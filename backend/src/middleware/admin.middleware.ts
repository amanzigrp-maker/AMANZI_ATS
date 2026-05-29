import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Middleware to verify if the authenticated user has the 'ADMIN' role.
 * This should be used after the verifyToken middleware.
 */
export const verifyAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role.toUpperCase() !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }
  next();
};
