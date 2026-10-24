import { Router } from 'express';
import { OrderController, orderStatusUpdateSchema, orderCheckoutSchema, orderCustomizationsUpdateSchema } from '../controllers/order.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Customer endpoints
router.get('/', OrderController.getOrders);
router.post('/checkout', validate(orderCheckoutSchema), OrderController.checkout);

// Admin / Staff endpoints — MUST be before /:id to prevent wildcard conflict
router.get('/admin/list', authorize(Role.ADMIN, Role.SUPERADMIN, Role.STAFF), OrderController.adminListOrders);
router.put('/admin/:id/customizations', authorize(Role.ADMIN, Role.SUPERADMIN, Role.STAFF), validate(orderCustomizationsUpdateSchema), OrderController.adminUpdateOrderCustomizations);
router.put('/admin/:id/status', authorize(Role.ADMIN, Role.SUPERADMIN, Role.STAFF), validate(orderStatusUpdateSchema), OrderController.adminUpdateOrderStatus);
router.put('/admin/:id/quick-status', authorize(Role.ADMIN, Role.SUPERADMIN, Role.STAFF), OrderController.adminUpdateQuickOrderStatus);
router.get('/admin/:id/packing-slip', authorize(Role.ADMIN, Role.SUPERADMIN, Role.STAFF), OrderController.adminGetPackingSlip);

// Dynamic /:id routes — MUST be after all static paths
router.get('/:id', OrderController.getOrderById);
router.get('/:id/invoice-pdf', OrderController.downloadInvoicePdf);
router.post('/:id/cancel', OrderController.cancelOrder);
router.post('/:id/quick-respond', OrderController.customerRespondToQuickOrderProposedDate);

export default router;
