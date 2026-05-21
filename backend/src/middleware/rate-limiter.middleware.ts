import { Request, Response, NextFunction } from 'express';

const ipRequests = new Map<string, { count: number; firstRequestTime: number }>();

export const rateLimiter = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
    const now = Date.now();

    const record = ipRequests.get(ip);
    if (!record) {
      ipRequests.set(ip, { count: 1, firstRequestTime: now });
      return next();
    }

    if (now - record.firstRequestTime > windowMs) {
      // Reset window
      ipRequests.set(ip, { count: 1, firstRequestTime: now });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.'
      });
    }

    record.count += 1;
    next();
  };
};
