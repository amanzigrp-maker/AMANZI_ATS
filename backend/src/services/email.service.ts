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
 * Send interview invite with temporary login credentials
 * @param to - Candidate email address
 * @param name - Candidate name
 * @param loginUrl - Login URL for the interview
 * @param password - Temporary generated password
 */
export const sendInterviewLink = async (to: string, name: string, loginUrl: string, password?: string): Promise<void> => {
  try {
    const displayPassword = password || 'Contact recruiter';
    const transporter = createTransporter();

    // If email is not configured, log to console for development
    if (!transporter) {
      console.log('\n==============================================');
      console.log('📧 [DEV MODE] Interview Login Details');
      console.log('==============================================');
      console.log(`To: ${to}`);
      console.log(`Name: ${name}`);
      console.log(`Login URL: ${loginUrl}`);
      console.log(`Password: ${displayPassword}`);
      console.log(`Note: Login details valid for the test duration.`);
      console.log('==============================================\n');
      return;
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: 'Interview Invitation - Amanzi ATS',
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
            .creds { background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; font-family: monospace; }
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
              <p>You have been invited for an interview. A temporary account has been created for your assessment.</p>
              
              <div class="creds">
                <p style="margin: 5px 0;"><strong>Email:</strong> ${to}</p>
                <p style="margin: 5px 0;"><strong>Password:</strong> ${displayPassword}</p>
              </div>

              <div style="text-align: center;">
                <a href="${loginUrl}" class="button" style="color: white;">Login to Assessment</a>
              </div>

              <div class="warning" style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 15px; margin: 25px 0; font-size: 14px;">
                <strong>🚨 IMPORTANT SECURITY NOTICE:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>This account is disabled after the test is completed.</li>
                  <li>Do not share these credentials.</li>
                  <li>Ensure you have a stable connection before starting.</li>
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
        
        You have been invited for an interview. A temporary account has been created for your assessment.
        
        Email: ${to}
        Password: ${displayPassword}
        
        Login URL: ${loginUrl}
        
        IMPORTANT SECURITY NOTICE:
        - This account is disabled after the test is completed.
        - Do not share these credentials.
        - Ensure you have a stable connection before starting.
        
        If you have any issues, please contact the recruitment team immediately.
        
        Best regards,
        Amanzi Recruitment Team
      `,
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
  report?: { correct?: number; incorrect?: number; attempted?: number }
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
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
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
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Error sending interview results:', err);
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
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
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
