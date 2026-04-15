/**
 * Search Routes - Elasticsearch powered full-text search
 */
import express from 'express';
import {
  searchResumes,
  searchResumesHybrid,
  searchJobs,
  suggestSkills,
  reindexResumes,
  reindexJobs
} from '../controllers/search.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Search endpoints
router.post('/resumes', searchResumes);
router.post('/resumes/hybrid', searchResumesHybrid);
router.post('/jobs', searchJobs);

// Autocomplete
router.get('/suggest/skills', suggestSkills);

// Admin reindex endpoints
router.post('/reindex/resumes', reindexResumes);
router.post('/reindex/jobs', reindexJobs);

export default router;
