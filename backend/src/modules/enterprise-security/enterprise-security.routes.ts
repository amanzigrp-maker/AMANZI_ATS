import { Router } from "express";
import type { Response, NextFunction } from "express";
import { verifyToken, type AuthenticatedRequest } from "../../middleware/auth.middleware";
import { enterpriseSecurityService } from "./enterprise-security.service";
import { enterpriseRiskEngine } from "./risk-engine.service";
import type { EnterpriseRole, EnterpriseSecurityEvent } from "./types";
import { config } from "../../config/env.config";

const router = Router();

const allowedRoles = new Set<EnterpriseRole>([
  "super_admin",
  "admin",
  "lead",
  "proctor",
  "reviewer",
  "enterprise_client",
]);

const requireEnterpriseAccess = (req: AuthenticatedRequest, res: any, next: any) => {
  const role = (req.user?.role ?? "").toLowerCase() as EnterpriseRole;
  if (!allowedRoles.has(role)) {
    return res.status(403).json({ message: "Enterprise security access is not enabled for this role." });
  }
  next();
};

const verifyUserOrIngestToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const ingestToken = config.SECURE_BROWSER_INGEST_TOKEN;

  if (ingestToken && token && token === ingestToken) {
    req.user = {
      id: 0,
      userid: 0,
      email: "secure-browser@system",
      role: "proctor",
    };
    return next();
  }

  return verifyToken(req, res, next);
};

router.get("/architecture", verifyToken, requireEnterpriseAccess, (_req, res) => {
  res.json(enterpriseSecurityService.getArchitecture());
});

router.get("/risk/summary", verifyToken, requireEnterpriseAccess, async (_req, res) => {
  res.json(await enterpriseRiskEngine.getSummary());
});

router.get("/risk/sessions", verifyToken, requireEnterpriseAccess, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 25), 100);
  res.json(await enterpriseRiskEngine.getRecent(limit));
});

router.post("/events", verifyUserOrIngestToken, async (req: AuthenticatedRequest, res) => {
  const event = req.body as EnterpriseSecurityEvent;
  if (!event?.eventType) {
    return res.status(400).json({ message: "eventType is required." });
  }

  await enterpriseSecurityService.recordEvent({
    ...event,
    actorUserId: req.user?.id ?? event.actorUserId,
  });

  res.status(202).json({ accepted: true });
});

router.post("/offline-cache/sync", verifyUserOrIngestToken, async (req: AuthenticatedRequest, res) => {
  const { sessionId, candidateId, answers = [], integrityHash } = req.body ?? {};
  await enterpriseSecurityService.recordEvent({
    eventType: "secure_browser.offline_cache_synced",
    severity: "medium",
    sessionId,
    candidateId,
    actorUserId: req.user?.id,
    source: "secure-browser",
    payload: {
      answerCount: Array.isArray(answers) ? answers.length : 0,
      integrityHash,
    },
  });

  res.status(202).json({ accepted: true, answerCount: Array.isArray(answers) ? answers.length : 0 });
});

router.get("/compliance/policies", verifyToken, requireEnterpriseAccess, (_req, res) => {
  res.json({
    encryption: { inTransit: "TLS 1.2+ required", atRest: "Database and evidence object storage encryption required" },
    retention: { defaultEvidenceDays: 180, auditLogDays: 2555, deletionMode: "cryptographic erase plus storage lifecycle deletion" },
    consent: { requiredBeforeExam: true, tracksWebcamAudioScreen: true },
    access: { auditEveryRead: true, leastPrivilegeRoles: [...allowedRoles] },
  });
});

export default router;
