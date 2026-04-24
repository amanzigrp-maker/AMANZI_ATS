import express from 'express';
import { pool } from '../lib/database';
import fs from 'fs/promises';
import path from 'path';

import {
  verifyToken,
  isLead,         // Use correct lead guard
  AuthenticatedRequest
} from '../middleware/auth.middleware';

import { createUser } from '../services/user.service';
import { adminChangePassword } from '../services/password-reset.service';
import { sendPasswordChangeConfirmation } from '../services/email.service';
import { logAudit } from '../services/audit.service';
import { z } from 'zod';

const router = express.Router();

// 🔥 FIXED: Admin and Lead routes
router.use(verifyToken, isLead);

/**
 * Helper to check if the current user (Lead) is authorized to manage the target user.
 * Admin can manage anyone. Lead can only manage those they created.
 */
async function isAuthorizedToManage(loggedInUser: any, targetUserId: string | number) {
  if (loggedInUser.role === 'admin') return true;
  if (loggedInUser.role !== 'lead') return false;

  const { rows } = await pool.query('SELECT created_by FROM users WHERE userid = $1', [targetUserId]);
  return rows.length > 0 && rows[0].created_by === loggedInUser.id;
}


/**
 * GET /api/admin/logins/recent
 * Fetches a paginated list of recent login attempts.
 * Query params: page (number), limit (number)
 */
