import express from 'express';
import { verifyToken, isAdmin, isLead } from '../middleware/auth.middleware';
import {
  upload,
  bulkUpload,
  uploadResume,
  bulkUploadResumes,
  uploadModifiedResume,
  downloadResume,
} from '../controllers/resume.controller';

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*                               UPLOAD RESUME                                 */
/* -------------------------------------------------------------------------- */
/**
 * URL: POST /api/resumes/upload
 * Form field: resume (multipart/form-data)
 */
router.post(
  '/upload',
  verifyToken,
  upload.single('resume'),
  uploadResume
);

router.post(
  '/bulk-upload',
  verifyToken,
  isLead,
  bulkUpload,
  bulkUploadResumes
);

router.post(
  '/upload-modified',
  verifyToken,
  upload.single('resume'),
  uploadModifiedResume
);

/* -------------------------------------------------------------------------- */
/*                              DOWNLOAD RESUME                                */
/* -------------------------------------------------------------------------- */
/**
 * URL: GET /api/resumes/:resumeId/download
 */
router.get(
  '/:resumeId/download',
  verifyToken,
  downloadResume
);

export default router;
