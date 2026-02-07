import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

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
export const generalRateLimit = rateLimit(rateLimitOptions);

// Strict rate limiter for sensitive endpoints
export const strictRateLimit = rateLimit({
  ...rateLimitOptions,
  max: 10, // Limit to 10 requests per 15 minutes
  windowMs: 15 * 60 * 1000,
});

// API rate limiter for API endpoints
export const apiRateLimit = rateLimit({
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
export const terminalRateLimit = rateLimit({
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
export const createRateLimit = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
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

// Rate limiter middleware with custom logic
export const rateLimitMiddleware = (options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  return rateLimit({
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

// Rate limiter for different HTTP methods
export const createMethodRateLimit = (method: string, options: { windowMs: number; max: number }) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      success: false,
      message: `Too many ${method} requests, please try again later.`,
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return `${req.ip}-${req.method}`;
    },
  });
};

// Rate limiter for authenticated users
export const authenticatedRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for authenticated users
  keyGenerator: (req: Request) => {
    // Use user ID if available, otherwise IP
    return (req as any).user?.id || req.ip;
  },
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for public endpoints
export const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Lower limit for public endpoints
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
