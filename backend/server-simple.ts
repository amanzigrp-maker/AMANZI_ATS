import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import passport from 'passport';
import session from 'express-session';
import path from 'path';
import configurePassport from './src/config/passport';
import { testConnection, pool } from './src/lib/database';
import { logAudit } from './src/services/audit.service';
import { User } from './src/types/db';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Session and Passport configuration
app.use(session({
  secret: process.env.JWT_SECRET || 'your-default-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' },
}));

app.use(passport.initialize());
app.use(passport.session());

// Initialize Passport strategies
configurePassport();

// Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is healthy',
    platform: process.platform,
    aiWorker: 'disabled (Windows development mode)'
  });
});

// Auth routes
import authRoutes from './src/routes/auth.routes';
app.use('/api/auth', authRoutes);

// Password reset routes
import passwordResetRoutes from './src/routes/password-reset.routes';
app.use('/api/auth', passwordResetRoutes);

// Protected user routes
import userRoutes from './src/routes/user.routes';
app.use('/api/users', userRoutes);

// Admin routes
import adminRoutes from './src/routes/admin.routes';
app.use('/api/admin', adminRoutes);

// Resume routes (without AI worker for now)
import resumeRoutes from './src/routes/resume.routes';
app.use('/api/resumes', resumeRoutes);

// Google OAuth Routes
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/api/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', { failureRedirect: '/login' }, async (err: any, user: User, info: any) => {
    if (err || !user) {
      await logAudit(null, req, false, 'GOOGLE_LOGIN_FAILED');
      return res.redirect('/login?error=google-auth-failed');
    }

    req.logIn(user, async (loginErr) => {
      if (loginErr) {
        await logAudit(user.userid, req, false, 'GOOGLE_LOGIN_FAILED');
        return res.redirect('/login?error=session-creation-failed');
      }

      await logAudit(user.userid, req, true, 'GOOGLE_LOGIN');

      const accessToken = jwt.sign(
        { id: user.userid, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-default-secret',
        { expiresIn: '15m' }
      );

      const refreshToken = crypto.randomBytes(64).toString('hex');
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7);

      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expiry) VALUES ($1, $2, $3)',
        [user.userid, refreshToken, expiryDate]
      );

      await pool.query(
        'UPDATE users SET lastlogin = NOW() WHERE userid = $1',
        [user.userid]
      );

      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    });
  })(req, res, next);
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
  });
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('--- UNHANDLED ERROR ---');
  console.error(err.stack);
  console.error('--- END UNHANDLED ERROR ---');

  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'An internal server error occurred.' 
    : err.message;

  res.status(500).json({ message: errorMessage });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    await pool.end();
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
const startServer = async () => {
  try {
    if (!(await testConnection())) {
      console.error('❌ Server could not start due to database connection issues.');
      process.exit(1);
    }
    
    console.log('⚠️ Windows development mode: AI Worker Service disabled');
    
    app.listen(PORT, () => {
      console.log(`✅ Server listening on http://localhost:${PORT}`);
      console.log(`🚀 ATS Application is ready (Windows development mode)!`);
      console.log(`📋 API Health: http://localhost:${PORT}/api/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
