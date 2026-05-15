
import { Request, Response } from "express";
import { AdaptiveAssessmentService } from "../../modules/adaptive-assessment/adaptive-engine.service";
import { SessionManagementService } from "../../modules/interview-session/session-manager.service";
import { QuestionBankService } from "../../modules/question-bank/question-bank.service";
import { pool } from "../../lib/database";
import { SessionState, DifficultyLevel } from "../../common/types";
import { HeartbeatService } from "../../modules/exam-resumption/services/heartbeat.service";
import { ExamResumptionService } from "../../modules/exam-resumption/services/exam-resumption.service";
import { ExamSnapshotService } from "../../modules/exam-resumption/services/exam-snapshot.service";
import { HeartbeatDto } from "../../modules/exam-resumption/dto/heartbeat.dto";
import { ResumeRequestDto } from "../../modules/exam-resumption/dto/resume-request.dto";
import { AutosaveDto } from "../../modules/exam-resumption/dto/autosave.dto";

export class EnterpriseInterviewController {

    /**
     * Start/Resume an enterprise interview session
     */
    public static async startSession(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            const ip = req.ip || "";

            if (session.state === SessionState.CREATED) {
                await SessionManagementService.transitionState(session.id, SessionState.STARTED, "Candidate started the interview", "candidate", ip);
                await SessionManagementService.transitionState(session.id, SessionState.ACTIVE, "Session activated", "system", ip);
            }

            // Fetch candidate profile for the adaptive engine
            const profileResult = await pool.query(
                "SELECT * FROM candidate_ai_profiles WHERE candidate_id = $1",
                [session.candidate_id]
            );

            res.json({
                success: true,
                data: {
                    sessionId: session.id,
                    state: session.state,
                    candidateName: session.candidate_name,
                    jobRole: session.role,
                    durationMins: session.duration_mins,
                    profile: profileResult.rows[0] || null
                }
            });
        } catch (error) {
            console.error("❌ Start Session Error:", error);
            res.status(500).json({ success: false, error: "Failed to start session" });
        }
    }

    /**
     * Get the next adaptive question (Section 2)
     */
    public static async getNextQuestion(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            
            // 1. Load latest snapshot for state recovery
            const snapshot = await ExamSnapshotService.loadSnapshot(session.id);
            const currentTheta = snapshot?.current_theta || session.current_theta || 0.5;
            const servedQuestionIds = snapshot?.questions_served || [];
            
            const historyResult = await pool.query(
                "SELECT question FROM interview_questions WHERE session_id = $1 ORDER BY id DESC LIMIT 5",
                [session.id]
            );
            const recentQuestionTexts = historyResult.rows.map(r => r.question);

            // 2. Decide Source: Bank (70%) vs Grounded AI (30%)
            const useBank = Math.random() < 0.7;
            let questionData: any;
            let sourceQuestionId: number | null = null;

            if (useBank) {
                // Fetch from bank, excluding already served IDs
                const bankResult = await pool.query(`
                    SELECT q.* FROM questions q
                    JOIN question_sets qs ON q.question_set_id = qs.question_set_id
                    JOIN assessments a ON qs.assessment_id = a.assessment_id
                    WHERE a.assessment_id = (SELECT assessment_id FROM interview_tokens WHERE token = $1)
                    AND q.question_id::text NOT IN (SELECT unnest($2::text[]))
                    ORDER BY ABS(COALESCE(q.difficulty_score::float8, 0.5) - $3), RANDOM()
                    LIMIT 1
                `, [session.token, servedQuestionIds, currentTheta]);

                if (bankResult.rowCount > 0) {
                    questionData = bankResult.rows[0];
                    sourceQuestionId = questionData.question_id;
                    // Format bank question to match AI output for frontend consistency
                    questionData = {
                        question_text: questionData.question_text,
                        options: (await pool.query("SELECT option_key, option_text FROM question_options WHERE question_id = $1", [sourceQuestionId])).rows.reduce((acc, curr) => ({...acc, [curr.option_key]: curr.option_text}), {}),
                        correct_option: questionData.correct_option,
                        explanation: questionData.explanation,
                        skill_tag: questionData.skill_tag || session.role,
                        difficulty_score: questionData.difficulty_score || 0.5
                    };
                }
            }

            if (!questionData) {
                // Generate using Grounded AI
                const candidateProfile = {
                    yearsOfExperience: session.experience_years || 0,
                    role: session.role,
                    skills: session.skills || ["General Software Engineering"],
                    projects: [], // In production, fetch from candidate/resume module
                    seniority: session.experience_years > 5 ? "Senior" : "Junior"
                };

                questionData = await AdaptiveAssessmentService.generateGroundedQuestion(candidateProfile, Number(currentTheta), recentQuestionTexts);
            }

            // 3. Save as an interview question and update snapshot
            const insertResult = await pool.query(`
                INSERT INTO interview_questions (session_id, question, options, correct_answer, difficulty_score)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, question, options
            `, [session.id, questionData.question_text, JSON.stringify(questionData.options), questionData.correct_option, currentTheta]);

            const newQuestionId = insertResult.rows[0].id;
            
            // Update served questions list in snapshot
            const updatedServed = [...servedQuestionIds, newQuestionId.toString()];
            await ExamSnapshotService.saveSnapshot(session.id, {
                current_question_index: updatedServed.length,
                questions_served: updatedServed,
                answers_submitted: snapshot?.answers_submitted || {},
                current_theta: Number(currentTheta),
                skill_rotation_state: snapshot?.skill_rotation_state || { nextSkill: "General", rotationIndex: 0, completedSkills: [] },
                device_fingerprint: snapshot?.device_fingerprint_at_snapshot || "system"
            });

            res.json({
                success: true,
                data: insertResult.rows[0]
            });

        } catch (error) {
            console.error("❌ Next Question Error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch question" });
        }
    }

    /**
     * Submit an answer and update ability (Section 2)
     */
    public static async submitAnswer(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            const { questionId, selectedAnswer } = req.body;

            // 1. Fetch Question Info
            const qResult = await pool.query(
                "SELECT correct_answer, difficulty_score FROM interview_questions WHERE id = $1",
                [questionId]
            );
            if (qResult.rows.length === 0) throw new Error("Question not found");

            const isCorrect = qResult.rows[0].correct_answer === selectedAnswer;
            const itemDifficulty = Number(qResult.rows[0].difficulty_score);

            // 2. Update Ability (Theta)
            const currentTheta = Number(session.current_theta);
            const newTheta = AdaptiveAssessmentService.updateAbility(currentTheta, itemDifficulty, isCorrect);

            // 3. Update Session
            await pool.query(
                "UPDATE interview_sessions SET current_theta = $1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $2",
                [newTheta, session.id]
            );

            // 4. Save Response and Update Snapshot
            await pool.query(`
                INSERT INTO interview_responses (session_id, question_id, selected_answer, is_correct, theta_before, theta_after)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [session.id, questionId, selectedAnswer, isCorrect, currentTheta, newTheta]);

            const snapshot = await ExamSnapshotService.loadSnapshot(session.id);
            const updatedAnswers = { 
                ...(snapshot?.answers_submitted || {}), 
                [questionId]: { 
                    answer: selectedAnswer, 
                    timestamp: new Date().toISOString(), 
                    time_spent_ms: 0, 
                    is_immutable: true 
                } 
            };

            await ExamSnapshotService.saveSnapshot(session.id, {
                current_question_index: snapshot?.current_question_index || 0,
                questions_served: snapshot?.questions_served || [],
                answers_submitted: updatedAnswers,
                current_theta: newTheta,
                skill_rotation_state: snapshot?.skill_rotation_state || { nextSkill: "General", rotationIndex: 0, completedSkills: [] },
                device_fingerprint: snapshot?.device_fingerprint_at_snapshot || "unknown"
            });

            res.json({
                success: true,
                data: { isCorrect, newTheta }
            });

        } catch (error) {
            console.error("❌ Submit Answer Error:", error);
            res.status(500).json({ success: false, error: "Failed to submit answer" });
        }
    }

    /**
     * POST /api/v1/interview/:token/heartbeat
     */
    public static async heartbeat(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            const payload: HeartbeatDto = req.body;
            
            await HeartbeatService.recordHeartbeat(session.id, session.candidate_id, payload);
            const remaining = await ExamSnapshotService.computeRemainingTime(session.id);

            res.json({
                success: true,
                data: { serverRemainingSeconds: remaining, sessionValid: true }
            });
        } catch (error) {
            console.error("❌ Heartbeat Error:", error);
            res.status(500).json({ success: false, error: "Heartbeat failed" });
        }
    }

    /**
     * POST /api/v1/interview/:token/resume
     */
    public static async resume(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            const { deviceFingerprint }: ResumeRequestDto = req.body;
            const ip = req.ip || "";

            const payload = await ExamResumptionService.initiateResume(session.id, deviceFingerprint, ip);
            
            res.json({ success: true, data: payload });
        } catch (error: any) {
            console.error("❌ Resume Error:", error);
            const status = error.message === "EXPIRED" ? 410 : 
                           error.message === "SECURITY_LOCKOUT" ? 403 : 500;
            res.status(status).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /api/v1/interview/:token/snapshot
     */
    public static async getSnapshot(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            const snapshot = await ExamSnapshotService.loadSnapshot(session.id);
            
            if (!snapshot) return res.status(404).json({ success: false, error: "Snapshot not found" });

            // Sanitize snapshot (remove internal scoring/sensitive data if any)
            const { checksum, server_node_id, ...sanitized } = snapshot;
            res.json({ success: true, data: sanitized });
        } catch (error) {
            console.error("❌ Snapshot Fetch Error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch snapshot" });
        }
    }

    /**
     * POST /api/v1/interview/:token/autosave
     */
    public static async autosave(req: Request, res: Response) {
        try {
            const session = (req as any).enterpriseSession;
            const { currentAnswers, currentQuestionIndex }: AutosaveDto = req.body;

            // Load existing snapshot to merge
            const snapshot = await ExamSnapshotService.loadSnapshot(session.id);
            const mergedAnswers = { ...(snapshot?.answers_submitted || {}), ...currentAnswers };

            const updatedSnapshot = await ExamSnapshotService.saveSnapshot(session.id, {
                current_question_index: currentQuestionIndex,
                questions_served: snapshot?.questions_served || [],
                answers_submitted: mergedAnswers,
                current_theta: snapshot?.current_theta || 0.5,
                skill_rotation_state: snapshot?.skill_rotation_state || { nextSkill: "General", rotationIndex: 0, completedSkills: [] },
                device_fingerprint: snapshot?.device_fingerprint_at_snapshot || "unknown"
            });

            res.json({
                success: true,
                data: { 
                    snapshotVersion: updatedSnapshot.snapshot_version, 
                    serverRemainingSeconds: updatedSnapshot.time_remaining_seconds 
                }
            });
        } catch (error) {
            console.error("❌ Autosave Error:", error);
            res.status(500).json({ success: false, error: "Autosave failed" });
        }
    }

    /**
     * POST /api/v1/admin/sessions/:sessionId/extend
     */
    public static async extendSession(req: Request, res: Response) {
        try {
            const { sessionId } = req.params;
            const { additionalSeconds } = req.body;

            if (additionalSeconds > 3600) return res.status(400).json({ error: "Max extension is 1 hour" });

            const result = await pool.query(
                "UPDATE interview_sessions SET duration_mins = duration_mins + $1 WHERE id = $2 RETURNING duration_mins",
                [Math.ceil(additionalSeconds / 60), sessionId]
            );

            if (result.rowCount === 0) return res.status(404).json({ error: "Session not found" });

            res.json({ success: true, data: { newDurationMins: result.rows[0].duration_mins } });
        } catch (error) {
            console.error("❌ Extend Session Error:", error);
            res.status(500).json({ success: false, error: "Failed to extend session" });
        }
    }
}
