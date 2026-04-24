// src/routes/auth.routes.ts
import { Router } from 'express';
import { createUser, findUserByEmail } from '../services/user.service';
import { logAudit } from '../services/audit.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../lib/database';

const router = Router();

// -----------------------------------------------------------------------------
// SAFE SECRET ACCESS
// -----------------------------------------------------------------------------
const getJwtSecrets = () => {
  const jwtSecret = process.env.JWT_SECRET;
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

  if (!jwtSecret || !refreshSecret) {
    throw new Error('[AUTH] Missing JWT_SECRET or REFRESH_TOKEN_SECRET');
  }

  return { jwtSecret, refreshSecret };
};

// -----------------------------------------------------------------------------
// POST /api/auth/login
// -----------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await logAudit(null, req, false, 'LOGIN_FAILED', email);
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const status = String(user.status || '').toLowerCase();
    if (status === 'disabled') {
      await logAudit(user.userid, req, false, 'LOGIN_DISABLED', email);
      return res.status(403).json({ message: 'Your account has been disabled.' });
    }

    if (status === 'blocked' || status === 'locked') {
      await logAudit(user.userid, req, false, 'LOGIN_BLOCKED', email);
      return res.status(403).json({ message: 'Your account has been locked.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordhash);
    if (!isPasswordValid) {
      await logAudit(user.userid, req, false, 'LOGIN_FAILED', email);
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const { jwtSecret, refreshSecret } = getJwtSecrets();

    const accessToken = jwt.sign(
      { id: user.userid, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { id: user.userid, email: user.email },
      refreshSecret,
      { expiresIn: '7d' }
    );

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expiry)
       VALUES ($1, $2, $3)`,
      [user.userid, refreshToken, expiryDate]
    );

    await pool.query(
      `UPDATE users SET lastlogin = NOW() WHERE userid = $1`,
      [user.userid]
    );

    await logAudit(user.userid, req, true, 'LOGIN', email);

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.userid,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[AUTH] /login error:', error);
    res.status(500).json({ message: 'Authentication error on server.' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/auth/refresh
// -----------------------------------------------------------------------------
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    await logAudit(null, req, false, 'REFRESH_FAILED');
    return res.status(400).json({ message: 'Refresh token is required.' });
  }

  try {
    const { jwtSecret, refreshSecret } = getJwtSecrets();

    let payload: any;
    try {
      payload = jwt.verify(refreshToken, refreshSecret);
    } catch {
      await logAudit(null, req, false, 'REFRESH_FAILED');
      return res.status(403).json({ message: 'Invalid refresh token.' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Invalid refresh token.' });
    }

    const dbToken = rows[0];
    if (new Date(dbToken.expiry) < new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      return res.status(403).json({ message: 'Refresh token expired.' });
    }

    const { rows: userRows } = await pool.query(
      'SELECT * FROM users WHERE userid = $1',
      [dbToken.user_id]
    );

    if (userRows.length === 0) {
      return res.status(403).json({ message: 'User not found.' });
    }

    const user = userRows[0];

    const newAccessToken = jwt.sign(
      { id: user.userid, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '1h' }
    );

    const newRefreshToken = jwt.sign(
      { id: user.userid, email: user.email },
      refreshSecret,
      { expiresIn: '7d' }
    );

    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 7);

    await pool.query(
      'UPDATE refresh_tokens SET token = $1, expiry = $2 WHERE token = $3',
      [newRefreshToken, newExpiry, refreshToken]
    );

    await logAudit(user.userid, req, true, 'REFRESH');

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('[AUTH] /refresh error:', error);
    res.status(500).json({ message: 'Authentication error on server.' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/auth/logout
// -----------------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM refresh_tokens WHERE token = $1 RETURNING user_id',
      [refreshToken]
    );

    if (result.rowCount > 0) {
      await logAudit(result.rows[0].user_id, req, true, 'LOGOUT');
    }

    res.json({ message: 'Logout successful.' });
  } catch (error) {
    console.error('[AUTH] /logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
