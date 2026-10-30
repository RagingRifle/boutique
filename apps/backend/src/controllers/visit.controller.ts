import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import { Role, VisitStatus } from '@prisma/client';
import R2Service from '../services/r2.service.js';
import { getIO } from '../socket/socket.handler.js';
import { createAuditLog } from '../utils/audit.js';
import redis from '../config/redis.js';

export const visitCreateSchema = z.object({
  body: z.object({
    preferredDate: z.string().datetime(),
    address: z.string().min(1),
    requirements: z.string().min(1),
    orderId: z.string().uuid().optional().nullable(),
  }),
});

export const visitAssignSchema = z.object({
  body: z.object({
    assignedStaffId: z.string().uuid(),
    confirmedDate: z.string().datetime(),
  }),
});

export const visitUpdateSchema = z.object({
  body: z.object({
    preferredDate: z.string().datetime().optional(),
    confirmedDate: z.string().datetime().optional(),
    address: z.string().min(1).optional(),
    requirements: z.string().min(1).optional(),
    status: z.enum(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    orderId: z.string().uuid().optional().nullable(),
    assignedStaffId: z.string().uuid().optional().nullable(),
  }),
});

export class VisitController {
  /**
   * GET /visits
   */
  static async getVisits(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { page = 1, limit = 20 } = req.query as any;
    const safeLimit = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * safeLimit;

    try {
      const where: any = {};
      if (user.role === Role.CUSTOMER) {
        where.customerId = user.id;
      }
      const [visits, total] = await Promise.all([
        prisma.storeVisit.findMany({
          where,
          orderBy: { preferredDate: 'asc' },
          skip,
          take: safeLimit,
          include: {
            customer: {
              select: {
                fullName: true,
                email: true,
                phoneNumber: true,
              },
            },
            assignedStaff: {
              select: {
                fullName: true,
              },
            },
            report: true,
          },
        }),
        prisma.storeVisit.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: visits,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /visits
   */
  static async createVisit(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { preferredDate, address, requirements, orderId } = req.body;

    try {
      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true } });
        if (!order || order.userId !== user.id) {
          return res.status(400).json({ success: false, message: 'This home visit cannot be linked to the order.' });
        }
      }

      if (user.role === Role.CUSTOMER) {
        // Layer 1: Burst limit (1 request per 3 seconds per user)
        const burstKey = `visit:burst:${user.id}`;
        const burstLock = await redis.set(burstKey, 'locked', 'EX', 3, 'NX');
        if (!burstLock) {
          return res.status(429).json({ success: false, message: 'Please wait a few seconds before making another visit request.' });
        }

        // Layer 2 & 3: Daily Quotas (User & IP)
        const todayStr = new Date().toISOString().split('T')[0];
        const dailyUserKey = `visit:daily:${user.id}:${todayStr}`;
        const dailyIpKey = `visit:daily_ip:${req.ip}:${todayStr}`;

        const userCount = await redis.incr(dailyUserKey);
        const ipCount = await redis.incr(dailyIpKey);

        if (userCount === 1) await redis.expire(dailyUserKey, 86400);
        if (ipCount === 1) await redis.expire(dailyIpKey, 86400);

        if (userCount > 20 || ipCount > 30) {
          return res.status(429).json({
            success: false,
            message: 'You have reached the daily store visit limit. Please try again tomorrow.',
          });
        }
      }

      const visit = await prisma.storeVisit.create({
        data: {
          customerId: user.id,
          preferredDate: new Date(preferredDate),
          address,
          requirements,
          orderId: orderId || undefined,
        },
      });

      // Broadcast to admins
      const io = getIO();
      if (io) {
        io.to('admins').emit('visit:status_changed', {
          visitId: visit.id,
          status: visit.status,
        });
      }

      return res.status(201).json({ success: true, data: visit });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /visits/:id/assign
   * Admin Only
   */
  static async assignVisit(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    const { assignedStaffId, confirmedDate } = req.body;

    try {
      const visit = await prisma.storeVisit.findUnique({ where: { id } });
      if (!visit) {
        return res.status(404).json({ success: false, message: 'Store visit request not found' });
      }

      const staff = await prisma.user.findUnique({ where: { id: assignedStaffId } });
      if (!staff || (staff.role !== Role.STAFF && staff.role !== Role.ADMIN)) {
        return res.status(400).json({ success: false, message: 'Invalid staff assignment: Assigned user must be STAFF or ADMIN' });
      }

      const updatedVisit = await prisma.storeVisit.update({
        where: { id },
        data: {
          assignedStaffId,
          confirmedDate: new Date(confirmedDate),
          status: VisitStatus.ASSIGNED,
        },
      });

      // Log assignment in AuditLog
      await createAuditLog({
        userId: req.user!.id,
        action: 'STAFF_ASSIGNED_TO_VISIT',
        ipAddress: req.ip,
        details: {
          message: `Admin ${req.user!.fullName} assigned staff member ${staff.fullName} (ID: ${assignedStaffId}) to store visit request ${id}`,
          visitId: id,
          assignedStaffId,
          confirmedDate,
        },
      });

      // Broadcast WebSocket notification to Staff, Customer and Admins
      const io = getIO();
      if (io) {
        io.to(`user:${visit.customerId}`).to(`user:${assignedStaffId}`).to('admins').emit('visit:status_changed', {
          visitId: updatedVisit.id,
          status: updatedVisit.status,
          confirmedDate: updatedVisit.confirmedDate,
        });
      }

      return res.status(200).json({ success: true, data: updatedVisit });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /visits/:id/status
   * Staff / Admin Only
   * Handle completion and multipart image upload
   */
  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { id } = req.params;
    const { status, completionNotes } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    try {
      const visit = await prisma.storeVisit.findUnique({
        where: { id },
      });

      if (!visit) {
        return res.status(404).json({ success: false, message: 'Store visit not found' });
      }

      // Authorization check (Must be assigned staff or admin)
      if (visit.assignedStaffId !== user.id && user.role !== Role.ADMIN && user.role !== Role.SUPERADMIN) {
        return res.status(403).json({ success: false, message: 'Forbidden: You are not assigned to this visit request' });
      }

      if (status === 'COMPLETED' || status === VisitStatus.COMPLETED) {
        if (!completionNotes) {
          return res.status(400).json({ success: false, message: 'Completion notes are required to complete a visit' });
        }

        // Upload verification photos to R2
        let mediaUrls: string[] = [];
        if (req.body.mediaUrls) {
          try {
            mediaUrls = Array.isArray(req.body.mediaUrls) ? req.body.mediaUrls : JSON.parse(req.body.mediaUrls);
          } catch (e) {
            if (typeof req.body.mediaUrls === 'string') {
              mediaUrls = [req.body.mediaUrls];
            }
          }
        }
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileKey = `visits/${visit.id}/report-img-${i}-${Date.now()}`;
            const url = await R2Service.uploadFile(file.buffer, fileKey, file.mimetype);
            mediaUrls.push(url);
          }
        }

        // Write visit report and complete inside a transaction
        const updatedVisit = await prisma.$transaction(async (tx: any) => {
          // Update visit state
          const updated = await tx.storeVisit.update({
            where: { id },
            data: { status: VisitStatus.COMPLETED },
          });

          // Generate Report
          await tx.visitReport.create({
            data: {
              visitId: id,
              staffId: user.id,
              completionNotes,
              mediaUrls,
            },
          });

          return updated;
        });

        // Broadcast completions
        const io = getIO();
        if (io) {
          io.to(`user:${visit.customerId}`).to('admins').emit('visit:status_changed', {
            visitId: updatedVisit.id,
            status: updatedVisit.status,
          });
        }

        return res.status(200).json({ success: true, data: updatedVisit });
      }

      // Simple status update (e.g. IN_PROGRESS)
      const updatedVisit = await prisma.storeVisit.update({
        where: { id },
        data: { status: status as VisitStatus },
      });

      const io = getIO();
      if (io) {
        io.to(`user:${visit.customerId}`).to('admins').emit('visit:status_changed', {
          visitId: updatedVisit.id,
          status: updatedVisit.status,
        });
      }

      return res.status(200).json({ success: true, data: updatedVisit });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /visits/:id
   * General update for store visit (e.g. rescheduling)
   */
  static async updateVisit(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { id } = req.params;
    const { preferredDate, confirmedDate, address, requirements, status, orderId, assignedStaffId } = req.body;

    try {
      const visit = await prisma.storeVisit.findUnique({
        where: { id },
      });

      if (!visit) {
        return res.status(404).json({ success: false, message: 'Store visit not found' });
      }

      // Check ownership/permissions
      if (visit.customerId !== user.id && user.role === Role.CUSTOMER) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not own this visit request' });
      }

      if (assignedStaffId !== undefined) {
        if (user.role === Role.CUSTOMER) {
          return res.status(403).json({ success: false, message: 'Only staff can assign a home visit.' });
        }
        if (assignedStaffId) {
          const staff = await prisma.user.findFirst({
            where: { id: assignedStaffId, role: { in: [Role.STAFF, Role.ADMIN, Role.SUPERADMIN] } },
            select: { id: true },
          });
          if (!staff) return res.status(400).json({ success: false, message: 'Select a valid staff member.' });
        }
      }

      // Reset to PENDING if user reschedules so admin can re-confirm/assign staff
      let targetStatus = status;
      if (preferredDate && user.role === Role.CUSTOMER) {
        targetStatus = 'PENDING';
      }

      const updated = await prisma.storeVisit.update({
        where: { id },
        data: {
          ...(preferredDate && { preferredDate: new Date(preferredDate) }),
          ...(confirmedDate && { confirmedDate: new Date(confirmedDate) }),
          ...(address && { address }),
          ...(requirements && { requirements }),
          ...(targetStatus && { status: targetStatus as VisitStatus }),
          ...(orderId !== undefined && { orderId }),
          ...(assignedStaffId !== undefined && { assignedStaffId }),
        },
        include: { assignedStaff: { select: { id: true, fullName: true } } },
      });

      // Broadcast WebSocket notification to Staff, Customer and Admins
      const io = getIO();
      if (io) {
        io.to(`user:${visit.customerId}`).to('admins').emit('visit:status_changed', {
          visitId: updated.id,
          status: updated.status,
          preferredDate: updated.preferredDate,
          confirmedDate: updated.confirmedDate,
        });
      }

      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
