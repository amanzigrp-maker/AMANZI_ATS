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

import { trackFailure } from "../config/sentry.config";

const candidateSocketsByInterview = new Map<string, Set<string>>();
const interviewByCandidateSocket = new Map<string, string>();

const saveProctorEvent = async (data: ProctorEvent) => {
  try {
    await pool.query(
      "INSERT INTO proctoring_logs (interview_id, candidate_id, type, detail, timestamp) VALUES ($1, $2, $3, $4, $5)",
      [data.interviewId, data.candidateId, data.type, data.detail, data.timestamp]
    );
  } catch (err) {
    trackFailure("WebSocket.ProctorEventSave", err, { eventData: data });
  }
};

const printProctoringReport = async (candidateId: string, interviewId: string) => {
  try {
    const result = await pool.query(
      "SELECT type, detail, timestamp FROM proctoring_logs WHERE interview_id = $1 AND candidate_id = $2 ORDER BY timestamp ASC",
      [interviewId, candidateId]
    );
    const logs = result.rows;

    const totalWarnings = logs.filter(log => log.type === 'warning').length;
    const totalViolations = logs.filter(log => log.type === 'violation').length;

    // Compile breakdowns
    const warningBreakdown: Record<string, number> = {};
    const violationBreakdown: Record<string, number> = {};

    logs.forEach(log => {
      const detailStr = String(log.detail || '');
      const detailClean = detailStr.split(':')[0] || detailStr;
      if (log.type === 'warning') {
        warningBreakdown[detailClean] = (warningBreakdown[detailClean] || 0) + 1;
      } else if (log.type === 'violation') {
        violationBreakdown[detailClean] = (violationBreakdown[detailClean] || 0) + 1;
      }
    });

    // Format visual report in backend node terminal
    console.log("\n\x1b[1;36m===================================================================\x1b[0m");
    console.log(`\x1b[1;33m🛡️  CANDIDATE PROCTORING AUDIT REPORT  \x1b[0m`);
    console.log(`\x1b[1;36m===================================================================\x1b[0m`);
    console.log(`\x1b[1mCandidate ID:\x1b[0m  \x1b[32m${candidateId}\x1b[0m`);
    console.log(`\x1b[1mInterview ID:\x1b[0m  \x1b[32m${interviewId}\x1b[0m`);
    console.log(`\x1b[1mTimestamp:\x1b[0m     ${new Date().toLocaleString()}`);
    console.log("\x1b[1;36m-------------------------------------------------------------------\x1b[0m");
    console.log(`\x1b[1mTOTAL WARNINGS   :\x1b[0m  \x1b[1;33m${totalWarnings}\x1b[0m`);
    console.log(`\x1b[1mTOTAL VIOLATIONS :\x1b[0m  \x1b[1;31m${totalViolations}\x1b[0m`);
    console.log("\x1b[1;36m-------------------------------------------------------------------\x1b[0m");
    
    if (Object.keys(warningBreakdown).length > 0) {
      console.log(`\x1b[1;33m⚠️  Warning Details (Breakdown):\x1b[0m`);
      Object.entries(warningBreakdown).forEach(([name, count]) => {
        console.log(`   • \x1b[1m${name}\x1b[0m: \x1b[33m${count} time(s)\x1b[0m`);
      });
    } else {
      console.log(`\x1b[1;32m✅ No warning events recorded.\x1b[0m`);
    }

    console.log("");
    if (Object.keys(violationBreakdown).length > 0) {
      console.log(`\x1b[1;31m🚨 Violation Details (Breakdown):\x1b[0m`);
      Object.entries(violationBreakdown).forEach(([name, count]) => {
        console.log(`   • \x1b[1m${name}\x1b[0m: \x1b[31m${count} time(s)\x1b[0m`);
      });
    } else {
      console.log(`\x1b[1;32m✅ No critical warning limit violations or session blocks recorded.\x1b[0m`);
    }

    console.log("\x1b[1;36m-------------------------------------------------------------------\x1b[0m");
    console.log(`\x1b[1;35m📊 SUSPICION SCORE SUMMARY:\x1b[0m`);
    
    // Quick estimation of score matching backend score calculator
    let suspicionScore = 0;
    logs.forEach(log => {
      const detail = String(log.detail || '').toLowerCase();
      if (detail.includes('fullscreen exited')) suspicionScore += 25;
      else if (detail.includes('tab switch') || detail.includes('switched tabs')) suspicionScore += 30;
      else if (detail.includes('devtools') || detail.includes('developer tools') || detail.includes('debugger')) suspicionScore += 40;
      else if (detail.includes('keyboard violation') || detail.includes('shortcut')) suspicionScore += 15;
      else if (detail.includes('right-click') || detail.includes('context menu')) suspicionScore += 5;
      else if (detail.includes('audio') || detail.includes('noise')) suspicionScore += 10;
      else if (detail.includes('multiple faces')) suspicionScore += 25;
      else if (detail.includes('no face')) suspicionScore += 15;
      else if (detail.includes('gaze') || detail.includes('looking away')) suspicionScore += 15;
    });
    suspicionScore = Math.min(100, suspicionScore);
    
    let scoreColor = "\x1b[32m"; // Green
    if (suspicionScore > 60) scoreColor = "\x1b[31m"; // Red
    else if (suspicionScore > 30) scoreColor = "\x1b[33m"; // Yellow
    
    console.log(`   Estimated Suspicion Score: ${scoreColor}${suspicionScore}/100\x1b[0m`);
    console.log("\x1b[1;36m===================================================================\x1b[0m\n");
  } catch (err) {
    console.error("Error generating terminal audit report:", err);
  }
};

