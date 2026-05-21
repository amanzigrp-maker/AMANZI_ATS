import { Request, Response, NextFunction } from 'express';

export const secureHeaders = (req: Request, res: Response, next: NextFunction) => {
  // CSP
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss: http: https:;"
  );
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Disable MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS filter in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'no-referrer');
  
  next();
};
