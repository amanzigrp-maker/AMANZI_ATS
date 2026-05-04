import { Server, Socket } from "socket.io";
import { pool } from "../lib/database";
import { logDebug, logInfo } from "../lib/logging";

interface ProctorEvent {
  candidateId: string;
  interviewId: string;
  type: "violation" | "warning" | "status";
  detail: string;
  timestamp: string;
}

export const setupSocketHandlers = (io: Server) => {
  logInfo("Setting up Socket.io handlers...");

  io.on("connection", (socket: Socket) => {
    logDebug(`New client connected: ${socket.id}`);

    socket.on("join-interview", (data: { interviewId: string; role: "candidate" | "admin" }) => {
      const room = `interview-${data.interviewId}`;
      socket.join(room);
      logDebug(`Socket ${socket.id} joined room ${room} as ${data.role}`);

      if (data.role === "candidate") {
        socket.to(room).emit("candidate-status", { socketId: socket.id, status: "online" });
      }
    });

    socket.on("signal", (data: { target: string; signal: any; interviewId: string }) => {
      const room = `interview-${data.interviewId}`;
      logDebug(`Signaling from ${socket.id} to ${data.target || room}`);
      if (data.target) {
        socket.to(data.target).emit("signal", { from: socket.id, signal: data.signal });
      } else {
        socket.to(room).emit("signal", { from: socket.id, signal: data.signal });
      }
    });

    socket.on("proctor-event", async (data: ProctorEvent) => {
      const room = `interview-${data.interviewId}`;
      logDebug(`Proctor Event: ${data.type} for interview ${data.interviewId}`);
      socket.to(room).emit("proctor-event-admin", data);

      try {
        await pool.query(
          "INSERT INTO proctoring_logs (interview_id, candidate_id, type, detail, timestamp) VALUES ($1, $2, $3, $4, $5)",
          [data.interviewId, data.candidateId, data.type, data.detail, data.timestamp]
        );
      } catch (err) {
        console.error("Failed to save proctor log:", err);
      }
    });

    socket.on("toggle-live-monitoring", (data: { interviewId: string; enabled: boolean }) => {
      const room = `interview-${data.interviewId}`;
      socket.to(room).emit("live-monitoring-changed", { enabled: data.enabled });
    });

    socket.on("disconnect", () => {
      logDebug(`Client disconnected: ${socket.id}`);
    });
  });
};

export const getProctoringLogs = async (interviewId: string) => {
  const result = await pool.query(
    "SELECT * FROM proctoring_logs WHERE interview_id = $1 ORDER BY timestamp DESC",
    [interviewId]
  );
  return result.rows;
};
