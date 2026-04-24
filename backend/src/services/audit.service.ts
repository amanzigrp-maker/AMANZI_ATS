import { Request } from 'express';
import { pool } from '../lib/database';

type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'REFRESH'
  | 'REFRESH_FAILED'
  | 'LOGOUT'
  | 'LOGOUT_FAILED'
  | 'LOGIN_DISABLED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_REQUEST_FAILED'
  | 'PASSWORD_RESET_OTP_VERIFIED'
  | 'PASSWORD_RESET_OTP_VERIFICATION_FAILED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_RESET_FAILED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_CHANGE_FAILED'
  | 'ADMIN_PASSWORD_CHANGE'
  | 'ADMIN_PASSWORD_CHANGE_FAILED'
  | 'CLIENT_CREATED'
  | 'CLIENT_CREATE_FAILED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_UPDATE_FAILED'
  | 'CLIENT_DELETED'
  | 'CLIENT_DELETE_FAILED'
  | 'JOB_CREATED'
  | 'JOB_CREATE_FAILED'
  | 'REPROCESS_FAILED_RESUMES'
  | 'REPROCESS_FAILED_RESUMES_ERROR'
  | 'EXPORT_RESUMES_CSV'
  | 'EXPORT_JOBS_CSV'
  | 'EXPORT_ANALYTICS_CSV'
  | 'EXPORT_USERS_CSV'
  | 'EXPORT_CSV_ERROR'
  | 'LOGIN_BLOCKED';

export type { AuditAction };

/**
 * Logs an authentication-related event to the login_audit table.
 *
 * @param userId - The ID of the user involved in the event. Can be null for failed attempts where the user is unknown.
 * @param req - The Express request object to extract IP address and user agent.
 * @param success - Whether the action was successful.
 * @param action - The type of action being logged.
 * @param attemptedEmail - The email address used in the login attempt (optional).
 */
export const logAudit = async (userId: number | null, req: Request, success: boolean, action: AuditAction, attemptedEmail?: string) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await pool.query(
      'INSERT INTO loginaudit (userid, ipaddress, deviceinfo, loginstatus, attempted_email) VALUES ($1, $2, $3, $4, $5)',
      [userId, ip, userAgent, success ? 'success' : 'failed', attemptedEmail || null]
    );
  } catch (error) {
    console.error('Failed to write to audit log:', error);
    // We don't re-throw the error because a failure to log should not crash the main application flow.
  }
};
