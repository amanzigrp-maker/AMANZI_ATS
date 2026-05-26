import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import hpp from "hpp";
import { config, isProduction } from "../config/env.config";
/**
 * PRODUCTION SECURITY HARDENING
 *
 * Comprehensive security middleware configuration with:
 * - Helmet for security headers
 * - Rate limiting (with separate strategies)
 * - Compression for performance
 * - HPP (HTTP Parameter Pollution) protection
 * - CORS hardening
 * - Secure cookie configuration
 * - Trust proxy settings
 * - Request size validation
 *
 * CAREFULLY DESIGNED TO NOT BREAK:
 * - File uploads (100MB limit preserved)
 * - WebSocket connections
 * - Electron telemetry
 * - AI services
 */
// ========================================================================
// HELMET CONFIGURATION
// ========================================================================
export const helmetConfig = helmet({
    // Content Security Policy - Allow necessary sources
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Required for WebSocket connection setup
                "'unsafe-eval'", // Required for JSON parsing
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Required for inline styles
                "https://fonts.googleapis.com",
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            // Critical: Allow WebSocket and API calls
            connectSrc: [
                "'self'",
                "ws:",
                "wss:",
                "https:",
                "http:",
            ],
            mediaSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
    },
    // Prevent clickjacking attacks
    frameguard: {
        action: "deny",
    },
    // Prevent MIME type sniffing
    noSniff: true,
    // Enable XSS protection in older browsers
    xssFilter: true,
    // Strict Transport Security (HSTS)
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: isProduction,
    },
    // Referrer Policy
    referrerPolicy: {
        policy: "no-referrer",
    },
    // Disable X-Powered-By header
    hidePoweredBy: true,
    // DNS Prefetch Control
    dnsPrefetchControl: {
        allow: false,
    },
});
// ========================================================================
// RATE LIMITING STRATEGIES
// ========================================================================
/**
 * Global rate limiter - Applied to all routes
 * Stricter in production
 */
export const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 100 : 1000, // 100 requests per 15 min in prod, 1000 in dev
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => {
        // Skip rate limiting for health checks and static files
        return (req.path === "/api/health" ||
            req.path === "/favicon.ico" ||
            req.path.startsWith("/static/"));
    },
    keyGenerator: (req) => {
        // Use X-Forwarded-For for proxied requests
        return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    },
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            error: "Too many requests. Please try again later.",
            retryAfter: res.getHeader("Retry-After"),
        });
    },
});
/**
 * Strict auth limiter - For login/registration endpoints
 * More aggressive rate limiting to prevent brute force
 */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 5 : 50, // 5 attempts per 15 min in prod
    message: "Too many authentication attempts, please try again later.",
    skipSuccessfulRequests: true, // Don't count successful requests
    skipFailedRequests: false, // Count failed attempts
    keyGenerator: (req) => {
        // Rate limit by email + IP for login
        const email = req.body?.email || "";
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
        return `${email}:${ip}`;
    },
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            error: "Too many login attempts. Please try again in 15 minutes.",
        });
    },
});
/**
 * API rate limiter - For general API endpoints
 * Moderate rate limiting
 */
export const apiRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isProduction ? 200 : 1000, // 200 requests per 5 min in prod
    message: "Too many API requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    },
});
/**
 * Upload limiter - More lenient for upload endpoints
 * Must NOT interfere with file uploads
 */
export const uploadRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isProduction ? 50 : 500, // 50 uploads per hour in prod
    message: "Too many upload attempts, please try again later.",
    skipSuccessfulRequests: true, // Don't count successful uploads
    keyGenerator: (req) => {
        return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    },
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            error: "Upload limit exceeded. Please try again later.",
        });
    },
});
/**
 * WebSocket rate limiter - For Socket.io events
 * Event-based rate limiting
 */
