import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import { StockStatus } from '@prisma/client';
import redis from '../config/redis.js';
import { computeStockStatus } from './product.controller.js';
import { customizationGroupsSchema } from '../utils/customizations.js';

export const productCreateSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string(),
    price: z.coerce.number().nonnegative(),
    materialInfo: z.string().optional(),
    images: z.array(z.string()).default([]),
    bannerImage: z.string().optional().nullable(),
    categoryId: z.string().uuid(),
    inventoryQty: z.coerce.number().int().nonnegative().default(0),
    targetGender: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).default('UNISEX'),
    inheritCategoryCustomizations: z.boolean().default(true),
    customizationGroups: customizationGroupsSchema.default([]),
  }),
});

export const productUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.coerce.number().nonnegative().optional(),
    materialInfo: z.string().optional(),
    images: z.array(z.string()).optional(),
    bannerImage: z.string().optional().nullable(),
    categoryId: z.string().uuid().optional(),
    inventoryQty: z.coerce.number().int().nonnegative().optional(),
    targetGender: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).optional(),
    inheritCategoryCustomizations: z.boolean().optional(),
    customizationGroups: customizationGroupsSchema.optional(),
  }),
});

export const trendingToggleSchema = z.object({
  body: z.object({
    isTrending: z.boolean(),
    trendingScheduledAt: z.string().datetime().optional().nullable(),
  }),
});



export class AdminProductController {
  /**
   * POST /admin/products
   */
  static async createProduct(req: Request, res: Response, next: NextFunction) {
    const { name, description, price, materialInfo, images, bannerImage, categoryId, inventoryQty, targetGender, inheritCategoryCustomizations, customizationGroups } = req.body;

    try {
      // Verify category exists
      const categoryExists = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!categoryExists) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }

      const stockStatus = computeStockStatus(inventoryQty);

      const product = await prisma.product.create({
        data: {
          name,
          description,
          price,
          materialInfo,
          images,
          bannerImage,
          categoryId,
          inventoryQty,
          stockStatus,
          targetGender,
          inheritCategoryCustomizations,
          customizationGroups,
        },
      });

      // Log initial price in ProductPriceHistory
      await (prisma as any).productPriceHistory.create({
        data: {
          productId: product.id,
          oldPrice: price,
          newPrice: price,
          changedBy: req.user?.fullName || 'Admin',
        },
      }).catch((err: any) => console.error('Failed to log initial price history:', err));

      // Write AuditLog
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'PRODUCT_CREATED',
          ipAddress: req.ip,
          details: {
            message: `Product ${name} created by ${req.user!.fullName}`,
            productId: product.id,
            name,
            price,
            inventoryQty,
          },
        },
      }).catch(err => console.error('Failed to write audit log:', err));

      // Invalidate products cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:products:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
        await redis.del('cache:categories');
      } catch (err: any) {
        console.error('Failed to invalidate product cache:', err);
      }

      return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/products/:id
   */
  static async updateProduct(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { name, description, price, materialInfo, images, bannerImage, categoryId, inventoryQty, targetGender, inheritCategoryCustomizations, customizationGroups } = req.body;

    try {
      const existingProduct = await prisma.product.findUnique({ where: { id } });
      if (!existingProduct) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const updateData: any = {
        name,
        description,
        price,
        materialInfo,
        images,
        bannerImage,
        categoryId,
        inventoryQty,
        targetGender,
        inheritCategoryCustomizations,
        customizationGroups,
      };

      // Recalculate stockStatus if inventoryQty is provided
      if (inventoryQty !== undefined) {
        updateData.stockStatus = computeStockStatus(inventoryQty);
      }

      const product = await prisma.product.update({
        where: { id },
        data: updateData,
      });

      // Log price change if price was updated
      if (price !== undefined && Number(price) !== Number(existingProduct.price)) {
        await (prisma as any).productPriceHistory.create({
          data: {
            productId: id,
            oldPrice: existingProduct.price,
            newPrice: price,
            changedBy: req.user?.fullName || 'Admin',
          },
        }).catch((err: any) => console.error('Failed to log price history:', err));
      }

      // Write AuditLog
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'PRODUCT_UPDATED',
          ipAddress: req.ip,
          details: {
            message: `Product ${product.name} updated by ${req.user!.fullName}`,
            productId: id,
            updates: updateData,
          },
        },
      }).catch(err => console.error('Failed to write audit log:', err));

      // Invalidate products cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:products:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
        await redis.del('cache:categories');
      } catch (err: any) {
        console.error('Failed to invalidate product cache:', err);
      }

      return res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/products/:id
   */
  static async deleteProduct(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;

    try {
      const existingProduct = await prisma.product.findUnique({ where: { id } });
      if (!existingProduct) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      // Check for associated orders
      const orderCount = await prisma.orderItem.count({ where: { productId: id } });
      if (orderCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete product because it has associated orders. Consider setting inventoryQty to 0 instead.',
        });
      }

      await prisma.product.delete({ where: { id } });

      // Write AuditLog
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'PRODUCT_DELETED',
          ipAddress: req.ip,
          details: {
            message: `Product ${existingProduct.name} deleted by ${req.user!.fullName}`,
            productId: id,
            name: existingProduct.name,
          },
        },
      }).catch(err => console.error('Failed to write audit log:', err));

      // Invalidate products cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:products:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
        await redis.del('cache:categories');
      } catch (err: any) {
        console.error('Failed to invalidate product cache:', err);
      }

      return res.status(200).json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/products/:id/trending
   */
  static async toggleTrending(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { isTrending, trendingScheduledAt } = req.body;

    try {
      const existingProduct = await prisma.product.findUnique({ where: { id } });
      if (!existingProduct) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const product = await prisma.product.update({
        where: { id },
        data: {
          isTrending,
          trendingScheduledAt: trendingScheduledAt ? new Date(trendingScheduledAt) : null,
        },
      });

      // Write AuditLog
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'TOGGLE_TRENDING_PRODUCT',
          details: {
            message: `Product ${product.name} trending status set to ${isTrending} by ${req.user!.fullName}`,
            productId: id,
            isTrending,
          },
        },
      }).catch(err => console.error('Failed to write audit log:', err));

      // Invalidate products cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:products:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      } catch (err: any) {
        console.error('Failed to invalidate product cache:', err);
      }

      return res.status(200).json({
        success: true,
        message: 'Product trending status updated successfully',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }
}
