import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import { StockStatus } from '@prisma/client';
import redis from '../config/redis.js';
import { getEffectiveCustomizationGroups, resolveSelectedCustomizations, selectedCustomizationsSchema } from '../utils/customizations.js';

// Capped in-memory LRU-like cache for search variations (stores up to 200 unique queries)
const searchVariationsCache = new Map<string, string[]>();
const MAX_CACHE_SIZE = 200;

function cacheSearchVariations(query: string, variations: string[]) {
  if (searchVariationsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = searchVariationsCache.keys().next().value;
    if (firstKey) searchVariationsCache.delete(firstKey);
  }
  searchVariationsCache.set(query, variations);
}

// Helper to generate search variations for singular and plural matching
function getSearchVariations(query: string): string[] {
  if (!query) return [];
  const trimmed = query.trim();
  if (trimmed === '') return [];

  // Check cache first
  if (searchVariationsCache.has(trimmed)) {
    return searchVariationsCache.get(trimmed)!;
  }

  const variations = new Set<string>();
  variations.add(trimmed);

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Word count cap: skip combinatorial expansion for complex multi-word queries (e.g. > 3 words)
  // to avoid combinatorial blowup and keep database clauses clean.
  if (words.length > 3) {
    const result = Array.from(variations);
    cacheSearchVariations(trimmed, result);
    return result;
  }

  // Singular nouns that end in s/ss and shouldn't be stripped of their ending s/ss
  const singularEndsWithS = new Set([
    'dress', 'jeans', 'glass', 'canvas', 'business', 'trousers', 'pants', 'tuxedo', 'suits'
  ]);

  // Irregular singular <-> plural mapping for clothing/catalog items
  const irregularPlurals: Record<string, string> = {
    scarf: 'scarves',
    scarves: 'scarf',
    half: 'halves',
    halves: 'half',
    shelf: 'shelves',
    shelves: 'shelf',
    foot: 'feet',
    feet: 'foot'
  };

  const wordVariationsList = words.map(word => {
    const wordVars = new Set<string>();
    wordVars.add(word);

    const lowerWord = word.toLowerCase();

    // Guard 1: Irregular Plurals
    if (irregularPlurals[lowerWord]) {
      wordVars.add(irregularPlurals[lowerWord]);
      return Array.from(wordVars);
    }

    // Guard 2: Singular nouns ending in s/ss
    if (singularEndsWithS.has(lowerWord)) {
      if (lowerWord === 'dress') {
        wordVars.add('dresses');
      } else if (lowerWord === 'glass') {
        wordVars.add('glasses');
      } else if (lowerWord === 'jeans') {
        wordVars.add('jean');
      }
      return Array.from(wordVars);
    }

    // Plural to singular rules
    if (lowerWord.endsWith('s')) {
      if (lowerWord.endsWith('ies') && lowerWord.length > 3) {
        // accessories -> accessory
        wordVars.add(word.slice(0, -3) + 'y');
      } else if (
        (lowerWord.endsWith('sses') ||
         lowerWord.endsWith('ches') ||
         lowerWord.endsWith('shes') ||
         lowerWord.endsWith('xes')) && lowerWord.length > 4
      ) {
        // dresses -> dress, trenches -> trench, boxes -> box
        wordVars.add(word.slice(0, -2));
      } else {
        // shirts -> shirt, sarees -> saree (strip last s)
        wordVars.add(word.slice(0, -1));
      }
    } else {
      // Singular to plural rules
      if (lowerWord.endsWith('y') && lowerWord.length > 1) {
        // accessory -> accessories
        wordVars.add(word.slice(0, -1) + 'ies');
      } else if (
        lowerWord.endsWith('ch') ||
        lowerWord.endsWith('sh') ||
        lowerWord.endsWith('x') ||
        lowerWord.endsWith('s')
      ) {
        wordVars.add(word + 'es');
      } else {
        // shirt -> shirts, suit -> suits
        wordVars.add(word + 's');
      }
    }
    return Array.from(wordVars);
  });

  const combine = (index: number, current: string) => {
    if (index === wordVariationsList.length) {
      variations.add(current.trim());
      return;
    }
    for (const v of wordVariationsList[index]) {
      combine(index + 1, current + " " + v);
    }
  };

  combine(0, "");
  const result = Array.from(variations);
  cacheSearchVariations(trimmed, result);
  return result;
}

