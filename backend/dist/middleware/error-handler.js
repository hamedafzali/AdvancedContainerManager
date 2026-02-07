"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.asyncHandler = asyncHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, next) {
    const logger = new logger_1.Logger(logger_1.LogLevel.ERROR);
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Internal Server Error";
    // Log the error
    logger.error("Application Error:", {
        message: err.message,
        stack: err.stack,
        statusCode,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
    });
    // Send error response
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: err.code || "INTERNAL_ERROR",
            statusCode,
            details: process.env.NODE_ENV === "development" ? err.stack : undefined,
        },
    });
}
function notFoundHandler(req, res, next) {
    const error = new Error(`Route not found: ${req.method} ${req.url}`);
    error.statusCode = 404;
    next(error);
}
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
exports.default = errorHandler;
