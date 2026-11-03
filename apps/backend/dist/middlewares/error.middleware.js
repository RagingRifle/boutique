"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = errorMiddleware;
const logger_js_1 = __importDefault(require("../utils/logger.js"));
const environment_js_1 = require("../config/environment.js");
function errorMiddleware(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    logger_js_1.default.error(`${req.method} ${req.originalUrl} - Error: ${message}`, {
        metadata: {
            stack: err.stack,
            details: err.details,
            statusCode,
        },
    });
    let cleanMessage = message;
    // Prisma codes identify the failure class without exposing SQL or metadata.
    const prismaCode = /^P\d{4}$/.test(String(err.code || ''))
        ? String(err.code)
        : undefined;
    if (environment_js_1.isProduction) {
        if (statusCode === 500) {
            cleanMessage = 'Internal Server Error';
        }
    }
    res.status(statusCode).json({
        success: false,
        message: cleanMessage,
        ...(environment_js_1.isProduction && prismaCode && { code: prismaCode }),
        ...(!environment_js_1.isProduction && { stack: err.stack }),
        ...(!environment_js_1.isProduction && err.details && { details: err.details }),
    });
}
exports.default = errorMiddleware;
