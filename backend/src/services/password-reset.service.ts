import { pool } from '@/lib/database';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { sendPasswordResetOTP } from './email.service';

/**
 * Password Reset Service
 * Handles OTP generation, verification, and password reset requests
 * Following the exact 3-step flow: Request OTP → Verify OTP → Reset Password
 */

/**
 * Generate a 6-digit OTP
 */
const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * STEP 1: Request password reset - generates OTP and sends email
 * @param email - User's email address
 * @returns Success message
 */
export const requestPasswordReset = async (email: string): Promise<{ message: string }> => {
  try {
    // Check if user exists
    const { rows: userRows } = await pool.query(
      'SELECT userid, email FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (userRows.length === 0) {
      // User doesn't exist - return error message
      throw new Error('User with this email does not exist. Please check your email address.');
    }

    const user = userRows[0];
    const otp = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    // Delete any existing unverified requests for this user
    await pool.query(
      'DELETE FROM password_reset_requests WHERE user_id = $1 AND verified = FALSE',
      [user.userid]
    );

    // Create new password reset request
    await pool.query(
      'INSERT INTO password_reset_requests (user_id, otp_code, otp_expiry, verified, attempts) VALUES ($1, $2, $3, $4, $5)',
      [user.userid, otp, expiresAt, false, 0]
    );

    // Send OTP via email
    await sendPasswordResetOTP(user.email, otp, user.email);
    return { message: 'OTP sent successfully to your registered email.' };
  } catch (error) {
    console.error('[PASSWORD-RESET] Error requesting password reset:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to process password reset request. Please try again later.');
  }
};

/**
 * STEP 2: Verify OTP for password reset
 * @param email - User's email address
 * @param otp - One-time password
 * @returns Success message
 */
