// -----------------------------------------------------------------------------
// ENV SETUP (MUST BE FIRST)
// -----------------------------------------------------------------------------
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "..", ".env"),
  override: true
});

// -----------------------------------------------------------------------------
// CORE IMPORTS
// -----------------------------------------------------------------------------
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

// -----------------------------------------------------------------------------
// INTERNAL IMPORTS
// -----------------------------------------------------------------------------
import { testConnection, pool } from "./src/lib/database";
import { aiWorkerService } from "./src/services/ai-worker.service";
import { setupSocketHandlers } from "./src/services/proctoring.service";

// -----------------------------------------------------------------------------
// ROUTES IMPORTS
// -----------------------------------------------------------------------------
import authRoutes from "./src/routes/auth.routes";
import passwordResetRoutes from "./src/routes/password-reset.routes";
import userRoutes from "./src/routes/user.routes";
import adminRoutes from "./src/routes/admin.routes";
import resumeRoutes from "./src/routes/resume.routes";
import candidateRoutes from "./src/routes/candidate.routes";
import jobRoutes from "./src/routes/job.routes";
import dashboardRoutes from "./src/routes/dashboard.routes";
import reportsRoutes from "./src/routes/reports.routes";
import applicationRoutes from "./src/routes/application.routes";
import notificationRoutes from "./src/routes/notification.routes";
import searchRoutes from "./src/routes/search.routes";
import recommendationRoutes from "./src/routes/recommendation.routes";
import interviewRoutes from "./src/routes/interview.routes";
import adaptiveInterviewRoutes from "./src/routes/adaptiveInterview.routes";
import assessmentRoutes from "./src/routes/assessment.routes";

// -----------------------------------------------------------------------------
// APP SETUP
// -----------------------------------------------------------------------------
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = Number(process.env.PORT) || 3003;

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------
app.use(cors());

app.get("/favicon.ico", (_, res) => res.sendStatus(204));

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/interview/adaptive", adaptiveInterviewRoutes);
app.use("/api/assessments", assessmentRoutes);

// Setup Socket.io Handlers
setupSocketHandlers(io);

// -----------------------------------------------------------------------------
// GLOBAL ERROR HANDLER
// -----------------------------------------------------------------------------
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("----- UNHANDLED ERROR -----");
    console.error(err);
    console.error("----- END ERROR -----");

    res.status(500).json({
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message
    });
  }
);

// -----------------------------------------------------------------------------
// PRODUCTION STATIC FILES
// -----------------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));

  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    }
  });
}

// -----------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// -----------------------------------------------------------------------------
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🔄 Received ${signal}. Shutting down...`);

  try {
    await aiWorkerService.shutdown();
    await pool.end();
    console.log("✅ Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Shutdown failed:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------
const startServer = async () => {
  try {
    console.log("🔌 Testing database connection...");

    const connected = await testConnection();

    if (!connected) {
      console.error("❌ Database connection failed.");
      process.exit(1);
    }

    console.log("🤖 Initializing AI Worker...");
    await aiWorkerService.initialize();

    // IMPORTANT: expose server to internet (EC2 fix)
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Accessible at http://<YOUR-EC2-IP>:${PORT}`);
      console.log("✅ ATS Monolithic Application ready with Socket.io!");
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

const bootstrapServer = async () => {
  try {
    console.log("Testing database connection...");

    const connected = await testConnection();

    if (!connected) {
      console.error("Database connection failed.");
      process.exit(1);
    }

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Accessible at http://<YOUR-EC2-IP>:${PORT}`);
      console.log("ATS Monolithic Application ready with Socket.io!");
    });

    console.log("Initializing AI Worker in background...");
    void aiWorkerService.initialize()
      .then(() => {
        console.log("AI Worker warmup complete");
      })
      .catch((err) => {
        console.error("AI Worker failed to initialize:", err);
      });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

bootstrapServer();
