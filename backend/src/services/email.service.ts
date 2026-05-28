import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { maskEmail, maskSecret, shouldShowSensitiveDevLogs } from '../lib/logging';
import { config } from '../config/env.config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to resolve the logo file and return nodemailer attachment object
const getLogoAttachment = () => {
  const possiblePaths = [
    path.join(process.cwd(), 'frontend/public/assets/logo.png'),
    path.join(process.cwd(), '../frontend/public/assets/logo.png'),
    path.join(__dirname, '../../../../frontend/public/assets/logo.png'),
    path.join(__dirname, '../../../frontend/public/assets/logo.png'),
    path.join(__dirname, '../public/assets/logo.png'),
  ];

  for (const imgPath of possiblePaths) {
    if (fs.existsSync(imgPath)) {
      return {
        filename: 'logo.png',
        path: imgPath,
        cid: 'logo' // referencing cid:logo in HTML
      };
    }
  }
  return null;
};

/**
 * Email service for sending emails using nodemailer
 */

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  // Check if email is configured
  if (!config.EMAIL_USER || !config.EMAIL_PASSWORD ||
    config.EMAIL_USER === 'your-email@gmail.com' ||
    config.EMAIL_PASSWORD === 'your-app-password') {
    // Email not configured - using development mode
    return null;
  }

  return nodemailer.createTransport({
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT,
    secure: config.EMAIL_SECURE, // true for 465
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,   // <---- FIXES "self-signed certificate" error
    },
  });
};

const logDevEmailEvent = (label: string, to: string) => {
  console.log(`[DEV EMAIL] ${label} prepared for ${maskEmail(to)}`);
};

/**
 * Send OTP email for password reset
 * @param to - Recipient email address
 * @param otp - One-time password
 * @param userName - User's name or email
 */