export const verifyPasswordResetOTP = async (email: string, otp: string): Promise<{ message: string }> => {
  try {
    // Find user
    const { rows: userRows } = await pool.query(
      'SELECT userid, email FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (userRows.length === 0) {
      throw new Error('Invalid or expired OTP.');
    }

    const user = userRows[0];

    // Find password reset request
    const { rows: resetRequests } = await pool.query(
      `SELECT * FROM password_reset_requests 
       WHERE user_id = $1 AND verified = FALSE AND otp_expiry > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [user.userid]
    );

    if (resetRequests.length === 0) {
      throw new Error('Invalid or expired OTP.');
    }

    const resetRequest = resetRequests[0];

    // Check if too many attempts (max 3)
    if (resetRequest.attempts >= 3) {
      await pool.query(
        'DELETE FROM password_reset_requests WHERE id = $1',
        [resetRequest.id]
      );
      throw new Error('Too many failed attempts. Please request a new OTP.');
    }

    // Verify OTP
    if (resetRequest.otp_code !== otp) {
      // Increment attempts
      await pool.query(
        'UPDATE password_reset_requests SET attempts = attempts + 1 WHERE id = $1',
        [resetRequest.id]
      );
      throw new Error('Invalid or expired OTP.');
    }

    // OTP is valid - mark as verified
    await pool.query(
      'UPDATE password_reset_requests SET verified = TRUE, verified_at = NOW() WHERE id = $1',
      [resetRequest.id]
    );

    return {
      message: 'OTP verified successfully. You may now reset your password.'
    };
  } catch (error) {
    console.error('[PASSWORD-RESET] Error verifying OTP:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to verify OTP. Please try again.');
  }
};

/**
 * STEP 3: Reset password after OTP verification
 * @param email - User's email address
 * @param newPassword - New password
 * @returns Success message
 */
export const resetPasswordWithOTP = async (
  email: string,
  newPassword: string
): Promise<{ message: string }> => {
  try {
    // Find user
    const { rows: userRows } = await pool.query(
      'SELECT userid, email FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (userRows.length === 0) {
      throw new Error('OTP verification required.');
    }

    const user = userRows[0];

    // Find most recent verified OTP request
    const { rows: resetRequests } = await pool.query(
      `SELECT * FROM password_reset_requests 
       WHERE user_id = $1 AND verified = TRUE 
       ORDER BY verified_at DESC LIMIT 1`,
      [user.userid]
    );

    if (resetRequests.length === 0) {
      throw new Error('OTP verification required.');
    }

    const resetRequest = resetRequests[0];

    // Check if verification is still recent (within 10 minutes)
    const verifiedAt = new Date(resetRequest.verified_at);
    const now = new Date();
    const minutesSinceVerification = (now.getTime() - verifiedAt.getTime()) / (1000 * 60);

    if (minutesSinceVerification > 10) {
      throw new Error('OTP verification expired. Please request a new OTP.');
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update user password with audit trail
    await pool.query(
      'UPDATE users SET passwordhash = $1, password_last_changed = NOW(), password_changed_by = $2, updatedat = NOW() WHERE userid = $3',
      [passwordHash, user.userid, user.userid]
    );

    // Delete the used OTP request
    await pool.query(
      'DELETE FROM password_reset_requests WHERE id = $1',
      [resetRequest.id]
    );

    // Invalidate all refresh tokens for this user (force re-login)
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [user.userid]
    );

    return { message: 'Password reset successfully.' };
  } catch (error) {
    console.error('[PASSWORD-RESET] Error resetting password:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to reset password. Please try again.');
  }
};

/**
 * Change password for authenticated user (requires current password)
 * @param userId - User ID
 * @param currentPassword - Current password
 * @param newPassword - New password
 * @returns Success message
 */
export const changePassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> => {
  try {
    // Get user
    const { rows: userRows } = await pool.query(
      'SELECT userid, email, passwordhash FROM users WHERE userid = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (userRows.length === 0) {
      throw new Error('User not found.');
    }

    const user = userRows[0];

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordhash);
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect.');
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password with audit trail
    await pool.query(
      'UPDATE users SET passwordhash = $1, password_last_changed = NOW(), password_changed_by = $2, updatedat = NOW() WHERE userid = $3',
      [passwordHash, userId, userId]
    );

    // Invalidate all refresh tokens (force re-login)
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [userId]
    );

    return { message: 'Password has been changed successfully.' };
  } catch (error) {
    console.error('[PASSWORD-RESET] Error changing password:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to change password. Please try again.');
  }
};

/**
 * Admin function to change user password without OTP verification
 * @param adminId - Admin user ID
 * @param targetUserId - Target user ID whose password to change
 * @param newPassword - New password
 * @returns Success message
 */
export const adminChangePassword = async (
  adminId: number,
  targetUserId: number,
  newPassword: string
): Promise<{ message: string }> => {
  try {
    // Verify admin exists
    const { rows: adminRows } = await pool.query(
      'SELECT userid, role FROM users WHERE userid = $1 AND deleted_at IS NULL',
      [adminId]
    );

    if (adminRows.length === 0 || adminRows[0].role.toLowerCase() !== 'admin') {
      throw new Error('Unauthorized. Admin access required.');
    }

    // Get target user
    const { rows: userRows } = await pool.query(
      'SELECT userid, email FROM users WHERE userid = $1 AND deleted_at IS NULL',
      [targetUserId]
    );

    if (userRows.length === 0) {
      throw new Error('Target user not found.');
    }

    const user = userRows[0];

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password with audit trail (track that admin changed it)
    await pool.query(
      'UPDATE users SET passwordhash = $1, password_last_changed = NOW(), password_changed_by = $2, updatedat = NOW() WHERE userid = $3',
      [passwordHash, adminId, targetUserId]
    );

    // Invalidate all refresh tokens for target user
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [targetUserId]
    );

    return { message: `Password for user ${user.email} reset successfully by admin ${adminId}.` };
  } catch (error) {
    console.error('[PASSWORD-RESET] Error in admin password change:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to change password. Please try again.');
  }
};
