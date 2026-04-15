/**
 * User Controller - Handles user management operations
 */
import { Request, Response } from 'express';
import { pool } from '../lib/database';

/**
 * Get users with optional filtering
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { role, status, limit = 50, offset = 0 } = req.query;
    
    const loggedInUser = (req as any).user;
    const loggedInUserId = loggedInUser?.userid || loggedInUser?.id;
    const loggedInUserRole = loggedInUser?.role?.toLowerCase();

    let query = 'SELECT userid, name, email, role, status, created_at FROM users WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    // Add role-based visibility filter
    if (loggedInUserRole === 'lead') {
      paramCount++;
      query += ` AND (userid = $${paramCount} OR created_by = $${paramCount})`;
      params.push(loggedInUserId);
    } else if (loggedInUserRole !== 'admin') {
      // Non-admins/non-leads can only see themselves
      paramCount++;
      query += ` AND userid = $${paramCount}`;
      params.push(loggedInUserId);
    }

    // Add role filter
    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }

    // Add status filter
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    // Add pagination
    paramCount++;
    query += ` ORDER BY name LIMIT $${paramCount}`;
    params.push(parseInt(limit as string));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset as string));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (loggedInUserRole === 'lead') {
      countParamCount++;
      countQuery += ` AND (userid = $${countParamCount} OR created_by = $${countParamCount})`;
      countParams.push(loggedInUserId);
    } else if (loggedInUserRole !== 'admin') {
      countParamCount++;
      countQuery += ` AND userid = $${countParamCount}`;
      countParams.push(loggedInUserId);
    }

    if (role) {
      countParamCount++;
      countQuery += ` AND role = $${countParamCount}`;
      countParams.push(role);
    }

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      users: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: (parseInt(offset as string) + parseInt(limit as string)) < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const loggedInUser = (req as any).user;
    const loggedInUserId = loggedInUser?.userid || loggedInUser?.id;
    const loggedInUserRole = loggedInUser?.role?.toLowerCase();

    let query = 'SELECT userid, name, email, role, status, created_at FROM users WHERE userid = $1';
    const params = [parseInt(id)];

    if (loggedInUserRole === 'lead') {
      query += ' AND (userid = $1 OR created_by = $1)';
    } else if (loggedInUserRole !== 'admin') {
      query += ' AND userid = $1';
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
