import { SessionManagementService } from "../modules/interview-session/session-manager.service";
import { EnterpriseError } from "../common/types";
export const validateEnterpriseSession = async (req, res, next) => {
    try {
        const token = req.headers["x-interview-token"] || req.query.token;
        const fingerprint = req.headers["x-device-fingerprint"];
        const ip = req.ip || "";
        if (!token) {
            throw new EnterpriseError("Interview token is required", "MISSING_TOKEN", 401);
        }
        if (!fingerprint) {
            // In a real production environment, we might enforce this.
            // For now, let's log a warning but allow if it's missing in dev.
            console.warn("⚠️ Missing device fingerprint for token:", token);
        }
        const session = await SessionManagementService.validateSessionAccess(token, fingerprint || "legacy-fingerprint", ip);
        // Attach session to request for downstream use
        req.enterpriseSession = session;
        next();
    }
    catch (error) {
        if (error instanceof EnterpriseError) {
            return res.status(error.status).json({
                success: false,
                error: error.message,
                code: error.code
            });
        }
        console.error("❌ Session Validation Middleware Error:", error);
        res.status(500).json({ success: false, error: "Internal security error" });
    }
};
