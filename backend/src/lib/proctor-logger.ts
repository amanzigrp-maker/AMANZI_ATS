import { StructuredLogger } from "./pino.config";
import { v4 as uuidv4 } from "uuid";

/**
 * Proctoring Event Logger
 * Specialized logging for interview proctoring events
 *
 * Features:
 * - Violation detection and logging
 * - Candidate behavior tracking
 * - Proctor action logging
 * - Session integrity monitoring
 * - Audit trail generation
 */

export enum ProctorEventType {
  VIOLATION = "violation",
  WARNING = "warning",
  STATUS = "status",
  ACTION = "action",
  ALERT = "alert",
  ANOMALY = "anomaly",
}

export enum ViolationType {
  // Screen/window violations
  TAB_SWITCH = "tab_switch",
  WINDOW_MINIMIZE = "window_minimize",
  SCREEN_SHARE_DETECTED = "screen_share_detected",
  MULTIPLE_MONITORS = "multiple_monitors",

  // Camera/audio violations
  NO_FACE_DETECTED = "no_face_detected",
  FACE_NOT_CENTERED = "face_not_centered",
  LOW_LIGHTING = "low_lighting",
  POOR_AUDIO_QUALITY = "poor_audio_quality",

  // Behavior violations
  EXCESSIVE_MOVEMENT = "excessive_movement",
  LOOKING_AWAY = "looking_away",
  TALKING_DETECTED = "talking_detected",
  MULTIPLE_PEOPLE = "multiple_people",

  // Environment violations
  PHONE_DETECTED = "phone_detected",
  EXTERNAL_MATERIAL = "external_material",
  HAND_RAISED = "hand_raised",

  // Technical violations
  CONNECTION_LOSS = "connection_loss",
  TIMEOUT = "timeout",
  BROWSER_DEVTOOLS = "browser_devtools",

  // Other
  DUPLICATE_SESSION = "duplicate_session",
  UNAUTHORIZED_EXIT = "unauthorized_exit",
  OTHER = "other",
}

export interface ProctorEvent {
  eventId: string;
  interviewId: string;
  candidateId: string;
  sessionId?: string;
  eventType: ProctorEventType;
  violationType?: ViolationType;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  correlationId?: string;
}

