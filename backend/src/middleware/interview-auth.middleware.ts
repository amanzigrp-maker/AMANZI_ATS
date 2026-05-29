import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../lib/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface InterviewRequest extends Request {
  interviewUser?: {
    id: number;
    email: string;
    interviewId: string;
  };
}

/**
 * Middleware to authenticate temporary interview users
 */
export const authenticateInterviewUser = async (req: InterviewRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (!decoded || !decoded.interviewUserId) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Check DB to ensure user is still active and not expired
    const result = await pool.query(
      'SELECT id, email, interview_id, is_active, expires_at FROM interview_users WHERE id = $1',
      [decoded.interviewUserId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is no longer active' });
    }

    if (new Date() > new Date(user.expires_at)) {
      return res.status(403).json({ success: false, error: 'Interview access has expired' });
    }

    req.interviewUser = {
      id: user.id,
      email: user.email,
      interviewId: user.interview_id
    };

    next();
  } catch (error) {
    console.error('Interview auth middleware error:', error);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};
