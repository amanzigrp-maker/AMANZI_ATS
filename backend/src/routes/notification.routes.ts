/**
 * Notification Routes - API endpoints for notification management
 */
import express from 'express';
import {
  getNotifications,
  markNotificationAsRead,
  getUnreadCount,
  createAdminNotification,
  getAdminNotificationHistory,
} from '../controllers/notification.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get notifications for authenticated user
router.get('/', getNotifications);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark notification as read
router.post('/:id/read', markNotificationAsRead);

// Admin: create notifications for vendors/recruiters
router.post('/admin', createAdminNotification);

// Admin: notification history
router.get('/admin/history', getAdminNotificationHistory);

export default router;
