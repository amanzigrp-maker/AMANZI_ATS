import { Router } from 'express';
import { 
  generateAndSendCertificate, 
  downloadCertificate, 
  verifyCertificate 
} from '../controllers/certificate.controller.js';

const router = Router();

// Public verification
router.get('/verify/:certificateId', verifyCertificate);

// Download
router.get('/download/:certificateId', downloadCertificate);

// Internal/Recruiter trigger
router.post('/generate', generateAndSendCertificate);

export default router;
