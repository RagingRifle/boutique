import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { OrderStatus, Role } from '@prisma/client';
import { createAuditLog } from '../utils/audit.js';
import { computeStockStatus } from './product.controller.js';
import JobsProducer from '../queues/jobs.producer.js';
import { getIO } from '../socket/socket.handler.js';
import redis from '../config/redis.js';
import PdfService from '../services/pdf.service.js';
import { getEffectiveCustomizationGroups, resolveSelectedCustomizations, selectedCustomizationsSchema } from '../utils/customizations.js';

export const orderStatusUpdateSchema = z.object({
  body: z.object({
    status: z.enum(['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']).optional(),
    paymentStatus: z.enum(['PENDING', 'PARTIAL', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
    fabricType: z.string().optional().nullable(),
    customizations: z.string().optional().nullable(),
    tailorNotes: z.string().optional().nullable(),
    measurementProfileId: z.string().uuid().optional().nullable(),
    advancePayment: z.coerce.number().optional(),
    deliveryDate: z.string().optional().nullable(),
    newPayment: z.object({
      id: z.string(),
      amount: z.coerce.number(),
      method: z.string(),
      date: z.string(),
      note: z.string().optional()
    }).optional(),
  }),
});

export const orderCheckoutSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      productId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1),
      price: z.coerce.number().positive().optional(),
      selectedCustomizations: selectedCustomizationsSchema.default([]),
    })).min(1),
    discountAmount: z.coerce.number().nonnegative().default(0),
    paymentMethod: z.enum(['CASH', 'CARD', 'ONLINE']).default('ONLINE'),
    couponCode: z.string().optional(),
    isQuickOrder: z.boolean().optional(),
    quickOrderReason: z.string().optional(),
    quickOrderExpectedDate: z.string().optional(),
  }).refine(data => !data.isQuickOrder || (data.quickOrderReason && data.quickOrderReason.trim().length > 0), {
    message: "Reason is required for quick orders",
    path: ["quickOrderReason"]
  }),
});

async function invalidateUserOrdersCache(userId: string) {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `cache:orders:user:${userId}:*`, 'COUNT', '100');
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    console.error('Failed to invalidate user orders cache:', err);
  }
}

export class OrderController {
  /**
   * Helper: Retrieve fitting booking associated with an order's invoice number
   */
  static async getAssociatedBooking(invoiceNumber: string) {
    if (!invoiceNumber) return null;

    // 1. Check Studio Appointments
    const appointment = await prisma.appointment.findFirst({
      where: {
        notes: invoiceNumber,
      },
    });

    if (appointment) {
      return {
        id: appointment.id,
        type: 'STUDIO',
        date: appointment.date,
        timeSlot: appointment.timeSlot,
        status: appointment.status,
        notes: appointment.notes,
      };
    }

    // 2. Check Tailor Home Visits
    const visit = await prisma.storeVisit.findFirst({
      where: {
        requirements: invoiceNumber,
      },
    });

    if (visit) {
      return {
        id: visit.id,
        type: 'HOME_VISIT',
        date: visit.confirmedDate || visit.preferredDate,
        timeSlot: 'Home Visit Fitting',
        status: visit.status,
        requirements: visit.requirements,
      };
    }

    return null;
  }