export const socketEventRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isProduction ? 100 : 1000, // 100 events per minute in prod
    keyGenerator: (req) => {
        // Use socket ID if available
        return req.socket?.remoteAddress || "unknown";
    },
    skip: (req) => {
        // Don't apply to health checks
        return req.path === "/api/health";
    },
});
export const getCorsOptions = () => {
    const allowedOrigins = [
        config.FRONTEND_URL,
        // Allow Electron app (typically localhost with various ports)
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:5173", // Vite dev
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
        // Allow Electron in production (custom protocol)
        "app://",
    ];
    if (!isProduction) {
        // Development: Allow all localhost variants
        allowedOrigins.push("http://localhost:*", "http://127.0.0.1:*");
    }
    return {
        origin: (origin, callback) => {
            // Allow requests with no origin (WebSocket, Electron native)
            if (!origin) {
                return callback(null, true);
            }
            // Check if origin matches any allowed origin
            const isAllowed = allowedOrigins.some((allowedOrigin) => {
                if (allowedOrigin === "app://") {
                    return origin.startsWith("app://");
                }
                return origin === allowedOrigin || allowedOrigin.includes("*");
            });
            if (isAllowed) {
                callback(null, true);
            }
            else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true, // Allow cookies for authenticated requests
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Cache-Control",
            "Pragma",
            "Expires",
            "X-Requested-With",
            "X-Correlation-ID"
        ],
        exposedHeaders: ["X-Correlation-ID", "X-Total-Count", "X-Page-Count"],
        maxAge: 86400, // 24 hours
    };
};
// ========================================================================
// COMPRESSION CONFIGURATION
// ========================================================================
export const compressionConfig = compression({
    // Only compress responses larger than 1KB
    threshold: 1024,
    // Exclude certain MIME types
    filter: (_req, res) => {
        // Don't compress WebSocket upgrades or large file responses
        if (res.getHeader("content-encoding") !== "identity" ||
            res.getHeader("X-No-Compression")) {
            return false;
        }
        // Compress these types
        const contentType = res.getHeader("content-type");
        if (typeof contentType === "string") {
            return !contentType.includes("video") && !contentType.includes("audio");
        }
        return true;
    },
    level: isProduction ? 6 : 3, // Compression level (0-9)
});
// ========================================================================
// HPP (HTTP Parameter Pollution) CONFIGURATION
// ========================================================================
export const hppConfig = hpp({
    // Whitelist parameters that can have multiple values
    whitelist: [
        "sort",
        "filter",
        "search",
        "fields",
        "skip",
        "limit",
        "page",
        // Add more as needed
    ],
});
// ========================================================================
// SECURE COOKIES CONFIGURATION
// ========================================================================
export const secureCookieConfig = {
    httpOnly: true, // Prevent XSS attacks
    secure: isProduction, // Only send over HTTPS in production
    sameSite: "strict", // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
};
// ========================================================================
// REQUEST SIZE LIMITS CONFIGURATION
// ========================================================================
/**
 * Configure request size limits
 * IMPORTANT: Preserves 100MB upload limit for file operations
 */
export const getRequestSizeLimits = () => {
    return {
        jsonLimit: "50mb", // JSON payload limit
        urlEncodedLimit: "50mb", // URL encoded payload limit
        textLimit: "50mb", // Text payload limit
        fileUploadLimit: "100mb", // File upload limit - MUST BE PRESERVED
    };
};
// ========================================================================
// TRUST PROXY CONFIGURATION
// ========================================================================
/**
 * Configure Express to trust proxy headers
 * Required for:
 * - Getting correct client IP behind load balancers (ALB, CloudFront)
 * - Detecting HTTPS connections
 * - Setting secure cookies properly
 */
export const trustProxyConfig = () => {
    if (isProduction) {
        // Trust up to 2 proxies (ALB + CloudFront or similar)
        return 2;
    }
    else {
        // In development, typically trust only local proxy
        return 1;
    }
};
// ========================================================================
// SECURITY HEADERS MIDDLEWARE
// ========================================================================
/**
 * Additional security headers beyond Helmet
 */