export const sendPasswordResetOTP = async (to: string, otp: string, userName?: string): Promise<void> => {
  try {
    const transporter = createTransporter();

    // If email is not configured, log OTP to console for development
    if (!transporter) {
      console.log('\n==============================================');
      console.log('📧 [DEV MODE] Password Reset OTP');
      console.log('==============================================');
      console.log(`To: ${to}`);
      console.log(`OTP: ${otp}`);
      console.log(`Valid for: 10 minutes`);
      console.log('==============================================\n');
      return;
    }

    const mailOptions = {
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to: to,
      subject: 'Password Reset OTP - Amanzi',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .otp-box { background-color: #fff; border: 2px dashed #4F46E5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #4F46E5; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello ${userName || 'User'},</p>
              <p>We received a request to reset your password. Use the OTP code below to complete the password reset process:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>This OTP is valid for <strong>15 minutes</strong></li>
                  <li>Do not share this code with anyone</li>
                  <li>If you didn't request this, please ignore this email</li>
                </ul>
              </div>
              
              <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              
              <p>Best regards,<br>Amanzi Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Hello ${userName || 'User'},
        
        We received a request to reset your password. Use the OTP code below to complete the password reset process:
        
        OTP Code: ${otp}
        
        Security Notice:
        - This OTP is valid for 15 minutes
        - Do not share this code with anyone
        - If you didn't request this, please ignore this email
        
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
        
        Best regards,
        Amanzi Team
      `,
    };

    await transporter.sendMail(mailOptions);
    // OTP sent successfully
  } catch (error) {
    console.error('[EMAIL] Error sending password reset OTP:', error);
    console.log('\n==============================================');
    console.log('📧 [DEV MODE FALLBACK] Password Reset OTP');
    console.log('==============================================');
    console.log(`To: ${to}`);
    console.log(`OTP: ${otp}`);
    console.log(`Valid for: 15 minutes`);
    console.log('==============================================\n');
    console.error('⚠️ Falling back to DEV MODE: OTP printed above because email transport failed.');
  }
};

/**
 * Send password change confirmation email
 * @param to - Recipient email address
 * @param userName - User's name or email
 */
export const sendPasswordChangeConfirmation = async (to: string, userName?: string): Promise<void> => {
  try {
    const transporter = createTransporter();

    // If email is not configured, log to console for development
    if (!transporter) {
      console.log('\n==============================================');
      console.log('📧 [DEV MODE] Password Change Confirmation');
      console.log('==============================================');
      console.log(`To: ${to}`);
      console.log(`Message: Password changed successfully`);
      console.log('==============================================\n');
      return;
    }

    const mailOptions = {
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to: to,
      subject: 'Password Changed Successfully - Amanzi',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Changed Successfully</h1>
            </div>
            <div class="content">
              <div class="success-icon">✅</div>
              <p>Hello ${userName || 'User'},</p>
              <p>Your password has been changed successfully. You can now log in with your new password.</p>
              
              <div class="warning">
                <strong>⚠️ Security Alert:</strong>
                <p style="margin: 10px 0;">If you did not make this change, please contact our support team immediately and secure your account.</p>
              </div>
              
              <p>For your security, we recommend:</p>
              <ul>
                <li>Use a strong, unique password</li>
                <li>Enable two-factor authentication if available</li>
                <li>Never share your password with anyone</li>
              </ul>
              
              <p>Best regards,<br>Amanzi Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Changed Successfully
        
        Hello ${userName || 'User'},
        
        Your password has been changed successfully. You can now log in with your new password.
        
        Security Alert:
        If you did not make this change, please contact our support team immediately and secure your account.
        
        For your security, we recommend:
        - Use a strong, unique password
        - Enable two-factor authentication if available
        - Never share your password with anyone
        
        Best regards,
        Team Amanzi
      `,
    };

    await transporter.sendMail(mailOptions);
    // Password change confirmation sent
  } catch (error) {
    console.error('[EMAIL] Error sending password change confirmation:', error);
    // Don't throw error here as password is already changed
    // Failed to send confirmation email, but password change was successful
  }
};

/**
 * Send interview invite with temporary login credentials
 * @param to - Candidate email address
 * @param name - Candidate name
 * @param loginUrl - Login URL for the interview
 * @param password - Temporary generated password
 */
export const sendInterviewLink = async (
  to: string, 
  name: string, 
  loginUrl: string, 
  password?: string,
  duration?: number,
  questionCount?: number
): Promise<void> => {
  try {
    const displayPassword = password || 'Contact recruiter';
    const transporter = createTransporter();
    const companyName = config.EMAIL_FROM_NAME || 'Amanzi';
    const contactEmail = 'support@amanzi.com';

    // If email is not configured, log to console for development
    if (!transporter) {
      console.log('\n==============================================');
      console.log('📧 [DEV MODE] Interview Login Details');
      console.log('==============================================');
      console.log(`Dear ${name || 'Candidate'},`);
      console.log(`\nGreetings from ${companyName}.`);
      console.log('\nPlease find below the online assessment test details for your further evaluation process.');
      console.log(`\nAssessment Test Link: ${loginUrl}`);
      console.log(`Username/User ID: ${to}`);
      console.log(`Password: ${displayPassword}`);
      console.log('\nKindly ensure that you complete the assessment within the stipulated timeline. We request you to use a stable internet connection and attempt the test in a distraction-free environment.');
      console.log(`\nIn case of any issues while accessing the assessment portal, please feel free to reach out to us.`);
      console.log('\nWishing you all the best for your assessment.');
      console.log(`\nRegards,\nAmanzi Hiring Team\nRecruitment Team\n${companyName}\n${contactEmail}`);
      console.log('==============================================\n');
      return;
    }

    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const logoAttachment = getLogoAttachment();
    let logoUrl = `${config.FRONTEND_URL || 'http://localhost:8080'}/assets/logo.png`;
    // Fallback to public server IP in dev mode so that external email clients (e.g. Gmail proxy) can load the image
    if (logoUrl.includes('localhost') || logoUrl.includes('127.0.0.1')) {
      logoUrl = 'http://13.201.116.154/assets/logo.png';
    }

    const mailOptions = {
      from: `"${companyName}" <${config.EMAIL_USER}>`,
      to: to,
      subject: `Interview Invitation - ${companyName} ATS [Ref: ${refCode}]`,
      html: `
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <title>Assessment Invitation</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <style type="text/css">
            body {
              margin: 0;
              padding: 0;
              min-width: 100%;
              background-color: #f4f6fa;
              font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            table {
              border-spacing: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            td {
              padding: 0;
            }
            img {
              border: 0;
              display: block;
              outline: none;
              text-decoration: none;
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; min-width: 100%; background-color: #f4f6fa;">
          <!-- Unique Preheader Thread-Breaker to prevent Gmail clipping or thread collapsing (no "..." dots) -->
          <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #f4f6fa;">
            Assessment Invitation from Amanzi Tech. Session ID: ${Date.now()}-${Math.random().toString(36).substring(2, 7)}
          </div>
          <center class="wrapper" style="width: 100%; table-layout: fixed; background-color: #f4f6fa; padding-bottom: 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6fa; width: 100%; table-layout: fixed;">
              <tr>
                <td align="center" style="padding: 40px 10px 40px 10px;">
                  
                  <!-- MAIN CONTAINER TABLE -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; border-collapse: collapse;">
                    
                    <!-- BLUE HEADER ZONE (wraps top of white card) -->
                    <tr>
                      <td bgcolor="#0B51C1" style="background-color: #0B51C1; padding: 30px 30px 0 30px; border-top-left-radius: 20px; border-top-right-radius: 20px;">
                        
                        <!-- TOP NESTED WHITE CARD -->
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-top-left-radius: 16px; border-top-right-radius: 16px; border-collapse: collapse;">
                          <tr>
                            <td align="center" style="padding: 40px 30px 10px 30px;">
                              <!-- Logo -->
                              <table cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center" style="padding-bottom: 20px;">
                                    <img src="${logoAttachment ? 'cid:logo' : logoUrl}" alt="Amanzi Logo" width="160" style="display: block; border: 0; outline: none; text-decoration: none;" />
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Title -->
                              <h1 style="color: #0f172a; font-size: 32px; font-weight: 800; margin: 0 0 10px 0; font-family: 'Inter', 'Segoe UI', sans-serif; letter-spacing: -0.5px; text-align: center;">Amanzi Tech ATS</h1>
                              
                              <!-- ONLINE ASSESSMENT INVITATION flanking dividers -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 20%;">&nbsp;</td>
                                  <td align="center" valign="middle" style="padding: 0 15px; font-size: 11.5px; font-weight: 800; color: #64748b; letter-spacing: 1.5px; text-transform: uppercase; font-family: 'Inter', sans-serif; white-space: nowrap;">
                                    ONLINE ASSESSMENT INVITATION
                                  </td>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 20%;">&nbsp;</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        
                      </td>
                    </tr>
                    
                    <!-- WHITE CONTENT ZONE (rest of the card) -->
                    <tr>
                      <td bgcolor="#f4f6fa" style="background-color: #f4f6fa; padding: 0 30px 30px 30px;">
                        
                        <!-- BOTTOM NESTED WHITE CARD -->
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05); border-collapse: collapse;">
                          <tr>
                            <td style="padding: 20px 30px 40px 30px; font-family: 'Inter', 'Segoe UI', sans-serif; text-align: left;">
                              
                              <!-- Greeting & Content -->
                              <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #0f172a;">Dear ${name || 'Candidate'},</p>
                              <p style="margin: 0 0 15px 0; font-size: 15px; color: #334155; line-height: 1.6;">Greetings from <strong style="color: #0B51C1;">Amanzi Tech</strong>.</p>
                              <p style="margin: 0 0 25px 0; font-size: 15px; color: #334155; line-height: 1.6;">We are pleased to invite you to complete the online assessment as part of your recruitment evaluation process. Please review the details below carefully.</p>
                              
                              <!-- ASSESSMENT DETAILS Inner Card -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; border-collapse: separate; overflow: hidden; margin-bottom: 25px;">
                                <!-- Card Header -->
                                <tr>
                                  <td bgcolor="#f8fafc" style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 15px 20px;">
                                    <table cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                        <td valign="middle" style="width: 28px; padding-right: 12px;">
                                          <!-- Clipboard Icon -->
                                          <div style="background-color: #0B51C1; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                            <span style="font-size: 14px; color: #ffffff;">📋</span>
                                          </div>
                                        </td>
                                        <td valign="middle">
                                          <span style="font-size: 14px; font-weight: 800; color: #0B51C1; letter-spacing: 0.5px; font-family: 'Inter', sans-serif; text-transform: uppercase;">ASSESSMENT DETAILS</span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Card Rows -->
                                <tr>
                                  <td style="padding: 10px 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                      
                                      <!-- Row 1: Assessment Link -->
                                      <tr>
                                        <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
                                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                              <td valign="middle" style="width: 28px; padding-right: 12px;">
                                                <div style="background-color: #eff6ff; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                                  <span style="font-size: 14px; color: #3b82f6;">🔗</span>
                                                </div>
                                              </td>
                                              <td valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 14.5px; font-weight: 600; color: #334155;">Assessment Link</span>
                                              </td>
                                              <td align="right" valign="middle">
                                                <a href="${loginUrl}" target="_blank" style="background-color: #0B51C1; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 13.5px; font-weight: 700; font-family: 'Inter', sans-serif; display: inline-block; white-space: nowrap;">
                                                  Start Assessment &nbsp;➔
                                                </a>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                      
                                      <!-- Row 2: Username / User ID -->
                                      <tr>
                                        <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9;">
                                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                              <td valign="middle" style="width: 28px; padding-right: 12px;">
                                                <div style="background-color: #eff6ff; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                                  <span style="font-size: 14px; color: #3b82f6;">👤</span>
                                                </div>
                                              </td>
                                              <td valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 14.5px; font-weight: 600; color: #334155;">Username / User ID</span>
                                              </td>
                                              <td align="right" valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <a href="mailto:${to}" style="font-size: 14.5px; font-weight: 700; color: #0B51C1; text-decoration: underline;">${to}</a>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                      
                                      <!-- Row 3: Temporary Password -->
                                      <tr>
                                        <td style="padding: 15px 0 5px 0;">
                                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                              <td valign="middle" style="width: 28px; padding-right: 12px;">
                                                <div style="background-color: #fef3c7; border-radius: 50%; width: 28px; height: 28px; text-align: center; line-height: 28px;">
                                                  <span style="font-size: 14px; color: #f59e0b;">🔒</span>
                                                </div>
                                              </td>
                                              <td valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 14.5px; font-weight: 600; color: #334155;">Temporary Password</span>
                                              </td>
                                              <td align="right" valign="middle" style="font-family: 'Inter', sans-serif;">
                                                <span style="font-size: 15.5px; font-weight: 800; color: #0B51C1; letter-spacing: 0.5px;">${displayPassword}</span>
                                              </td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                      
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Important Note Amber Container -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #fef3c7; border-left: 4px solid #ea580c; border-radius: 6px; background-color: #fffbef; border-collapse: separate; margin-bottom: 25px;">
                                <tr>
                                  <td style="padding: 15px 20px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                      <tr>
                                        <td valign="top" style="width: 20px; padding-right: 12px; font-size: 18px; line-height: 1;">
                                          ⚠️
                                        </td>
                                        <td valign="top" style="font-family: 'Inter', sans-serif; text-align: left;">
                                          <span style="font-size: 15px; font-weight: 800; color: #78350f; display: block; margin-bottom: 5px;">Important Note</span>
                                          <span style="font-size: 13.5px; color: #78350f; line-height: 1.5; display: block;">
                                            Please ensure that you complete the assessment within the stipulated timeline. Use a stable internet connection and attempt the test in a distraction-free environment for the best experience.
                                          </span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Support contact line -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                                <tr>
                                  <td valign="middle" style="width: 24px; padding-right: 12px; font-size: 20px; line-height: 1; text-align: center;">
                                    🎧
                                  </td>
                                  <td valign="middle" style="font-family: 'Inter', sans-serif; text-align: left; font-size: 13.5px; color: #475569; line-height: 1.5;">
                                    If you encounter any issues while accessing the assessment portal, please feel free to contact our recruitment team at <a href="mailto:support@amanzi.com" style="color: #0B51C1; text-decoration: underline; font-weight: 700;">support@amanzi.com</a>.
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Closing Greeting -->
                              <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155; line-height: 1.5;">We wish you all the best for your assessment.</p>
                              
                              <p style="margin: 0 0 4px 0; font-size: 13.5px; color: #64748b;">Regards,</p>
                              <p style="margin: 0 0 2px 0; font-size: 16px; font-weight: 800; color: #0B51C1;">Amanzi Tech Hiring Team</p>
                              <p style="margin: 0; font-size: 13.5px; color: #475569;">Recruitment Department</p>
                              
                              <!-- Divider Shield -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px; margin-bottom: 25px;">
                                <tr>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 45%;">&nbsp;</td>
                                  <td align="center" valign="middle" style="padding: 0 12px; font-size: 16px; line-height: 1; text-align: center; color: #64748b;">
                                    🛡️
                                  </td>
                                  <td valign="middle" style="border-bottom: 1px solid #e2e8f0; width: 45%;">&nbsp;</td>
                                </tr>
                              </table>
                              
                              <!-- Footer Branding -->
                              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center" style="font-family: 'Inter', sans-serif; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
                                    <p style="margin: 0 0 6px 0;">This is an automated email from <strong style="color: #475569;">Amanzi Tech ATS</strong>. Please do not reply directly to this email.</p>
                                    <p style="margin: 0 0 6px 0;">&copy; ${new Date().getFullYear()} Amanzi Tech. All rights reserved.</p>
                                    <p style="margin: 0; font-size: 11px; color: #94a3b8;">Sent at: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                  </td>
                                </tr>
                              </table>
                              
                            </td>
                          </tr>
                        </table>
                        
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
            </table>
          </center>
          <!-- Unique Footer Thread-Breaker to prevent Gmail signature trimming and collapsing (no "..." dots) -->
          <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #f4f6fa; margin-top: 10px;">
            Verification Hash: ${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now()}
          </div>
        </body>
        </html>
      `,
      text: `
Dear ${name || 'Candidate'},

Greetings from ${companyName}.

We are pleased to invite you to complete the online assessment as part of your recruitment evaluation process. Please review the details below carefully.

Assessment Details:
- Assessment Link: ${loginUrl}
- Username / User ID: ${to}
- Temporary Password: ${displayPassword}

Important Note:
Please ensure that you complete the assessment within the stipulated timeline. Use a stable internet connection and attempt the test in a distraction-free environment for the best experience.

If you encounter any issues while accessing the assessment portal, please feel free to contact our recruitment team at support@amanzi.com.

We wish you all the best for your assessment.

Regards,
Amanzi Tech Hiring Team
Recruitment Department
${companyName}
support@amanzi.com
      `,
      attachments: logoAttachment ? [logoAttachment] : [],
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('[EMAIL] Error sending interview link:', error);
  }
};
/**
 * Send interview results to candidate with detailed performance report
 */
export const sendInterviewResults = async (
  to: string, 
  name: string, 
  score: number, 
  total: number,
  role?: string,
  timeTakenMins?: number | null,
  breakdown?: Record<string, { total: number, correct: number }>,
  report?: { correct?: number; incorrect?: number; attempted?: number },
  certificateBuffer?: Buffer,
  certificateId?: string
): Promise<void> => {
  try {
    const transporter = createTransporter();
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const correct = Number(report?.correct ?? score) || 0;
    const attempted = Number(report?.attempted ?? total) || total || 0;
    const incorrect = Number(report?.incorrect ?? Math.max(0, attempted - correct)) || 0;
    
    let performanceLabel = 'Needs Improvement';
    let performanceColor = '#EF4444';
    let performanceEmoji = '📊';
    if (percentage >= 80) { performanceLabel = 'Excellent'; performanceColor = '#10B981'; performanceEmoji = '🌟'; }
    else if (percentage >= 60) { performanceLabel = 'Good'; performanceColor = '#3B82F6'; performanceEmoji = '👍'; }
    else if (percentage >= 40) { performanceLabel = 'Average'; performanceColor = '#F59E0B'; performanceEmoji = '📈'; }

    // Difficulty breakdown HTML
    let analysisHtml = '';
    if (breakdown) {
      analysisHtml = `
        <div style="margin: 20px 0; padding: 20px; border: 1px solid #e0e7ff; background: #f8fafc; border-radius: 12px;">
          <h3 style="margin-top: 0; color: #4F46E5; font-size: 16px;">🔍 Concept Analysis</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${Object.entries(breakdown).map(([difficulty, data]) => {
              if (data.total === 0) return '';
              const diffPct = Math.round((data.correct / data.total) * 100);
              const color = diffPct >= 80 ? '#10B981' : diffPct >= 50 ? '#3B82F6' : '#EF4444';
              const label = diffPct >= 80 ? 'Proficient' : diffPct >= 50 ? 'Developing' : 'Needs Practice';
              return `
                <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="text-transform: capitalize; font-weight: 600; font-size: 14px; color: #475569;">${difficulty} Concepts</span>
                    <span style="font-size: 13px; color: ${color}; font-weight: 700;">${data.correct}/${data.total} (${diffPct}%)</span>
                  </div>
                  <div style="background: #e2e8f0; height: 6px; border-radius: 3px;">
                    <div style="background: ${color}; width: ${diffPct}%; height: 100%; border-radius: 3px;"></div>
                  </div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Level: <strong>${label}</strong></div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (!transporter) {
      console.log(`\n==============================================`);
      console.log(`📧 [DEV MODE] Interview Results`);
      console.log(`==============================================`);
      console.log(`To: ${to}`);
      console.log(`Name: ${name}`);
      console.log(`Score: ${score}/${total} (${percentage}%)`);
      console.log(`Correct: ${correct} | Incorrect: ${incorrect} | Assigned: ${attempted}`);
      console.log(`==============================================\n`);
      return;
    }

    const mailOptions = {
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to: to,
      subject: `Assessment Results — ${performanceLabel} Performance | Amanzi`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f0f2f5; margin: 0; padding: 0; }
            .wrapper { max-width: 600px; margin: 30px auto; }
            .container { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 32px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 22px; }
            .content { padding: 32px 24px; }
            .score-card { background: #f8fafc; border: 1px solid #e0e7ff; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0; }
            .score-big { font-size: 48px; font-weight: 800; color: #4F46E5; margin: 8px 0; }
            .footer { text-align: center; padding: 20px 24px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="container">
              <div class="header">
                <h1>Assessment Performance</h1>
                <p>Technical Results Analysis</p>
              </div>
              <div class="content">
                <p>Dear <strong>${name}</strong>,</p>
                <p>Thank you for taking the assessment. Your results have been processed:</p>
                <div class="score-card">
                  <div style="font-size: 13px; color: #6b7280; text-transform: uppercase;">Final Score</div>
                  <div class="score-big">${score} / ${total}</div>
                  <div style="font-size: 16px; color: ${performanceColor}; font-weight: 700;">
                    ${performanceEmoji} ${performanceLabel} — ${percentage}%
                  </div>
                </div>
                ${certificateBuffer ? `
                <div style="margin: 16px 0; padding: 12px; background: #EEF2FF; border: 1px dashed #4F46E5; border-radius: 12px; text-align: center;">
                  <span style="font-size: 24px;">🏆</span>
                  <p style="margin: 8px 0 0; font-weight: 700; color: #4F46E5; font-size: 14px;">Official Certificate Attached!</p>
                  <p style="margin: 4px 0 0; font-size: 11px; color: #6366F1;">ID: ${certificateId}</p>
                </div>
                ` : ''}
                <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 20px 0;">
                  <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                    <div style="font-size:12px; text-transform:uppercase; color:#64748b;">Correct Answers</div>
                    <div style="font-size:28px; font-weight:800; color:#10B981;">${correct}</div>
                  </div>
                  <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                    <div style="font-size:12px; text-transform:uppercase; color:#64748b;">Incorrect Answers</div>
                    <div style="font-size:28px; font-weight:800; color:#EF4444;">${incorrect}</div>
                  </div>
                  <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                    <div style="font-size:12px; text-transform:uppercase; color:#64748b;">Questions Assigned</div>
                    <div style="font-size:28px; font-weight:800; color:#4F46E5;">${attempted}</div>
                  </div>
                  <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                    <div style="font-size:12px; text-transform:uppercase; color:#64748b;">Time Taken</div>
                    <div style="font-size:28px; font-weight:800; color:#0F172A;">${timeTakenMins ?? '—'}</div>
                    <div style="font-size:11px; color:#64748b;">minutes</div>
                  </div>
                </div>
                ${role ? `<p style="margin: 0 0 16px; color: #475569; font-size: 14px;"><strong>Assessment Focus:</strong> ${role}</p>` : ''}
                ${analysisHtml}
                <div style="background: #fdf2f2; border: 1px solid #fee2e2; border-radius: 10px; padding: 20px; margin: 24px 0;">
                  <h3 style="margin: 0 0 8px; color: #991b1b; font-size: 15px;">🚀 Next Steps</h3>
                  <p style="margin: 0; color: #b91c1c; font-size: 14px;">
                    Your profile is now under evaluation. <strong>If selected, you will receive a follow-up email regarding next steps shortly.</strong>
                  </p>
                </div>
                <p>Best regards,<br><strong>Amanzi Recruitment Team</strong></p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Assessment Results — Score: ${score}/${total} (${percentage}%). Correct: ${correct}. Incorrect: ${incorrect}. Questions Assigned: ${attempted}.${timeTakenMins !== null && timeTakenMins !== undefined ? ` Time Taken: ${timeTakenMins} minutes.` : ''} If selected, you will receive a mail regarding next steps.`,
      attachments: certificateBuffer ? [
        {
          filename: `Certificate_${certificateId || 'Amanzi'}.pdf`,
          content: certificateBuffer,
          contentType: 'application/pdf',
        }
      ] : [],
    };

    if (!transporter) {
      logDevEmailEvent('Interview Results', to);
      console.log('----------------------------------------------');
      console.log(`Score: ${score}/${total} (${percentage}%)`);
      console.log(`Role: ${role}`);
      console.log(`Certificate: ${certificateId || 'None'}`);
      console.log('----------------------------------------------');
      return;
    }

    console.log(`[EmailService] Sending email to ${to} with certificate ${certificateId || 'none'}...`);
    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Email successfully sent to ${to}`);
  } catch (err) {
    console.error(`❌ [EmailService] Failed to send results to ${to}:`, err);
  }
};


/**
 * Send congratulations email to selected candidate
 */
export const sendSelectionEmail = async (to: string, name: string, role?: string): Promise<void> => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log(`📧 [DEV MODE] Selection email for ${to}`);
      return;
    }

    const mailOptions = {
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to: to,
      subject: `Congratulations! You've been selected | Amanzi`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #f0fdf4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #bbf7d0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .header { background: #10b981; color: white; padding: 40px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 32px 24px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Congratulations ${name}! 🎉</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${name}</strong>,</p>
              <p>We are thrilled to inform you that you have been <strong>selected</strong> following your recent assessment${role ? ` for the <strong>${role}</strong> role` : ''}!</p>
              <p>Your performance was impressive, and we believe you'd be a great fit for our team.</p>
              
              <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #065f46; font-weight: 600;">Next Steps:</p>
                <p style="margin: 8px 0 0; color: #065f46;">Our HR team will reach out to you shortly with details about the final interview round and onboarding process.</p>
              </div>

              <p>Keep an eye on your inbox for upcoming instructions.</p>
              
              <p>Best regards,<br><strong>Amanzi Hiring Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Congratulations ${name}! You have been selected. We will tell you about next steps soon.`,
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Error sending selection email:', err);
  }
};

export const sendRejectionEmail = async (to: string, name: string, role?: string): Promise<void> => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`📧 [DEV MODE] Rejection email for ${to}`);
      return;
    }

    const mailOptions = {
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to,
      subject: `Interview Update | Amanzi`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #fff7ed; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #fed7aa; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08); }
            .header { background: #f97316; color: white; padding: 32px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 32px 24px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Interview Update</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${name}</strong>,</p>
              <p>Thank you for taking the time to complete your assessment${role ? ` for the <strong>${role}</strong> role` : ''}.</p>
              <p>After reviewing your performance, we will not be moving forward with your application for this position at the moment.</p>
              <p>We appreciate your interest in Amanzi and the effort you put into the process. We encourage you to apply again in the future if another opportunity matches your profile.</p>
              <p>We wish you all the very best in your job search.</p>
              <p>Best regards,<br><strong>Amanzi Hiring Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Dear ${name}, thank you for taking the assessment${role ? ` for the ${role} role` : ''}. After review, we will not be moving forward with your application for this position at the moment. We appreciate your interest in Amanzi and wish you the best.`,
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Error sending rejection email:', err);
  }
};

/**
 * Send certificate email with PDF attachment
 */
