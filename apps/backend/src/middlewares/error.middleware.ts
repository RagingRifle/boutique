import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { isProduction } from '../config/environment.js';

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorMiddleware(
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  logger.error(`${req.method} ${req.originalUrl} - Error: ${message}`, {
    metadata: {
      stack: err.stack,
      details: err.details,
      statusCode,
    },
  });

  let cleanMessage = message;
  // Prisma error codes are safe to expose and identify the failure class (for
  // example P2002 = unique constraint, P2021 = missing table). The full error
  // remains in server logs; never send SQL or Prisma metadata to production.
  const prismaCode = /^P\d{4}$/.test(String((err as any).code || ''))
    ? String((err as any).code)
    : undefined;

  if (isProduction) {
    if (statusCode === 500) {
      cleanMessage = 'Internal Server Error';
    }
  }

  res.status(statusCode).json({
    success: false,
    message: cleanMessage,
    ...(isProduction && prismaCode && { code: prismaCode }),
    ...(!isProduction && { stack: err.stack }),
    ...(!isProduction && err.details && { details: err.details }),
  });
}

export default errorMiddleware;