router.get('/logins/recent', async (req, res) => {
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '20', 10);
  const offset = (page - 1) * limit;

  try {
    const loggedInUser = req.user;
    let query = `
      SELECT la.auditid, la.userid, u.email, la.logintime, la.ipaddress, la.deviceinfo, la.loginstatus
      FROM loginaudit la
      JOIN users u ON la.userid = u.userid
    `;
    const params: any[] = [limit, offset];

    if (loggedInUser?.role === 'lead') {
      query += ` WHERE u.created_by = $3 OR u.userid = $3`;
      params.push(loggedInUser.id);
    }

    query += ` ORDER BY la.logintime DESC LIMIT $1 OFFSET $2`;

    const { rows } = await pool.query(query, params);

    const { rows: totalRows } = await pool.query('SELECT COUNT(*) FROM loginaudit');
    const total = parseInt(totalRows[0].count, 10);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/logins/failed
 * Fetches users with a suspicious number of failed login attempts.
 * Query params: min (number), hours (number)
 */
router.get('/logins/failed', async (req, res) => {
  const min = parseInt(req.query.min as string || '1', 10);
  const hours = parseInt(req.query.hours as string || '24', 10);

  try {
    const loggedInUser = req.user;
    let query = `
      SELECT u.userid, u.email, COUNT(*) AS failed_attempts
      FROM loginaudit l
      JOIN users u ON l.userid = u.userid
      WHERE l.loginstatus = 'failed'
        AND l.logintime >= NOW() - ($2 * INTERVAL '1 hour')
    `;
    const params: any[] = [min, hours];

    if (loggedInUser?.role === 'lead') {
      query += ` AND (u.created_by = $3 OR u.userid = $3)`;
      params.push(loggedInUser.id);
    }

    query += ` GROUP BY u.userid, u.email`;

    query += ` HAVING COUNT(*) >= $1 ORDER BY failed_attempts DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[ADMIN] Error fetching failed logins:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/sessions/active
 * Fetches users with more than a certain number of active refresh tokens.
 * Query params: threshold (number)
 */
router.get('/sessions/active', async (req, res) => {
  const threshold = parseInt(req.query.threshold as string || '3', 10);

  try {
    const loggedInUser = req.user;
    let query = `
      SELECT u.userid, u.email, COUNT(r.token) AS active_sessions
      FROM users u
      JOIN refresh_tokens r ON u.userid = r.user_id
      WHERE r.expiry > NOW()
    `;
    const params: any[] = [threshold];

    if (loggedInUser?.role === 'lead') {
      query += ` AND (u.created_by = $2 OR u.userid = $2)`;
      params.push(loggedInUser.id);
    }

    query += ` GROUP BY u.userid, u.email HAVING COUNT(r.token) >= $1 ORDER BY active_sessions DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[ADMIN] Error fetching active sessions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/logins/heatmap
 * Fetches login counts per day for a given period, separated by role.
 * Query params: days (number)
 */
router.get('/logins/heatmap', async (req, res) => {
  const days = parseInt(req.query.days as string || '30', 10);

  try {
    const loggedInUser = req.user;
    let query = `
      SELECT 
        DATE(l.logintime) AS day,
        SUM(CASE WHEN u.role = 'RECRUITER' THEN 1 ELSE 0 END) AS internal_logins,
        SUM(CASE WHEN u.role = 'VENDOR' THEN 1 ELSE 0 END) AS vendor_logins,
        COUNT(*) AS total_logins
      FROM loginaudit l
      JOIN users u ON l.userid = u.userid
      WHERE l.loginstatus = 'success'
        AND l.logintime >= NOW() - ($1 * INTERVAL '1 day')
    `;
    const params: any[] = [days];

    if (loggedInUser?.role === 'lead') {
      query += ` AND (u.created_by = $2 OR u.userid = $2)`;
      params.push(loggedInUser.id);
    }

    query += ` GROUP BY DATE(l.logintime) ORDER BY day`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:userId/lock
 * Locks a user's account, preventing them from logging in.
 */
router.post('/users/:userId/lock', async (req, res) => {
  const { userId } = req.params;
  const loggedInUser = req.user;

  if (!await isAuthorizedToManage(loggedInUser, userId)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  try {
    const { rowCount } = await pool.query("UPDATE users SET status = 'blocked' WHERE userid = $1", [userId]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ message: 'User account has been locked.' });
  } catch (error) {
    console.error('[ADMIN] Error locking user:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:userId/unlock
 * Unlocks a user's account, allowing them to log in again.
 */
router.post('/users/:userId/unlock', async (req, res) => {
  const { userId } = req.params;
  const loggedInUser = req.user;

  if (!await isAuthorizedToManage(loggedInUser, userId)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  try {
    const { rowCount } = await pool.query("UPDATE users SET status = 'active' WHERE userid = $1", [userId]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ message: 'User account has been unlocked.' });
  } catch (error) {
    console.error('[ADMIN] Error unlocking user:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/admin/users/:userId/revoke-tokens
 * Revokes all active refresh tokens for a user, forcing a logout on all devices.
 */
router.post('/users/:userId/revoke-tokens', async (req, res) => {
  const { userId } = req.params;
  const loggedInUser = req.user;

  if (!await isAuthorizedToManage(loggedInUser, userId)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  try {
    const { rowCount } = await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    res.status(200).json({ message: `Revoked ${rowCount} session(s) for the user.` });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users
 * Creates a new user. Only accessible by admins.
 */
router.post('/users', async (req, res) => {
  try {
    const { role } = req.body;
    const loggedInUserRole = req.user?.role;

    if (loggedInUserRole === 'lead' && !['recruiter', 'vendor'].includes(role?.toLowerCase())) {
      return res.status(403).json({ message: 'Leads can only create Recruiter or Vendor accounts.' });
    }

    const newUser = await createUser({ ...req.body, created_by: req.user?.id });
    res.status(201).json({ message: 'User created successfully', user: { id: newUser.userid, email: newUser.email, role: newUser.role } });
  } catch (error: any) {
    console.error('[ADMIN] Error creating user:', error);

    // Check for duplicate email error
    if (error.code === '23505' || (error.message && error.message.includes('duplicate key')) || (error.message && error.message.includes('already exists'))) {
      const { email } = req.body;
      const { rows } = await pool.query('SELECT u.email, u.userid, u.created_by, creator.email as creator_email FROM users u LEFT JOIN users creator ON u.created_by = creator.userid WHERE u.email = $1', [email]);
      
      if (rows.length > 0 && req.user?.role === 'lead') {
        const existing = rows[0];
        if (existing.created_by === req.user.id) {
          return res.status(409).json({ message: 'This user is already assigned to you.' });
        } else if (existing.created_by) {
          return res.status(409).json({ message: `This user is already assigned to another Lead.`, detail: 'Multiple leads cannot share the same recruiter/vendor.' });
        } else {
          return res.status(409).json({ message: 'This user already exists in the system (Unassigned or Admin).' });
        }
      }
      
      return res.status(409).json({ message: 'User with this email already exists.' });
    }

    // Check for other validation errors
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users
 * Fetches a list of active users (excludes disabled).
 */
router.get('/users', async (req, res) => {
  try {
    const loggedInUser = req.user;
    let query = `
      SELECT u.userid, u.email, u.role, u.status, u.createdat, u.lastlogin, u.created_by, creator.email as creator_email
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.userid
      WHERE u.status != 'disabled'
    `;
    const params: any[] = [];

    if (loggedInUser?.role === 'lead') {
      query += ` AND u.created_by = $1`;
      params.push(loggedInUser.id);
    }

    query += ` ORDER BY u.createdat DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users/all
 * Fetches all users including disabled ones.
 */
router.get('/users/all', async (req, res) => {
  try {
    const loggedInUser = req.user;
    let query = `
      SELECT u.userid, u.email, u.role, u.status, u.createdat, u.lastlogin, u.created_by, creator.email as creator_email
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.userid
    `;
    const params: any[] = [];

    if (loggedInUser?.role === 'lead') {
      query += ` WHERE u.created_by = $1`;
      params.push(loggedInUser.id);
    }

    query += ` ORDER BY 
        CASE WHEN u.status = 'disabled' THEN 1 ELSE 0 END,
        u.createdat DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/users/:userId/assignment
 * Re-assigns a user to a different Lead. Only accessible by admins.
 */
router.put('/users/:userId/assignment', async (req, res) => {
  const { userId } = req.params;
  const { leadId } = req.body;
  const loggedInUser = req.user;

  if (loggedInUser?.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can re-assign users to different leads.' });
  }

  if (!leadId) {
    return res.status(400).json({ message: 'Lead ID is required.' });
  }

  try {
    // Verify lead exists and is a lead
    const { rows: leadRows } = await pool.query('SELECT role FROM users WHERE userid = $1', [leadId]);
    if (leadRows.length === 0 || leadRows[0].role !== 'lead') {
      return res.status(400).json({ message: 'The specified Lead ID is invalid or not a Lead.' });
    }

    const { rowCount } = await pool.query('UPDATE users SET created_by = $1 WHERE userid = $2', [leadId, userId]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ message: 'User assignment updated successfully.' });
  } catch (error) {
    console.error('[ADMIN] Error re-assigning user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/users/:userId/role
 * Updates the role of a specific user.
 */
router.put('/users/:userId/role', async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const loggedInUserId = req.user?.id;

  if (parseInt(userId, 10) === loggedInUserId) {
    return res.status(403).json({ message: 'Admins cannot change their own role.' });
  }

  if (!await isAuthorizedToManage(req.user, userId)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  if (!role || !['admin', 'recruiter', 'vendor', 'lead'].includes(role.toLowerCase())) {
    return res.status(400).json({ message: 'Invalid role specified.' });
  }

  if (req.user?.role === 'lead' && !['recruiter', 'vendor'].includes(role.toLowerCase())) {
    return res.status(403).json({ message: 'Leads can only assign Recruiter or Vendor roles.' });
  }

  try {
    const { rowCount } = await pool.query('UPDATE users SET role = $1 WHERE userid = $2', [role, userId]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ message: `User role updated to ${role}.` });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Deletes a user and their associated data.
 */
router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const loggedInUserId = req.user?.id;

  if (parseInt(userId, 10) === loggedInUserId) {
    return res.status(403).json({ message: 'Admins cannot disable their own account.' });
  }

  if (!await isAuthorizedToManage(req.user, userId)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE users 
       SET status = 'disabled', deleted_at = NOW(), deleted_by = $1
       WHERE userid = $2`,
      [loggedInUserId, userId]
    );

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found.' });
    }

    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    res.status(200).json({ message: 'User account has been disabled successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/admin/users/stats
 * Fetches statistics about users, including total count and breakdown by status.
 */
router.get('/users/stats', async (req, res) => {
  try {
    const loggedInUser = req.user;
    let query = `
      SELECT 
        COUNT(*) AS total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_users,
        COUNT(CASE WHEN status = 'disabled' THEN 1 END) AS disabled_users,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) AS inactive_users,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) AS blocked_users
      FROM users
    `;
    const params: any[] = [];

    if (loggedInUser?.role === 'lead') {
      query += ` WHERE created_by = $1`;
      params.push(loggedInUser.id);
    }

    const { rows } = await pool.query(query, params);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/users/:userId/enable
 * Reactivates a disabled user account.
 */
router.put('/users/:userId/enable', async (req, res) => {
  const { userId } = req.params;

  if (!await isAuthorizedToManage(req.user, userId)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE users 
       SET status = 'active', deleted_at = NULL, deleted_by = NULL, updatedat = NOW()
       WHERE userid = $1 AND status = 'disabled'`,
      [userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Disabled user not found.' });
    }

    res.status(200).json({ message: 'User account has been reactivated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /admin/reset-password/:id
 * Admin can directly change a user's password without requiring OTP verification
 */
const AdminChangePasswordSchema = z.object({
  newPassword: z.string().min(8, { message: 'Password must be at least 8 characters long.' }),
});

router.put('/reset-password/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const loggedInUserId = req.user?.id;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!await isAuthorizedToManage(req.user, id)) {
    return res.status(403).json({ message: 'Access denied. You can only manage users you created.' });
  }

  try {
    const validation = AdminChangePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { newPassword } = validation.data;
    const targetUserId = parseInt(id, 10);

    if (isNaN(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const { rows: userRows } = await pool.query(
      'SELECT userid, email FROM users WHERE userid = $1 AND deleted_at IS NULL',
      [targetUserId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const targetUser = userRows[0];

    const result = await adminChangePassword(loggedInUserId, targetUserId, newPassword);

    try {
      await sendPasswordChangeConfirmation(targetUser.email, targetUser.email);
    } catch (emailError) {
      console.warn('[ADMIN] Failed to send confirmation email:', emailError);
    }

    await logAudit(loggedInUserId, req, true, 'ADMIN_PASSWORD_CHANGE');
    res.json(result);
  } catch (error) {
    await logAudit(loggedInUserId || null, req, false, 'ADMIN_PASSWORD_CHANGE_FAILED');
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to change password.',
    });
  }
});

/**
 * POST /api/admin/clients
 * Creates a new client company.
 */
router.post('/clients', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const { client_name, gstin, pan, state, pincode } = req.body as any;

    if (!client_name) {
      return res.status(400).json({ message: 'Client name is required.' });
    }

    // Basic server-side validation for new fields
    if (gstin && String(gstin).length !== 15) {
      return res.status(400).json({ message: 'GSTIN must be exactly 15 characters.' });
    }
    if (pan && String(pan).length !== 10) {
      return res.status(400).json({ message: 'PAN must be exactly 10 characters.' });
    }
    if (pincode && !/^\d{6}$/.test(String(pincode))) {
      return res.status(400).json({ message: 'Pincode must be exactly 6 digits.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Insert client row and get numeric client_id
      const insertResult = await client.query(
        `INSERT INTO clients (client_name, gstin, pan, state, pincode, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [client_name, gstin || null, pan || null, state || null, pincode || null, loggedInUserId]
      );
      const inserted = insertResult.rows[0];

      // 2) Generate human-friendly code like AG1005
      const numericId = inserted.client_id as number;
      const clientCode = `AG${1000 + Number(numericId || 0)}`;

      // 3) Update the row with the generated code
      const updateResult = await client.query(
        `UPDATE clients SET code = $1 WHERE client_id = $2 RETURNING *`,
        [clientCode, numericId]
      );
      const updated = updateResult.rows[0];

      await client.query('COMMIT');

      await logAudit(loggedInUserId, req, true, 'CLIENT_CREATED');
      res.status(201).json({ message: 'Client created successfully', client: updated });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[ADMIN] Error creating client:', error);

    // Handle unique constraint violations for gstin / pan
    if (error.code === '23505') {
      const detail = (error.detail || '').toLowerCase();
      if (detail.includes('gstin')) {
        return res.status(409).json({ message: 'A client with this GSTIN already exists.' });
      }
      if (detail.includes('pan')) {
        return res.status(409).json({ message: 'A client with this PAN already exists.' });
      }
      return res.status(409).json({ message: 'Duplicate value for a unique client field.' });
    }

    await logAudit(loggedInUserId || null, req, false, 'CLIENT_CREATE_FAILED');
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/clients
 * Fetches all clients.
 */
router.get('/clients', async (req, res) => {
  try {
    const loggedInUser = req.user;
    let query = `
      SELECT c.client_id,
             c.client_name,
             c.code,
             c.gstin,
             c.pan,
             c.state,
             c.pincode,
             c.created_by,
             u.email as created_by_email
      FROM clients c
      LEFT JOIN users u ON c.created_by = u.userid
    `;
    const params: any[] = [];

    // visibility logic: admin sees all, lead sees their own + their descendants'
    if (loggedInUser?.role === 'lead') {
      query += ` WHERE c.created_by = $1 OR u.created_by = $1`;
      params.push(loggedInUser.id);
    }
    // else if admin, skip WHERE to see everything

    query += ` ORDER BY c.client_id DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[ADMIN] Error fetching clients:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/clients/:id
 * Updates a client's name.
 */
router.put('/clients/:id', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;
  const { id } = req.params as any;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const { client_name, gstin, pan, state, pincode } = req.body;
    if (!client_name) {
      return res.status(400).json({ message: 'Client name is required.' });
    }

    const { rows, rowCount } = await pool.query(
      `UPDATE clients
          SET client_name = $1,
              gstin = $2,
              pan = $3,
              state = $4,
              pincode = $5,
              updated_at = NOW()
        WHERE client_id = $6
        RETURNING *`,
      [client_name, gstin || null, pan || null, state || null, pincode || null, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    await logAudit(loggedInUserId, req, true, 'CLIENT_UPDATED');
    res.json({ message: 'Client updated successfully', client: rows[0] });
  } catch (error) {
    console.error('[ADMIN] Error updating client:', error);
    await logAudit(loggedInUserId || null, req, false, 'CLIENT_UPDATE_FAILED');
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/clients/:id
 * Deletes a client.
 */
router.delete('/clients/:id', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;
  const { id } = req.params as any;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    // Check if client has active jobs
    const { rows: jobRows } = await pool.query(
      'SELECT job_id FROM jobs WHERE client_id = $1 LIMIT 1',
      [id]
    );

    if (jobRows.length > 0) {
      return res.status(409).json({ 
        message: 'Cannot delete client because it has associated jobs. Please delete or reassign the jobs first.' 
      });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM clients WHERE client_id = $1',
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    await logAudit(loggedInUserId, req, true, 'CLIENT_DELETED');
    res.json({ message: 'Client deleted successfully' });
  } catch (error: any) {
    console.error('[ADMIN] Error deleting client:', error);

    // Backup check for foreign key constraint
    if (error.code === '23503') {
      return res.status(409).json({ 
        message: 'Cannot delete client: it is still referenced by other records (jobs).' 
      });
    }

    await logAudit(loggedInUserId || null, req, false, 'CLIENT_DELETE_FAILED');
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * POST /api/admin/jobs
 * Creates a new job posting.
 */
router.post('/jobs', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const { client_id } = req.body;

    if (!client_id) {
      return res.status(400).json({ message: 'Client ID is required.' });
    }

    // Verify client exists
    const { rows: clientRows } = await pool.query(
      'SELECT client_id FROM clients WHERE client_id = $1',
      [client_id]
    );

    if (clientRows.length === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO job_openings (client_id, created_by) VALUES ($1, $2) RETURNING *`,
      [client_id, loggedInUserId]
    );

    await logAudit(loggedInUserId, req, true, 'JOB_CREATED');
    res.status(201).json({ message: 'Job created successfully', job: rows[0] });
  } catch (error) {
    console.error('[ADMIN] Error creating job:', error);
    await logAudit(loggedInUserId || null, req, false, 'JOB_CREATE_FAILED');
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/jobs
 * Fetches all jobs with client information.
 */
router.get('/jobs', async (req, res) => {
  try {
    const loggedInUser = req.user;
    let query = `
      SELECT j.job_id, j.client_id, j.created_by, c.client_name, u.email as created_by_email
      FROM job_openings j
      LEFT JOIN clients c ON j.client_id = c.client_id
      LEFT JOIN users u ON j.created_by = u.userid
    `;
    const params: any[] = [];

    if (loggedInUser?.role === 'admin') {
      // no extra filters
    } else if (loggedInUser?.role === 'lead') {
      // Lead sees jobs they posted OR jobs posted by users they created
      query += ` WHERE j.created_by = $1 OR u.created_by = $1`;
      params.push(loggedInUser.id);
    }

    query += ` ORDER BY j.job_id DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[ADMIN] Error fetching jobs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/resumes/delete-all
 * Delete all resumes from database (TEMPORARY - for testing)
 */
router.delete('/resumes/delete-all', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get counts before deletion
    const resumeCountResult = await client.query('SELECT COUNT(*) FROM resumes');
    const candidateCountResult = await client.query('SELECT COUNT(*) FROM candidates');
    const resumeCount = parseInt(resumeCountResult.rows[0].count);
    const candidateCount = parseInt(candidateCountResult.rows[0].count);

    console.log(`📊 Before deletion: ${resumeCount} resumes, ${candidateCount} candidates`);

    // Delete in correct order due to foreign keys
    // Optional tables must NOT abort the transaction if missing.
    const safeDelete = async (tableName: string) => {
      try {
        await client.query('SAVEPOINT sp_delete');
        const exists = await client.query(
          `SELECT to_regclass($1) AS regclass`,
          [tableName]
        );
        if (!exists.rows?.[0]?.regclass) {
          console.log(`ℹ️ ${tableName} not found; skipping`);
          await client.query('RELEASE SAVEPOINT sp_delete');
          return;
        }
        const result = await client.query(`DELETE FROM ${tableName}`);
        console.log(`🗑️ Deleted ${result.rowCount} from ${tableName}`);
        await client.query('RELEASE SAVEPOINT sp_delete');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_delete');
        console.log(`ℹ️ ${tableName} cannot be cleared:`, (e as any)?.message);
      }
    };

    await safeDelete('resume_section_embeddings');
    await safeDelete('candidate_job_matches');
    await safeDelete('resume_embeddings');
    await safeDelete('job_embeddings');
    await safeDelete('resume_parsing_queue');

    const appsResult = await client.query('DELETE FROM applications');
    console.log(`🗑️ Deleted ${appsResult.rowCount} from applications`);

    const resumesResult = await client.query('DELETE FROM resumes');
    console.log(`🗑️ Deleted ${resumesResult.rowCount} from resumes`);

    const candidatesResult = await client.query('DELETE FROM candidates');
    console.log(`🗑️ Deleted ${candidatesResult.rowCount} from candidates`);

    // Best-effort: delete stored resume files on disk so re-uploads don't reference stale paths
    try {
      const resumesDir = path.join(process.cwd(), 'storage', 'resumes');
      await fs.rm(resumesDir, { recursive: true, force: true });
      await fs.mkdir(resumesDir, { recursive: true });
      console.log('🧹 Deleted storage/resumes directory');
    } catch (fileErr) {
      console.log('⚠️ Could not delete storage/resumes directory:', fileErr);
    }

    // Reset sequences
    try {
      await client.query('ALTER SEQUENCE resumes_resume_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE candidates_candidate_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE applications_application_id_seq RESTART WITH 1');
    } catch (seqError) {
      console.log('Note: Some sequences do not exist or cannot be reset');
    }

    await client.query('COMMIT');

    console.log(`✅ Deleted ${resumeCount} resumes and ${candidateCount} candidates successfully`);

    res.json({
      success: true,
      message: `Deleted ${resumeCount} resumes and ${candidateCount} candidates successfully`,
      deletedCount: resumeCount + candidateCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ADMIN] Error deleting all resumes:', error);
    console.error('Error details:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/resumes/reprocess-failed
 * Reprocess failed resume uploads
 */
router.post('/resumes/reprocess-failed', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    // Find failed resume uploads (you may need to adjust this query based on your schema)
    const { rows: failedResumes } = await pool.query(`
      SELECT r.resume_id, r.file_path, r.candidate_id
      FROM resumes r
      WHERE r.parsing_status = 'failed' OR r.parsing_status = 'error'
      ORDER BY r.created_at DESC
      LIMIT 100
    `);

    if (failedResumes.length === 0) {
      return res.json({
        success: true,
        message: 'No failed uploads found to reprocess',
        count: 0
      });
    }

    // Add failed resumes back to processing queue
    for (const resume of failedResumes) {
      await pool.query(`
        INSERT INTO resume_parsing_queue (resume_id, candidate_id, file_path, status, created_at)
        VALUES ($1, $2, $3, 'pending', NOW())
        ON CONFLICT (resume_id) DO UPDATE SET
          status = 'pending',
          retry_count = COALESCE(retry_count, 0) + 1,
          updated_at = NOW()
      `, [resume.resume_id, resume.candidate_id, resume.file_path]);

      // Update resume status to processing
      await pool.query(`
        UPDATE resumes 
        SET parsing_status = 'processing', updated_at = NOW()
        WHERE resume_id = $1
      `, [resume.resume_id]);
    }

    await logAudit(loggedInUserId, req, true, 'REPROCESS_FAILED_RESUMES');

    res.json({
      success: true,
      message: `Started reprocessing ${failedResumes.length} failed uploads`,
      count: failedResumes.length
    });
  } catch (error) {
    console.error('[ADMIN] Error reprocessing failed uploads:', error);
    await logAudit(loggedInUserId || null, req, false, 'REPROCESS_FAILED_RESUMES_ERROR');
    res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/admin/reports/export
 * Export data as CSV reports
 */
router.get('/reports/export', async (req: AuthenticatedRequest, res) => {
  const loggedInUserId = req.user?.id;
  const { type, days = '30' } = req.query;

  if (!loggedInUserId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!type || !['resumes', 'jobs', 'analytics', 'users'].includes(type as string)) {
    return res.status(400).json({ message: 'Invalid export type. Must be: resumes, jobs, analytics, or users' });
  }

  try {
    let csvData = '';
    const daysInt = parseInt(days as string, 10);

    switch (type) {
      case 'resumes':
        let resumeQuery = `
          SELECT 
            r.resume_id,
            c.name,
            c.email,
            c.phone,
            r.file_name,
            r.parsing_status,
            r.created_at,
            r.updated_at
          FROM resumes r
          LEFT JOIN candidates c ON r.candidate_id = c.candidate_id
          LEFT JOIN users u ON r.uploaded_by = u.userid
          WHERE r.created_at >= NOW() - INTERVAL '${daysInt} days'
        `;
        const resumeParams: any[] = [];
        if (req.user?.role === 'lead') {
          resumeQuery += ` AND (r.uploaded_by = $1 OR u.created_by = $1)`;
          resumeParams.push(req.user.id);
        }
        resumeQuery += ` ORDER BY r.created_at DESC`;

        const { rows: resumeRows } = await pool.query(resumeQuery, resumeParams);

        csvData = 'Resume ID,Name,Email,Phone,File Name,Status,Created At,Updated At\n';
        csvData += resumeRows.map(row =>
          `${row.resume_id},"${row.name || ''}","${row.email || ''}","${row.phone || ''}","${row.file_name || ''}","${row.parsing_status || ''}","${row.created_at}","${row.updated_at}"`
        ).join('\n');
        break;

      case 'jobs':
        let jobsQuery = `
          SELECT 
            j.job_id,
            j.title,
            j.company,
            j.location,
            j.employment_type,
            j.status,
            j.created_at,
            COUNT(a.application_id) as application_count
          FROM jobs j
          LEFT JOIN applications a ON j.job_id = a.job_id
          LEFT JOIN users u ON j.posted_by = u.userid
          WHERE j.created_at >= NOW() - INTERVAL '${daysInt} days'
        `;
        const jobsParams: any[] = [];
        if (req.user?.role === 'lead') {
          jobsQuery += ` AND (j.posted_by = $1 OR u.created_by = $1)`;
          jobsParams.push(req.user.id);
        }
        jobsQuery += ` GROUP BY j.job_id, j.title, j.company, j.location, j.employment_type, j.status, j.created_at
                       ORDER BY j.created_at DESC`;

        const { rows: jobRows } = await pool.query(jobsQuery, jobsParams);

        csvData = 'Job ID,Title,Company,Location,Employment Type,Status,Created At,Applications\n';
        csvData += jobRows.map(row =>
          `${row.job_id},"${row.title || ''}","${row.company || ''}","${row.location || ''}","${row.employment_type || ''}","${row.status || ''}","${row.created_at}",${row.application_count}`
        ).join('\n');
        break;

      case 'analytics':
        let analyticsQuery = `
          SELECT 
            DATE(r.created_at) as date,
            COUNT(*) as total_uploads,
            COUNT(CASE WHEN r.parsing_status = 'completed' THEN 1 END) as successful_uploads,
            COUNT(CASE WHEN r.parsing_status = 'failed' THEN 1 END) as failed_uploads
          FROM resumes r
          LEFT JOIN users u ON r.uploaded_by = u.userid
          WHERE r.created_at >= NOW() - INTERVAL '${daysInt} days'
        `;
        const analyticsParams: any[] = [];
        if (req.user?.role === 'lead') {
          analyticsQuery += ` AND (r.uploaded_by = $1 OR u.created_by = $1)`;
          analyticsParams.push(req.user.id);
        }
        analyticsQuery += ` GROUP BY DATE(r.created_at) ORDER BY date DESC`;

        const { rows: analyticsRows } = await pool.query(analyticsQuery, analyticsParams);

        csvData = 'Date,Total Uploads,Successful,Failed\n';
        csvData += analyticsRows.map(row =>
          `${row.date},${row.total_uploads},${row.successful_uploads},${row.failed_uploads}`
        ).join('\n');
        break;

      case 'users':
        let usersQuery = `
          SELECT 
            userid,
            email,
            role,
            status,
            createdat,
            lastlogin
          FROM users
          WHERE createdat >= NOW() - INTERVAL '${daysInt} days'
        `;
        const usersParams: any[] = [];
        if (req.user?.role === 'lead') {
          usersQuery += ` AND (created_by = $1 OR userid = $1)`;
          usersParams.push(req.user.id);
        }
        usersQuery += ` ORDER BY createdat DESC`;

        const { rows: userRows } = await pool.query(usersQuery, usersParams);

        csvData = 'User ID,Email,Role,Status,Created At,Last Login\n';
        csvData += userRows.map(row =>
          `${row.userid},"${row.email}","${row.role}","${row.status}","${row.createdat}","${row.lastlogin || ''}"`
        ).join('\n');
        break;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvData);

    await logAudit(loggedInUserId, req, true, `EXPORT_${(type as string).toUpperCase()}_CSV` as any);
  } catch (error) {
    console.error('[ADMIN] Error exporting CSV:', error);
    await logAudit(loggedInUserId || null, req, false, 'EXPORT_CSV_ERROR');
    res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
