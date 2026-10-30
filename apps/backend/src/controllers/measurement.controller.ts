import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import { Role } from '@prisma/client';
import { createAuditLog } from '../utils/audit.js';
import redis from '../config/redis.js';

export const measurementCreateSchema = z.object({
  body: z.object({
    userId: z.string().uuid().optional(), // If Staff creates it, they specify userId
    profileName: z.string().min(1),
    fullLength: z.coerce.number().optional(),
    shoulderWidth: z.coerce.number().optional(),
    upperChest: z.coerce.number().optional(),
    bust: z.coerce.number().optional(),
    waist: z.coerce.number().optional(),
    hip: z.coerce.number().optional(),
    armLength: z.coerce.number().optional(),
    sleeveLength: z.coerce.number().optional(),
    neck: z.coerce.number().optional(),
    seat: z.coerce.number().optional(),
    skirtLength: z.coerce.number().optional(),
    pantLength: z.coerce.number().optional(),
    tailorNotes: z.string().optional(),
    customMeasurements: z.array(z.object({ name: z.string().min(1), value: z.string().min(1), unit: z.string().optional() })).optional(),
  }),
});

export const measurementUpdateSchema = z.object({
  body: z.object({
    fullLength: z.coerce.number().optional(),
    shoulderWidth: z.coerce.number().optional(),
    upperChest: z.coerce.number().optional(),
    bust: z.coerce.number().optional(),
    waist: z.coerce.number().optional(),
    hip: z.coerce.number().optional(),
    armLength: z.coerce.number().optional(),
    sleeveLength: z.coerce.number().optional(),
    neck: z.coerce.number().optional(),
    seat: z.coerce.number().optional(),
    skirtLength: z.coerce.number().optional(),
    pantLength: z.coerce.number().optional(),
    tailorNotes: z.string().optional(),
    customMeasurements: z.array(z.object({ name: z.string().min(1), value: z.string().min(1), unit: z.string().optional() })).optional(),
  }),
});

