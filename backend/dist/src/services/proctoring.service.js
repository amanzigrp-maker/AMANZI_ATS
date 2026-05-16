import { pool } from "../lib/database";
import { logDebug, logInfo } from "../lib/logging";
const candidateSocketsByInterview = new Map();
const interviewByCandidateSocket = new Map();
const saveProctorEvent = async (data) => {
    try {
        await pool.query("INSERT INTO proctoring_logs (interview_id, candidate_id, type, detail, timestamp) VALUES ($1, $2, $3, $4, $5)", [data.interviewId, data.candidateId, data.type, data.detail, data.timestamp]);
    }
    catch (err) {
        console.error("Failed to save proctor log:", err);
    }
};
export const setupSocketHandlers = (io) => {
    logInfo("Setting up Socket.io handlers...");
    io.on("connection", (socket) => {
        logDebug(`New client connected: ${socket.id}`);
        socket.on("join-interview", async (data) => {
            const room = `interview-${data.interviewId}`;
            socket.join(room);
            logDebug(`Socket ${socket.id} joined room ${room} as ${data.role}`);
            if (data.role === "candidate") {
                const activeSockets = candidateSocketsByInterview.get(data.interviewId) ?? new Set();
                const existingSockets = [...activeSockets].filter((socketId) => io.sockets.sockets.has(socketId));
                activeSockets.forEach((socketId) => {
                    if (!io.sockets.sockets.has(socketId))
                        activeSockets.delete(socketId);
                });
                if (existingSockets.length > 0) {
                    const timestamp = new Date().toISOString();
                    const detail = "This examination link is already active in another browser tab or session.";
                    const event = {
                        candidateId: data.candidateId || "candidate",
                        interviewId: data.interviewId,
                        type: "violation",
                        detail,
                        timestamp
                    };
                    io.to(room).emit("proctor-event-admin", event);
                    socket.emit("duplicate-session-detected", {
                        blocked: true,
                        detail,
                        activeSessionCount: existingSockets.length + 1,
                        timestamp
                    });
                    existingSockets.forEach((socketId) => {
                        io.to(socketId).emit("duplicate-session-detected", {
                            blocked: false,
                            detail: "Another browser tab or session tried to open this examination link.",
                            activeSessionCount: existingSockets.length + 1,
                            timestamp
                        });
                    });
                    await saveProctorEvent(event);
                }
                activeSockets.add(socket.id);
                candidateSocketsByInterview.set(data.interviewId, activeSockets);
                interviewByCandidateSocket.set(socket.id, data.interviewId);
                socket.to(room).emit("candidate-status", { socketId: socket.id, status: "online" });
            }
        });
        socket.on("signal", (data) => {
            const room = `interview-${data.interviewId}`;
            logDebug(`Signaling from ${socket.id} to ${data.target || room}`);
            if (data.target) {
                socket.to(data.target).emit("signal", { from: socket.id, signal: data.signal });
            }
            else {
                socket.to(room).emit("signal", { from: socket.id, signal: data.signal });
            }
        });
        socket.on("proctor-event", async (data) => {
            const room = `interview-${data.interviewId}`;
            logDebug(`Proctor Event: ${data.type} for interview ${data.interviewId}`);
            socket.to(room).emit("proctor-event-admin", data);
            await saveProctorEvent(data);
        });
        socket.on("toggle-live-monitoring", (data) => {
            const room = `interview-${data.interviewId}`;
            socket.to(room).emit("live-monitoring-changed", { enabled: data.enabled });
        });
        socket.on("disconnect", () => {
            const interviewId = interviewByCandidateSocket.get(socket.id);
            if (interviewId) {
                const activeSockets = candidateSocketsByInterview.get(interviewId);
                activeSockets?.delete(socket.id);
                if (activeSockets && activeSockets.size === 0) {
                    candidateSocketsByInterview.delete(interviewId);
                }
                interviewByCandidateSocket.delete(socket.id);
            }
            logDebug(`Client disconnected: ${socket.id}`);
        });
    });
};
export const getProctoringLogs = async (interviewId) => {
    const result = await pool.query("SELECT * FROM proctoring_logs WHERE interview_id = $1 ORDER BY timestamp DESC", [interviewId]);
    return result.rows;
};
