export type EnterpriseRole =
  | "super_admin"
  | "admin"
  | "lead"
  | "proctor"
  | "recruiter"
  | "reviewer"
  | "enterprise_client";

export type EnterpriseEventType =
  | "proctoring.warning"
  | "proctoring.violation"
  | "secure_browser.process_detected"
  | "secure_browser.integrity_failed"
  | "secure_browser.shortcut_blocked"
  | "secure_browser.offline_cache_synced"
  | "assessment.answer_submitted"
  | "assessment.behavior_sampled"
  | "risk.score_updated"
  | "audit.access";

export type EnterpriseEventSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface EnterpriseSecurityEvent {
  eventType: EnterpriseEventType;
  severity?: EnterpriseEventSeverity;
  sessionId?: string | number | null;
  interviewId?: string | null;
  candidateId?: string | number | null;
  tenantId?: string | number | null;
  actorUserId?: string | number | null;
  source?: "browser" | "secure-browser" | "backend" | "ai" | "admin";
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export interface BehaviorSignal {
  typingSpeedWpm?: number;
  answerTimeMs?: number;
  mouseLinearity?: number;
  idleMs?: number;
  pasteCount?: number;
  gazeAwayRatio?: number;
  webcamInactiveMs?: number;
  tabSwitchCount?: number;
  llmPatternScore?: number;
  violationCount?: number;
}

export interface RiskScore {
  sessionId: string;
  candidateId?: string | null;
  score: number;
  riskBand: "low" | "medium" | "high" | "critical";
  reasons: string[];
  updatedAt: string;
}
