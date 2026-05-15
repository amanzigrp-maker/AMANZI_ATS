
import { SessionState } from "../../../common/types";

export type DisruptionType = 
    | "NETWORK_DROP" 
    | "BROWSER_CRASH" 
    | "TAB_CLOSE" 
    | "DEVICE_REBOOT" 
    | "INACTIVITY" 
    | "SERVER_RESTART" 
    | "MANUAL_DISCONNECT" 
    | "UNKNOWN";

export type PageVisibilityState = "VISIBLE" | "HIDDEN" | "UNKNOWN";
export type NetworkQuality = "EXCELLENT" | "GOOD" | "POOR" | "OFFLINE";
export type ResumePolicy = "STRICT" | "LENIENT";

export interface AnswerMap {
    [questionId: string]: {
        answer: any;
        timestamp: string;
        time_spent_ms: number;
        is_immutable: boolean;
    };
}

export interface SkillRotationState {
    nextSkill: string;
    rotationIndex: number;
    completedSkills: string[];
}

export interface ExamSnapshot {
    id: string;
    session_id: string;
    candidate_id: string;
    snapshot_version: number;
    current_question_index: number;
    questions_served: string[];
    answers_submitted: AnswerMap;
    current_theta: number;
    skill_rotation_state: SkillRotationState;
    time_elapsed_seconds: number;
    exam_duration_seconds: number;
    time_remaining_seconds: number;
    last_heartbeat_at: Date;
    snapshot_taken_at: Date;
    resume_count: number;
    is_active: boolean;
    device_fingerprint_at_snapshot: string;
    server_node_id: string;
    checksum: string;
}

export interface SnapshotPayload {
    current_question_index: number;
    questions_served: string[];
    answers_submitted: AnswerMap;
    current_theta: number;
    skill_rotation_state: SkillRotationState;
    device_fingerprint: string;
}

export interface ResumePayload {
    resumeGranted: boolean;
    remainingSeconds: number;
    currentQuestionIndex: number;
    questionsServed: string[];
    answersSubmitted: AnswerMap;
    currentTheta: number;
    skillRotationState: SkillRotationState;
    warningMessage?: string;
    sessionToken: string;
}

export interface HeartbeatPayload {
    clientReportedRemainingSeconds: number;
    pageVisibility: PageVisibilityState;
    networkQuality: NetworkQuality;
}

export interface HeartbeatResponse {
    serverRemainingSeconds: number;
    sessionValid: boolean;
}

export interface DisruptionEvent {
    id: string;
    session_id: string;
    candidate_id: string;
    disruption_type: DisruptionType;
    disrupted_at: Date;
    resumed_at?: Date;
    time_lost_seconds: number;
    resume_device_fingerprint?: string;
    ip_at_disruption: string;
    ip_at_resume?: string;
    was_suspicious: boolean;
    recruiter_notified: boolean;
}

export interface SessionExtensionRequest {
    additionalSeconds: number;
}

export interface SnapshotChecksum {
    checksum: string;
    timestamp: string;
}
