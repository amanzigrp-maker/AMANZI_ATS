
import { Request, Response } from "express";
import { RecoveryEngineService } from "./recovery-engine.service";
import { TimerEngineService } from "./timer-engine.service";
import { AutosaveEngineService } from "./autosave-engine.service";
import { EnterpriseError } from "../../common/types";

export class SessionRecoveryController {

    /**
     * POST /session/heartbeat
     */
    public static async heartbeat(req: Request, res: Response) {
        try {
            const sessionId = (req as any).user?.sessionId || req.body.sessionId;
            if (!sessionId) throw new EnterpriseError("Session ID required", "MISSING_SESSION_ID", 400);

            const result = await TimerEngineService.processHeartbeat(sessionId, req.ip || "");
            
            res.json({
                success: true,
                data: result
            });
        } catch (error: any) {
            console.error("❌ Heartbeat Error:", error);
            res.status(error.status || 500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /session/autosave
     */
    public static async autosave(req: Request, res: Response) {
        try {
            const sessionId = (req as any).user?.sessionId || req.body.sessionId;
            const { questionId, responseData, isDraft, clientTimestamp } = req.body;

            await AutosaveEngineService.saveDraft(sessionId, {
                questionId,
                responseData,
                isDraft,
                clientTimestamp
            });

            res.json({ success: true });
        } catch (error: any) {
            console.error("❌ Autosave Error:", error);
            res.status(500).json({ success: false, error: "Autosave failed" });
        }
    }

    /**
     * POST /session/reconnect
     */
    public static async reconnect(req: Request, res: Response) {
        try {
            const { token, fingerprint } = req.body;
            const ip = req.ip || "";
            const userAgent = req.headers["user-agent"] || "unknown";

            const restoredState = await RecoveryEngineService.validateAndRestore(token, fingerprint, ip, userAgent);

            res.json({
                success: true,
                data: restoredState
            });
        } catch (error: any) {
            console.error("❌ Reconnect Error:", error);
            res.status(error.status || 500).json({ success: false, error: error.message, code: error.code });
        }
    }

    /**
     * POST /session/disconnect
     */
    public static async disconnect(req: Request, res: Response) {
        try {
            const sessionId = (req as any).user?.sessionId || req.body.sessionId;
            await TimerEngineService.pauseTimer(sessionId, "Manual disconnect / Tab closed");
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /session/restore-state
     */
    public static async restoreState(req: Request, res: Response) {
        try {
            const sessionId = (req as any).user?.sessionId;
            // This is a simplified version for an active session to re-sync
            const drafts = await AutosaveEngineService.restoreAllDrafts(sessionId);
            res.json({ success: true, data: { drafts } });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
