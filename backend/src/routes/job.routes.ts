import { Router } from "express";
import { verifyToken, isAdmin, isLead } from "../middleware/auth.middleware";
import {
  createJob,
  getJobs,
  getJobById,
  getAiCandidatesForJob,
  updateJob,
  deleteJob,
  assignJob,
} from "../controllers/job.controller";
import { getJobMatches } from "../controllers/job-match.controller";
import jobAssignmentService from "../services/job-assignment.service";

/**
 * Job Routes
 *
 * Base path: /api/jobs
 */

const router = Router();

// Apply JWT Authentication to all job routes
router.use(verifyToken);

/**
 * ==========================================
 * GET /api/jobs
 * Fetch jobs (Admin → all jobs, Recruiter/Vendor → assigned jobs)
 * ==========================================
 */
router.get("/", getJobs);

/**
 * ==========================================
 * GET /api/jobs/:job_id/matches
 * Semantic matches (pgvector only)
 * ==========================================
 */
router.get("/:job_id/matches", getJobMatches);

router.get("/:job_id/ai-candidates", getAiCandidatesForJob);

/**
 * ==========================================
 * GET /api/jobs/:id
 * Fetch a single job by ID (with matches)
 * ==========================================
 */
router.get("/:id", getJobById);

/**
 * ==========================================
 * POST /api/jobs
 * Create new job
 * Admin ONLY
 * ==========================================
 */
router.post("/", isLead, createJob);

/**
 * ==========================================
 * PUT /api/jobs/:id
 * Update job details
 * Admin ONLY
 * ==========================================
 */
router.put("/:id", isLead, updateJob);

/**
 * ==========================================
 * POST /api/jobs/:id/assign
 * Assign job to specific recruiters/vendors
 * Admin ONLY
 * ==========================================
 */
router.post("/:id/assign", isLead, assignJob);

/**
 * ==========================================
 * DELETE /api/jobs/:id
 * Delete job
 * Admin ONLY
 * ==========================================
 */
router.delete("/:id", isLead, deleteJob);

// Admin: get current recruiter assignments for a specific job
router.get("/:id/assignments/recruiters", isLead, async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    if (!jobId) {
      return res.status(400).json({ error: "Invalid job id" });
    }

    const rows = await jobAssignmentService.getJobAssignments(jobId);
    const recruiters = rows.filter((r: any) => String(r.role || "").toLowerCase() === "recruiter");

    return res.json({ success: true, data: recruiters });
  } catch (err: any) {
    console.error("Failed to fetch recruiter assignments:", err);
    return res.status(500).json({ error: err?.message || "Failed to fetch assignments" });
  }
});

export default router;