// Product query validation
export const productQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
    category: z.string().optional(),
    categoryId: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.enum(['price', 'createdAt', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

// Cart item validator schema
export const cartAddSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1),
    selectedCustomizations: selectedCustomizationsSchema.default([]),
  }),
});

// Coupon validation schema
export const couponValidateSchema = z.object({
  body: z.object({
    code: z.string(),
  }),
});

// Favorite item validator schema
export const favoriteAddSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
  }),
});

export function computeStockStatus(qty: number): StockStatus {
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (qty <= 10) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export class ProductController {
  /**
   * Helper to fetch and cache active offers
   */
  static async getActiveOffers() {
    const cacheKey = 'cache:active_offers';
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const offers = await prisma.offer.findMany({ where: { isActive: true } });
    await redis.set(cacheKey, JSON.stringify(offers), 'EX', 300); // 5 minutes
    return offers;
  }

  /**
   * Helper to fetch and cache all categories for hierarchy traversal
   */
  static async getAllCategoriesCached() {
    const cacheKey = 'cache:all_categories_tree';
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const categories = await prisma.category.findMany();
    await redis.set(cacheKey, JSON.stringify(categories), 'EX', 300); // 5 minutes
    return categories;
  }

  /**
   * GET /products
   */
  static async getProducts(req: Request, res: Response, next: NextFunction) {
    const { page, limit, category, categoryId, search, sortBy, sortOrder } = req.query as any;
    const safePage = Math.max(parseInt(page as string, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 100);
    const skip = (safePage - 1) * safeLimit;
    const sortField = (sortBy && typeof sortBy === 'string') ? sortBy : 'createdAt';
    const sortDir = (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : 'desc';
    const cacheKey = `cache:products:page-${safePage}-limit-${safeLimit}-cat-${category || 'all'}-catId-${categoryId || 'all'}-search-${search || 'none'}-sort-${sortField}-${sortDir}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(JSON.parse(cached));
      }

      res.setHeader('X-Cache', 'MISS');

      const where: any = {};

      if (category) {
        const allCategories = await ProductController.getAllCategoriesCached();
        const targetCategory = allCategories.find((c: any) => c.slug === category);

        if (targetCategory) {
          const getDescendants = (parentId: string): string[] => {
            const list = [parentId];
            allCategories.forEach((c: any) => {
              if (c.parentId === parentId) {
                list.push(...getDescendants(c.id));
              }
            });
            return list;
          };
          const descendantIds = getDescendants(targetCategory.id);
          where.categoryId = { in: descendantIds };
        } else {
          where.category = {
            slug: category,
          };
        }
      } else if (categoryId) {
        const allCategories = await ProductController.getAllCategoriesCached();
        const getDescendants = (parentId: string): string[] => {
          const list = [parentId];
          allCategories.forEach((c: any) => {
            if (c.parentId === parentId) {
              list.push(...getDescendants(c.id));
            }
          });
          return list;
        };
        const descendantIds = getDescendants(categoryId);
        where.categoryId = { in: descendantIds };
      }

      if (search) {
        const variations = getSearchVariations(search);
        const orConditions: any[] = [];
        variations.forEach(term => {
          orConditions.push({ name: { contains: term, mode: 'insensitive' } });
          orConditions.push({ description: { contains: term, mode: 'insensitive' } });
        });
        where.OR = orConditions;
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { [sortField]: sortDir },
          skip,
          take: safeLimit,
          include: { category: true },
        }),
        prisma.product.count({ where }),
      ]);
      
      const activeOffers: any[] = await ProductController.getActiveOffers();

      const freeShippingProductIds = new Set<string>();
      const freeShippingCategoryIds = new Set<string>();
      let storewideFreeShipping = false;
      activeOffers.forEach((offer: any) => {
        if (offer.isFreeShipping || offer.type === 'FREE_SHIPPING') {
          if (offer.applicableProductIds.length === 0 && offer.applicableCategoryIds.length === 0) {
            storewideFreeShipping = true;
          } else {
            offer.applicableProductIds.forEach((id: string) => freeShippingProductIds.add(id));
            offer.applicableCategoryIds.forEach((id: string) => freeShippingCategoryIds.add(id));
          }
        }
      });

      const processedProducts = products.map(product => ({
        ...product,
        hasFreeShipping: storewideFreeShipping || freeShippingProductIds.has(product.id) || freeShippingCategoryIds.has(product.categoryId)
      }));

      const responsePayload = {
        success: true,
        data: processedProducts,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit) || 1,
        },
      };

      await redis.set(cacheKey, JSON.stringify(responsePayload), 'EX', 300); // 5 minutes cache

      return res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /products/:id
   */
  static async getProductById(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;

    try {
      const product = await prisma.product.findUnique({
        where: { id },
        include: { category: true },
      });
      
      const activeOffers: any[] = await ProductController.getActiveOffers();

      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      let hasFreeShipping = false;
      for (const offer of activeOffers) {
        if (offer.isFreeShipping || offer.type === 'FREE_SHIPPING') {
          if (
            (offer.applicableProductIds.length === 0 && offer.applicableCategoryIds.length === 0) ||
            offer.applicableProductIds.includes(product.id) ||
            offer.applicableCategoryIds.includes(product.categoryId)
          ) {
            hasFreeShipping = true;
            break;
          }
        }
      }

      const processedProduct = {
        ...product,
        customizationGroups: await getEffectiveCustomizationGroups(prisma, product),
        hasFreeShipping
      };

      // Log PRODUCT_VIEW event asynchronously to Redis list
      const userId = req.user?.id || null;
      try {
        await redis.rpush('analytics:events', JSON.stringify({
          eventType: 'PRODUCT_VIEW',
          productId: id,
          userId,
          createdAt: new Date().toISOString()
        }));
      } catch (e) {
        console.error('Failed to log product view event to Redis:', e);
      }

      return res.status(200).json({ success: true, data: processedProduct });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /cart
   */
  static async getCart(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    try {
      const items = await prisma.cartItem.findMany({
        where: { userId },
        include: { product: true },
      });
      
      const activeOffers: any[] = await ProductController.getActiveOffers();

      const freeShippingProductIds = new Set<string>();
      const freeShippingCategoryIds = new Set<string>();
      let storewideFreeShipping = false;
      activeOffers.forEach((offer: any) => {
        if (offer.isFreeShipping || offer.type === 'FREE_SHIPPING') {
          if (offer.applicableProductIds.length === 0 && offer.applicableCategoryIds.length === 0) {
            storewideFreeShipping = true;
          } else {
            offer.applicableProductIds.forEach((id: string) => freeShippingProductIds.add(id));
            offer.applicableCategoryIds.forEach((id: string) => freeShippingCategoryIds.add(id));
          }
        }
      });

      const processedItems = items.map(item => ({
        ...item,
        unitPrice: Number(item.product.price) + (((item.selectedCustomizations as any[] | null) || []).reduce((sum, group) => sum + (group.options || []).reduce((optionSum: number, option: any) => optionSum + Number(option.price || 0), 0), 0)),
        product: {
          ...item.product,
          hasFreeShipping: storewideFreeShipping || freeShippingProductIds.has(item.product.id) || freeShippingCategoryIds.has(item.product.categoryId)
        }
      }));

      return res.status(200).json({ success: true, data: processedItems });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /cart
   */
  static async addToCart(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { productId, quantity, selectedCustomizations = [] } = req.body;

    try {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      // Check inventory quantity
      if (product.inventoryQty < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient inventory. Only ${product.inventoryQty} items remaining in stock.`,
        });
      }

      let resolvedOptions;
      try {
        const groups = await getEffectiveCustomizationGroups(prisma, product);
        resolvedOptions = resolveSelectedCustomizations(groups, selectedCustomizations);
      } catch (customizationError: any) {
        return res.status(400).json({ success: false, message: customizationError.message || 'Invalid customization selection.' });
      }

      const cartItem = await prisma.cartItem.upsert({
        where: {
          userId_productId: { userId, productId },
        },
        update: { quantity, selectedCustomizations: resolvedOptions.selectedCustomizations as any },
        create: { userId, productId, quantity, selectedCustomizations: resolvedOptions.selectedCustomizations as any },
      });

      // Log ADD_TO_CART event asynchronously to Redis list
      try {
        await redis.rpush('analytics:events', JSON.stringify({
          eventType: 'ADD_TO_CART',
          productId,
          userId,
          createdAt: new Date().toISOString()
        }));
      } catch (e) {
        console.error('Failed to log add to cart event to Redis:', e);
      }

      return res.status(200).json({ success: true, data: cartItem });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /cart/:productId
   */
  static async removeFromCart(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { productId } = req.params;

    try {
      await prisma.cartItem.delete({
        where: {
          userId_productId: { userId, productId },
        },
      });

      return res.status(200).json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
      next(error);
    }
  }


  /**
   * POST /cart/coupon
   */
  static async validateCoupon(req: Request, res: Response, next: NextFunction) {
    const { code } = req.body;

    try {
      const coupon = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!coupon) {
        return res.status(404).json({ success: false, message: 'Coupon invalid or not found' });
      }

      if (!coupon.isActive) {
        return res.status(400).json({ success: false, message: 'Coupon is currently inactive' });
      }

      if (new Date() > new Date(coupon.expiryDate)) {
        return res.status(400).json({ success: false, message: 'Coupon has expired' });
      }

      if (coupon.usedCount >= coupon.maxUses) {
        return res.status(400).json({ success: false, message: 'Coupon utilization limit reached' });
      }

      // Check if this user has already used this coupon
      const userId = req.user?.id;
      if (userId) {
        const userCouponExists = await prisma.userCoupon.findUnique({
          where: {
            userId_couponId: { userId, couponId: coupon.id },
          },
        });

        if (userCouponExists) {
          return res.status(400).json({ success: false, message: 'You have already used this coupon' });
        }
      }

      // Return coupon calculations
      return res.status(200).json({
        success: true,
        message: 'Coupon is valid',
        data: {
          code: coupon.code,
          discountPercent: coupon.discountPercent,
          discountFlat: coupon.discountFlat,
          maxDiscount: coupon.maxDiscount,
        },
        coupon: {
          code: coupon.code,
          discountPercent: coupon.discountPercent,
          discountFlat: coupon.discountFlat,
          maxDiscount: coupon.maxDiscount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /cart/favorites
   */
  static async getFavorites(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    try {
      const items = await prisma.favorite.findMany({
        where: { userId },
        include: { product: true },
      });

      return res.status(200).json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /cart/favorites
   */
  static async addToFavorites(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { productId } = req.body;

    try {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const favItem = await prisma.favorite.upsert({
        where: {
          userId_productId: { userId, productId },
        },
        update: {}, // Do nothing if already exists
        create: { userId, productId },
      });

      return res.status(200).json({ success: true, data: favItem });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /cart/favorites/:productId
   */
  static async removeFromFavorites(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { productId } = req.params;

    try {
      await prisma.favorite.delete({
        where: {
          userId_productId: { userId, productId },
        },
      });

      return res.status(200).json({ success: true, message: 'Item removed from favorites' });
    } catch (error) {
      next(error);
    }
  }
}
