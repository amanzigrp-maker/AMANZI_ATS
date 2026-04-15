/**
 * Recommendation Routes
 * 
 * API endpoints for the enhanced candidate recommendation engine
 * 
 * Base path: /api/recommendations
 */

import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware";
import {
    searchTalentPool,
    getRecommendations,
    getRecommendationStats,
    updateRecommendationStatus,
    generateRecommendations,
    getRecommendationDetail,
} from "../controllers/recommendation.controller";

const router = Router();

// Apply JWT authentication to all recommendation routes
router.use(verifyToken);

/**
 * POST /api/recommendations/search
 * Search entire talent pool for matching candidates
 * 
 * Request body:
 * {
 *   job_id: number,
 *   filters?: {
 *     min_experience?: number,
 *     max_experience?: number,
 *     locations?: string[],
 *     skills?: string[],
 *     availability?: string
 *   },
 *   top_k?: number
 * }
 */
router.post("/search", searchTalentPool);

/**
 * POST /api/recommendations/generate/:jobId
 * Generate and store recommendations for a job
 */
router.post("/generate/:jobId", generateRecommendations);

/**
 * GET /api/recommendations/:jobId
 * Get stored recommendations for a job
 * 
 * Query params:
 * - status: filter by recommendation status
 * - limit: number of results (default 50)
 * - offset: pagination offset (default 0)
 */
router.get("/:jobId", getRecommendations);

/**
 * GET /api/recommendations/:jobId/stats
 * Get recommendation statistics for a job
 */
router.get("/:jobId/stats", getRecommendationStats);

/**
 * GET /api/recommendations/:jobId/candidate/:candidateId
 * Get detailed recommendation for a specific candidate-job pair
 */
router.get("/:jobId/candidate/:candidateId", getRecommendationDetail);

/**
 * PUT /api/recommendations/:jobId/candidate/:candidateId/status
 * Update recommendation status
 * 
 * Request body:
 * {
 *   status: 'new' | 'viewed' | 'shortlisted' | 'rejected' | 'hired'
 * }
 */
router.put("/:jobId/candidate/:candidateId/status", updateRecommendationStatus);

export default router;
