import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../lib/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Login for temporary interview users
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // 1. Fetch user
    const result = await pool.query(
      'SELECT * FROM interview_users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // 2. Check if active and not expired
    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is no longer active' });
    }

    if (new Date() > new Date(user.expires_at)) {
      return res.status(403).json({ success: false, error: 'Interview access has expired' });
    }

    // 3. Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // 4. Generate JWT
    const token = jwt.sign(
      { interviewUserId: user.id, email: user.email, interviewId: user.interview_id },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        interviewId: user.interview_id,
        expiresAt: user.expires_at
      }
    });
  } catch (error) {
    console.error('Interview login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
