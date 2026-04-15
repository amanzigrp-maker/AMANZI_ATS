/**
 * Recommendation Controller
 * 
 * Handles API requests for the candidate recommendation engine
 */

import { Request, Response } from "express";
import { pool } from "../lib/database";
import { aiWorkerService } from "../services/ai-worker.service";

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_BASE_URL || "http://127.0.0.1:8001";

/**
 * POST /api/recommendations/search
 * Search talent pool for matching candidates
 */
export const searchTalentPool = async (req: Request, res: Response) => {
    try {
        const {
            job_id,
            filters = {},
            top_k = 100,
        } = req.body;

        if (!job_id) {
            return res.status(400).json({ error: "job_id is required" });
        }

        // Verify job exists
        const jobResult = await pool.query(
            "SELECT job_id, title FROM jobs WHERE job_id = $1",
            [job_id]
        );

        if (!jobResult.rows.length) {
            return res.status(404).json({ error: "Job not found" });
        }

        logger.info(`Searching talent pool for job ${job_id}`);

        // Call Python worker
        const response = await fetch(`${PYTHON_WORKER_URL}/api/recommendations/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                job_id,
                filters,
                top_k,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Python worker error: ${error}`);
        }

        const result = await response.json();

        return res.json({
            success: true,
            job_id,
            job_title: jobResult.rows[0].title,
            count: result.count,
            data: result.data,
        });
    } catch (error: any) {
        console.error("Talent pool search error:", error);
        return res.status(500).json({
            error: "Failed to search talent pool",
            message: error.message,
        });
    }
};

/**
 * POST /api/recommendations/generate/:jobId
 * Generate and store recommendations for a job
 */
export const generateRecommendations = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const job_id = parseInt(jobId);

        if (isNaN(job_id)) {
            return res.status(400).json({ error: "Invalid job ID" });
        }

        // Verify job exists
        const jobResult = await pool.query(
            "SELECT job_id, title FROM jobs WHERE job_id = $1",
            [job_id]
        );

        if (!jobResult.rows.length) {
            return res.status(404).json({ error: "Job not found" });
        }

        logger.info(`Generating recommendations for job ${job_id}`);

        // Call Python worker (fire and forget)
        const response = await fetch(`${PYTHON_WORKER_URL}/api/recommendations/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                job_id,
                top_k: 100,
            }),
        });

        const result = await response.json();

        return res.json({
            success: true,
            message: "Recommendation generation started",
            job_id,
            job_title: jobResult.rows[0].title,
            status: result.status,
        });
    } catch (error: any) {
        console.error("Generate recommendations error:", error);
        return res.status(500).json({
            error: "Failed to generate recommendations",
            message: error.message,
        });
    }
};

/**
 * GET /api/recommendations/:jobId
 * Get stored recommendations for a job
 */
export const getRecommendations = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const job_id = parseInt(jobId);
        const status = req.query.status as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        if (isNaN(job_id)) {
            return res.status(400).json({ error: "Invalid job ID" });
        }

        // Build query
        let query = `
            SELECT 
                jr.*,
                c.full_name,
                c.email,
                c.phone,
                c.current_designation,
                c.current_company,
                c.total_experience_years,
                c.location,
                c.skills
            FROM job_recommendations jr
            JOIN candidates c ON c.candidate_id = jr.candidate_id
            WHERE jr.job_id = $1
        `;
        const params: any[] = [job_id];

        if (status) {
            query += ` AND jr.recommendation_status = $2`;
            params.push(status);
        }

        query += ` ORDER BY jr.final_score DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get stats
        const statsResult = await pool.query(`
            SELECT 
                recommendation_status,
                COUNT(*) as count
            FROM job_recommendations
            WHERE job_id = $1
            GROUP BY recommendation_status
        `, [job_id]);

        const stats: Record<string, number> = {};
        statsResult.rows.forEach(row => {
            stats[row.recommendation_status] = parseInt(row.count);
        });

        return res.json({
            success: true,
            job_id,
            count: result.rows.length,
            total: stats['new'] || 0,
            stats,
            data: result.rows.map(row => ({
                candidate_id: row.candidate_id,
                full_name: row.full_name,
                email: row.email,
                phone: row.phone || "",
                current_designation: row.current_designation || "",
                current_company: row.current_company || "",
                total_experience_years: parseFloat(row.total_experience_years) || 0,
                location: row.location || "",
                skills: Array.isArray(row.skills) ? row.skills : [],
                final_score: parseFloat(row.final_score) * 100,
                scores: {
                    experience: parseFloat(row.experience_score || 0) * 100,
                    skills: parseFloat(row.skills_score || 0) * 100,
                    semantic: parseFloat(row.semantic_score || 0) * 100,
                    education: parseFloat(row.education_score || 0) * 100,
                    location: parseFloat(row.location_score || 0) * 100,
                    industry: parseFloat(row.industry_score || 0) * 100,
                    recency: parseFloat(row.recency_score || 0) * 100,
                },
                matched_skills: row.matched_skills || [],
                missing_skills: row.missing_skills || [],
                explanation: row.explanation || "",
                status: row.recommendation_status,
                recommended_at: row.recommended_at,
                viewed_at: row.viewed_at,
                shortlisted_at: row.shortlisted_at,
            })),
        });
    } catch (error: any) {
        console.error("Get recommendations error:", error);
        return res.status(500).json({
            error: "Failed to get recommendations",
            message: error.message,
        });
    }
};

