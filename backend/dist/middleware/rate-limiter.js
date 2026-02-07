"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicRateLimit = exports.authenticatedRateLimit = exports.createMethodRateLimit = exports.rateLimitMiddleware = exports.createRateLimit = exports.terminalRateLimit = exports.apiRateLimit = exports.strictRateLimit = exports.generalRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Rate limiting configuration
const rateLimitOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
};
// General rate limiter
exports.generalRateLimit = (0, express_rate_limit_1.default)(rateLimitOptions);
// Strict rate limiter for sensitive endpoints
exports.strictRateLimit = (0, express_rate_limit_1.default)({
    ...rateLimitOptions,
    max: 10, // Limit to 10 requests per 15 minutes
    windowMs: 15 * 60 * 1000,
});
// API rate limiter for API endpoints
exports.apiRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per minute
    message: {
        success: false,
        message: "Too many API requests, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Terminal rate limiter (more restrictive)
exports.terminalRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Limit terminal operations
    message: {
        success: false,
        message: "Too many terminal operations, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Custom rate limiter for different user types
const createRateLimit = (windowMs, max, message) => {
    return (0, express_rate_limit_1.default)({
        windowMs,
        max,
        message: {
            success: false,
            message: message || "Rate limit exceeded",
        },
        standardHeaders: true,
        legacyHeaders: false,
    });
};
exports.createRateLimit = createRateLimit;
// Rate limiter middleware with custom logic
const rateLimitMiddleware = (options) => {
    return (0, express_rate_limit_1.default)({
        windowMs: options.windowMs,
        max: options.max,
        message: {
            success: false,
            message: options.message || "Rate limit exceeded",
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: options.skipSuccessfulRequests,
        skipFailedRequests: options.skipFailedRequests,
    });
};
exports.rateLimitMiddleware = rateLimitMiddleware;
// Rate limiter for different HTTP methods
const createMethodRateLimit = (method, options) => {
    return (0, express_rate_limit_1.default)({
        windowMs: options.windowMs,
        max: options.max,
        message: {
            success: false,
            message: `Too many ${method} requests, please try again later.`,
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            return `${req.ip}-${req.method}`;
        },
    });
};
exports.createMethodRateLimit = createMethodRateLimit;
// Rate limiter for authenticated users
exports.authenticatedRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Higher limit for authenticated users
    keyGenerator: (req) => {
        // Use user ID if available, otherwise IP
        return req.user?.id || req.ip;
    },
    message: {
        success: false,
        message: "Too many requests, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiter for public endpoints
exports.publicRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Lower limit for public endpoints
    message: {
        success: false,
        message: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