export const setupSocketHandlers = (io: Server) => {
  logInfo("Setting up Socket.io handlers...");

  io.on("connection", (socket: Socket) => {
    logDebug(`New client connected: ${socket.id}`);

    socket.on("join-interview", async (data: { interviewId: string; candidateId?: string; role: "candidate" | "admin" }) => {
      const room = `interview-${data.interviewId}`;
      socket.join(room);
      logDebug(`Socket ${socket.id} joined room ${room} as ${data.role}`);

      if (data.role === "candidate") {
        const activeSockets = candidateSocketsByInterview.get(data.interviewId) ?? new Set<string>();
        const existingSockets = [...activeSockets].filter((socketId) => io.sockets.sockets.has(socketId));
        activeSockets.forEach((socketId) => {
          if (!io.sockets.sockets.has(socketId)) activeSockets.delete(socketId);
        });
        let shouldTrackAsActiveCandidate = true;

        if (existingSockets.length > 0) {
          shouldTrackAsActiveCandidate = false;
          const timestamp = new Date().toISOString();
          const detail = "This examination link is already active in another browser tab or session.";
          const event: ProctorEvent = {
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

        if (shouldTrackAsActiveCandidate) {
          activeSockets.add(socket.id);
          candidateSocketsByInterview.set(data.interviewId, activeSockets);
          interviewByCandidateSocket.set(socket.id, data.interviewId);
          socket.to(room).emit("candidate-status", { socketId: socket.id, status: "online" });
        }
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
      
      // Explicitly log proctor event to backend console for user visibility during interview
      logInfo(`[PROCTOR MOVEMENT] Type: ${data.type} | Candidate: ${data.candidateId} | Interview: ${data.interviewId} | Detail: ${data.detail}`);

      socket.to(room).emit("proctor-event-admin", data);

      await saveProctorEvent(data);
      await printProctoringReport(data.candidateId, data.interviewId);
    });

    socket.on("toggle-live-monitoring", (data: { interviewId: string; enabled: boolean }) => {
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

export const getProctoringLogs = async (interviewId: string) => {
  const result = await pool.query(
    "SELECT * FROM proctoring_logs WHERE interview_id = $1 ORDER BY timestamp DESC",
    [interviewId]
  );
  return result.rows;
};

export const calculateSuspicionScore = async (interviewId: string) => {
  const logs = await getProctoringLogs(interviewId);
  let score = 0;
  const breakdown: Record<string, number> = {};

  logs.forEach((log: any) => {
    const detail = String(log.detail || '').toLowerCase();
    const type = String(log.type || '').toLowerCase();
    const title = String(log.type || '');

    let points = 0;
    if (detail.includes('fullscreen exited')) {
      points = 25;
    } else if (detail.includes('tab switch') || detail.includes('switched tabs')) {
      points = 30;
    } else if (detail.includes('devtools') || detail.includes('developer tools') || detail.includes('debugger')) {
      points = 40;
    } else if (detail.includes('keyboard violation') || detail.includes('shortcut')) {
      points = 15;
    } else if (detail.includes('right-click') || detail.includes('context menu')) {
      points = 5;
    } else if (detail.includes('audio') || detail.includes('noise')) {
      points = 10;
    } else if (detail.includes('multiple faces')) {
      points = 25;
    } else if (detail.includes('no face')) {
      points = 15;
    } else if (detail.includes('eye') || detail.includes('gaze') || detail.includes('head turn') || detail.includes('looking away')) {
      points = 15;
    }

    if (points > 0) {
      breakdown[title] = (breakdown[title] || 0) + points;
      score += points;
    }
  });

  return {
    score: Math.min(100, score),
    breakdown,
    timeline: logs.map((log: any) => ({
      type: log.type,
      detail: log.detail,
      timestamp: log.timestamp
    }))
  };
};
