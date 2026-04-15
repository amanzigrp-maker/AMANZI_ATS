import express from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import {
  getJobPerformance,
  exportJobPerformance,
  getResumeUploadReport,
  exportResumeUploadReport,
  getStatusUpdateReport,
  exportStatusUpdateReport,
} from '../controllers/reports.controller';

const router = express.Router();

// All reports routes require authentication
router.use(verifyToken);

router.get('/jobs', getJobPerformance);
router.get('/jobs/export', exportJobPerformance);

router.get('/resume-uploads', getResumeUploadReport);
router.get('/resume-uploads/export', exportResumeUploadReport);

router.get('/status-updates', getStatusUpdateReport);
router.get('/status-updates/export', exportStatusUpdateReport);

export default router;
