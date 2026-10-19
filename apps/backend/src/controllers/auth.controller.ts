import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db.js';
import redis from '../config/redis.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import AuthService from '../services/auth.service.js';
import SmsService from '../services/sms.service.js';
import EmailService from '../services/email.service.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { validatePassword } from '../validators/password.validator.js';
import { createAuditLog } from '../utils/audit.js';
import logger from '../utils/logger.js';
import { secureCookieOptions, isProduction } from '../config/environment.js';

export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (/^91\d{10}$/.test(cleaned)) {
    return `+91${cleaned.substring(2)}`;
  }
  if (/^\+91\d{10}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^\+\d+$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

// Register validator schema
export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    phoneNumber: z.string(),
    password: z.string().min(6),
    fullName: z.string(),
    registrationToken: z.string().min(1, "Registration token is required"),
    referredById: z.string().uuid().optional().nullable(),
    referredByCode: z.string().optional().nullable(),
  }),
});

// Login validator schema
export const loginSchema = z.object({
  body: z.object({
    email: z.string(), // Accepts both email or phone number
    password: z.string(),
  }),
});

// Check Identifier Schema
export const checkIdentifierSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, "Identifier is required"), // Email or phone
  }),
});

// Setup Password Schema
export const setupPasswordSchema = z.object({
  body: z.object({
    verifyToken: z.string().min(1, "Verify token is required"),
    newPassword: z.string().min(10, "Password must be at least 10 characters"),
  }),
});

// OTP send schema
export const otpSendSchema = z.object({
  body: z.object({
    phoneNumber: z.string().optional(),
    email: z.string().email().optional(),
  }).refine(data => data.phoneNumber || data.email, {
    message: 'Either phoneNumber or email is required',
    path: ['phoneNumber'],
  }),
});

// OTP verify schema
export const otpVerifySchema = z.object({
  body: z.object({
    phoneNumber: z.string().optional(),
    email: z.string().email().optional(),
    code: z.string().length(6),
    purpose: z.string().optional(),
  }).refine(data => data.phoneNumber || data.email, {
    message: 'Either phoneNumber or email is required',
    path: ['phoneNumber'],
  }),
});

// Forgot password schema
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

// Reset password schema
export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
    code: z.string().length(6),
    newPassword: z.string().min(6),
  }),
});

// Forgot password verification schema
export const verifyResetOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
    code: z.string().length(6),
  }),
});

// Update profile schema
export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().min(1).optional(),
    gender: z.string().optional().nullable(),
    avatarUrl: z.string().url().optional().nullable(),
    address: z.string().optional().nullable(),
    fcmToken: z.string().optional().nullable(),
  }),
});

// Redeem points schema
export const redeemPointsSchema = z.object({
  body: z.object({
    voucherPlanId: z.string().uuid().optional(),
    pointsToRedeem: z.coerce.number().int().optional(),
  }),
});

// Verify password schema
export const verifyPasswordSchema = z.object({
  body: z.object({
    password: z.string(),
  }),
});

// Request contact details update schema
export const requestContactUpdateSchema = z.object({
  body: z.object({
    password: z.string(),
    newEmail: z.string().email().optional(),
    newPhoneNumber: z.string().optional(),
  }).refine(data => data.newEmail || data.newPhoneNumber, {
    message: 'Either newEmail or newPhoneNumber is required',
    path: ['newEmail'],
  }),
});

// Confirm contact details update schema
export const confirmContactUpdateSchema = z.object({
  body: z.object({
    code: z.string().length(6),
  }),
});

