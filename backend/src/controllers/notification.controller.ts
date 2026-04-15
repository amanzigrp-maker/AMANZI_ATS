/**
 * Notification Controller - Handles notification-related operations
 */
import { Request, Response } from 'express';
import notificationService from '../services/notification.service';
import { pool } from '../lib/database';

/**
 * Get notifications for the authenticated user
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userid;
    const unreadOnly = req.query.unread === 'true';

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const notifications = await notificationService.getUserNotifications(userId, unreadOnly);
    const unreadCount = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      notifications,
      unread_count: unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Admin: Create broadcast / targeted notifications for vendors/recruiters
 */
export const createAdminNotification = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can send notifications' });
    }

    const { title, message, recipientType, priority, vendorId, recruiterId } = req.body as {
      title?: string;
      message?: string;
      recipientType?: string;
      priority?: 'normal' | 'high' | 'urgent';
      vendorId?: number;
      recruiterId?: number;
    };

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    if (!recipientType) {
      return res.status(400).json({ error: 'recipientType is required' });
    }

    let recipientsQuery = '';
    const params: any[] = [];

    switch (recipientType) {
      case 'all_vendors':
        recipientsQuery = `SELECT userid, role FROM users WHERE role = 'vendor' AND status = 'active'`;
        break;
      case 'all_recruiters':
        recipientsQuery = `SELECT userid, role FROM users WHERE role = 'recruiter' AND status = 'active'`;
        break;
      case 'both':
        recipientsQuery = `SELECT userid, role FROM users WHERE role IN ('vendor','recruiter') AND status = 'active'`;
        break;
      case 'specific_vendor':
        if (!vendorId) {
          return res.status(400).json({ error: 'vendorId is required for specific_vendor' });
        }
        recipientsQuery = `SELECT userid, role FROM users WHERE userid = $1 AND role = 'vendor' AND status = 'active'`;
        params.push(Number(vendorId));
        break;
      case 'specific_recruiter':
        if (!recruiterId) {
          return res.status(400).json({ error: 'recruiterId is required for specific_recruiter' });
        }
        recipientsQuery = `SELECT userid, role FROM users WHERE userid = $1 AND role = 'recruiter' AND status = 'active'`;
        params.push(Number(recruiterId));
        break;
      default:
        return res.status(400).json({ error: 'Invalid recipientType' });
    }

    const result = await pool.query(recipientsQuery, params);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No matching recipients found' });
    }

    const notifications = result.rows.map((row) => ({
      userId: row.userid as number,
      title,
      message,
      type: 'info' as const,
      senderRole: 'admin' as const,
      recipientRole: (row.role as 'vendor' | 'recruiter' | 'admin') || null,
      priority: priority || 'normal',
    }));

    await notificationService.sendBulkNotifications(notifications);

    return res.status(201).json({
      success: true,
      count: notifications.length,
    });
  } catch (error) {
    console.error('Error creating admin notification:', error);
    return res.status(500).json({
      error: 'Failed to create admin notification',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Admin: Notification history
 */
export const getAdminNotificationHistory = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can view notification history' });
    }

    const { recipientRole, priority, from, to } = req.query as {
      recipientRole?: string;
      priority?: string;
      from?: string;
      to?: string;
    };

    const conditions: string[] = [`sender_role = 'admin'`];
    const params: any[] = [];

    if (recipientRole) {
      params.push(recipientRole);
      conditions.push(`recipient_role = $${params.length}`);
    }

    if (priority) {
      params.push(priority);
      conditions.push(`priority = $${params.length}`);
    }

    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        notification_id,
        user_id,
        title,
        message,
        type,
        recipient_role,
        priority,
        created_at
      FROM notifications
      ${where}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching admin notification history:', error);
    return res.status(500).json({
      error: 'Failed to fetch admin notification history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Mark a notification as read
 */
export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userid;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await notificationService.markAsRead(parseInt(id), userId);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userid;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      unread_count: count
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      error: 'Failed to fetch unread count',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
