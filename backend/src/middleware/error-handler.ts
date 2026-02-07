import { Request, Response, NextFunction } from "express";
import { Logger, LogLevel } from "../utils/logger";

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const logger = new Logger(LogLevel.ERROR);

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

export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const error = new Error(`Route not found: ${req.method} ${req.url}`);
  (error as any).statusCode = 404;
  next(error);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default errorHandler;