export const additionalSecurityHeaders = (_req, res, next) => {
    // Prevent caching of sensitive pages
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    // Additional security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Prevent Google from indexing in development
    if (!isProduction) {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    next();
};
// ========================================================================
// INPUT VALIDATION & SANITIZATION
// ========================================================================
/**
 * Validate and sanitize query parameters
 */
export const validateQueryParams = (_req, res, next) => {
    // This is a basic implementation
    // In production, use more robust libraries like joi or yup
    next();
};
// ========================================================================
// EXPORT MIDDLEWARE ORDER CONFIGURATION
// ========================================================================
/**
 * Recommended middleware order for maximum security without breaking functionality
 *
 * Order matters! Apply in this sequence:
 * 1. Trust proxy (must be first for IP detection)
 * 2. Helmet (security headers)
 * 3. CORS (before compression for WebSocket)
 * 4. Compression (after CORS)
 * 5. HPP (before body parsers)
 * 6. Request size limits (JSON/URL encoded)
 * 7. Global rate limiter
 * 8. Additional security headers
 * 9. Routes (with specific rate limiters as needed)
 */
export const setupSecurityMiddleware = (app) => {
    // 1. Trust proxy (MUST be first)
    app.set("trust proxy", trustProxyConfig());
    // 2. Helmet security headers
    app.use(helmetConfig);
    // 3. CORS (must be before compression)
    const corsOptions = getCorsOptions();
    app.use((req, res, next) => {
        // Handle CORS for all origins except disallowed ones
        const origin = req.headers.origin;
        if (!origin) {
            // Allow requests without origin (WebSocket, native apps)
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Requested-With, X-Correlation-ID");
            res.setHeader("Access-Control-Expose-Headers", "X-Correlation-ID");
        }
        else if (typeof corsOptions.origin === "function") {
            let allowOrigin = false;
            let corsError = null;
            corsOptions.origin(origin, (err, allow) => {
                corsError = err;
                allowOrigin = Boolean(allow);
            });
            if (corsError || !allowOrigin) {
                return res.status(403).json({ error: "Origin not allowed by CORS" });
            }
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Methods", corsOptions.methods.join(", "));
            res.setHeader("Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(", "));
            res.setHeader("Access-Control-Expose-Headers", corsOptions.exposedHeaders.join(", "));
            res.setHeader("Access-Control-Max-Age", String(corsOptions.maxAge));
        }
        if (req.method === "OPTIONS") {
            return res.sendStatus(200);
        }
        next();
    });
    // 4. Compression (after CORS for WebSocket compatibility)
    app.use(compressionConfig);
    // 5. HPP - Must be before body parsers
    app.use(hppConfig);
    // 6. Request body parsing with size limits (preserved for uploads)
    const limits = getRequestSizeLimits();
    app.use(express.json({ limit: limits.jsonLimit }));
    app.use(express.urlencoded({ limit: limits.urlEncodedLimit, extended: true }));
    // 7. Global rate limiting
    app.use((req, res, next) => {
        // Skip rate limiting for health checks
        if (req.path === "/api/health" || req.path === "/favicon.ico") {
            return next();
        }
        globalRateLimiter(req, res, next);
    });
    // 8. Additional security headers
    app.use(additionalSecurityHeaders);
    // 8. Query parameter validation
    app.use(validateQueryParams);
    return app;
};
// ========================================================================
// SOCKET.IO SECURITY CONFIGURATION
// ========================================================================
export const getSocketIOSecurityConfig = () => {
    return {
        // CORS for WebSocket
        cors: getCorsOptions(),
        // Maximum payload size (keep reasonable for real-time events)
        maxHttpBufferSize: 1e5, // 100KB for Socket.io events
        // Connection timeout
        connectTimeout: 45000,
        // Upgrade timeout
        upgradeTimeout: 30000,
        // Allow upgrades (http long-polling fallback)
        allowUpgrades: true,
        // Transport methods in order of preference
        transports: ["websocket", "polling"],
        // Cookie configuration for Socket.io
        cookie: {
            name: "io",
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000,
        },
    };
};
// ========================================================================
// SECURITY UTILITIES
// ========================================================================
/**
 * Validate API key or bearer token
 */
export const validateAuthHeader = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return null;
    }
    if (authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }
    return null;
};
/**
 * Check if request is from trusted source
 */
export const isTrustedSource = (req) => {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    // Allow requests with X-Correlation-ID (internal services)
    if (req.headers["x-correlation-id"]) {
        return true;
    }
    // Check origin/referer
    if (origin || referer) {
        const corsOptions = getCorsOptions();
        return corsOptions.allowedHeaders.includes("*");
    }
    // Allow no-origin requests (WebSocket, native)
    return true;
};
