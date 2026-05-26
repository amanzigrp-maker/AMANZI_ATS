import { pool } from '../lib/database';
/**
 * Logs an authentication-related event to the public.loginaudit table.
 *
 * @param userId - The ID of the user involved in the event. Can be null for failed attempts where the user is unknown.
 * @param req - The Express request object to extract IP address and user agent.
 * @param success - Whether the action was successful.
 * @param action - The type of action being logged.
 * @param attemptedEmail - The email address used in the login attempt (optional).
 */
export const logAudit = async (userId, req, success, action, attemptedEmail) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const status = success ? 'success' : 'failed';
        // DEBUG LOGS (Requested by user)
        console.log("Audit Data:", {
            userId,
            ip,
            userAgent,
            status,
            action,
            attemptedEmail
        });
        console.log("Attempted Email:", attemptedEmail);
        // EXPLICIT SAFE QUERY
        await pool.query(`INSERT INTO public.loginaudit (
        userid, 
        ipaddress, 
        deviceinfo, 
        loginstatus, 
        attempted_email
      ) VALUES ($1, $2, $3, $4, $5)`, [
            userId,
            ip,
            userAgent,
            status,
            attemptedEmail || null
        ]);
    }
    catch (error) {
        // SILENT ERROR HANDLING (As requested to never crash the main app)
        console.error('Failed to write to audit log:', error);
    }
};
