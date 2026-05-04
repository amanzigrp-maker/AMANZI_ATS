
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const testEmail = async () => {
  console.log('--- Email Test Script ---');
  console.log('User:', process.env.EMAIL_USER);
  console.log('Host:', process.env.EMAIL_HOST);
  console.log('Port:', process.env.EMAIL_PORT);
  console.log('Secure:', process.env.EMAIL_SECURE);

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('Sending test email...');
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Amanzi'}" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to self
      subject: 'Amanzi Test Email',
      text: 'If you see this, email configuration is working!',
    });
    console.log('✅ Test email sent successfully!');
  } catch (err) {
    console.error('❌ Failed to send test email:', err);
  }
};

testEmail();