  /**
   * GET /orders
   * Customer: returns logged-in user's order history
   */
  static async getOrders(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { page = 1, limit = 10 } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const cacheKey = `cache:orders:user:${userId}:${page}:${limit}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit),
          include: {
            orderItems: {
              include: {
                product: {
                  select: { name: true, price: true, images: true }
                }
              }
            },
            invoice: true
          }
        }),
        prisma.order.count({ where: { userId } }),
      ]);

      const invoiceNumbers = orders.map((o) => o.invoiceNumber);

      const [appointments, visits] = await Promise.all([
        prisma.appointment.findMany({
          where: { notes: { in: invoiceNumbers } },
        }),
        prisma.storeVisit.findMany({
          where: { requirements: { in: invoiceNumbers } },
        }),
      ]);

      const ordersWithBookings = orders.map((order) => {
        const appointment = appointments.find((a) => a.notes === order.invoiceNumber);
        let booking = null;
        if (appointment) {
          booking = {
            id: appointment.id,
            type: 'STUDIO',
            date: appointment.date,
            timeSlot: appointment.timeSlot,
            status: appointment.status,
            notes: appointment.notes,
          };
        } else {
          const visit = visits.find((v) => v.requirements === order.invoiceNumber);
          if (visit) {
            booking = {
              id: visit.id,
              type: 'HOME_VISIT',
              date: visit.confirmedDate || visit.preferredDate,
              timeSlot: 'Home Visit Fitting',
              status: visit.status,
              requirements: visit.requirements,
            };
          }
        }
        return {
          ...order,
          booking,
        };
      });

      const responsePayload = {
        success: true,
        data: ordersWithBookings,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      };

      await redis.set(cacheKey, JSON.stringify(responsePayload), 'EX', 60);

      return res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /orders/:id
   * Customer/Admin: returns a specific order details
   */
  static async getOrderById(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const user = req.user!;

    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          user: {
            select: {
              fullName: true,
              email: true,
              phoneNumber: true,
              address: true,
            },
          },
          invoice: true,
          measurementProfile: true,
        },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Customer can only view their own order
      if (user.role === Role.CUSTOMER && order.userId !== user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const booking = await OrderController.getAssociatedBooking(order.invoiceNumber);

      return res.status(200).json({
        success: true,
        data: {
          ...order,
          booking,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/orders (Admin / Staff Only)
   * Admin: list all orders globally
   */
  static async adminListOrders(req: Request, res: Response, next: NextFunction) {
    const { page = 1, limit = 10, status } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const cacheKey = `cache:admin:orders:${page}:${limit}:${status || 'ALL'}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }

