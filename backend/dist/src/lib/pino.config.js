import pino from "pino";
import { config } from "../config/env.config";
const getLogLevel = () => {
    const envLevel = (process.env.APP_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase();
    const validLevels = ["silent", "fatal", "error", "warn", "info", "debug", "trace"];
    return validLevels.includes(envLevel) ? envLevel : "info";
};
/**
 * Sensitive field patterns to redact in logs
 */
const SENSITIVE_FIELDS = [
    "password",
    "otp",
    "token",
    "authorization",
    "cookie",
    "loginurl",
    "jwt",
    "secret",
    "apikey",
    "api_key",
    "creditcard",
    "ssn",
];
const SENSITIVE_FIELD_PATTERN = new RegExp(SENSITIVE_FIELDS.join("|"), "gi");
/**
 * Redact sensitive values from strings and objects
 */
const redactSensitiveData = (value) => {
    if (typeof value === "string") {
        return value.replace(/(password|otp|token|secret|apikey|api_key)\s*[:=]\s*[^\s,}]+/gi, (match, key) => `${key}=[REDACTED]`);
    }
    if (value && typeof value === "object") {
        if (Array.isArray(value)) {
            return value.map(redactSensitiveData);
        }
        const redacted = {};
        for (const [key, val] of Object.entries(value)) {
            if (SENSITIVE_FIELD_PATTERN.test(key)) {
                redacted[key] = "[REDACTED]";
            }
            else {
                redacted[key] = redactSensitiveData(val);
            }
        }
        return redacted;
    }
    return value;
};
/**
 * Create base logger instance with appropriate transport
 */
const createBaseLogger = () => {
    const isDevelopment = config.NODE_ENV === "development";
    const level = getLogLevel();
    // Transport for pretty-printing in development
    const devTransport = pino.transport({
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            singleLine: false,
            messageFormat: "{levelLabel} [{context}] {msg}",
        },
    });
    // Production transport: JSON lines format for parsing
    const prodTransport = pino.transport({
        target: "pino/file",
        options: {
            destination: process.env.LOG_FILE_PATH || "/var/log/amanzi-ats/server.log",
            mkdir: true,
        },
    });
    return pino({
        level,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level: (label, number) => {
                return { level: number, levelName: label };
            },
            bindings: (bindings) => {
                return {
                    pid: bindings.pid,
                    hostname: bindings.hostname,
                    nodeVersion: process.version,
                    environment: config.NODE_ENV,
                };
            },
        },
        serializers: {
            // Serialize error objects with full stack
            err: pino.stdSerializers.err,
            // Custom serializer for requests
            req: (req) => {
                return {
                    id: req.id,
                    method: req.method,
                    url: req.url,
                    remoteAddress: req.remoteAddress,
                    remotePort: req.remotePort,
                    userAgent: req.headers?.["user-agent"],
                    correlationId: req.headers?.["x-correlation-id"],
                };
            },
            // Custom serializer for responses
            res: (res) => {
                return {
                    statusCode: res.statusCode,
                    responseTime: res.responseTime,
                };
            },
        },
    }, isDevelopment ? devTransport : prodTransport);
};
// Export base logger
export const baseLogger = createBaseLogger();
/**
 * Logger class with context support
 * Automatically includes correlationId, userId, and other contextual metadata
 */
export class StructuredLogger {
    logger;
    context = {};
    constructor(context) {
        this.logger = baseLogger;
        this.context = context || {};
    }
    /**
     * Create a new logger with additional context
     */
    withContext(additionalContext) {
        const newLogger = new StructuredLogger({
            ...this.context,
            ...additionalContext,
        });
        return newLogger;
    }
    /**
     * Set correlation ID (typically from X-Correlation-ID header)
     */
    withCorrelationId(correlationId) {
        return this.withContext({ correlationId });
    }
    /**
     * Set user context
     */
    withUser(userId, email, role) {
        return this.withContext({
            userId,
            userEmail: email,
            userRole: role,
        });
    }
    /**
     * Set request context
     */
    withRequest(method, path) {
        return this.withContext({
            method,
            path,
        });
    }
    /**
     * Set interview/session context
     */
    withInterview(interviewId, candidateId) {
        return this.withContext({
            interviewId,
            candidateId,
        });
    }
    /**
     * Set WebSocket connection context
     */
    withSocket(socketId, room) {
        return this.withContext({
            socketId,
            room,
        });
    }
    /**
     * Log at debug level
     */
    debug(message, data, additionalContext) {
        const logData = redactSensitiveData({
            ...this.context,
            ...additionalContext,
            ...data,
        });
        this.logger.debug(logData, message);
    }
    /**
     * Log at info level
     */
    info(message, data, additionalContext) {
        const logData = redactSensitiveData({
            ...this.context,
            ...additionalContext,
            ...data,
        });
        this.logger.info(logData, message);
    }
    /**
     * Log at warn level
     */
    warn(message, data, additionalContext) {
        const logData = redactSensitiveData({
            ...this.context,
            ...additionalContext,
            ...data,
        });
        this.logger.warn(logData, message);
    }
    /**
     * Log at error level
     */
    error(message, error, additionalContext) {
        const logData = redactSensitiveData({
            ...this.context,
            ...additionalContext,
        });
        if (error instanceof Error) {
            this.logger.error({ ...logData, err: error }, message);
        }
        else if (error) {
            this.logger.error({ ...logData, ...error }, message);
        }
        else {
            this.logger.error(logData, message);
        }
    }
    /**
     * Log at fatal level
     */
    fatal(message, error, additionalContext) {
        const logData = redactSensitiveData({
            ...this.context,
            ...additionalContext,
        });
        if (error instanceof Error) {
            this.logger.fatal({ ...logData, err: error }, message);
        }
        else if (error) {
            this.logger.fatal({ ...logData, ...error }, message);
        }
        else {
            this.logger.fatal(logData, message);
        }
    }
    /**
     * Log performance metrics (useful for tracking API response times)
     */
    logPerformance(operationName, durationMs, metadata) {
        const level = durationMs > 5000 ? "warn" : "info";
        const logData = {
            ...this.context,
            operation: operationName,
            durationMs,
            performanceLevel: level,
            ...metadata,
        };
        if (level === "warn") {
            this.logger.warn(logData, `Slow operation: ${operationName}`);
        }
        else {
            this.logger.info(logData, `Operation completed: ${operationName}`);
        }
    }
    /**
     * Log structured event (useful for audit logging)
     */
    logEvent(eventName, eventType, data) {
        const logData = {
            ...this.context,
            eventName,
            eventType,
            timestamp: new Date().toISOString(),
            ...data,
        };
        this.logger.info(logData, `Event: ${eventName}`);
    }
    /**
     * Create child logger for nested operations
     */
    child(bindings) {
        return this.logger.child(bindings);
    }
}
/**
 * Export singleton logger instance for module-level logging
 */
export const logger = new StructuredLogger();
/**
 * Utility function to create a logger with initial context
 */
export const createLogger = (context) => {
    return new StructuredLogger(context);
};