/**
 * GET /api/recommendations/:jobId/stats
 * Get recommendation statistics for a job
 */
export const getRecommendationStats = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const job_id = parseInt(jobId);

        if (isNaN(job_id)) {
            return res.status(400).json({ error: "Invalid job ID" });
        }

        // Get stats
        const statsResult = await pool.query(`
            SELECT 
                recommendation_status,
                recommendation_score_bucket,
                COUNT(*) as count,
                AVG(final_score) as avg_score,
                MAX(final_score) as max_score,
                MIN(final_score) as min_score
            FROM job_recommendations
            WHERE job_id = $1
            GROUP BY recommendation_status, recommendation_score_bucket
        `, [job_id]);

        // Aggregate stats
        const byStatus: Record<string, number> = {};
        const byBucket: Record<string, number> = {};
        let totalCount = 0;
        let totalScore = 0;

        statsResult.rows.forEach(row => {
            const count = parseInt(row.count);
            const score = parseFloat(row.avg_score) || 0;

            byStatus[row.recommendation_status] = count;
            byBucket[row.recommendation_score_bucket] = count;

            totalCount += count;
            totalScore += score * count;
        });

        return res.json({
            success: true,
            job_id,
            total: totalCount,
            avg_score: totalCount > 0 ? Math.round((totalScore / totalCount) * 100) : 0,
            by_status: byStatus,
            by_bucket: byBucket,
        });
    } catch (error: any) {
        console.error("Get recommendation stats error:", error);
        return res.status(500).json({
            error: "Failed to get recommendation stats",
            message: error.message,
        });
    }
};

/**
 * GET /api/recommendations/:jobId/candidate/:candidateId
 * Get detailed recommendation for a specific candidate-job pair
 */
