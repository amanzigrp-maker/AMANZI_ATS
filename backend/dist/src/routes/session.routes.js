import { Router } from "express";
import { SessionRecoveryController } from "../modules/interview-session/session-recovery.controller";
import { verifyToken } from "../middleware/auth.middleware";
const router = Router();
/**
 * Public/Candidate Session Routes
 * Note: reconnect uses token/fingerprint, others use verifyToken for active sessions
 */
// Re-establish session after disruption
router.post("/reconnect", SessionRecoveryController.reconnect);
// Heartbeat for server-authoritative timer
router.post("/heartbeat", verifyToken, SessionRecoveryController.heartbeat);
// High-frequency autosave
router.post("/autosave", verifyToken, SessionRecoveryController.autosave);
// Explicit disconnect (e.g. beforeUnload)
router.post("/disconnect", verifyToken, SessionRecoveryController.disconnect);
// Restore state for active session
router.get("/restore-state", verifyToken, SessionRecoveryController.restoreState);
export default router;
