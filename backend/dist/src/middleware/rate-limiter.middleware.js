const ipRequests = new Map();
export const rateLimiter = (maxRequests, windowMs) => {
    return (req, res, next) => {
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
