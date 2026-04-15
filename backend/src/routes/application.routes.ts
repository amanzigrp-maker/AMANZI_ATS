/**
 * Application Routes - Handles job applications (candidate and vendor)
 */
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { applyAsVendor, getVendorApplications, getJobApplications, updateApplicationStatus, checkVendorApplyEligibility, getApplicationDetails, getInterviewCandidates, linkCandidateToJob } from '../controllers/application.controller';


const router = Router();

// Apply middleware to all routes
router.use(verifyToken);

/**
 * POST /api/applications/jobs/:jobId/apply
 * Apply for a job as a vendor
 */
router.post('/jobs/:jobId/apply', applyAsVendor);

/**
 * GET /api/applications/jobs/:jobId/can-apply
 * Check if vendor can apply for a job
 */
router.get('/jobs/:jobId/can-apply', checkVendorApplyEligibility);

/**
 * GET /api/applications/vendor
 * Get vendor's applications
 */
router.get('/vendor', getVendorApplications);

/**
 * GET /api/applications/jobs/:jobId
 * Get all applications for a job (admin only)
 */
router.get('/jobs/:jobId', getJobApplications);

/**
 * POST /api/applications/jobs/:jobId/link-candidate
 * Create/link a candidate application for a specific job
 */
router.post('/jobs/:jobId/link-candidate', linkCandidateToJob);

/**
 * PUT /api/applications/:applicationId/status
 * Update application status (admin only)
 */
router.put('/:applicationId/status', updateApplicationStatus);

/**
 * GET /api/applications/:applicationId/details
 * Get full details (candidate + resume) for a single application
 */
router.get('/:applicationId/details', getApplicationDetails);

/**
 * GET /api/applications/interviews
 * Get candidates in interview pipeline (pending, screening, interview, accepted, rejected, offered)
 */
router.get('/interviews', getInterviewCandidates);

export default router;
