import { Router } from 'express';
import { verifyToken, AuthenticatedRequest } from '@/middleware/auth.middleware';
import {
  requestPasswordReset,
  verifyPasswordResetOTP,
  resetPasswordWithOTP,
  changePassword,
} from '@/services/password-reset.service';
import { sendPasswordChangeConfirmation } from '@/services/email.service';
import { findUserById } from '@/services/user.service';
import { logAudit } from '@/services/audit.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const RequestResetSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});

const VerifyOTPSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
});

const ResetPasswordSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  newPassword: z.string().min(8, { message: 'Password must be at least 8 characters long.' }),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Current password is required.' }),
  newPassword: z.string().min(8, { message: 'New password must be at least 8 characters long.' }),
});

/**
 * POST /auth/request-reset
 * STEP 1: Request password reset - sends OTP to email
 * Public route (no authentication required)
 */
router.post('/request-reset', async (req, res) => {
  try {
    const validation = RequestResetSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { email } = validation.data;
    const result = await requestPasswordReset(email);

    await logAudit(null, req, true, 'PASSWORD_RESET_REQUESTED', email);
    res.json(result);
  } catch (error) {
    console.error('[ROUTE] Error requesting password reset:', error);
    await logAudit(null, req, false, 'PASSWORD_RESET_REQUEST_FAILED', req.body.email);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to process password reset request.',
    });
  }
});

/**
 * POST /auth/verify-otp
 * STEP 2: Verify OTP
 * Public route (no authentication required)
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const validation = VerifyOTPSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { email, otp } = validation.data;
    const result = await verifyPasswordResetOTP(email, otp);

    await logAudit(null, req, true, 'PASSWORD_RESET_OTP_VERIFIED', email);
    res.json(result);
  } catch (error) {
    console.error('[ROUTE] Error verifying OTP:', error);
    await logAudit(null, req, false, 'PASSWORD_RESET_OTP_VERIFICATION_FAILED', req.body.email);
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to verify OTP.',
    });
  }
});

/**
 * POST /auth/reset-password
 * STEP 3: Reset password after OTP verification
 * Public route (no authentication required)
 */
router.post('/reset-password', async (req, res) => {
  try {
    const validation = ResetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { email, newPassword } = validation.data;
    const result = await resetPasswordWithOTP(email, newPassword);

    // Send confirmation email
    try {
      await sendPasswordChangeConfirmation(email, email);
    } catch (emailError) {
      console.warn('[ROUTE] Failed to send confirmation email:', emailError);
    }

    await logAudit(null, req, true, 'PASSWORD_RESET_COMPLETED', email);
    res.json(result);
  } catch (error) {
    console.error('[ROUTE] Error resetting password:', error);
    await logAudit(null, req, false, 'PASSWORD_RESET_FAILED', req.body.email);
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to reset password.',
    });
  }
});

/**
 * POST /auth/change-password
 * Change password for authenticated user (requires current password)
 * Protected route (authentication required)
 */
router.post('/change-password', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const validation = ChangePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { currentPassword, newPassword } = validation.data;

    // Check if new password is same as current
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: 'New password must be different from current password.',
      });
    }

    const result = await changePassword(req.user.id, currentPassword, newPassword);

    // Get user details for confirmation email
    const user = await findUserById(req.user.id);
    if (user) {
      try {
        await sendPasswordChangeConfirmation(user.email, user.email);
      } catch (emailError) {
        console.warn('[ROUTE] Failed to send confirmation email:', emailError);
      }
    }

    await logAudit(req.user.id, req, true, 'PASSWORD_CHANGED');
    res.json(result);
  } catch (error) {
    console.error('[ROUTE] Error changing password:', error);
    if (req.user) {
      await logAudit(req.user.id, req, false, 'PASSWORD_CHANGE_FAILED');
    }
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to change password.',
    });
  }
});

export default router;
