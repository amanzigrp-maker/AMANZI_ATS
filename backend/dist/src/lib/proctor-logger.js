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
export var ProctorEventType;
(function (ProctorEventType) {
    ProctorEventType["VIOLATION"] = "violation";
    ProctorEventType["WARNING"] = "warning";
    ProctorEventType["STATUS"] = "status";
    ProctorEventType["ACTION"] = "action";
    ProctorEventType["ALERT"] = "alert";
    ProctorEventType["ANOMALY"] = "anomaly";
})(ProctorEventType || (ProctorEventType = {}));
export var ViolationType;
(function (ViolationType) {
    // Screen/window violations
    ViolationType["TAB_SWITCH"] = "tab_switch";
    ViolationType["WINDOW_MINIMIZE"] = "window_minimize";
    ViolationType["SCREEN_SHARE_DETECTED"] = "screen_share_detected";
    ViolationType["MULTIPLE_MONITORS"] = "multiple_monitors";
    // Camera/audio violations
    ViolationType["NO_FACE_DETECTED"] = "no_face_detected";
    ViolationType["FACE_NOT_CENTERED"] = "face_not_centered";
    ViolationType["LOW_LIGHTING"] = "low_lighting";
    ViolationType["POOR_AUDIO_QUALITY"] = "poor_audio_quality";
    // Behavior violations
    ViolationType["EXCESSIVE_MOVEMENT"] = "excessive_movement";
    ViolationType["LOOKING_AWAY"] = "looking_away";
    ViolationType["TALKING_DETECTED"] = "talking_detected";
    ViolationType["MULTIPLE_PEOPLE"] = "multiple_people";
    // Environment violations
    ViolationType["PHONE_DETECTED"] = "phone_detected";
    ViolationType["EXTERNAL_MATERIAL"] = "external_material";
    ViolationType["HAND_RAISED"] = "hand_raised";
    // Technical violations
    ViolationType["CONNECTION_LOSS"] = "connection_loss";
    ViolationType["TIMEOUT"] = "timeout";
    ViolationType["BROWSER_DEVTOOLS"] = "browser_devtools";
    // Other
    ViolationType["DUPLICATE_SESSION"] = "duplicate_session";
    ViolationType["UNAUTHORIZED_EXIT"] = "unauthorized_exit";
    ViolationType["OTHER"] = "other";
})(ViolationType || (ViolationType = {}));
export class ProctoringEventLogger {
    logger;
    constructor() {
        this.logger = new StructuredLogger();
    }
    /**
     * Log violation event
     */
    logViolation(interviewId, candidateId, violation, details) {
        const eventId = uuidv4();
        const correlationId = uuidv4();
        const event = {
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
        }
        else if (logLevel === "warn") {
            this.logger
                .withInterview(interviewId, candidateId)
                .warn(`Proctoring violation: ${event.title}`, logData);
        }
        else {
            this.logger
                .withInterview(interviewId, candidateId)
                .info(`Proctoring violation: ${event.title}`, logData);
        }
        return event;
    }
    /**
     * Log warning event
     */
    logWarning(interviewId, candidateId, warningType, message, details) {
        const eventId = uuidv4();
        const event = {
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
    logStatus(interviewId, candidateId, status, details) {
        const eventId = uuidv4();
        const event = {
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
    logProctorAction(interviewId, proctorId, actionType, reason, targetCandidateId, metadata) {
        const actionId = uuidv4();
        const action = {
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
    logSessionStart(interviewId, candidateId, sessionId, metadata) {
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
    logSessionEnd(interviewId, candidateId, sessionId, duration, exitReason, metadata) {
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
    logTechnicalIssue(interviewId, candidateId, issueType, message, details) {
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
    logAnomaly(interviewId, candidateId, anomalyType, confidenceScore, details) {
        const eventId = uuidv4();
        const event = {
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
    determineSeverity(violation) {
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
        if (criticalViolations.includes(violation))
            return "critical";
        if (highSeverityViolations.includes(violation))
            return "high";
        if (mediumSeverityViolations.includes(violation))
            return "medium";
        return "low";
    }
    /**
     * Get violation title
     */
    getViolationTitle(violation) {
        const titles = {
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
    getViolationDescription(violation) {
        const descriptions = {
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
    events = [];
    actions = [];
    /**
     * Add event to audit log
     */
    addEvent(event) {
        this.events.push(event);
    }
    /**
     * Add action to audit log
     */
    addAction(action) {
        this.actions.push(action);
    }
    /**
     * Get events for interview
     */
    getInterviewEvents(interviewId) {
        return this.events.filter((e) => e.interviewId === interviewId);
    }
    /**
     * Get actions for interview
     */
    getInterviewActions(interviewId) {
        return this.actions.filter((a) => a.interviewId === interviewId);
    }
    /**
     * Get events by severity
     */
    getEventsBySeverity(interviewId, severity) {
        return this.getInterviewEvents(interviewId).filter((e) => e.severity === severity);
    }
    /**
     * Export audit log as JSON
     */
    export(interviewId) {
        return {
            interviewId,
            exportedAt: new Date().toISOString(),
            events: this.getInterviewEvents(interviewId),
            actions: this.getInterviewActions(interviewId),
            summary: {
                totalViolations: this.getInterviewEvents(interviewId).filter((e) => e.eventType === ProctorEventType.VIOLATION).length,
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
