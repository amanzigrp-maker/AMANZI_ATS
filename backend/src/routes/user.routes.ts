import { Router } from 'express';
import { verifyToken, AuthenticatedRequest } from '@/middleware/auth.middleware';
import { findUserByEmail } from '@/services/user.service';
import { pool } from '@/lib/database';
import { getUsers, getUserById } from '../controllers/user.controller';

const router = Router();

// This entire router is protected. We apply the middleware at the router level.
router.use(verifyToken);

// GET /api/profile
// An example of a protected route that returns the current user's profile.
router.get('/profile', async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication error.' });
  }

  try {
    // We can re-fetch the user from the database to get the most up-to-date information
    const user = await findUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Return user data (without the password hash)
    res.json({
      id: user.userid,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar_url: (user as any).avatar_url ?? null,
      lastLogin: user.lastlogin,
      createdAt: user.createdat,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.put('/avatar', async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication error.' });
  }

  const userId = req.user.id;
  const avatar_url = String((req as any).body?.avatar_url ?? '').trim();

  if (!avatar_url) {
    return res.status(400).json({ message: 'avatar_url is required.' });
  }

  const allowed = new Set([
    '/avatars/default.png',
    '/avatars/avatar-1.png',
    '/avatars/avatar-2.png',
    '/avatars/avatar-3.png',
    '/avatars/avatar-4.png',
    '/avatars/avatar-5.png',
  ]);

  if (!allowed.has(avatar_url)) {
    return res.status(400).json({ message: 'Invalid avatar_url.' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE userid = $2 RETURNING avatar_url',
      [avatar_url, userId]
    );

    return res.json({ success: true, avatar_url: result.rows[0]?.avatar_url ?? null });
  } catch (error) {
    console.error('Failed to update avatar:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET /api/users - Get users with optional filtering
router.get('/', getUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', getUserById);

export default router;