      const where: any = {};
      if (status) {
        where.status = status as OrderStatus;
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit),
          include: {
            user: {
              select: {
                fullName: true,
                email: true,
                phoneNumber: true,
                address: true,
              },
            },
            orderItems: {
              include: {
                product: {
                  select: { name: true, images: true }
                }
              }
            },
            measurementProfile: true,
          },
        }),
        prisma.order.count({ where }),
      ]);

      const invoiceNumbers = orders.map((o) => o.invoiceNumber);

      const [appointments, visits] = await Promise.all([
        prisma.appointment.findMany({
          where: { notes: { in: invoiceNumbers } },
        }),
        prisma.storeVisit.findMany({
          where: { requirements: { in: invoiceNumbers } },
        }),
      ]);

      const ordersWithBookings = orders.map((order) => {
        const appointment = appointments.find((a) => a.notes === order.invoiceNumber);
        let booking = null;
        if (appointment) {
          booking = {
            id: appointment.id,
            type: 'STUDIO',
            date: appointment.date,
            timeSlot: appointment.timeSlot,
            status: appointment.status,
            notes: appointment.notes,
          };
        } else {
          const visit = visits.find((v) => v.requirements === order.invoiceNumber);
          if (visit) {
            booking = {
              id: visit.id,
              type: 'HOME_VISIT',
              date: visit.confirmedDate || visit.preferredDate,
              timeSlot: 'Home Visit Fitting',
              status: visit.status,
              requirements: visit.requirements,
            };
          }
        }
        return {
          ...order,
          booking,
        };
      });

      const responsePayload = {
        success: true,
        data: ordersWithBookings,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      };

      await redis.set(cacheKey, JSON.stringify(responsePayload), 'EX', 30);

      return res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/orders/:id/status (Admin / Staff Only)
   * Admin: updates an order delivery/payment status
   */
  static async adminUpdateOrderStatus(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { status, paymentStatus, fabricType, customizations, tailorNotes, measurementProfileId, newPayment } = req.body;

    try {
      const existing = await prisma.order.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const updateData: any = {};
      if (status !== undefined) {
        updateData.status = status;
      }
      if (paymentStatus !== undefined) {
        updateData.paymentStatus = paymentStatus;
      }
      if (fabricType !== undefined) {
        updateData.fabricType = fabricType;
      }
      if (customizations !== undefined) {
        updateData.customizations = customizations;
      }
      if (tailorNotes !== undefined) {
        updateData.tailorNotes = tailorNotes;
      }
      if (measurementProfileId !== undefined) {
        updateData.measurementProfileId = measurementProfileId;
      }
      if (req.body.advancePayment !== undefined) {
        updateData.advancePayment = req.body.advancePayment;
      }
      
      let currentPaymentHistory: any[] = [];
      if (existing.paymentHistory) {
        currentPaymentHistory = Array.isArray(existing.paymentHistory) ? existing.paymentHistory : [];
      }
      
      if (newPayment) {
        currentPaymentHistory.push(newPayment);
        updateData.paymentHistory = currentPaymentHistory;
      }

      // Recalculate balance
      const advance = updateData.advancePayment !== undefined ? Number(updateData.advancePayment) : Number(existing.advancePayment || 0);
      const sumSubsequent = currentPaymentHistory.reduce((sum, p) => sum + Number(p.amount), 0);
      updateData.balanceAmount = Math.max(0, Number(existing.payableAmount) - advance - sumSubsequent);

      // Auto update payment status if balance is 0 or if advance payment exists
      if (updateData.balanceAmount === 0 && Number(existing.payableAmount) > 0) {
        updateData.paymentStatus = 'COMPLETED';
      } else if (advance > 0 && updateData.balanceAmount > 0 && paymentStatus !== 'REFUNDED' && paymentStatus !== 'FAILED') {
        updateData.paymentStatus = 'PARTIAL';
      }


      let deliveryDateChanged = false;
      let newDeliveryDateFormatted = '';
      if (req.body.deliveryDate !== undefined) {
        const newDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null;
        const oldDate = existing.deliveryDate ? new Date(existing.deliveryDate) : null;
        if (newDate?.getTime() !== oldDate?.getTime()) {
          updateData.deliveryDate = newDate;
          deliveryDateChanged = true;
          if (newDate) {
            newDeliveryDateFormatted = newDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        }
      }

      // Do not auto-set paymentStatus to REFUNDED. Admin manually marks as REFUNDED.

      const order = await prisma.order.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
              phoneNumber: true,
              address: true,
            },
          },
          orderItems: {
            include: {
              product: {
                select: { name: true }
              }
            }
          },
          measurementProfile: true
        }
      });

      if (deliveryDateChanged && order.userId) {
        await JobsProducer.queueNotification({
          userId: order.userId,
          channels: ['PUSH'],
          templates: {
            push: {
              title: 'Delivery Date Updated',
              body: newDeliveryDateFormatted 
                ? `The delivery date for your order ${order.invoiceNumber} has been updated to ${newDeliveryDateFormatted}.`
                : `The delivery date for your order ${order.invoiceNumber} has been removed.`,
            },
          },
        }).catch(err => console.error('Failed to queue delivery date update notification:', err));
      }

      // Invalidate admin cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:admin:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      } catch (err: any) {
        console.error('Failed to invalidate admin cache:', err);
      }

      // Audit Log for order status change
      if (status !== undefined && status !== existing.status) {
        await createAuditLog({
          userId: req.user!.id,
          action: 'ORDER_STATUS_CHANGED',
          ipAddress: req.ip,
          details: {
            message: `Order ${order.invoiceNumber} status changed from ${existing.status} to ${status} by ${req.user!.fullName}`,
            orderId: id,
            previousStatus: existing.status,
            newStatus: status,
            triggeredBy: req.user!.fullName,
          },
        });

        // Emit real-time update to customer, order room, and broadcast
        const io = getIO();
        if (io) {
          const statusPayload = {
            orderId: order.id,
            invoiceNumber: order.invoiceNumber,
            newStatus: status,
            updatedAt: new Date(),
          };

          if (order.userId) {
            io.to(`user:${order.userId}`).emit('order:status_changed', statusPayload);
          }
          io.to(`order:${order.id}`).emit('order:status_changed', statusPayload);
          io.emit('order:status_changed', statusPayload);
        }

        if (order.userId) {
          // Queue push notification for status update
          await JobsProducer.queueNotification({
            userId: order.userId,
            channels: ['PUSH'],
            templates: {
              push: {
                title: 'Order Status Update',
                body: `Your order ${order.invoiceNumber} status is now ${status}.`,
              },
            },
          }).catch(err => console.error('Failed to queue order status notification:', err));
        }
      }

      // Audit Log for refund processed
      if (order.paymentStatus === 'REFUNDED' && existing.paymentStatus !== 'REFUNDED') {
        await createAuditLog({
          userId: req.user!.id,
          action: 'REFUND_PROCESSED',
          ipAddress: req.ip,
          details: {
            message: `Refund processed for order ${order.invoiceNumber}. Payment status set to REFUNDED by ${req.user!.fullName}`,
            orderId: id,
            refundedAmount: order.payableAmount,
            triggeredBy: req.user!.fullName,
          },
        });
      }

      if (order.userId) {
        await invalidateUserOrdersCache(order.userId);
      }
      try {
        await redis.del(`cache:order:${order.id}`, `cache:orders:${order.id}`);
      } catch (e) {}

      return res.status(200).json({
        success: true,
        message: 'Order status updated successfully',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/orders/:id/packing-slip (Admin / Staff Only)
   * Admin: generates a text packing slip with customer details and item checklists
   */
  static async adminGetPackingSlip(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;

    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          orderItems: {
            include: {
              product: {
                select: { name: true, materialInfo: true }
              }
            }
          },
          user: {
            select: {
              fullName: true,
              address: true,
              phoneNumber: true,
            }
          }
        }
      });

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const slip = {
        invoiceNumber: order.invoiceNumber,
        orderDate: order.createdAt,
        customer: {
          fullName: order.user?.fullName || 'Guest Customer',
          phoneNumber: order.user?.phoneNumber || 'N/A',
          shippingAddress: order.user?.address || 'Walk-in / In-store Pickup',
        },
        items: order.orderItems.map((item: any) => ({
          name: item.product.name,
          material: item.product.materialInfo || 'N/A',
          quantity: item.quantity,
          packed: false,
        })),
        totals: {
          subtotal: order.totalAmount,
          discount: order.discountAmount,
          tax: order.taxAmount,
          grandTotal: order.payableAmount,
        },
        paymentMethod: order.paymentMethod,
        isOfflineSales: order.isOfflineSales,
      };

      return res.status(200).json({
        success: true,
        data: slip,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /orders/:id/invoice-pdf
   * Generate and stream PDF Invoice on demand.
   */
  static async downloadInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          orderItems: {
            include: { product: true },
          },
          user: true,
        },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (req.user!.role === Role.CUSTOMER && order.userId !== req.user!.id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const customer = order.user || {
        fullName: (order.gatewayResponse as any)?.guestCustomerName || 'Bespoke Customer',
        email: 'customer@marcosapp.com',
        phoneNumber: 'N/A',
      };

      const pdfBuffer = await PdfService.generateInvoicePdf(order, customer);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="invoice-${order.invoiceNumber}.pdf"`);
      return res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /orders/checkout
   * Customer checkout: creates a PENDING order, adjusts stock, and schedules PDF/Points jobs upon completion.
   */
  static async checkout(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { items, discountAmount, paymentMethod, couponCode, isQuickOrder, quickOrderReason, quickOrderExpectedDate } = req.body;
    const idempotencyKey = (req.headers['x-idempotency-key'] || req.body.idempotencyKey) as string | undefined;

    try {
      if (idempotencyKey) {
        const existingOrder = await prisma.order.findUnique({
          where: { idempotencyKey },
          include: {
            orderItems: {
              include: {
                product: {
                  select: { name: true, price: true }
                }
              }
            },
            invoice: true
          }
        });
        if (existingOrder) {
          return res.status(200).json({
            success: true,
            message: 'Order already processed (Idempotent)',
            data: existingOrder,
          });
        }
      }

      const order = await prisma.$transaction(async (tx: any) => {
        let subtotal = 0;

        // Pre-fetch all products to avoid N+1 reads
        const productIds = items.map((i: any) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });
        const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

        const pricedItems = items.map((item: any) => {
          const product = productMap.get(item.productId);
          if (!product) throw new Error(`Product ${item.productId} not found`);
          const groupsPromise = getEffectiveCustomizationGroups(tx, product);
          return groupsPromise;
        });
        const effectiveGroupsByItem = await Promise.all(pricedItems);
        const normalizedItems = items.map((item: any, index: number) => {
          const product = productMap.get(item.productId);
          const resolved = resolveSelectedCustomizations(effectiveGroupsByItem[index], item.selectedCustomizations || []);
          return {
            ...item,
            price: Number(product.price) + resolved.priceAdjustment,
            selectedCustomizations: resolved.selectedCustomizations,
          };
        });

        // 1. Verify inventory in-memory first using pre-fetched products
        for (const item of normalizedItems) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }
          if (product.inventoryQty < item.quantity) {
            throw new Error(`Insufficient inventory for ${product.name}. Required: ${item.quantity}`);
          }
        }

        // 2. Perform bulk inventory deduction using a single raw SQL query
        if (normalizedItems.length > 0) {
          const values: string[] = [];
          for (const item of normalizedItems) {
            const product = productMap.get(item.productId);
            const newInventoryQty = product.inventoryQty - item.quantity;
            const newStockStatus = computeStockStatus(newInventoryQty);
            // Use ::text cast since Prisma maps String id to text in PostgreSQL
            values.push(`('${item.productId}'::text, ${item.quantity}::int, '${newStockStatus}'::"StockStatus")`);
          }

          const query = `
            UPDATE "Product" AS p
            SET 
              "inventoryQty" = p."inventoryQty" - v.qty,
              "salesCount" = p."salesCount" + v.qty,
              "stockStatus" = v.status
            FROM (VALUES ${values.join(', ')}) AS v(id, qty, status)
            WHERE p.id = v.id AND p."inventoryQty" >= v.qty
          `;

          const updatedRows = await tx.$executeRawUnsafe(query);
          
          if (updatedRows !== normalizedItems.length) {
            throw new Error('Concurrent inventory update failure. Insufficient stock during checkout.');
          }
        }

        for (const item of normalizedItems) {
          subtotal += Number(item.price) * item.quantity;
        }

        // Coupon Validation & Consumption
        if (couponCode) {
          const coupon = await tx.coupon.findUnique({
            where: { code: couponCode.toUpperCase() }
          });

          if (!coupon) {
            throw new Error('Coupon not found or invalid.');
          }

          if (!coupon.isActive) {
            throw new Error('Coupon is inactive.');
          }

          if (new Date() > new Date(coupon.expiryDate)) {
            throw new Error('Coupon has expired.');
          }

          if (coupon.usedCount >= coupon.maxUses) {
            throw new Error('Coupon usage limit reached.');
          }

          // Check if this user has already used this coupon
          const userCouponExists = await tx.userCoupon.findUnique({
            where: {
              userId_couponId: {
                userId,
                couponId: coupon.id
              }
            }
          });

          if (userCouponExists) {
            throw new Error('You have already used this coupon.');
          }

          // Calculate expected discount
          let expectedDiscount = 0;
          if (Number(coupon.discountPercent) > 0) {
            expectedDiscount = subtotal * (Number(coupon.discountPercent) / 100);
            if (coupon.maxDiscount && expectedDiscount > Number(coupon.maxDiscount)) {
              expectedDiscount = Number(coupon.maxDiscount);
            }
          } else if (Number(coupon.discountFlat) > 0) {
            expectedDiscount = Number(coupon.discountFlat);
          }

          // Verify client-submitted discountAmount matches expected discount
          if (Math.abs(Number(discountAmount) - expectedDiscount) > 0.01) {
            throw new Error('Security Check: Discount amount mismatch detected.');
          }

          // Increment coupon usedCount
          const updatedCoupon = await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } }
          });

          if (updatedCoupon.usedCount > coupon.maxUses) {
            throw new Error('Coupon usage limit reached.');
          }

          // Create UserCoupon record to track usage
          await tx.userCoupon.create({
            data: {
              userId,
              couponId: coupon.id
            }
          });
        } else {
          // If no coupon is applied, discountAmount must be 0
          if (Number(discountAmount) > 0) {
            throw new Error('Security Check: Discount applied without coupon.');
          }
        }

        // Calculations
        const taxRate = 0.18; // 18% GST/VAT default
        const taxAmount = (subtotal - discountAmount) * taxRate;
        const totalAmount = subtotal;
        const deliveryCharge = subtotal > 30000 ? 0 : 150;
        const payableAmount = (subtotal - discountAmount) + taxAmount + deliveryCharge;

        const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

        // Create Order (Initially PENDING for online checkout)
        const newOrder = await tx.order.create({
          data: {
            userId,
            status: 'PENDING',
            paymentStatus: 'PENDING',
            totalAmount,
            taxAmount,
            gstPercentage: 18,
            discountAmount,
            payableAmount,
            paymentMethod,
            isOfflineSales: false,
            invoiceNumber,
            idempotencyKey: idempotencyKey || null,
            isQuickOrder: isQuickOrder || false,
            quickOrderReason: isQuickOrder ? quickOrderReason : null,
            quickOrderExpectedDate: isQuickOrder && quickOrderExpectedDate ? new Date(quickOrderExpectedDate) : null,
            quickOrderStatus: isQuickOrder ? 'PENDING' : null,
          },
        });

        // Insert Order Items
        await tx.orderItem.createMany({
          data: normalizedItems.map((item: any) => ({
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            selectedCustomizations: item.selectedCustomizations as any,
          }))
        });

        // Clear only checked-out items from the user's cart
        const purchasedProductIds = normalizedItems.map((item: any) => item.productId);
        await tx.cartItem.deleteMany({
          where: {
            userId,
            productId: { in: purchasedProductIds },
          },
        });

        return newOrder;
      });

      // Log ORDER_CREATED
      await createAuditLog({
        userId,
        action: 'ORDER_CREATED',
        ipAddress: req.ip,
        details: {
          message: `Online Order ${order.invoiceNumber} created by customer. Amount: ${order.payableAmount}, Payment: ${order.paymentMethod}`,
          orderId: order.id,
          totalAmount: order.totalAmount,
          payableAmount: order.payableAmount,
          paymentMethod: order.paymentMethod,
          isOfflineSales: false,
          items,
        },
      });

      // Queue background PDF compilation & emails
      await JobsProducer.queueInvoicePdf(order.id);
      // Queue referral and customer loyalty point adjustments
      await JobsProducer.queueCreditReferralPoints(order.id, userId);

      // Broadcast WebSocket order:placed event to admins
      const io = getIO();
      if (io) {
        io.to('admins').emit('order:placed', {
          orderId: order.id,
          invoiceNumber: order.invoiceNumber,
          payableAmount: order.payableAmount,
        });
      }

      // Invalidate admin cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:admin:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      } catch (err: any) {
        console.error('Failed to invalidate admin cache:', err);
      }

      return res.status(201).json({
        success: true,
        message: 'Order placed successfully and processing',
        data: order,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /orders/:id/cancel
   * Customer: cancels their own order if status is PENDING or PAID.
   * Side effects: restores inventory, marks payment as REFUNDED if completed, emits socket event.
   */
  static async cancelOrder(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const existing = await prisma.order.findUnique({
        where: { id },
        include: {
          orderItems: {
            include: { product: true },
          },
        },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Only the order's owner can cancel
      if (existing.userId !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only cancel your own orders' });
      }

      // Only PENDING or PAID orders can be cancelled by the customer
      const cancellableStatuses = ['PENDING', 'PAID'];
      if (!cancellableStatuses.includes(existing.status)) {
        return res.status(400).json({
          success: false,
          message: `Order cannot be cancelled. Current status: ${existing.status}. Only PENDING or PAID orders are eligible.`,
        });
      }

      const refundTriggered = existing.paymentStatus === 'COMPLETED';

      // Transactionally cancel the order, restore inventory, and mark refund
      const updatedOrder = await prisma.$transaction(async (tx: any) => {
        // 1. Update order status and payment status
        const cancelled = await tx.order.update({
          where: { id },
          data: {
            status: 'CANCELLED',
          },
        });

        // 2. Restore inventory for each order item using atomic increment
        for (const item of existing.orderItems) {
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: {
              inventoryQty: { increment: item.quantity },
              salesCount: { decrement: item.quantity },
            },
          });
          // Re-compute stock status from the freshly updated value
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockStatus: computeStockStatus(updated.inventoryQty),
            },
          });
        }

        return cancelled;
      });

      // 3. Audit log
      await createAuditLog({
        userId,
        action: 'ORDER_CANCELLED',
        ipAddress: req.ip,
        details: {
          message: `Order ${updatedOrder.invoiceNumber} cancelled by customer. Inventory restored for ${existing.orderItems.length} item(s).${refundTriggered ? ' Refund marked as REFUNDED.' : ''}`,
          orderId: id,
          invoiceNumber: updatedOrder.invoiceNumber,
          restoredItems: existing.orderItems.map((i: any) => ({ productId: i.productId, qty: i.quantity })),
          refundTriggered,
        },
      });

      // 4. Notify customer in real-time via socket
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit('order:status_changed', {
          orderId: updatedOrder.id,
          invoiceNumber: updatedOrder.invoiceNumber,
          newStatus: 'CANCELLED',
          updatedAt: new Date(),
        });
      }

      // Invalidate admin cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:admin:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      } catch (err: any) {
        console.error('Failed to invalidate admin cache:', err);
      }

      return res.status(200).json({
        success: true,
        message: refundTriggered
          ? 'Order cancelled successfully. A refund will be processed within 5–7 business days.'
          : 'Order cancelled successfully.',
        data: updatedOrder,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/orders/:id/quick-status (Admin / Staff Only)
   * Admin: accepts or rejects a quick order request
   */
  static async adminUpdateQuickOrderStatus(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { quickOrderStatus, quickOrderProposedDate, adminProposalNote } = req.body;

    if (!['APPROVED', 'REJECTED', 'DATE_CHANGE_PROPOSED'].includes(quickOrderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid quick order status' });
    }

    if (quickOrderStatus === 'DATE_CHANGE_PROPOSED' && (!quickOrderProposedDate || !adminProposalNote)) {
      return res.status(400).json({ success: false, message: 'Proposed date and admin note are required' });
    }

    try {
      const existing = await prisma.order.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (!existing.isQuickOrder) {
        return res.status(400).json({ success: false, message: 'Order is not a quick order' });
      }

      let updateData: any = { quickOrderStatus };
      let runCancellation = false;
      
      // If rejected, mark main order status as CANCELLED and free slots
      if (quickOrderStatus === 'REJECTED') {
        updateData = {
          quickOrderStatus: 'REJECTED',
          status: 'CANCELLED',
          quickOrderProposedDate: null,
          adminProposalNote: null,
          userRejectionNote: null,
        };
        runCancellation = true;
      } else if (quickOrderStatus === 'DATE_CHANGE_PROPOSED') {
        updateData = {
          quickOrderStatus: 'DATE_CHANGE_PROPOSED',
          quickOrderProposedDate: new Date(quickOrderProposedDate),
          adminProposalNote: adminProposalNote,
          userRejectionNote: null, // Clear any previous user rejection note when admin counters
        };
      } else if (quickOrderStatus === 'APPROVED') {
        updateData = {
          quickOrderStatus: 'APPROVED',
          quickOrderProposedDate: null,
          adminProposalNote: null,
          userRejectionNote: null,
        };
      }

      let order;
      if (runCancellation) {
        // Load order with items to restore inventory
        const fullOrder = await prisma.order.findUnique({
          where: { id },
          include: {
            orderItems: true,
          },
        });

        if (!fullOrder) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order = await prisma.$transaction(async (tx: any) => {
          // 1. Update order status and quickOrderStatus to REJECTED/CANCELLED
          const updated = await tx.order.update({
            where: { id },
            data: updateData,
          });

          // 2. Restore inventory for each item in the order
          for (const item of fullOrder.orderItems) {
            const updatedProd = await tx.product.update({
              where: { id: item.productId },
              data: {
                inventoryQty: { increment: item.quantity },
                salesCount: { decrement: item.quantity },
              },
            });
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockStatus: computeStockStatus(updatedProd.inventoryQty),
              },
            });
          }

          // 3. Cancel associated studio fitting appointment (frees the slot)
          await tx.appointment.updateMany({
            where: {
              notes: {
                contains: fullOrder.invoiceNumber,
              },
            },
            data: {
              status: 'CANCELLED',
            },
          });

          // 4. Cancel associated home visit fitting (frees the slot)
          await tx.storeVisit.updateMany({
            where: {
              requirements: {
                contains: fullOrder.invoiceNumber,
              },
            },
            data: {
              status: 'CANCELLED',
            },
          });

          return updated;
        });
      } else {
        order = await prisma.order.update({
          where: { id },
          data: updateData,
        });
      }

      await createAuditLog({
        userId: req.user!.id,
        action: 'QUICK_ORDER_STATUS_CHANGED',
        ipAddress: req.ip,
        details: {
          message: `Quick order request for ${order.invoiceNumber} was ${quickOrderStatus} by ${req.user!.fullName}`,
          orderId: id,
          quickOrderStatus,
          quickOrderProposedDate: quickOrderStatus === 'DATE_CHANGE_PROPOSED' ? quickOrderProposedDate : undefined,
          adminProposalNote: quickOrderStatus === 'DATE_CHANGE_PROPOSED' ? adminProposalNote : undefined,
          triggeredBy: req.user!.fullName,
        },
      });

      // Queue notification to user
      if (order.userId) {
        let title = 'Quick Order Update';
        let body = `Your quick order ${order.invoiceNumber} status is now ${order.quickOrderStatus}.`;
        if (quickOrderStatus === 'APPROVED') {
          title = 'Quick Order Approved';
          body = `Your quick order ${order.invoiceNumber} has been approved. Expected delivery: ${order.quickOrderExpectedDate ? new Date(order.quickOrderExpectedDate).toLocaleDateString('en-IN') : 'N/A'}`;
        } else if (quickOrderStatus === 'REJECTED') {
          title = 'Quick Order Rejected';
          body = `Your quick order request for ${order.invoiceNumber} was rejected by Admin.`;
        } else if (quickOrderStatus === 'DATE_CHANGE_PROPOSED') {
          title = 'Delivery Date Change Proposed';
          body = `Admin proposed to deliver your quick order ${order.invoiceNumber} on ${order.quickOrderProposedDate ? new Date(order.quickOrderProposedDate).toLocaleDateString('en-IN') : 'N/A'}. Please accept or reject.`;
        }

        await JobsProducer.queueNotification({
          userId: order.userId,
          channels: ['PUSH'],
          templates: {
            push: { title, body },
          },
        }).catch(err => console.error('Failed to queue quick order notification:', err));

        // Also emit real-time event to socket
        const io = getIO();
        if (io) {
          io.to(`user:${order.userId}`).emit('order:status_changed', {
            orderId: order.id,
            invoiceNumber: order.invoiceNumber,
            newStatus: order.status,
            quickOrderStatus: order.quickOrderStatus,
            updatedAt: new Date(),
          });
        }
      }

      // Invalidate admin cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:admin:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      } catch (err: any) {
        console.error('Failed to invalidate admin cache:', err);
      }

      return res.status(200).json({
        success: true,
        message: `Quick order ${quickOrderStatus.toLowerCase()} successfully`,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /orders/:id/quick-respond
   * Customer: accepts or rejects proposed date change
   */
  static async customerRespondToQuickOrderProposedDate(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { action, userRejectionNote } = req.body; // 'ACCEPT' | 'REJECT'

    if (!['ACCEPT', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be ACCEPT or REJECT' });
    }
    
    if (action === 'REJECT' && !userRejectionNote) {
      return res.status(400).json({ success: false, message: 'Reason for rejection is required' });
    }

    try {
      const existing = await prisma.order.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      // Ensure the logged in user is the owner of the order
      if (existing.userId !== req.user!.id) {
        return res.status(403).json({ success: false, message: 'Unauthorized access to this order' });
      }

      if (!existing.isQuickOrder || existing.quickOrderStatus !== 'DATE_CHANGE_PROPOSED') {
        return res.status(400).json({ success: false, message: 'Order does not have a proposed date change request' });
      }

      let updateData: any = {};
      if (action === 'ACCEPT') {
        if (!existing.quickOrderProposedDate) {
          return res.status(400).json({ success: false, message: 'No proposed date found on the order' });
        }
        updateData = {
          quickOrderStatus: 'ADMIN_FINAL_APPROVAL_PENDING',
          quickOrderExpectedDate: existing.quickOrderProposedDate,
          quickOrderProposedDate: null,
          adminProposalNote: null,
        };
      } else if (action === 'REJECT') {
        updateData = {
          quickOrderStatus: 'USER_REJECTED_PROPOSAL',
          userRejectionNote: userRejectionNote,
        };
      }

      const order = await prisma.order.update({
        where: { id },
        data: updateData,
      });

      await createAuditLog({
        userId: req.user!.id,
        action: 'QUICK_ORDER_STATUS_CHANGED',
        ipAddress: req.ip,
        details: {
          message: `Customer ${req.user!.fullName} ${action.toLowerCase()}ed the proposed quick order date. Status is now ${order.quickOrderStatus}`,
          orderId: id,
          action,
          triggeredBy: req.user!.fullName,
        },
      });

      // Queue notification to user confirming their action
      if (order.userId) {
        const title = action === 'ACCEPT' ? 'Delivery Proposal Accepted' : 'Delivery Proposal Rejected';
        const body = action === 'ACCEPT' 
          ? `You have accepted the new proposed delivery date for order ${order.invoiceNumber}. Awaiting final Admin confirmation.`
          : `You have rejected the proposed delivery date for order ${order.invoiceNumber}. The admin will review your feedback.`;

        await JobsProducer.queueNotification({
          userId: order.userId,
          channels: ['PUSH'],
          templates: {
            push: { title, body },
          },
        }).catch(err => console.error('Failed to queue customer response notification:', err));

        // Emit real-time event to the customer's personal socket room
        const io = getIO();
        if (io) {
          io.to(`user:${order.userId}`).emit('order:status_changed', {
            orderId: order.id,
            invoiceNumber: order.invoiceNumber,
            newStatus: order.status,
            quickOrderStatus: order.quickOrderStatus,
            updatedAt: new Date(),
          });

          // Emit real-time event to admin room so admin panel refreshes
          io.to('admins').emit('order:quick_order_response', {
            orderId: order.id,
            invoiceNumber: order.invoiceNumber,
            quickOrderStatus: order.quickOrderStatus,
            action,
            userRejectionNote: action === 'REJECT' ? userRejectionNote : undefined,
            updatedAt: new Date(),
          });
        }
      }

      // Invalidate admin cache
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:admin:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      } catch (err: any) {
        console.error('Failed to invalidate admin cache:', err);
      }

      return res.status(200).json({
        success: true,
        message: `Quick order date change request ${action.toLowerCase()}ed successfully`,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }
}