export interface ProctorAction {
  actionId: string;
  interviewId: string;
  proctorId: string;
  actionType: "warning" | "pause" | "resume" | "terminate" | "review" | "note";
  targetCandidateId?: string;
  reason: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class ProctoringEventLogger {
  private logger: StructuredLogger;

  constructor() {
    this.logger = new StructuredLogger();
  }

  /**
   * Log violation event
   */
  logViolation(
    interviewId: string,
    candidateId: string,
    violation: ViolationType,
    details?: Record<string, any>
  ): ProctorEvent {
    const eventId = uuidv4();
    const correlationId = uuidv4();

    const event: ProctorEvent = {
      eventId,
      interviewId,
      candidateId,
      eventType: ProctorEventType.VIOLATION,
      violationType: violation,
      severity: this.determineSeverity(violation),
      title: this.getViolationTitle(violation),
      description: this.getViolationDescription(violation),
      metadata: details,
      timestamp: new Date(),
      correlationId,
    };

    const severity = event.severity;
    const logLevel = severity === "critical" ? "error" : severity === "high" ? "warn" : "info";

    const logData = {
      eventId,
      correlationId,
      interviewId,
      candidateId,
      violationType: violation,
      severity,
      title: event.title,
      description: event.description,
      metadata: details,
      timestamp: event.timestamp.toISOString(),
    };

    if (logLevel === "error") {
      this.logger
        .withInterview(interviewId, candidateId)
        .error(`Proctoring violation: ${event.title}`, new Error(event.description), logData);
    } else if (logLevel === "warn") {
      this.logger
        .withInterview(interviewId, candidateId)
        .warn(`Proctoring violation: ${event.title}`, logData);
    } else {
      this.logger
        .withInterview(interviewId, candidateId)
        .info(`Proctoring violation: ${event.title}`, logData);
    }

    return event;
  }

  /**
   * Log warning event
   */
  logWarning(
    interviewId: string,
    candidateId: string,
    warningType: string,
    message: string,
    details?: Record<string, any>
  ): ProctorEvent {
    const eventId = uuidv4();

    const event: ProctorEvent = {
      eventId,
      interviewId,
      candidateId,
      eventType: ProctorEventType.WARNING,
      severity: "medium",
      title: warningType,
      description: message,
      metadata: details,
      timestamp: new Date(),
    };

    this.logger
      .withInterview(interviewId, candidateId)
      .warn(`Proctoring warning: ${warningType}`, {
        eventId,
        interviewId,
        candidateId,
        message,
        details,
        timestamp: event.timestamp.toISOString(),
      });

    return event;
  }

  /**
   * Log candidate status event
   */
  logStatus(
    interviewId: string,
    candidateId: string,
    status: string,
    details?: Record<string, any>
  ): ProctorEvent {
    const eventId = uuidv4();

    const event: ProctorEvent = {
      eventId,
      interviewId,
      candidateId,
      eventType: ProctorEventType.STATUS,
      severity: "low",
      title: `Candidate ${status}`,
      description: `Candidate status changed to: ${status}`,
      metadata: details,
      timestamp: new Date(),
    };

    this.logger
      .withInterview(interviewId, candidateId)
      .info(`Candidate status: ${status}`, {
        eventId,
        interviewId,
        candidateId,
        status,
        details,
        timestamp: event.timestamp.toISOString(),
      });

    return event;
  }

  /**
   * Log proctor action
   */
  logProctorAction(
    interviewId: string,
    proctorId: string,
    actionType: ProctorAction["actionType"],
    reason: string,
    targetCandidateId?: string,
    metadata?: Record<string, any>
  ): ProctorAction {
    const actionId = uuidv4();

    const action: ProctorAction = {
      actionId,
      interviewId,
      proctorId,
      actionType,
      targetCandidateId,
      reason,
      metadata,
      timestamp: new Date(),
    };

    this.logger
      .withInterview(interviewId, targetCandidateId)
      .info(`Proctor action: ${actionType}`, {
        actionId,
        interviewId,
        proctorId,
        actionType,
        targetCandidateId,
        reason,
        metadata,
        timestamp: action.timestamp.toISOString(),
      });

    return action;
  }

  /**
   * Log session start
   */
  logSessionStart(
    interviewId: string,
    candidateId: string,
    sessionId: string,
    metadata?: Record<string, any>
  ): void {
    this.logger
      .withInterview(interviewId, candidateId)
      .info("Interview session started", {
        interviewId,
        candidateId,
        sessionId,
        metadata,
        timestamp: new Date().toISOString(),
      });
  }

  /**
   * Log session end
   */
  logSessionEnd(
    interviewId: string,
    candidateId: string,
    sessionId: string,
    duration: number,
    exitReason: string,
    metadata?: Record<string, any>
  ): void {
    const durationMinutes = Math.round(duration / 60000);

    this.logger
      .withInterview(interviewId, candidateId)
      .info("Interview session ended", {
        interviewId,
        candidateId,
        sessionId,
        durationMinutes,
        exitReason,
        metadata,
        timestamp: new Date().toISOString(),
      });
  }

  /**
   * Log technical issue
   */
  logTechnicalIssue(
    interviewId: string,
    candidateId: string,
    issueType: string,
    message: string,
    details?: Record<string, any>
  ): void {
    this.logger
      .withInterview(interviewId, candidateId)
      .warn(`Technical issue: ${issueType}`, {
        interviewId,
        candidateId,
        issueType,
        message,
        details,
        timestamp: new Date().toISOString(),
      });
  }

  /**
   * Log anomaly detection
   */
  logAnomaly(
    interviewId: string,
    candidateId: string,
    anomalyType: string,
    confidenceScore: number,
    details?: Record<string, any>
  ): ProctorEvent {
    const eventId = uuidv4();

    const event: ProctorEvent = {
      eventId,
      interviewId,
      candidateId,
      eventType: ProctorEventType.ANOMALY,
      severity: confidenceScore > 0.8 ? "high" : "medium",
      title: `Anomaly detected: ${anomalyType}`,
      description: `Potential ${anomalyType} detected with ${(confidenceScore * 100).toFixed(1)}% confidence`,
      metadata: {
        ...details,
        confidenceScore,
      },
      timestamp: new Date(),
    };

    this.logger
      .withInterview(interviewId, candidateId)
      .warn(`Anomaly: ${anomalyType}`, {
        eventId,
        interviewId,
        candidateId,
        anomalyType,
        confidenceScore,
        details,
        timestamp: event.timestamp.toISOString(),
      });

    return event;
  }

  /**
   * Determine severity based on violation type
   */
  private determineSeverity(
    violation: ViolationType
  ): "low" | "medium" | "high" | "critical" {
    const criticalViolations = [
      ViolationType.MULTIPLE_PEOPLE,
      ViolationType.BROWSER_DEVTOOLS,
      ViolationType.DUPLICATE_SESSION,
    ];

    const highSeverityViolations = [
      ViolationType.TAB_SWITCH,
      ViolationType.NO_FACE_DETECTED,
      ViolationType.EXTERNAL_MATERIAL,
    ];

    const mediumSeverityViolations = [
      ViolationType.WINDOW_MINIMIZE,
      ViolationType.FACE_NOT_CENTERED,
      ViolationType.EXCESSIVE_MOVEMENT,
      ViolationType.PHONE_DETECTED,
    ];

    if (criticalViolations.includes(violation)) return "critical";
    if (highSeverityViolations.includes(violation)) return "high";
    if (mediumSeverityViolations.includes(violation)) return "medium";
    return "low";
  }

  /**
   * Get violation title
   */
  private getViolationTitle(violation: ViolationType): string {
    const titles: Record<ViolationType, string> = {
      [ViolationType.TAB_SWITCH]: "Tab Switch Detected",
      [ViolationType.WINDOW_MINIMIZE]: "Window Minimized",
      [ViolationType.SCREEN_SHARE_DETECTED]: "Screen Share Detected",
      [ViolationType.MULTIPLE_MONITORS]: "Multiple Monitors Detected",
      [ViolationType.NO_FACE_DETECTED]: "Face Not Detected",
      [ViolationType.FACE_NOT_CENTERED]: "Face Not Centered",
      [ViolationType.LOW_LIGHTING]: "Low Lighting Detected",
      [ViolationType.POOR_AUDIO_QUALITY]: "Poor Audio Quality",
      [ViolationType.EXCESSIVE_MOVEMENT]: "Excessive Movement",
      [ViolationType.LOOKING_AWAY]: "Looking Away",
      [ViolationType.TALKING_DETECTED]: "Talking Detected",
      [ViolationType.MULTIPLE_PEOPLE]: "Multiple People in Frame",
      [ViolationType.PHONE_DETECTED]: "Phone Detected",
      [ViolationType.EXTERNAL_MATERIAL]: "External Material Detected",
      [ViolationType.HAND_RAISED]: "Hand Raised",
      [ViolationType.CONNECTION_LOSS]: "Connection Loss",
      [ViolationType.TIMEOUT]: "Session Timeout",
      [ViolationType.BROWSER_DEVTOOLS]: "Browser DevTools Detected",
      [ViolationType.DUPLICATE_SESSION]: "Duplicate Session Detected",
      [ViolationType.UNAUTHORIZED_EXIT]: "Unauthorized Exit",
      [ViolationType.OTHER]: "Unknown Violation",
    };

    return titles[violation] || "Unknown Violation";
  }

  /**
   * Get violation description
   */
  private getViolationDescription(violation: ViolationType): string {
    const descriptions: Record<ViolationType, string> = {
      [ViolationType.TAB_SWITCH]: "Candidate switched to another browser tab during interview",
      [ViolationType.WINDOW_MINIMIZE]: "Candidate minimized the browser window",
      [ViolationType.SCREEN_SHARE_DETECTED]: "Screen sharing detected on candidate system",
      [ViolationType.MULTIPLE_MONITORS]: "Multiple monitor setup detected",
      [ViolationType.NO_FACE_DETECTED]: "Candidate face not detected in video",
      [ViolationType.FACE_NOT_CENTERED]: "Candidate face not properly centered in frame",
      [ViolationType.LOW_LIGHTING]: "Low lighting conditions detected",
      [ViolationType.POOR_AUDIO_QUALITY]: "Poor audio quality from microphone",
      [ViolationType.EXCESSIVE_MOVEMENT]: "Excessive movement detected",
      [ViolationType.LOOKING_AWAY]: "Candidate looking away from screen",
      [ViolationType.TALKING_DETECTED]: "Candidate talking during interview",
      [ViolationType.MULTIPLE_PEOPLE]: "Multiple people detected in frame",
      [ViolationType.PHONE_DETECTED]: "Phone or external device detected",
      [ViolationType.EXTERNAL_MATERIAL]: "External material (papers, devices) detected",
      [ViolationType.HAND_RAISED]: "Candidate hand raised abnormally",
      [ViolationType.CONNECTION_LOSS]: "Network connection lost",
      [ViolationType.TIMEOUT]: "Session timeout detected",
      [ViolationType.BROWSER_DEVTOOLS]: "Browser developer tools detected",
      [ViolationType.DUPLICATE_SESSION]: "Duplicate session detected",
      [ViolationType.UNAUTHORIZED_EXIT]: "Candidate exited without authorization",
      [ViolationType.OTHER]: "An unknown violation was detected",
    };

    return descriptions[violation] || "Unknown violation occurred";
  }
}

/**
 * Singleton instance for proctoring event logging
 */
export const proctoringLogger = new ProctoringEventLogger();

/**
 * Audit log for proctoring events
 * Can be used to generate compliance reports
 */
export class ProctoringAuditLog {
  private events: ProctorEvent[] = [];
  private actions: ProctorAction[] = [];

