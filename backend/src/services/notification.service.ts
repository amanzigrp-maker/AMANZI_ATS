/**
 * Notification Service - Handles sending notifications to users
 */
import { pool } from '../lib/database';

export interface NotificationData {
  userId: number;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  relatedJobId?: number;
  relatedJobCode?: string;     // ⭐ NEW
  relatedEntityType?: string;
  relatedEntityId?: number;

  // sender / recipient information for admin broadcast
  senderRole?: 'admin' | 'vendor' | 'recruiter' | 'system';
  recipientRole?: 'vendor' | 'recruiter' | 'admin';
  priority?: 'normal' | 'high' | 'urgent';
}

class NotificationService {

  /**
   * Send a notification to a specific user
   */
  async sendNotification(data: NotificationData): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO notifications (
          user_id, title, message, type, related_job_id, 
          related_job_code, related_entity_type, related_entity_id,
          sender_role, recipient_role, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          data.userId,
          data.title,
          data.message,
          data.type || 'info',
          data.relatedJobId || null,
          data.relatedJobCode || null,
          data.relatedEntityType || null,
          data.relatedEntityId || null,
          data.senderRole || 'system',
          data.recipientRole || null,
          data.priority || 'normal',
        ]
      );

      console.log(
        `📩 Notification sent → User ${data.userId} | Job Code: ${data.relatedJobCode || 'N/A'}`
      );

    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Send notifications to multiple users
   */
  async sendBulkNotifications(notifications: NotificationData[]): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const n of notifications) {
        await client.query(
          `INSERT INTO notifications (
            user_id, title, message, type, related_job_id, 
            related_job_code, related_entity_type, related_entity_id,
            sender_role, recipient_role, priority
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            n.userId,
            n.title,
            n.message,
            n.type || 'info',
            n.relatedJobId || null,
            n.relatedJobCode || null,
            n.relatedEntityType || null,
            n.relatedEntityId || null,
            n.senderRole || 'system',
            n.recipientRole || null,
            n.priority || 'normal',
          ]
        );

        console.log(
          `📩 Bulk Notification → User ${n.userId} | Job Code: ${n.relatedJobCode || 'N/A'}`
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error sending bulk notifications:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId: number, unreadOnly: boolean = false): Promise<any[]> {
  try {
    let query = `
      SELECT 
        n.notification_id,
        n.user_id,
        n.title,
        n.message,
        n.type,
        n.related_job_id,
        n.related_job_code,
        n.related_entity_type,
        n.related_entity_id,
        n.created_at,
        n.is_read,
        j.title AS job_title,
        j.company AS job_company,
        a.applied_date AS applied_date,
        c.full_name AS candidate_name,
        c.gender AS candidate_gender
      FROM notifications n
      LEFT JOIN jobs j ON n.related_job_id = j.job_id
      LEFT JOIN applications a
        ON a.application_id = n.related_entity_id
       AND n.related_entity_type = 'application'
      LEFT JOIN candidates c ON c.candidate_id = a.candidate_id
      WHERE n.user_id = $1
    `;

    const params = [userId];

    if (unreadOnly) {
      query += ' AND n.is_read = FALSE';
    }

    query += ' ORDER BY n.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    throw error;
  }
}


  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number, userId: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE notifications 
       SET is_read = TRUE
       WHERE notification_id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}


  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: number): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count 
       FROM notifications 
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    return Number(result.rows[0].count);
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}


  /**
   * Cleanup old notifications
   */
  async cleanupOldNotifications(): Promise<void> {
    try {
      await pool.query(
        `DELETE FROM notifications 
         WHERE created_at < NOW() - INTERVAL '30 days' 
         AND is_read = TRUE`
      );
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }
}

export default new NotificationService();
