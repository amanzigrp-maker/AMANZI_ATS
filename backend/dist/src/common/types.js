export var SessionState;
(function (SessionState) {
    SessionState["CREATED"] = "CREATED";
    SessionState["SENT"] = "SENT";
    SessionState["OPENED"] = "OPENED";
    SessionState["VERIFIED"] = "VERIFIED";
    SessionState["STARTED"] = "STARTED";
    SessionState["ACTIVE"] = "ACTIVE";
    SessionState["PAUSED"] = "PAUSED";
    SessionState["SUBMITTED"] = "SUBMITTED";
    SessionState["EXPIRED"] = "EXPIRED";
    SessionState["BLOCKED"] = "BLOCKED";
    SessionState["TERMINATED"] = "TERMINATED";
})(SessionState || (SessionState = {}));
export var DifficultyLevel;
(function (DifficultyLevel) {
    DifficultyLevel["BASIC"] = "basic";
    DifficultyLevel["MEDIUM"] = "medium";
    DifficultyLevel["ADVANCED"] = "advanced";
    DifficultyLevel["EXPERT"] = "expert";
})(DifficultyLevel || (DifficultyLevel = {}));
export var CognitiveLevel;
(function (CognitiveLevel) {
    CognitiveLevel["RECALL"] = "recall";
    CognitiveLevel["APPLY"] = "apply";
    CognitiveLevel["ANALYZE"] = "analyze";
    CognitiveLevel["EVALUATE"] = "evaluate";
})(CognitiveLevel || (CognitiveLevel = {}));
export class EnterpriseError extends Error {
    message;
    code;
    status;
    constructor(message, code, status = 500) {
        super(message);
        this.message = message;
        this.code = code;
        this.status = status;
    }
}