export const getRecommendationDetail = async (req: Request, res: Response) => {
    try {
        const { jobId, candidateId } = req.params;
        const job_id = parseInt(jobId);
        const candidate_id = parseInt(candidateId);

        if (isNaN(job_id) || isNaN(candidate_id)) {
            return res.status(400).json({ error: "Invalid job or candidate ID" });
        }

        // Get recommendation
        const recResult = await pool.query(`
            SELECT * FROM job_recommendations
            WHERE job_id = $1 AND candidate_id = $2
        `, [job_id, candidate_id]);

        if (!recResult.rows.length) {
            return res.status(404).json({ error: "Recommendation not found" });
        }

        const rec = recResult.rows[0];

        // Get candidate details
        const candResult = await pool.query(`
            SELECT 
                c.*,
                r.parsed_json
            FROM candidates c
            LEFT JOIN resumes r ON r.candidate_id = c.candidate_id
            WHERE c.candidate_id = $1
        `, [candidate_id]);

        const candidate = candResult.rows[0];

        // Get job details
        const jobResult = await pool.query(`
            SELECT * FROM jobs WHERE job_id = $1
        `, [job_id]);

        return res.json({
            success: true,
            data: {
                recommendation: {
                    final_score: parseFloat(rec.final_score) * 100,
                    scores: {
                        experience: parseFloat(rec.experience_score || 0) * 100,
                        skills: parseFloat(rec.skills_score || 0) * 100,
                        semantic: parseFloat(rec.semantic_score || 0) * 100,
                        education: parseFloat(rec.education_score || 0) * 100,
                        location: parseFloat(rec.location_score || 0) * 100,
                        industry: parseFloat(rec.industry_score || 0) * 100,
                        recency: parseFloat(rec.recency_score || 0) * 100,
                    },
                    matched_skills: rec.matched_skills || [],
                    missing_skills: rec.missing_skills || [],
                    explanation: rec.explanation || "",
                    status: rec.recommendation_status,
                    recommended_at: rec.recommended_at,
                },
                candidate: {
                    candidate_id: candidate.candidate_id,
                    full_name: candidate.full_name,
                    email: candidate.email,
                    phone: candidate.phone || "",
                    current_designation: candidate.current_designation || "",
                    current_company: candidate.current_company || "",
                    total_experience_years: parseFloat(candidate.total_experience_years) || 0,
                    location: candidate.location || "",
                    skills: Array.isArray(candidate.skills) ? candidate.skills : [],
                    linkedin_url: candidate.linkedin_url || "",
                    github_url: candidate.github_url || "",
                    parsed_json: candidate.parsed_json,
                },
                job: jobResult.rows[0],
            },
        });
    } catch (error: any) {
        console.error("Get recommendation detail error:", error);
        return res.status(500).json({
            error: "Failed to get recommendation detail",
            message: error.message,
        });
    }
};

/**
 * PUT /api/recommendations/:jobId/candidate/:candidateId/status
 * Update recommendation status
 */
export const updateRecommendationStatus = async (req: Request, res: Response) => {
    try {
        const { jobId, candidateId } = req.params;
        const { status } = req.body;
        const job_id = parseInt(jobId);
        const candidate_id = parseInt(candidateId);

        if (isNaN(job_id) || isNaN(candidate_id)) {
            return res.status(400).json({ error: "Invalid job or candidate ID" });
        }

        const validStatuses = ["new", "viewed", "shortlisted", "rejected", "hired"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
            });
        }

        // Determine timestamp column
        const timestampMap: Record<string, string> = {
            viewed: "viewed_at",
            shortlisted: "shortlisted_at",
            rejected: "rejected_at",
            hired: "shortlisted_at",
        };

        const timestampCol = timestampMap[status];

        // Update status
        let query = `
            UPDATE job_recommendations
            SET recommendation_status = $1
        `;
        const params: any[] = [status];

        if (timestampCol) {
            query += `, ${timestampCol} = NOW()`;
        }

        query += ` WHERE job_id = $2 AND candidate_id = $3 RETURNING *`;
        params.push(job_id, candidate_id);

        const result = await pool.query(query, params);

        if (!result.rows.length) {
            return res.status(404).json({ error: "Recommendation not found" });
        }

        return res.json({
            success: true,
            message: `Status updated to ${status}`,
            job_id,
            candidate_id,
            status,
        });
    } catch (error: any) {
        console.error("Update recommendation status error:", error);
        return res.status(500).json({
            error: "Failed to update recommendation status",
            message: error.message,
        });
    }
};

// Import logger
const logger = console;

