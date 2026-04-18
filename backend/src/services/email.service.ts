import nodemailer from 'nodemailer';

/**
 * Email service for sending emails using nodemailer
 */

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  // Check if email is configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD ||
    process.env.EMAIL_USER === 'your-email@gmail.com' ||
    process.env.EMAIL_PASSWORD === 'your-app-password') {
    // Email not configured - using development mode
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,   // <---- FIXES "self-signed certificate" error
    },
  });
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
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
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
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
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
 * Send interview link to candidate
 * @param to - Candidate email address
 * @param name - Candidate name
 * @param interviewLink - Secure interview link
 */
export const sendInterviewLink = async (to: string, name: string, interviewLink: string): Promise<void> => {
  try {
    const transporter = createTransporter();

    // If email is not configured, log to console for development
    if (!transporter) {
      console.log('\n==============================================');
      console.log('📧 [DEV MODE] Interview Link');
      console.log('==============================================');
      console.log(`To: ${to}`);
      console.log(`Name: ${name}`);
      console.log(`Link: ${interviewLink}`);
      console.log(`Note: Link valid for 5 minutes only!`);
      console.log('==============================================\n');
      return;
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: 'Interview Link - Amanzi ATS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1a1a; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; }
            .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
            .content { padding: 30px 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .warning { background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 15px; margin: 25px 0; font-size: 14px; }
            .footer { text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
            .bold { font-weight: 700; color: #111827; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #4F46E5; margin: 0;">Amanzi ATS</h1>
            </div>
            <div class="content">
              <p>Dear <span class="bold">${name}</span>,</p>
              <p>You have been invited for an interview. Please use the secure link below to access your interview session.</p>
              
              <div style="text-align: center;">
                <a href="${interviewLink}" class="button" style="color: white;">Start Interview</a>
              </div>

              <div class="warning" style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 15px; margin: 25px 0; font-size: 14px;">
                <strong>🚨 IMPORTANT SECURITY NOTICE:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>This link is valid for <span class="bold">5 minutes</span> only.</li>
                  <li>It can be used <span class="bold">only once</span>.</li>
                  <li>It is locked to the <span class="bold">first device</span> that opens it.</li>
                </ul>
              </div>

              <p>If you have any issues, please contact the recruitment team immediately.</p>
              
              <p>Best regards,<br>Amanzi Recruitment Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Interview Invitation - Amanzi ATS
        
        Dear ${name},
        
        You have been invited for an interview. Please use the secure link below to access your interview session.
        
        Link: ${interviewLink}
        
        IMPORTANT SECURITY NOTICE:
        - This link is valid for 5 minutes only.
        - It can be used only once.
        - It is locked to the first device that opens it.
        
        If you have any issues, please contact the recruitment team immediately.
        
        Best regards,
        Amanzi Recruitment Team
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('[EMAIL] Error sending interview link:', error);
    // Log fallback in case email fails
    console.log('\n==============================================');
    console.log('📧 [FALLBACK] Interview Link');
    console.log('==============================================');
    console.log(`To: ${to}`);
    console.log(`Link: ${interviewLink}`);
    console.log('==============================================\n');
  }
};

/**
 * Send temporary interview credentials to candidate
 * @param to - Candidate email address
 * @param name - Candidate name
 * @param password - Generated temporary password
 * @param loginLink - Login page link
 */
export const sendInterviewCredentials = async (to: string, name: string, password: string, loginLink: string): Promise<void> => {
  try {
    const transporter = createTransporter();

    // If email is not configured, log to console for development
    if (!transporter) {
      console.log('\n==============================================');
      console.log('📧 [DEV MODE] Interview Credentials');
      console.log('==============================================');
      console.log(`To: ${to}`);
      console.log(`Name: ${name}`);
      console.log(`Username: ${to}`);
      console.log(`Password: ${password}`);
      console.log(`Link: ${loginLink}`);
      console.log('==============================================\n');
      return;
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: 'Temporary Interview Access - Amanzi ATS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1a1a; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; }
            .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
            .content { padding: 30px 20px; }
            .creds-box { background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .warning { background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 15px; margin: 25px 0; font-size: 14px; }
            .footer { text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
            .bold { font-weight: 700; color: #111827; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #4F46E5; margin: 0;">Amanzi ATS</h1>
            </div>
            <div class="content">
              <p>Dear <span class="bold">${name}</span>,</p>
              <p>You have been invited for a technical interview. Below are your temporary login credentials to access the assessment portal.</p>
              
              <div class="creds-box">
                <p style="margin: 0;"><strong>Username:</strong> ${to}</p>
                <p style="margin: 10px 0 0 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #eee; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
              </div>

              <div style="text-align: center;">
                <a href="${loginLink}" class="button" style="color: white;">Login to Assessment</a>
              </div>

              <div class="warning">
                <strong>🚨 IMPORTANT:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>These credentials are valid for <strong>2 hours</strong> only.</li>
                  <li>Access will be disabled immediately after you complete the test.</li>
                  <li>Do not share these credentials with anyone.</li>
                </ul>
              </div>

              <p>Best regards,<br>Amanzi Recruitment Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Amanzi. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Temporary Interview Access - Amanzi ATS
        
        Dear ${name},
        
        You have been invited for a technical interview. Below are your temporary login credentials:
        
        Username: ${to}
        Password: ${password}
        
        Login Link: ${loginLink}
        
        IMPORTANT:
        - These credentials are valid for 2 hours only.
        - Access will be disabled immediately after you complete the test.
        
        Best regards,
        Amanzi Recruitment Team
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('[EMAIL] Error sending interview credentials:', error);
  }
};