  /**
   * Add event to audit log
   */
  addEvent(event: ProctorEvent): void {
    this.events.push(event);
  }

  /**
   * Add action to audit log
   */
  addAction(action: ProctorAction): void {
    this.actions.push(action);
  }

  /**
   * Get events for interview
   */
  getInterviewEvents(interviewId: string): ProctorEvent[] {
    return this.events.filter((e) => e.interviewId === interviewId);
  }

  /**
   * Get actions for interview
   */
  getInterviewActions(interviewId: string): ProctorAction[] {
    return this.actions.filter((a) => a.interviewId === interviewId);
  }

  /**
   * Get events by severity
   */
  getEventsBySeverity(interviewId: string, severity: ProctorEvent["severity"]): ProctorEvent[] {
    return this.getInterviewEvents(interviewId).filter((e) => e.severity === severity);
  }

  /**
   * Export audit log as JSON
   */
  export(interviewId: string): Record<string, any> {
    return {
      interviewId,
      exportedAt: new Date().toISOString(),
      events: this.getInterviewEvents(interviewId),
      actions: this.getInterviewActions(interviewId),
      summary: {
        totalViolations: this.getInterviewEvents(interviewId).filter(
          (e) => e.eventType === ProctorEventType.VIOLATION
        ).length,
        criticalViolations: this.getEventsBySeverity(interviewId, "critical").length,
        highSeverityViolations: this.getEventsBySeverity(interviewId, "high").length,
        totalProctorActions: this.getInterviewActions(interviewId).length,
      },
    };
  }
}

/**
 * Singleton instance for audit logging
 */
export const proctoringAuditLog = new ProctoringAuditLog();