export class MeasurementController {
  /**
   * GET /measurements
   */
  static async getMeasurements(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const targetUserId = req.query.userId as string;

    try {
      let queryUserId = user.id;

      if (user.role === Role.ADMIN || user.role === Role.SUPERADMIN || user.role === Role.STAFF) {
        if (targetUserId) {
          queryUserId = targetUserId;
        } else {
          // Admin/Staff fetching all profiles in database - this is a bulk export!
          const profiles = await prisma.measurementProfile.findMany({
            include: { user: { select: { fullName: true, email: true } } },
          });

          await createAuditLog({
            userId: user.id,
            action: 'EXPORT_MEASUREMENTS',
            ipAddress: req.ip,
            details: {
              message: `Admin/Staff ${user.fullName} exported ${profiles.length} measurement profiles in bulk.`,
              count: profiles.length,
            },
          });

          // Sliding window counter in Redis: alert if more than 10 records are exported within 10 seconds
          const redisKey = `export_records_count:${user.id}`;
          const currentCount = await redis.incrby(redisKey, profiles.length);
          if (currentCount === profiles.length) {
            await redis.expire(redisKey, 10);
          }
          if (currentCount > 10) {
            await createAuditLog({
              userId: user.id,
              action: 'EXPORT_MEASUREMENTS_ALERT',
              ipAddress: req.ip,
              details: {
                message: `ALERT: More than 10 measurement records exported by admin/staff ${user.fullName} within 10 seconds. Total: ${currentCount}`,
                userId: user.id,
                totalExported: currentCount,
              },
            });
          }

          return res.status(200).json({ success: true, data: profiles });
        }
      } else {
        // Customer role
        if (targetUserId && targetUserId !== user.id) {
          await createAuditLog({
            userId: user.id,
            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
            ipAddress: req.ip,
            details: {
              message: `Customer ${user.email} attempted unauthorized access to measurements of user ID ${targetUserId}`,
              userId: user.id,
              targetPath: req.originalUrl,
            },
          });
          return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges' });
        }
      }

      const profiles = await prisma.measurementProfile.findMany({
        where: { userId: queryUserId },
      });

      return res.status(200).json({ success: true, data: profiles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /measurements
   */
  static async createMeasurement(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { userId, profileName, ...measurements } = req.body;

    try {
      let targetUserId = user.id;

      // Staff/Admin can specify another customer's ID
      if (userId && (user.role === Role.ADMIN || user.role === Role.SUPERADMIN || user.role === Role.STAFF)) {
        targetUserId = userId;
      }

      const profile = await prisma.measurementProfile.create({
        data: {
          userId: targetUserId,
          profileName,
          ...measurements,
        },
      });

      await createAuditLog({
        userId: user.id,
        action: 'CREATE_MEASUREMENT_PROFILE',
        ipAddress: req.ip,
        details: {
          message: `Measurement profile '${profileName}' created for customer ID ${targetUserId} by ${user.fullName}`,
          profileId: profile.id,
          profileName,
          customerUserId: targetUserId,
        },
      });

      return res.status(201).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  static async updateMeasurement(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { id } = req.params;
    const updates = req.body;

    try {
      const existingProfile = await prisma.measurementProfile.findUnique({
        where: { id },
      });

      if (!existingProfile) {
        return res.status(404).json({ success: false, message: 'Measurement profile not found' });
      }

      // Record transaction
      const updatedProfile = await prisma.$transaction(async (tx: any) => {
        // 1. Update Profile
        const updated = await tx.measurementProfile.update({
          where: { id },
          data: updates,
        });

        // 2. Prepare snapshots
        const prevValues: Record<string, any> = {};
        const newValues: Record<string, any> = {};

        Object.keys(updates).forEach((key) => {
          const prev = (existingProfile as any)[key];
          const curr = (updated as any)[key];
          if (prev !== undefined) prevValues[key] = prev;
          if (curr !== undefined) newValues[key] = curr;
        });

        // 3. Save to History
        await tx.measurementHistory.create({
          data: {
            profileId: id,
            changedBy: user.id,
            previousValues: prevValues,
            newValues,
          },
        });

        return { updated, prevValues, newValues };
      });

      // 4. Save to AuditLog (outside tx)
      await createAuditLog({
        userId: user.id,
        action: 'UPDATE_MEASUREMENT',
        ipAddress: req.ip,
        details: {
          message: `Staff member ${user.fullName} updated measurement profile '${existingProfile.profileName}' (Profile ID: ${id})`,
          profileId: id,
          profileName: existingProfile.profileName,
          changedBy: user.id,
          previousValues: updatedProfile.prevValues,
          newValues: updatedProfile.newValues,
        },
      });

      return res.status(200).json({ success: true, data: updatedProfile.updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /measurements/:id/history
   * Admin / Staff Only
   */
  static async getHistory(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;

    try {
      const history = await prisma.measurementHistory.findMany({
        where: { profileId: id },
        orderBy: { changedAt: 'desc' },
      });

      return res.status(200).json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /measurements/:id
   */
  static async deleteMeasurement(req: Request, res: Response, next: NextFunction) {
    const user = req.user!;
    const { id } = req.params;

    try {
      const profile = await prisma.measurementProfile.findUnique({
        where: { id },
      });

      if (!profile) {
        return res.status(404).json({ success: false, message: 'Measurement profile not found' });
      }

      // Check ownership or role privilege
      if (profile.userId !== user.id && user.role === Role.CUSTOMER) {
        await createAuditLog({
          userId: user.id,
          action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
          ipAddress: req.ip,
          details: {
            message: `Customer ${user.email} attempted unauthorized deletion of measurement profile ID ${id} belonging to user ID ${profile.userId}`,
            userId: user.id,
            targetPath: req.originalUrl,
          },
        });
        return res.status(403).json({ success: false, message: 'Forbidden: You do not own this profile' });
      }

      // Snapshot final values before delete
      const finalValues = {
        profileName: profile.profileName,
        fullLength: profile.fullLength,
        shoulderWidth: profile.shoulderWidth,
        upperChest: profile.upperChest,
        bust: profile.bust,
        waist: profile.waist,
        hip: profile.hip,
        armLength: profile.armLength,
        sleeveLength: profile.sleeveLength,
        neck: profile.neck,
        seat: profile.seat,
        skirtLength: profile.skirtLength,
        pantLength: profile.pantLength,
        tailorNotes: profile.tailorNotes,
      };

      await prisma.measurementProfile.delete({
        where: { id },
      });

      // Write to AuditLog
      await createAuditLog({
        userId: user.id,
        action: 'DELETE_MEASUREMENT_PROFILE',
        ipAddress: req.ip,
        details: {
          message: `User/Staff ${user.fullName} deleted measurement profile '${profile.profileName}' (Profile ID: ${id})`,
          profileId: id,
          profileName: profile.profileName,
          finalValues,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Measurement profile deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