export class AuthController {
  /**
   * POST /auth/register
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      let { email, phoneNumber, password, fullName, registrationToken, referredById, referredByCode } = req.body;

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      const cleanDigits = phoneNumber.replace(/[\s\-()]/g, '');
      const rawDigits = cleanDigits.startsWith('+91') ? cleanDigits.substring(3) : (cleanDigits.startsWith('91') ? cleanDigits.substring(2) : cleanDigits);
      const possiblePhoneNumbers = [phoneNumber, normalizedPhone, cleanDigits, rawDigits];

      // Validate Registration Token
      const storedTokenPhone = await redis.get(`registration_token:${normalizedPhone}`);
      const storedTokenEmail = await redis.get(`registration_token:${email}`);

      if (!storedTokenPhone && !storedTokenEmail) {
        return res.status(401).json({ success: false, message: 'Registration token missing or expired. Please verify your OTP again.' });
      }

      if ((storedTokenPhone && storedTokenPhone !== registrationToken) && (storedTokenEmail && storedTokenEmail !== registrationToken)) {
        return res.status(401).json({ success: false, message: 'Invalid registration token.' });
      }

      // Check existence
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { phoneNumber: { in: possiblePhoneNumbers } }
          ],
        },
      });

      if (existingUser) {
        return res.status(409).json({ success: false, message: 'Email or Phone Number already registered' });
      }

      // If referredByCode is passed, resolve referredById
      if (referredByCode && !referredById) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: referredByCode.trim().toUpperCase() }
        });
        if (referrer) {
          referredById = referrer.id;
        } else {
          return res.status(400).json({ success: false, message: 'Invalid referral code.' });
        }
      }

      const passwordHash = await hashPassword(password);
      
      // Generate unique referral code using UUID for collision safety
      const referralCode = `REF-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

      const user = await prisma.$transaction(async (tx: any) => {
        const newUser = await tx.user.create({
          data: {
            email,
            phoneNumber: normalizedPhone,
            passwordHash,
            fullName,
            referralCode,
            referredById,
            role: 'CUSTOMER',
            pointsBalance: referredById ? 100 : 0,
          },
        });

        if (referredById) {
          // Create PointTransaction record for customer
          await tx.pointTransaction.create({
            data: {
              userId: newUser.id,
              points: 100,
              reason: 'Referral signup bonus points',
            }
          });
        }

        return newUser;
      });

      // Generate tokens
      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      };
      const accessToken = AuthService.generateAccessToken(payload);
      const refreshToken = await AuthService.generateRefreshToken(user.id);

      await createAuditLog({
        userId: user.id,
        action: 'USER_REGISTERED',
        ipAddress: req.ip,
        details: {
          message: `New user account created via email/phone: ${user.email} (Role: ${user.role})`,
          email: user.email,
          phoneNumber: user.phoneNumber,
          registrationMethod: 'email',
        },
      });

      const clientType = req.headers['x-client-type'] as string || 'web';
      const responseUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        pointsBalance: user.pointsBalance,
        referredById: user.referredById,
      };

      if (clientType === 'mobile') {
        return res.status(201).json({
          success: true,
          message: 'User registered successfully',
          accessToken,
          refreshToken,
          user: responseUser,
        });
      } else {
        res.cookie('refreshToken', refreshToken, secureCookieOptions);

        return res.status(201).json({
          success: true,
          message: 'User registered successfully',
          accessToken,
          user: responseUser,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login/check
   * Amazon-style step 1: Check if identifier exists and if password setup is required
   */
  static async checkIdentifier(req: Request, res: Response, next: NextFunction) {
    const { identifier } = req.body;
    try {
      const start = process.hrtime.bigint();
      
      let searchEmail = identifier;
      if (identifier.includes('@')) {
        searchEmail = identifier.toLowerCase();
      }

      let possiblePhoneNumbers = [identifier];
      if (!identifier.includes('@')) {
        const normalized = normalizePhoneNumber(identifier);
        const clean = identifier.replace(/[\s\-()]/g, '');
        const raw = clean.startsWith('+91') ? clean.substring(3) : (clean.startsWith('91') ? clean.substring(2) : clean);
        possiblePhoneNumbers = [identifier, normalized, clean, raw];
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: searchEmail },
            { phoneNumber: { in: possiblePhoneNumbers } }
          ]
        }
      });

      // Constant-time-ish: always do a comparable amount of work
      if (!user || !user.passwordHash) {
        // Dummy bcrypt comparison
        await verifyPassword("dummy_password", "$2b$10$C8.w1N/bY.W/F8e8uO/3k.U5EwKqZ6M3v/Zz1L6C.m3J0XwX7.F.m");
      }

      const state = !user
        ? 'NOT_FOUND'
        : !user.passwordHash
        ? 'SETUP_REQUIRED'
        : 'PASSWORD_REQUIRED';

      return res.status(200).json({ 
        success: true, 
        status: state,
        fullName: user ? user.fullName : null 
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/setup-password
   */
  static async setupPassword(req: Request, res: Response, next: NextFunction) {
    const { verifyToken, newPassword } = req.body;
    const clientType = req.headers['x-client-type'] as string || 'web';

    try {
      // 1. Verify token
      let decoded: any;
      try {
        decoded = jwt.verify(verifyToken, env.JWT_ACCESS_SECRET);
        if (decoded.scope !== 'setup-password') throw new Error('Invalid token scope');
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired verify token.' });
      }

      // 2. Find User
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub }
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      // 3. Validate new password
      validatePassword(newPassword, { email: user.email, fullName: user.fullName });

      // 4. Update Password
      const passwordHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        // @ts-ignore - IDE TS cache issue
        data: { passwordHash, passwordSetByUser: true }
      })

      // 5. Generate Tokens
      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      };

      const accessToken = AuthService.generateAccessToken(payload);
      const refreshToken = await AuthService.generateRefreshToken(user.id);

      if (clientType === 'mobile') {
        return res.status(200).json({ success: true, accessToken, refreshToken, user: payload, message: 'Password configured successfully' });
      } else {
        res.cookie('refreshToken', refreshToken, secureCookieOptions);
        return res.status(200).json({ success: true, accessToken, user: payload, message: 'Password configured successfully' });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;
    const clientType = req.headers['x-client-type'] as string || 'web'; // Determine cookie vs body

    try {
      let searchEmail = email;
      if (email.includes('@')) {
        searchEmail = email.toLowerCase();
      }

      let possiblePhoneNumbers = [email];
      if (!email.includes('@')) {
        const normalized = normalizePhoneNumber(email);
        const clean = email.replace(/[\s\-()]/g, '');
        const raw = clean.startsWith('+91') ? clean.substring(3) : (clean.startsWith('91') ? clean.substring(2) : clean);
        possiblePhoneNumbers = [email, normalized, clean, raw];
      }

      // Check if IP or Email is temporarily blocked due to brute-force
      const ipBlock = await redis.get(`block_login_ip:${req.ip}`);
      const emailBlock = await redis.get(`block_login:${searchEmail}`);
      if (ipBlock || emailBlock) {
        return res.status(429).json({ success: false, message: 'Too many failed login attempts. Please try again later.' });
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: searchEmail },
            { phoneNumber: { in: possiblePhoneNumbers } }
          ]
        }
      });
      if (!user) {
        await AuthController.trackFailedLogin(email, req.ip || 'unknown');
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (!user.passwordHash) {
        return res.status(403).json({ success: false, message: 'SETUP_REQUIRED', details: 'Please setup your password first.' });
      }

      const isPasswordValid = await verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        await AuthController.trackFailedLogin(email, req.ip || 'unknown');
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Successful login - clear failed login counter
      await redis.del(`failed_login:${email}`);
      await redis.del(`failed_login_ip:${req.ip}`);

      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      };

      const accessToken = AuthService.generateAccessToken(payload);
      const refreshToken = await AuthService.generateRefreshToken(user.id);

      if (clientType === 'mobile') {
        // Return in body for Mobile Clients
        return res.status(200).json({
          success: true,
          accessToken,
          refreshToken,
          user: payload,
        });
      } else {
        res.cookie('refreshToken', refreshToken, secureCookieOptions);

        return res.status(200).json({
          success: true,
          accessToken,
          user: payload,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper to track failed login counts and trigger warnings
   */
  private static async trackFailedLogin(email: string, ip: string) {
    const keyEmail = `failed_login:${email}`;
    const keyIp = `failed_login_ip:${ip}`;

    const countEmail = await redis.incr(keyEmail);
    const countIp = await redis.incr(keyIp);

    if (countEmail === 1) await redis.expire(keyEmail, 300); // 5 minutes window
    if (countIp === 1) await redis.expire(keyIp, 300);

    if (countEmail > 10 || countIp > 10) {
      // Block for 15 minutes
      if (countEmail > 10) await redis.set(`block_login:${email}`, 'blocked', 'EX', 900);
      if (countIp > 10) await redis.set(`block_login_ip:${ip}`, 'blocked', 'EX', 900);

      await createAuditLog({
        action: 'FAILED_LOGIN_ALERT',
        ipAddress: ip,
        details: {
          message: `More than 10 failed login attempts triggered. Blocked for 15 minutes. Email: ${email}, IP: ${ip}`,
          email,
          ip,
        },
      });
    } else {
      await createAuditLog({
        action: 'FAILED_LOGIN',
        ipAddress: ip,
        details: {
          message: `Failed login attempt for identifier: ${email}`,
          identifier: email,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * POST /auth/otp/send
   */
  static async sendOtp(req: Request, res: Response, next: NextFunction) {
    const { phoneNumber, email } = req.body;
    const identifier = phoneNumber ? normalizePhoneNumber(phoneNumber) : email;

    try {
      // IP-based Rate Limit (max 10 OTP requests per hour per IP)
      const ipKey = `otp_ip_count:${req.ip}`;
      const ipCount = await redis.incr(ipKey);
      if (ipCount === 1) await redis.expire(ipKey, 3600);
      if (ipCount > 10) {
        return res.status(429).json({ success: false, message: 'Too many OTP requests from this IP address. Please try again later.' });
      }

      // 1. Check if the identifier is blocked (from failed verifications or hourly limit)
      const isBlocked = await redis.get(`cooldown:otp:${identifier}`);
      if (isBlocked) {
        return res.status(429).json({
          success: false,
          message: 'Too many OTP requests or validations failed. Please try again later.',
        });
      }

      // 2. Enforce a strict 60-second request cooldown to prevent instant spamming
      const sendCooldown = await redis.get(`cooldown:send:otp:${identifier}`);
      if (sendCooldown) {
        return res.status(429).json({
          success: false,
          message: 'Please wait 60 seconds before requesting another verification code.',
        });
      }

      // 3. Enforce an hourly request limit (max 5 requests per hour)
      const hourKey = `otp_count:${identifier}`;
      const count = await redis.incr(hourKey);
      if (count === 1) {
        await redis.expire(hourKey, 3600); // 1 hour TTL
      }
      if (count > 5) {
        // Block user for 24 hours if they trigger excessive OTPs
        await redis.set(`cooldown:otp:${identifier}`, 'blocked', 'EX', 86400);
        await redis.del(hourKey);
        await createAuditLog({
          action: 'OTP_IDENTIFIER_LOCKED',
          ipAddress: req.ip,
          details: {
            message: `OTP identifier locked out for 24 hours due to excessive OTP requests: ${identifier}`,
            identifier,
            reason: 'Excessive OTP requests (hourly limit exceeded)',
            duration: '24 hours',
          },
        });
        return res.status(429).json({
          success: false,
          message: 'Too many OTP requests. This identifier has been locked out for 24 hours.',
        });
      }

      // Generate 6 digit code
      const code = crypto.randomInt(100000, 999999).toString();
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

      // Save to Redis with 5 minutes TTL
      await redis.set(`otp:${identifier}`, hashedCode, 'EX', 300);

      if (!isProduction) {
        logger.info(`====================================================`);
        logger.info(`🔑 [DEVELOPMENT OTP] Code for ${identifier}: ${code}`);
        logger.info(`====================================================`);
      }

      // Send OTP via SMS or Email (asynchronously in background to prevent client loading hangs)
      if (phoneNumber) {
        SmsService.sendSms(identifier, `Your MARCOS verification code is ${code}. Valid for 5 minutes.`).catch(err => {
          logger.error('Failed to send SMS OTP in background', { metadata: { error: err.message } });
        });
      }
      if (email) {

        const emailHtml = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px 20px; text-align: center;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #eaeaea; text-align: left;">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #111111, #333333); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px;">MARCOS</h1>
                <p style="color: #aaaaaa; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Secure Authorization</p>
              </div>
              <!-- Content -->
              <div style="padding: 40px 30px;">
                <h2 style="color: #222222; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hello,</h2>
                <p style="color: #555555; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                  A request has been made to log in or verify your identity with **MARCOS Studio**. Please use the secure one-time verification code (OTP) below to complete your sign-in.
                </p>
                
                <!-- OTP Box -->
                <div style="background-color: #f4f6f8; border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 30px; border: 1px solid #eef2f5;">
                  <span style="display: block; color: #777777; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">Verification Code</span>
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #111111; letter-spacing: 6px; display: inline-block;">${code}</span>
                </div>

                <p style="color: #999999; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0;">
                  This code is highly sensitive and is valid for the next **5 minutes**. For your own security, do not share this code with anyone, including the MARCOS support team.
                </p>
                <p style="color: #999999; font-size: 13px; line-height: 1.5; margin: 0;">
                  If you did not request this code, you can safely ignore this email. Your account remains secure.
                </p>
              </div>
              <!-- Footer -->
              <div style="background-color: #f4f6f8; padding: 25px 30px; text-align: center; border-top: 1px solid #eaeaea;">
                <p style="color: #222222; font-size: 14px; font-weight: 600; margin: 0 0 5px 0;">MARCOS Bespoke Tailoring Studio</p>
                <p style="color: #888888; font-size: 12px; margin: 0 0 15px 0;">Premium Customized Design & Fittings</p>
                <p style="color: #bbbbbb; font-size: 11px; margin: 0; line-height: 1.4;">
                  This is an automated security transmission. Please do not reply directly to this email.<br />
                  &copy; 2026 MARCOS Studio. All Rights Reserved.
                </p>
              </div>
            </div>
          </div>
        `;
        await EmailService.sendEmail(
          email, 
          'Your MARCOS Verification Code', 
          `Your MARCOS OTP is: ${code}`,
          emailHtml
        );
      }

      // Set 60-second request cooldown on success
      await redis.set(`cooldown:send:otp:${identifier}`, 'active', 'EX', 60);

      return res.status(200).json({
        success: true,
        message: 'Verification code sent successfully',
        ...((!isProduction) ? { devOtp: code } : {})
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/otp/verify
   */
  static async verifyOtp(req: Request, res: Response, next: NextFunction) {
    const { phoneNumber, email, code, purpose } = req.body;
    const identifier = phoneNumber ? normalizePhoneNumber(phoneNumber) : email;
    const clientType = req.headers['x-client-type'] as string || 'web';

    try {
      // Check cooldown block
      const isBlocked = await redis.get(`cooldown:otp:${identifier}`);
      if (isBlocked) {
        return res.status(429).json({ success: false, message: 'Identifier temporarily locked out. Try again later.' });
      }

      const storedHash = await redis.get(`otp:${identifier}`);
      const hashedIncoming = crypto.createHash('sha256').update(code).digest('hex');

      const isDevMasterOtp = !isProduction && (code === '123456' || code === '000000');

      if (!isDevMasterOtp && (!storedHash || storedHash !== hashedIncoming)) {
        // Verify failure - track count
        const failKey = `otp_fail:${identifier}`;
        const attempts = await redis.incr(failKey);
        
        if (attempts === 1) await redis.expire(failKey, 900); // 15 mins tracking

        if (attempts >= 3) {
          // Block identifier for 15 minutes
          await redis.set(`cooldown:otp:${identifier}`, 'blocked', 'EX', 900);
          await redis.del(failKey);
          await createAuditLog({
            action: 'OTP_IDENTIFIER_LOCKED',
            ipAddress: req.ip,
            details: {
              message: `OTP identifier locked out for 15 minutes due to consecutive incorrect attempts: ${identifier}`,
              identifier,
              reason: 'Too many incorrect OTP verification attempts',
              duration: '15 minutes',
            },
          });
          return res.status(429).json({
            success: false,
            message: 'Too many incorrect OTP attempts. You are locked out for 15 minutes.',
          });
        }

        return res.status(400).json({
          success: false,
          message: `Invalid verification code. ${3 - attempts} attempts remaining before cooldown.`,
        });
      }

      // SUCCESS: Clear OTP keys & failures
      await redis.del(`otp:${identifier}`);
      await redis.del(`otp_fail:${identifier}`);

      // Fetch user profile or register new guest if needed (for simplicity, we assume user is already registered)
      let user = null;
      if (phoneNumber) {
        const normalized = normalizePhoneNumber(phoneNumber);
        const clean = phoneNumber.replace(/[\s\-()]/g, '');
        const raw = clean.startsWith('+91') ? clean.substring(3) : (clean.startsWith('91') ? clean.substring(2) : clean);
        user = await prisma.user.findFirst({
          where: {
            phoneNumber: { in: [phoneNumber, normalized, clean, raw] }
          }
        });
      } else if (email) {
        user = await prisma.user.findFirst({
          where: { email },
        });
      }

      if (purpose === 'register') {
        if (user) {
          return res.status(400).json({
            success: false,
            message: 'Email or Phone Number already registered. Please login instead.',
          });
        }
        
        // Generate registration token to prevent bypass
        const registrationToken = crypto.randomBytes(32).toString('hex');
        await redis.set(`registration_token:${identifier}`, registrationToken, 'EX', 900); // 15 mins TTL

        return res.status(200).json({
          success: true,
          message: 'OTP verified successfully.',
          registrationToken
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Verification complete, but no user profile matches this phone/email. Please register first.',
        });
      }

      if (purpose === 'setup-password') {
        const verifyToken = jwt.sign({ sub: user.id, scope: 'setup-password' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
        return res.status(200).json({ success: true, message: 'OTP verified successfully.', verifyToken });
      }

      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      };

      const accessToken = AuthService.generateAccessToken(payload);
      const refreshToken = await AuthService.generateRefreshToken(user.id);

      if (clientType === 'mobile') {
        return res.status(200).json({ success: true, accessToken, refreshToken, user: payload });
      } else {
        res.cookie('refreshToken', refreshToken, secureCookieOptions);

        return res.status(200).json({ success: true, accessToken, user: payload });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh
   */
  static async refresh(req: Request, res: Response, next: NextFunction) {
    let token = req.cookies?.refreshToken || req.body?.refreshToken || req.headers['x-refresh-token'];

    if (!token) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    try {
      const { accessToken, refreshToken: newRefreshToken, user } = await AuthService.rotateTokens(token);
      const clientType = req.headers['x-client-type'] as string || 'web';

      if (clientType === 'mobile') {
        return res.status(200).json({ success: true, accessToken, refreshToken: newRefreshToken, user });
      } else {
        res.cookie('refreshToken', newRefreshToken, secureCookieOptions);

        return res.status(200).json({ success: true, accessToken, user });
      }
    } catch (error: any) {
      return res.status(401).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /auth/logout
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies?.refreshToken || req.body?.refreshToken || req.headers['x-refresh-token'];
    const authHeader = req.headers.authorization;

    try {
      if (token) {
        await AuthService.logoutRefreshToken(token);
      }

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const accessToken = authHeader.split(' ')[1];
        await AuthService.blacklistAccessToken(accessToken);
      }

      res.clearCookie('refreshToken', { path: '/' });
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/forgot-password
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    const { email } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      
      await createAuditLog({
        userId: user ? user.id : null,
        action: 'PASSWORD_RESET_REQUESTED',
        ipAddress: req.ip,
        details: {
          message: `Password reset requested for email: ${email}`,
          email,
        },
      });

      if (!user) {
        // Return success message to prevent user enumeration
        return res.status(200).json({ success: true, message: 'If that email exists, a reset code has been sent.' });
      }

      // Generate 6-digit code
      const code = crypto.randomInt(100000, 999999).toString();
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

      // Save to Redis (5 mins TTL)
      await redis.set(`reset_otp:${email}`, hashedCode, 'EX', 300);

      // Send via email (premium layout)
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px 20px; text-align: center;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #eaeaea; text-align: left;">
            <div style="background: linear-gradient(135deg, #e056fd, #be2edd); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px;">MARCOS</h1>
              <p style="color: #ffffff; opacity: 0.8; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Password Reset Request</p>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #222222; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hello ${user.fullName},</h2>
              <p style="color: #555555; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                We received a request to reset your password for your MARCOS Studio account. Please use the secure verification code (OTP) below to complete your reset.
              </p>
              
              <div style="background-color: #f4f6f8; border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 30px; border: 1px solid #eef2f5;">
                <span style="display: block; color: #777777; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">Reset Code</span>
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #be2edd; letter-spacing: 6px; display: inline-block;">${code}</span>
              </div>

              <p style="color: #999999; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0;">
                This reset code is valid for **5 minutes**. For security reasons, never share this code with anyone.
              </p>
            </div>
            <div style="background-color: #f4f6f8; padding: 25px 30px; text-align: center; border-top: 1px solid #eaeaea;">
              <p style="color: #222222; font-size: 14px; font-weight: 600; margin: 0 0 5px 0;">MARCOS Bespoke Tailoring Studio</p>
              <p style="color: #bbbbbb; font-size: 11px; margin: 0;">&copy; 2026 MARCOS Studio. All Rights Reserved.</p>
            </div>
          </div>
        </div>
      `;

      EmailService.sendEmail(email, 'Reset Your MARCOS Password', `Your password reset code is: ${code}`, emailHtml).catch(err => {
        logger.error('Failed to send Reset Password email in background', { metadata: { error: err.message } });
      });

      return res.status(200).json({ success: true, message: 'If that email exists, a reset code has been sent.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/forgot-password/verify
   */
  static async verifyResetOtp(req: Request, res: Response, next: NextFunction) {
    const { email, code } = req.body;

    try {
      // Check cooldown block
      const isBlocked = await redis.get(`cooldown:reset_otp:${email}`);
      if (isBlocked) {
        return res.status(429).json({ success: false, message: 'Identifier temporarily locked out. Try again later.' });
      }

      const storedHash = await redis.get(`reset_otp:${email}`);
      const hashedIncoming = crypto.createHash('sha256').update(code).digest('hex');

      if (!storedHash || storedHash !== hashedIncoming) {
        // Track failed reset attempts
        const failKey = `reset_otp_fail:${email}`;
        const attempts = await redis.incr(failKey);
        
        if (attempts === 1) await redis.expire(failKey, 900);

        if (attempts >= 3) {
          await redis.set(`cooldown:reset_otp:${email}`, 'blocked', 'EX', 900);
          await redis.del(failKey);
          return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Locked out for 15 minutes.' });
        }
        
        return res.status(400).json({ success: false, message: `Invalid or expired reset code. ${3 - attempts} attempts remaining.` });
      }

      return res.status(200).json({ success: true, message: 'Reset code verified successfully.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    const { email, code, newPassword } = req.body;

    try {
      // Check cooldown block
      const isBlocked = await redis.get(`cooldown:reset_otp:${email}`);
      if (isBlocked) {
        return res.status(429).json({ success: false, message: 'Identifier temporarily locked out. Try again later.' });
      }

      const storedHash = await redis.get(`reset_otp:${email}`);
      const hashedIncoming = crypto.createHash('sha256').update(code).digest('hex');

      if (!storedHash || storedHash !== hashedIncoming) {
        const failKey = `reset_otp_fail:${email}`;
        const attempts = await redis.incr(failKey);
        
        if (attempts === 1) await redis.expire(failKey, 900);

        if (attempts >= 3) {
          await redis.set(`cooldown:reset_otp:${email}`, 'blocked', 'EX', 900);
          await redis.del(failKey);
          return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Locked out for 15 minutes.' });
        }

        return res.status(400).json({ success: false, message: `Invalid or expired reset code. ${3 - attempts} attempts remaining.` });
      }

      // Successful verification - delete OTP and update password
      await redis.del(`reset_otp:${email}`);
      await redis.del(`reset_otp_fail:${email}`);
      const passwordHash = await hashPassword(newPassword);

      await prisma.user.update({
        where: { email },
        data: { passwordHash },
      });

      return res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/profile
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const cacheKey = `cache:profile:${userId}`;

      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }

      const [user, orderCount, rewardCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            fullName: true,
            gender: true,
            avatarUrl: true,
            address: true,
            fcmToken: true,
            role: true,
            pointsBalance: true,
            referralCode: true,
            createdAt: true,
            pointTransactions: {
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
            referrals: {
              select: {
                fullName: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.order.count({ where: { userId } }),
        prisma.pointTransaction.count({ 
          where: { 
            userId,
            points: { gt: 0 } // Rewards are positive point transactions
          } 
        })
      ]);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      // Merge stats into the user data object
      const userData = {
        ...user,
        stats: {
          orders: orderCount,
          rewards: rewardCount,
        }
      };

      const responsePayload = { success: true, data: userData };
      await redis.set(cacheKey, JSON.stringify(responsePayload), 'EX', 120);

      return res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /auth/profile
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { fullName, gender, avatarUrl, address, fcmToken } = req.body;

      // Update user details
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          fullName,
          gender,
          avatarUrl,
          address,
          fcmToken,
        },
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          fullName: true,
          gender: true,
          avatarUrl: true,
          address: true,
          fcmToken: true,
          role: true,
          pointsBalance: true,
          referralCode: true,
        },
      });

      // Invalidate profile cache
      await redis.del(`cache:profile:${userId}`);

      await createAuditLog({
        userId,
        action: 'PROFILE_UPDATED',
        ipAddress: req.ip,
        details: {
          message: 'User profile updated',
          updatedFields: { fullName, gender, avatarUrl, address, fcmToken },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /auth/delete-account
   * Customer self-service account deletion
   */
  static async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      await prisma.user.delete({
        where: { id: req.user!.id },
      });

      await createAuditLog({
        userId: null,
        action: 'ACCOUNT_DELETED',
        ipAddress: req.ip,
        details: {
          message: `User ${user.email} deleted their own account.`,
          deletedUserId: user.id,
          deletedBy: 'self',
          finalValues: {
            fullName: user.fullName,
            email: user.email,
            phoneNumber: user.phoneNumber,
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Your account has been deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/loyalty/redeem
   * Customer loyalty points redemption to generate discount coupon
   */
  static async redeemPoints(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { voucherPlanId, pointsToRedeem: legacyPoints } = req.body;

    try {
      const result = await prisma.$transaction(async (tx: any) => {
        let pointsRequired = 0;
        let discountFlat = 0;
        let reasonLabel = '';

        if (voucherPlanId) {
          const plan = await tx.voucherPlan.findUnique({
            where: { id: voucherPlanId }
          });
          if (!plan) {
            throw new Error('Voucher plan not found.');
          }
          if (!plan.isActive) {
            throw new Error('Voucher plan is inactive.');
          }
          pointsRequired = plan.pointsRequired;
          discountFlat = Number(plan.discountFlat);
          reasonLabel = plan.title;
        } else if (legacyPoints) {
          pointsRequired = legacyPoints;
          discountFlat = legacyPoints === 500 ? 500.00 : 1200.00;
          reasonLabel = `₹${discountFlat} Discount Voucher`;
        } else {
          throw new Error('Either voucherPlanId or pointsToRedeem is required.');
        }

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { pointsBalance: true }
        });

        if (!user) {
          throw new Error('User not found.');
        }

        if (user.pointsBalance < pointsRequired) {
          throw new Error('Insufficient points balance.');
        }

        // Generate unique coupon code
        const code = `REDEEM-${pointsRequired}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // Valid for 30 days

        // 1. Create Coupon in database
        const coupon = await tx.coupon.create({
          data: {
            code,
            discountPercent: 0,
            discountFlat,
            maxDiscount: discountFlat,
            expiryDate,
            isActive: true,
            maxUses: 1,
            usedCount: 0,
          }
        });

        // 2. Decrement User points balance
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { pointsBalance: { decrement: pointsRequired } }
        });

        if (updatedUser.pointsBalance < 0) {
          throw new Error('Insufficient points balance.');
        }

        // 3. Create PointTransaction record
        await tx.pointTransaction.create({
          data: {
            userId,
            points: -pointsRequired,
            reason: `Redeemed points for Coupon: ${code}`
          }
        });

        return { couponCode: code, discountFlat, pointsRemaining: updatedUser.pointsBalance, pointsRequired, reasonLabel };
      });

      // Log points redeemed
      await createAuditLog({
        userId,
        action: 'POINTS_REDEEMED',
        ipAddress: req.ip,
        details: {
          message: `Customer redeemed ${result.pointsRequired} points for a ₹${result.discountFlat} discount coupon (${result.couponCode})`,
          pointsRedeemed: result.pointsRequired,
          discountFlat: result.discountFlat,
          couponCode: result.couponCode,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Points redeemed successfully.',
        data: result
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /auth/loyalty/coupons
   * Customer: list active unexpired coupon codes redeemed by user
   */
  static async listUserCoupons(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;

    try {
      // 1. Fetch user's point transactions that represent coupon redemption
      const transactions = await prisma.pointTransaction.findMany({
        where: {
          userId,
          reason: {
            startsWith: 'Redeemed points for Coupon: '
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // 2. Extract codes
      const couponCodes = transactions
        .map((tx: any) => {
          const parts = tx.reason.split('Redeemed points for Coupon: ');
          return parts[1]?.trim();
        })
        .filter(Boolean);

      if (couponCodes.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      // 3. Fetch these coupons from Coupon table
      const coupons = await prisma.coupon.findMany({
        where: {
          code: { in: couponCodes },
          isActive: true,
          expiryDate: { gt: new Date() }
        }
      });

      // 4. Filter coupons that have remaining uses
      const activeCoupons = coupons.filter((c: any) => c.usedCount < c.maxUses);

      return res.status(200).json({
        success: true,
        data: activeCoupons
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/profile/request-update
   * Authenticated: requests changing email/phone number
   */
  static async requestContactUpdate(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { password, newEmail, newPhoneNumber } = req.body;

    try {
      // 1. Fetch user to verify password
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      if (!user.passwordHash) {
        return res.status(403).json({ success: false, message: 'SETUP_REQUIRED', details: 'Please setup your password first.' });
      }

      const isPasswordValid = await verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
      }

      // If newEmail or newPhoneNumber is requested, check if it's already registered by another user
      if (newEmail && newEmail !== user.email) {
        const emailExists = await prisma.user.findFirst({ where: { email: newEmail, id: { not: userId } } });
        if (emailExists) {
          return res.status(400).json({ success: false, message: 'New email is already registered to another account.' });
        }
      }
      if (newPhoneNumber) {
        const normalized = normalizePhoneNumber(newPhoneNumber);
        const phoneExists = await prisma.user.findFirst({ where: { phoneNumber: normalized, id: { not: userId } } });
        if (phoneExists) {
          return res.status(400).json({ success: false, message: 'New phone number is already registered to another account.' });
        }
      }

      // 2. Generate 6-digit verification code
      const code = crypto.randomInt(100000, 999999).toString();
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

      // 3. Save request state to Redis (expires in 5 mins)
      const state = {
        hashedCode,
        newEmail: newEmail || null,
        newPhoneNumber: newPhoneNumber ? normalizePhoneNumber(newPhoneNumber) : null,
      };
      await redis.set(`contact_update_request:${userId}`, JSON.stringify(state), 'EX', 300);

      // 4. Send code to user's CURRENT email address
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px 20px; text-align: center;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #eaeaea; text-align: left;">
            <div style="background: linear-gradient(135deg, #fb923c, #e85c1c); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px;">MARCOS</h1>
              <p style="color: #ffffff; opacity: 0.8; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Security Verification</p>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #222222; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hello ${user.fullName},</h2>
              <p style="color: #555555; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                We received a request to update the registered contact details for your MARCOS Studio account. Please use the secure verification code (OTP) below to authorize this change.
              </p>
              
              <div style="background-color: #f4f6f8; border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 30px; border: 1px solid #eef2f5;">
                <span style="display: block; color: #777777; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">Verification Code</span>
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #e85c1c; letter-spacing: 6px; display: inline-block;">${code}</span>
              </div>

              <p style="color: #999999; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0;">
                This code is valid for **5 minutes**. If you did not request this update, please ignore this email or contact support immediately.
              </p>
            </div>
            <div style="background-color: #f4f6f8; padding: 25px 30px; text-align: center; border-top: 1px solid #eaeaea;">
              <p style="color: #222222; font-size: 14px; font-weight: 600; margin: 0 0 5px 0;">MARCOS Bespoke Tailoring Studio</p>
              <p style="color: #bbbbbb; font-size: 11px; margin: 0;">&copy; 2026 MARCOS Studio. All Rights Reserved.</p>
            </div>
          </div>
        </div>
      `;

      EmailService.sendEmail(user.email, 'Verify Your Identity - MARCOS', `Your verification code is: ${code}`, emailHtml).catch(err => {
        logger.error('Failed to send contact update request email', { metadata: { error: err.message } });
      });

      return res.status(200).json({ success: true, message: 'Verification code sent to your current email address.' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/profile/confirm-update
   * Authenticated: confirms update using code and applies it
   */
  static async confirmContactUpdate(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { code } = req.body;

    try {
      // 1. Get request state from Redis
      const rawState = await redis.get(`contact_update_request:${userId}`);
      if (!rawState) {
        return res.status(400).json({ success: false, message: 'Verification request expired or not initiated. Please request again.' });
      }

      const state = JSON.parse(rawState);
      const hashedIncoming = crypto.createHash('sha256').update(code).digest('hex');

      if (state.hashedCode !== hashedIncoming) {
        return res.status(400).json({ success: false, message: 'Invalid verification code.' });
      }

      // 2. Clear request from Redis
      await redis.del(`contact_update_request:${userId}`);

      // 3. Apply changes to database
      const updateData: any = {};
      if (state.newEmail) updateData.email = state.newEmail;
      if (state.newPhoneNumber) updateData.phoneNumber = state.newPhoneNumber;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      await createAuditLog({
        userId,
        action: 'USER_CONTACT_UPDATED',
        ipAddress: req.ip,
        details: {
          message: `User updated contact details: email (${state.newEmail || 'unchanged'}), phone (${state.newPhoneNumber || 'unchanged'})`,
          updatedFields: updateData,
        },
      });

      // Generate a fresh access token for the updated email/info
      const accessToken = AuthService.generateAccessToken({
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        fullName: updatedUser.fullName,
      });

      return res.status(200).json({
        success: true,
        message: 'Contact details updated successfully.',
        accessToken,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          fullName: updatedUser.fullName,
          phoneNumber: updatedUser.phoneNumber,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/profile/verify-password
   * Authenticated: verifies password before letting customer change email/phone
   */
  static async verifyProfilePassword(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { password } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      if (!user.passwordHash) {
        return res.status(403).json({ success: false, message: 'SETUP_REQUIRED', details: 'Please setup your password first.' });
      }

      const isPasswordValid = await verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Password verified successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}
