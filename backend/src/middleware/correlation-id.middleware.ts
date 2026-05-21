import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { StructuredLogger } from "../lib/pino.config";

/**
 * Request Correlation ID Middleware
 * Generates unique correlation IDs for request tracing across systems
 *
 * Usage:
 * - Enables distributed tracing
 * - Tracks request flow through microservices
 * - Correlates logs across system components
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId?: string;
      logger?: StructuredLogger;
      startTime?: number;
    }
  }
}

/**
 * Generates or retrieves correlation ID from request
 * Priority:
 * 1. X-Correlation-ID header (from client or upstream service)
 * 2. X-Request-ID header (AWS ALB/CloudFront)
 * 3. Generate new UUID
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get or generate correlation ID
  const correlationId =
    (req.headers["x-correlation-id"] as string) ||
    (req.headers["x-request-id"] as string) ||
    (req.headers["x-amzn-trace-id"] as string) ||
    uuidv4();

  // Store in request for use in handlers
  req.correlationId = correlationId;

  // Add to response headers for client-side tracing
  res.setHeader("X-Correlation-ID", correlationId);

  // Create logger with correlation context
  req.logger = new StructuredLogger().withCorrelationId(correlationId);

  // Record start time for performance tracking
  req.startTime = Date.now();

  next();
};

/**
 * Request logging middleware
 * Logs HTTP request and response with correlation IDs
 */
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = req.startTime || Date.now();
  const correlationId = req.correlationId || "unknown";
  const logger = req.logger || new StructuredLogger().withCorrelationId(correlationId);

  // Extract user info if authenticated
  const user = (req as any).user;
  const userId = user?.id;
  const userEmail = user?.email;
  const userRole = user?.role;

  // Log incoming request
  logger
    .withRequest(req.method, req.path)
    .withUser(userId, userEmail, userRole)
    .debug("Incoming request", {
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

  // Capture response
  const originalSend = res.send;
  res.send = function (data: any) {
    res.send = originalSend;

    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log response
    const logLevel = statusCode >= 400 ? "warn" : "info";
    const logData = {
      method: req.method,
      path: req.path,
      statusCode,
      durationMs: duration,
      userId,
    };

    if (logLevel === "warn") {
      logger.warn(`HTTP response`, logData);
    } else {
      logger.debug(`HTTP response`, logData);
    }

    return res.send(data);
  };

  next();
};

/**
 * Error logging middleware
 * Logs errors with full context and correlation ID
 */
export const errorLoggingMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = req.correlationId || "unknown";
  const logger = req.logger || new StructuredLogger().withCorrelationId(correlationId);
  const user = (req as any).user;

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal server error";

  logger
    .withRequest(req.method, req.path)
    .withUser(user?.id, user?.email, user?.role)
    .error(`HTTP Error ${statusCode}`, err, {
      method: req.method,
      path: req.path,
      statusCode,
      userId: user?.id,
      stack: err.stack,
    });

  // Send error response
  res.status(statusCode).json({
    error: message,
    correlationId,
    statusCode,
  });
};

/**
 * Attach logger to response for use in route handlers
 */
export const loggerInjectionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.logger) {
    const correlationId = req.correlationId || uuidv4();
    req.logger = new StructuredLogger().withCorrelationId(correlationId);
  }

  next();
};

/**
 * Unhandled promise rejection handler
 */
export const unhandledRejectionHandler = (reason: any, promise: Promise<any>): void => {
  const logger = new StructuredLogger();
  logger.error("Unhandled Promise Rejection", reason instanceof Error ? reason : new Error(String(reason)), {
    promise: String(promise),
  });
};

/**
 * Uncaught exception handler
 */
export const uncaughtExceptionHandler = (error: Error): void => {
  const logger = new StructuredLogger();
  logger.fatal("Uncaught Exception", error, {
    message: error.message,
    stack: error.stack,
  });

  // Exit process after logging
  process.exit(1);
};
