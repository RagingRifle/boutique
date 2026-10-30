import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import { Role, AppointmentStatus, AppointmentType } from '@prisma/client';
import { getIO } from '../socket/socket.handler.js';
import { createAuditLog } from '../utils/audit.js';
import redis from '../config/redis.js';

export const appointmentCreateSchema = z.object({
  body: z.object({
    date: z.string().datetime(),
    timeSlot: z.string().min(1),
    productType: z.string().min(1),
    type: z.enum(['MEASUREMENT', 'CONSULTATION', 'PRODUCT_SELECTION']),
    notes: z.string().optional(),
    userId: z.string().uuid().optional(),
    adminOverride: z.boolean().optional(),
    staffId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional().nullable(),
  }),
});

export const appointmentUpdateSchema = z.object({
  body: z.object({
    date: z.string().datetime().optional(),
    timeSlot: z.string().min(1).optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'CONSULTED', 'ORDERED']).optional(),
    notes: z.string().optional(),
    orderId: z.string().uuid().optional().nullable(),
    assignedStaffId: z.string().uuid().optional().nullable(),
  }),
});

export class AppointmentController {
  /**
   * GET /appointments
   */
  static async getAppointments(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { page = 1, limit = 10, status, startDate, endDate, userId } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    try {
      const where: any = {};

      // Role check
      if (user.role === Role.CUSTOMER) {
        where.userId = user.id;
      } else {
        // Staff/Admin can filter by customer userId
        if (userId) {
          where.userId = userId;
        }
      }

      if (status) {
        where.status = status as AppointmentStatus;
      }

      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
      }

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          orderBy: { date: 'asc' },
          skip,
          take: Number(limit),
          include: {
            user: { select: { fullName: true, email: true, phoneNumber: true } },
            assignedStaff: { select: { id: true, fullName: true } },
          },
        }),
        prisma.appointment.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: appointments,
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
   * GET /appointments/availability
   */
  static async getAvailability(req: Request, res: Response, next: NextFunction) {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date query parameter is required' });
    }

    try {
      const parsedDate = new Date(date as string);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }

      const [appointments, settings] = await Promise.all([
        prisma.appointment.groupBy({
          by: ['timeSlot'],
          where: {
            date: parsedDate,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          _count: {
            id: true,
          },
        }),
        prisma.systemSettings.findUnique({ where: { id: 'default' } })
      ]);

      const availability = appointments.reduce((acc: any, curr) => {
        acc[curr.timeSlot] = curr._count.id;
        return acc;
      }, {});

      // Fallback settings if default not found
      const startHour = settings?.businessHoursStart || '09:00';
      const endHour = settings?.businessHoursEnd || '18:00';
      const duration = settings?.bookingSlotDurationMinutes || 60;
      const maxSlots = settings?.maxBookingsPerSlot || 5;

      const [startH, startM] = startHour.split(':').map(Number);
      const [endH, endM] = endHour.split(':').map(Number);
      
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;

      const generatedSlots: string[] = [];
      for (let time = startTime; time + duration <= endTime; time += duration) {
        const sh = Math.floor(time / 60).toString().padStart(2, '0');
        const sm = (time % 60).toString().padStart(2, '0');
        const eh = Math.floor((time + duration) / 60).toString().padStart(2, '0');
        const em = ((time + duration) % 60).toString().padStart(2, '0');
        generatedSlots.push(`${sh}:${sm} - ${eh}:${em}`);
      }

      // Filter past slots if the requested date is today
      const now = new Date();
      const isToday = parsedDate.toDateString() === now.toDateString();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const availableSlots = generatedSlots.filter(slot => {
        const count = availability[slot] || 0;
        if (count >= maxSlots) return false;
        
        if (isToday) {
          const startStr = slot.split(' - ')[0];
          const [h, m] = startStr.split(':').map(Number);
          const slotMinutes = h * 60 + m;
          if (slotMinutes <= currentMinutes) return false;
        }
        
        return true;
      });

      return res.status(200).json({
        success: true,
        data: {
          counts: availability,
          availableSlots,
          debug: {
            now: now.toISOString(),
            parsedDate: parsedDate.toISOString(),
            isToday,
            currentMinutes,
            startTime,
            endTime,
            duration,
            maxSlots,
            generatedSlots
          }
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /appointments
   */
  static async createAppointment(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { date, timeSlot, productType, type, notes, userId, adminOverride, staffId, orderId } = req.body;

    const appointmentDate = new Date(date);
    const lockKey = `lock:appointment:${appointmentDate.toISOString()}:${timeSlot}`;
    let lockAcquired = false;

    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
      const maxSlots = settings?.maxBookingsPerSlot || 5;
      const bypassLimits = adminOverride && (user.role === Role.ADMIN || user.role === Role.SUPERADMIN || user.role === Role.STAFF);

      let targetUserId = user.id;
      if (user.role !== Role.CUSTOMER) {
        targetUserId = userId || null;
      }

      if (orderId) {
        const linkedOrder = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true } });
        if (!linkedOrder || linkedOrder.userId !== targetUserId) {
          return res.status(400).json({ success: false, message: 'The order cannot be linked to this customer booking.' });
        }
      }

      if (!bypassLimits) {
        // Layer 1: Burst limit (1 request per 3 seconds per user)
        const burstKey = `booking:burst:${targetUserId}`;
        const burstLock = await redis.set(burstKey, 'locked', 'EX', 3, 'NX');
        if (!burstLock) {
          return res.status(429).json({ success: false, message: 'Please wait a few seconds before making another booking request.' });
        }

        // Layer 2 & 3: Daily Quotas (User & IP)
        const todayStr = new Date().toISOString().split('T')[0];
        const dailyUserKey = `booking:daily:${targetUserId}:${todayStr}`;
        const dailyIpKey = `booking:daily_ip:${req.ip}:${todayStr}`;

        const userCount = await redis.incr(dailyUserKey);
        const ipCount = await redis.incr(dailyIpKey);

        if (userCount === 1) await redis.expire(dailyUserKey, 86400);
        if (ipCount === 1) await redis.expire(dailyIpKey, 86400);

        if (userCount > 20 || ipCount > 30) {
          return res.status(429).json({
            success: false,
            message: 'You have reached the daily booking limit. Please try again tomorrow.',
          });
        }

        // Acquire Redis lock
        for (let attempt = 0; attempt < 5; attempt++) {
          const resLock = await redis.set(lockKey, 'locked', 'PX', 3000, 'NX');
          if (resLock === 'OK') {
            lockAcquired = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
        }

        if (!lockAcquired) {
          return res.status(429).json({
            success: false,
            message: 'Too many concurrent booking requests for this slot. Please try again.',
          });
        }
      }

      // Check slot constraint to allow up to 5 bookings per slot
      const slotCount = await prisma.appointment.count({
        where: {
          date: appointmentDate,
          timeSlot,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });

      if (slotCount >= maxSlots && !bypassLimits) {
        if (lockAcquired) await redis.del(lockKey);
        return res.status(409).json({
          success: false,
          message: `The requested appointment slot is fully booked (maximum ${maxSlots} bookings). Please choose another time.`,
        });
      }

      const appointment = await prisma.appointment.create({
        data: {
          userId: targetUserId,
          date: appointmentDate,
          timeSlot,
          productType,
          type: type as AppointmentType,
          notes,
          orderId,
          assignedStaffId: staffId,
        },
        include: { user: { select: { fullName: true, email: true } }, assignedStaff: { select: { fullName: true } } },
      });

      if (lockAcquired) {
        await redis.del(lockKey);
      }

      // Broadcast appointment:created event to admins
      const io = getIO();
      if (io) {
        io.to('admins').emit('appointment:created', {
          id: appointment.id,
          customerName: appointment.user ? appointment.user.fullName : 'Walk-In Customer',
          date: appointment.date,
          timeSlot: appointment.timeSlot,
          type: appointment.type,
          assignedStaff: appointment.assignedStaff ? appointment.assignedStaff.fullName : null,
        });
      }

      return res.status(201).json({ success: true, data: appointment });
    } catch (error) {
      if (lockAcquired) {
        await redis.del(lockKey).catch(() => { });
      }
      next(error);
    }
  }

  /**
   * PUT /appointments/:id
   */
  static async updateAppointment(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { id } = req.params;
    const { date, timeSlot, status, notes, orderId, assignedStaffId } = req.body;

    let lockKey: string | null = null;
    let lockAcquired = false;

    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      // Check ownership
      if (appointment.userId !== user.id && user.role === Role.CUSTOMER) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not own this booking' });
      }

      if (assignedStaffId !== undefined) {
        if (user.role === Role.CUSTOMER) {
          return res.status(403).json({ success: false, message: 'Only staff can assign a fitting.' });
        }
        if (assignedStaffId) {
          const staff = await prisma.user.findFirst({
            where: { id: assignedStaffId, role: { in: [Role.STAFF, Role.ADMIN, Role.SUPERADMIN] } },
            select: { id: true },
          });
          if (!staff) return res.status(400).json({ success: false, message: 'Select a valid staff member.' });
        }
      }

      // Enforce cancellation limit: Prevents cancellations if the start time is less than 2 hours away.
      if (status === 'CANCELLED' || status === AppointmentStatus.CANCELLED) {
        const appointmentTime = new Date(appointment.date).getTime();
        const differenceMs = appointmentTime - Date.now();
        const twoHoursMs = 2 * 60 * 60 * 1000;

        if (differenceMs < twoHoursMs) {
          return res.status(400).json({
            success: false,
            message: 'Cancellations are not permitted less than 2 hours prior to the scheduled slot.',
          });
        }
      }

      // Check double-booking slot constraints if changing date/time (allow up to 5)
      if (date || timeSlot) {
        const checkDate = date ? new Date(date) : appointment.date;
        const checkSlot = timeSlot || appointment.timeSlot;

        lockKey = `lock:appointment:${new Date(checkDate).toISOString()}:${checkSlot}`;

        // Acquire Redis lock
        for (let attempt = 0; attempt < 5; attempt++) {
          const resLock = await redis.set(lockKey, 'locked', 'PX', 3000, 'NX');
          if (resLock === 'OK') {
            lockAcquired = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
        }

        if (!lockAcquired) {
          return res.status(429).json({
            success: false,
            message: 'Too many concurrent booking requests for this slot. Please try again.',
          });
        }

        const slotCount = await prisma.appointment.count({
          where: {
            id: { not: id },
            date: checkDate,
            timeSlot: checkSlot,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        });

        const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } });
        const maxSlots = settings?.maxBookingsPerSlot || 5;

        if (slotCount >= maxSlots) {
          if (lockAcquired) await redis.del(lockKey);
          return res.status(409).json({
            success: false,
            message: `Slot conflict: The updated time slot is fully booked (maximum ${maxSlots} bookings).`,
          });
        }
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          ...(date && { date: new Date(date) }),
          ...(timeSlot && { timeSlot }),
          ...(status && { status: status as AppointmentStatus }),
          ...(notes !== undefined && { notes }),
          ...(orderId !== undefined && { orderId }),
          ...(assignedStaffId !== undefined && { assignedStaffId }),
        },
        include: { assignedStaff: { select: { id: true, fullName: true } } },
      });

      if (lockAcquired && lockKey) {
        await redis.del(lockKey);
      }

      if ((status === 'CANCELLED' || status === AppointmentStatus.CANCELLED) && user.role !== Role.CUSTOMER) {
        await createAuditLog({
          userId: user.id,
          action: 'APPOINTMENT_CANCELLED_BY_ADMIN',
          ipAddress: req.ip,
          details: {
            message: `Admin/Staff ${user.fullName} force-cancelled appointment ID ${id} for customer ID ${appointment.userId}`,
            appointmentId: id,
            customerId: appointment.userId,
            cancelledBy: user.id,
          },
        });
      }

      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      if (lockAcquired && lockKey) {
        await redis.del(lockKey).catch(() => { });
      }
      next(error);
    }
  }
}
