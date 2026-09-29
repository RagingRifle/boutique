import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import { createAuditLog } from '../utils/audit.js';
import redis from '../config/redis.js';
import { customizationGroupsSchema } from '../utils/customizations.js';

export const categoryCreateSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    imageUrl: z.union([z.string().url(), z.literal('')]).optional(),
    customizationGroups: customizationGroupsSchema.optional(),
    order: z.coerce.number().int().default(0),
    parentId: z.string().uuid().optional().nullable(),
  }),
});

export const categoryUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    imageUrl: z.union([z.string().url(), z.literal('')]).optional(),
    customizationGroups: customizationGroupsSchema.optional(),
    order: z.coerce.number().int().optional(),
    parentId: z.string().uuid().optional().nullable(),
  }),
});

export const categoriesReorderSchema = z.object({
  body: z.object({
    categories: z.array(z.object({
      id: z.string().uuid(),
      order: z.coerce.number().int(),
    })).min(1),
  }),
});



export class AdminCategoryController {
  /**
   * POST /admin/categories
   */
  static async createCategory(req: Request, res: Response, next: NextFunction) {
    const { name, slug, order, imageUrl, parentId, customizationGroups } = req.body;

    try {
      const existing = await prisma.category.findFirst({
        where: { parentId: parentId || null, slug },
      });

      if (existing) {
        return res.status(409).json({ success: false, message: 'Category name or slug already exists' });
      }

      const category = await prisma.category.create({
        data: { name, slug, order, imageUrl: imageUrl || null, parentId: parentId || null, customizationGroups: customizationGroups ?? undefined },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'CATEGORY_CREATED',
        ipAddress: req.ip,
        details: {
          message: `Category '${name}' (Slug: ${slug}) created by ${req.user!.fullName}`,
          categoryId: category.id,
          name,
          slug,
          order,
        },
      });

      await redis.del('cache:categories', 'cache:all_categories_tree');

      return res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/categories/:id
   */
  static async updateCategory(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { name, slug, order, imageUrl, parentId, customizationGroups } = req.body;

    try {
      const existing = await prisma.category.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }

      const category = await prisma.category.update({
        where: { id },
        data: { name, slug, order, imageUrl: imageUrl === undefined ? undefined : imageUrl || null, parentId: parentId !== undefined ? parentId : undefined, customizationGroups: customizationGroups === undefined ? undefined : customizationGroups },
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'CATEGORY_UPDATED',
        ipAddress: req.ip,
        details: {
          message: `Category '${category.name}' updated by ${req.user!.fullName}`,
          categoryId: id,
          name,
          slug,
          order,
        },
      });

      await redis.del('cache:categories', 'cache:all_categories_tree');

      return res.status(200).json({
        success: true,
        message: 'Category updated successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/categories/:id
   */
  static async deleteCategory(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;

    try {
      const existing = await prisma.category.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }

      // Check for associated products
      const productCount = await prisma.product.count({ where: { categoryId: id } });
      if (productCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete category because it contains active products. Please delete or reassign products first.',
        });
      }

      await prisma.category.delete({ where: { id } });

      await createAuditLog({
        userId: req.user!.id,
        action: 'CATEGORY_DELETED',
        ipAddress: req.ip,
        details: {
          message: `Category '${existing.name}' deleted by ${req.user!.fullName}`,
          categoryId: id,
          name: existing.name,
        },
      });

      await redis.del('cache:categories', 'cache:all_categories_tree');

      return res.status(200).json({
        success: true,
        message: 'Category deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/categories/reorder
   */
  static async reorderCategories(req: Request, res: Response, next: NextFunction) {
    const { categories } = req.body;

    try {
      await prisma.$transaction(
        categories.map((c: any) =>
          prisma.category.update({
            where: { id: c.id },
            data: { order: c.order },
          })
        )
      );
      await redis.del('cache:categories', 'cache:all_categories_tree');

      return res.status(200).json({
        success: true,
        message: 'Categories reordered successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /categories  (includes subCategories)
   */
  static async listCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const cached = await redis.get('cache:categories');
      if (cached) {
        return res.status(200).json({
          success: true,
          data: JSON.parse(cached),
        });
      }

      const categories = await prisma.category.findMany({
        orderBy: { order: 'asc' },
        include: {
          _count: {
            select: { products: true }
          }
        }
      });

      // Build tree
      const categoryMap = new Map();
      categories.forEach(c => categoryMap.set(c.id, { ...c, subCategories: [] }));
      
      const tree: any[] = [];
      categories.forEach(c => {
        if (c.parentId) {
          const parent = categoryMap.get(c.parentId);
          if (parent) {
            parent.subCategories.push(categoryMap.get(c.id));
          } else {
            tree.push(categoryMap.get(c.id)); // Fallback if parent missing
          }
        } else {
          tree.push(categoryMap.get(c.id));
        }
      });

      // Sort subcategories by order recursively and compute product counts
      const processTree = (node: any): number => {
        const directCount = node._count?.products || 0;
        node.directProductCount = directCount;
        
        let subCategoriesTotal = 0;
        if (node.subCategories && node.subCategories.length > 0) {
          node.subCategories.sort((a: any, b: any) => a.order - b.order);
          node.subCategories.forEach((sub: any) => {
            subCategoriesTotal += processTree(sub);
          });
        }
        
        node.totalProductCount = directCount + subCategoriesTotal;
        return node.totalProductCount;
      };
      
      tree.forEach(node => {
        processTree(node);
      });
      
      tree.sort((a, b) => a.order - b.order);

      await redis.set('cache:categories', JSON.stringify(tree), 'EX', 86400);

      return res.status(200).json({
        success: true,
        data: tree,
      });
    } catch (error) {
      next(error);
    }
  }


}
