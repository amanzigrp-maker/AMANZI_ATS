/**
 * Dashboard Analytics Routes
 */
import express from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = express.Router();

// All dashboard routes require authentication
router.use(verifyToken);

// Get overview statistics
router.get('/stats', dashboardController.getDashboardStats);

// Get upload trends
router.get('/trends', dashboardController.getUploadTrends);

// Get top skills
router.get('/skills', dashboardController.getTopSkills);

// Get parsing metrics
router.get('/parsing', dashboardController.getParsingMetrics);

// Get experience distribution
router.get('/experience', dashboardController.getExperienceDistribution);

// Get location distribution
router.get('/locations', dashboardController.getLocationDistribution);

// Get complete dashboard (all metrics)
router.get('/complete', dashboardController.getCompleteDashboard);

// Get hourly pipeline trend (applicants vs interviews)
router.get('/pipeline-trend', dashboardController.getPipelineTrend);

// Get recent applications list for dashboard
router.get('/recent-applications', dashboardController.getRecentApplications);

export default router;
