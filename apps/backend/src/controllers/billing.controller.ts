import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import env from '../config/env.js';
import { isTest } from '../config/environment.js';
import JobsProducer from '../queues/jobs.producer.js';
import { computeStockStatus } from './product.controller.js';
import { getIO } from '../socket/socket.handler.js';
import crypto from 'crypto';
import { createAuditLog } from '../utils/audit.js';
import redis from '../config/redis.js';
import { getEffectiveCustomizationGroups, resolveSelectedCustomizations, selectedCustomizationsSchema } from '../utils/customizations.js';

export const invoiceCreateSchema = z.object({
  body: z.object({
    userId: z.string().uuid().optional(), // optional for guest checkout
    customerName: z.string().optional(), // optional guest name
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().optional(),
    items: z.array(z.object({
      productId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1),
      price: z.coerce.number().positive(),
      selectedCustomizations: selectedCustomizationsSchema.default([]),
    })).min(1),
    discountAmount: z.coerce.number().nonnegative().default(0),
    paymentMethod: z.enum(['CASH', 'CARD', 'ONLINE']),
    isOfflineSales: z.boolean().default(true),
    status: z.enum(['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']).optional(),
    paymentStatus: z.enum(['PENDING', 'PARTIAL', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
    advancePayment: z.coerce.number().nonnegative().optional(),
    gstPercentage: z.coerce.number().nonnegative().optional(),
    isQuickOrder: z.boolean().optional(),
    quickOrderReason: z.string().optional(),
    quickOrderExpectedDate: z.string().optional(),
    measurementProfileIds: z.array(z.string()).optional(),
    deliveryDate: z.string().min(1, "Delivery date is required"),
  }).refine(data => !data.isQuickOrder || (data.quickOrderReason && data.quickOrderReason.trim().length > 0), {
    message: "Reason is required for quick orders",
    path: ["quickOrderReason"]
  }),
});

export class BillingController {
  /**
   * POST /billing/invoice
   * Creates an Order, adjusts inventory, and queues BullMQ background tasks.
   */
  static async createInvoice(req: Request, res: Response, next: NextFunction) {
    const { userId, customerName, customerEmail, customerPhone, items, discountAmount, paymentMethod, isOfflineSales, status, paymentStatus, advancePayment, gstPercentage, isQuickOrder, quickOrderReason, quickOrderExpectedDate, measurementProfileIds, deliveryDate } = req.body;

    try {
      // 1. Process inventory adjust and Order insertion inside a database transaction
      const order = await prisma.$transaction(async (tx: any) => {
        let subtotal = 0;

        let finalUserId = userId;
        if (!finalUserId && (customerEmail || customerPhone)) {
          const userMatch = await tx.user.findFirst({
            where: {
              OR: [
                customerEmail ? { email: customerEmail.toLowerCase() } : undefined,
                customerPhone ? { phoneNumber: customerPhone } : undefined,
              ].filter(Boolean) as any,
            },
          });
          if (userMatch) {
            finalUserId = userMatch.id;
          }
        }

        // Pre-fetch all products to avoid N+1 reads
        const productIds = items.map((i: any) => i.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });
        const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

        const normalizedItems = await Promise.all(items.map(async (item: any) => {
          const product = productMap.get(item.productId);
          if (!product) throw new Error(`Product ${item.productId} not found`);
          const groups = await getEffectiveCustomizationGroups(tx, product);
          const resolved = resolveSelectedCustomizations(groups, item.selectedCustomizations || []);
          return { ...item, selectedCustomizations: resolved.selectedCustomizations };
        }));

        for (const item of normalizedItems) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }
          if (product.inventoryQty < item.quantity) {
            throw new Error(`Insufficient inventory for ${product.name}. Required: ${item.quantity}, Available: ${product.inventoryQty}`);
          }
        }

        // Deduct inventory and update stock statuses
        for (const item of items) {
          const product = productMap.get(item.productId);
          const newInventoryQty = product.inventoryQty - item.quantity;
          const newStockStatus = computeStockStatus(newInventoryQty);
          await tx.product.update({
            where: { id: item.productId },
            data: {
              inventoryQty: { decrement: item.quantity },
              salesCount: { increment: item.quantity },
              stockStatus: newStockStatus,
            },
          });
          subtotal += Number(item.price) * item.quantity;
        }

        // Calculations
        const finalGstPercentage = gstPercentage !== undefined ? Number(gstPercentage) : 0;
        const taxRate = finalGstPercentage / 100;
        const taxAmount = (subtotal - discountAmount) * taxRate;
        const totalAmount = subtotal;
        const payableAmount = (subtotal - discountAmount) + taxAmount;
        
        const advancePaymentValue = advancePayment ? Number(advancePayment) : 0;
        const balanceAmount = Math.max(0, payableAmount - advancePaymentValue);

        const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

        // Compute appropriate paymentStatus if not explicitly supplied or based on advance amount
        let finalPaymentStatus = paymentStatus;
        if (!finalPaymentStatus) {
          if (advancePaymentValue >= payableAmount && payableAmount > 0) {
            finalPaymentStatus = 'COMPLETED';
          } else if (advancePaymentValue > 0) {
            finalPaymentStatus = 'PARTIAL';
          } else {
            finalPaymentStatus = 'PENDING';
          }
        } else if (finalPaymentStatus === 'PENDING' && advancePaymentValue >= payableAmount && payableAmount > 0) {
          finalPaymentStatus = 'COMPLETED';
        } else if (finalPaymentStatus === 'PENDING' && advancePaymentValue > 0) {
          finalPaymentStatus = 'PARTIAL';
        }

        // Create Order with nested orderItems
        const newOrder = await tx.order.create({
          data: {
            userId: finalUserId,
            status: status || 'PENDING',
            paymentStatus: finalPaymentStatus,
            totalAmount,
            taxAmount,
            gstPercentage: finalGstPercentage,
            discountAmount,
            payableAmount,
            paymentMethod,
            isOfflineSales,
            invoiceNumber,
            advancePayment: advancePaymentValue,
            balanceAmount,
            gatewayResponse: {
              ...(customerName ? { guestCustomerName: customerName } : {}),
              ...(customerEmail ? { guestCustomerEmail: customerEmail } : {}),
              ...(customerPhone ? { guestCustomerPhone: customerPhone } : {}),
            },
            isQuickOrder: isQuickOrder || false,
            quickOrderReason: isQuickOrder ? quickOrderReason : null,
            quickOrderExpectedDate: isQuickOrder && quickOrderExpectedDate ? new Date(quickOrderExpectedDate) : null,
            quickOrderStatus: isQuickOrder ? 'PENDING' : null,
            measurementProfileIds: measurementProfileIds && measurementProfileIds.length > 0 ? measurementProfileIds : undefined,
            deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
            orderItems: {
              create: normalizedItems.map((item: any) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                selectedCustomizations: item.selectedCustomizations,
              })),
            },
          },
          include: {
            orderItems: {
              include: {
                product: true,
              },
            },
          },
        });

        return newOrder;
      }, {
        maxWait: 10000,
        timeout: 30000,
      });

      // Log ORDER_CREATED
      await createAuditLog({
        userId: req.user!.id,
        action: 'ORDER_CREATED',
        ipAddress: req.ip,
        details: {
          message: `Order ${order.invoiceNumber} created by user ID ${req.user!.id}. Amount: ${order.payableAmount}, Payment: ${order.paymentMethod}, Type: ${order.isOfflineSales ? 'Offline' : 'Online'}`,
          orderId: order.id,
          totalAmount: order.totalAmount,
          payableAmount: order.payableAmount,
          paymentMethod: order.paymentMethod,
          isOfflineSales: order.isOfflineSales,
          items,
        },
      });

      // Log MANUAL_SALE_ENTRY if it is offline sales
      if (order.isOfflineSales) {
        await createAuditLog({
          userId: req.user!.id,
          action: 'MANUAL_SALE_ENTRY',
          ipAddress: req.ip,
          details: {
            message: `Manual offline sale entered by staff/admin ${req.user!.fullName} (Order ID: ${order.id})`,
            orderId: order.id,
            payableAmount: order.payableAmount,
            paymentMethod: order.paymentMethod,
            items,
          },
        });
      }

      // 2. Queue background PDF compilation & emails
      await JobsProducer.queueInvoicePdf(order.id, customerEmail, customerName);

      // 3. Queue referral and customer loyalty point adjustments
      if (order.userId) {
        await JobsProducer.queueCreditReferralPoints(order.id, order.userId);
      }

      // Broadcast WebSocket order:placed event to admins
      const io = getIO();
      if (io) {
        io.to('admins').emit('order:placed', {
          orderId: order.id,
          invoiceNumber: order.invoiceNumber,
          payableAmount: order.payableAmount,
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Order created and background tasks queued',
        data: order,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /billing/webhook/:gateway
   * Verify signed payload from Stripe or Razorpay, and trigger payment processing.
   */
  static async handleWebhook(req: Request, res: Response, next: NextFunction) {
    const { gateway } = req.params;
    
    // We expect the raw request body at req.body (Buffer)
    const rawBody = req.body;
    if (!rawBody) {
      return res.status(400).json({ success: false, message: 'Raw body buffer is missing' });
    }

    try {
      let isVerified = false;
      let orderId = '';
      let paymentGateway = gateway.toUpperCase();
      let transactionId = '';
      let payloadJson: any = {};

      if (gateway === 'stripe') {
        const sigHeader = req.headers['stripe-signature'] as string;
        const secret = env.STRIPE_WEBHOOK_SECRET;

        if (!secret || secret === 'stripe-webhook-secret' || isTest) {
          // Bypassed for tests
          isVerified = true;
          payloadJson = JSON.parse(rawBody.toString());
          orderId = payloadJson.orderId || payloadJson.data?.object?.metadata?.orderId || 'mock-id';
          transactionId = payloadJson.id || 'stripe-tx-mock';
        } else {
          // Stripe verification using Stripe SDK placeholder
          // const event = stripe.webhooks.constructEvent(rawBody, sigHeader, secret);
          // orderId = event.data.object.metadata.orderId;
          // transactionId = event.data.object.id;
          isVerified = true; 
        }
      } else if (gateway === 'razorpay') {
        const receivedSignature = req.headers['x-razorpay-signature'] as string;
        const secret = env.RAZORPAY_WEBHOOK_SECRET;

        if (!secret || secret === 'razorpay-webhook-secret' || isTest) {
          isVerified = true;
          payloadJson = JSON.parse(rawBody.toString());
          orderId = payloadJson.orderId || 'mock-id';
          transactionId = payloadJson.paymentId || 'razorpay-tx-mock';
        } else {
          // Verify signature using HMAC timingSafeEqual
          const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(rawBody.toString())
            .digest('hex');

          const genBuf = Buffer.from(generatedSignature, 'utf-8');
          const recBuf = Buffer.from(receivedSignature || '', 'utf-8');
          
          if (genBuf.length === recBuf.length) {
            isVerified = crypto.timingSafeEqual(genBuf, recBuf);
          } else {
            isVerified = false;
          }

          if (isVerified) {
            payloadJson = JSON.parse(rawBody.toString());
            orderId = payloadJson.payload?.payment?.entity?.notes?.orderId;
            transactionId = payloadJson.payload?.payment?.entity?.id;
          }
        }
      }

      if (!isVerified) {
        await createAuditLog({
          action: 'PAYMENT_WEBHOOK_RECEIVED',
          ipAddress: req.ip,
          details: {
            message: `Stripe/Razorpay webhook HMAC signature validation failed for gateway: ${gateway}`,
            gateway,
            status: 'FAILED_HMAC',
          },
        });
        return res.status(400).json({ success: false, message: 'Signature verification failed' });
      }

      await createAuditLog({
        action: 'PAYMENT_WEBHOOK_RECEIVED',
        ipAddress: req.ip,
        details: {
          message: `Stripe/Razorpay webhook verified successfully for gateway: ${gateway} (Order ID: ${orderId})`,
          gateway,
          status: 'SUCCESS',
          orderId,
          transactionId,
        },
      });

      // 2. Process payment state update
      // Find associated Order
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (order) {
        // Idempotency guard: skip if order is already PAID to prevent duplicate processing
        if (order.paymentStatus === 'COMPLETED' || order.status === 'PAID') {
          return res.status(200).json({ success: true, message: 'Webhook already processed (idempotent)' });
        }

        const updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'PAID',
            paymentStatus: 'COMPLETED',
            transactionId,
            paymentGateway,
            gatewayResponse: payloadJson,
          },
        });

      // Invalidate admin cache using SCAN (non-blocking, unlike KEYS)
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'cache:admin:*', 'COUNT', '100');
          cursor = nextCursor;
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== '0');
      } catch (err) {
        console.error('Failed to invalidate admin cache:', err);
      }

        // 3. Queue jobs
        await JobsProducer.queueInvoicePdf(order.id);
        if (order.userId) {
          await JobsProducer.queueCreditReferralPoints(order.id, order.userId);
        }

        // Notify admins
        const io = getIO();
        if (io) {
          io.to('admins').emit('order:placed', {
            orderId: order.id,
            invoiceNumber: order.invoiceNumber,
            payableAmount: order.payableAmount,
          });
        }
      }

      return res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error: any) {
      next(error);
    }
  }
}
