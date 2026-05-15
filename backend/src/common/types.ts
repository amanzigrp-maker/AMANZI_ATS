
export enum SessionState {
    CREATED = 'CREATED',
    SENT = 'SENT',
    OPENED = 'OPENED',
    VERIFIED = 'VERIFIED',
    STARTED = 'STARTED',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    SUBMITTED = 'SUBMITTED',
    EXPIRED = 'EXPIRED',
    BLOCKED = 'BLOCKED',
    TERMINATED = 'TERMINATED'
}

export enum DifficultyLevel {
    BASIC = 'basic',
    MEDIUM = 'medium',
    ADVANCED = 'advanced',
    EXPERT = 'expert'
}

export enum CognitiveLevel {
    RECALL = 'recall',
    APPLY = 'apply',
    ANALYZE = 'analyze',
    EVALUATE = 'evaluate'
}

export interface QuestionBankEntry {
    id?: number;
    textContent: string;
    textHash: string;
    normalizedText?: string;
    skillCategory: string;
    subtopic?: string;
    difficultyLevel: DifficultyLevel;
    experienceLevelYears: number;
    cognitiveLevel: CognitiveLevel;
    estimatedTimeSeconds: number;
    metadata: Record<string, any>;
    version?: number;
}

export interface SimilarityResult {
    questionId: number;
    score: number;
    textContent: string;
}

export class EnterpriseError extends Error {
    constructor(public message: string, public code: string, public status: number = 500) {
        super(message);
    }
}
