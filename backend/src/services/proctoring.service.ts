import { Server, Socket } from "socket.io";
import { pool } from "../lib/database";

interface ProctorEvent {
  candidateId: string;
  interviewId: string;
  type: "violation" | "warning" | "status";
  detail: string;
  timestamp: string;
}

export const setupSocketHandlers = (io: Server) => {
  console.log("🛠️  Setting up Socket.io handlers...");

  io.on("connection", (socket: Socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // Join room based on interview ID
    socket.on("join-interview", (data: { interviewId: string; role: "candidate" | "admin" }) => {
      const room = `interview-${data.interviewId}`;
      socket.join(room);
      console.log(`👤 Socket ${socket.id} joined room ${room} as ${data.role}`);
      
      if (data.role === "candidate") {
        socket.to(room).emit("candidate-status", { socketId: socket.id, status: "online" });
      }
    });

    // WebRTC Signaling
    socket.on("signal", (data: { target: string; signal: any; interviewId: string }) => {
      const room = `interview-${data.interviewId}`;
      console.log(`📡 Signaling from ${socket.id} to ${data.target} in room ${room}`);
      // In a simple setup, we might broadcast or target specifically.
      // If target is provided, send to that specific socket.
      if (data.target) {
        socket.to(data.target).emit("signal", { from: socket.id, signal: data.signal });
      } else {
        // Broadcast to admin/candidate in the same room
        socket.to(room).emit("signal", { from: socket.id, signal: data.signal });
      }
    });

    // Proctoring Events (Violations, Warnings)
    socket.on("proctor-event", async (data: ProctorEvent) => {
      const room = `interview-${data.interviewId}`;
      console.log(`⚠️  Proctor Event: ${data.type} - ${data.detail} for interview ${data.interviewId}`);

      // Broadcast to admin in the same room
      socket.to(room).emit("proctor-event-admin", data);

      // Store in database
      try {
        await pool.query(
          "INSERT INTO proctoring_logs (interview_id, candidate_id, type, detail, timestamp) VALUES ($1, $2, $3, $4, $5)",
          [data.interviewId, data.candidateId, data.type, data.detail, data.timestamp]
        );
      } catch (err) {
        console.error("❌ Failed to save proctor log:", err);
      }
    });

    // Live Monitoring Toggle (Admin control)
    socket.on("toggle-live-monitoring", (data: { interviewId: string; enabled: boolean }) => {
      const room = `interview-${data.interviewId}`;
      socket.to(room).emit("live-monitoring-changed", { enabled: data.enabled });
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });
};

/**
 * Helper to fetch proctoring logs for an interview
 */
export const getProctoringLogs = async (interviewId: string) => {
  const result = await pool.query(
    "SELECT * FROM proctoring_logs WHERE interview_id = $1 ORDER BY timestamp DESC",
    [interviewId]
  );
  return result.rows;
};
