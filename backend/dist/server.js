// -----------------------------------------------------------------------------
// ENV SETUP (MUST BE FIRST)
// -----------------------------------------------------------------------------
import { fileURLToPath } from "url";
import path from "path";
import { config, isProduction } from "./src/config/env.config";
import { installConsoleFilters } from "./src/lib/logging";
installConsoleFilters();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
import { SessionJobsService } from "./src/modules/interview-session/session-jobs.service";
import { secureHeaders } from "./src/middleware/security.middleware";
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
import certificateRoutes from "./src/routes/certificate.routes";
import sessionRoutes from "./src/routes/session.routes";
import { ExamResumptionModule } from "./src/modules/exam-resumption/exam-resumption.module";
import enterpriseSecurityRoutes from "./src/modules/enterprise-security/enterprise-security.routes";
// -----------------------------------------------------------------------------
// APP SETUP
// -----------------------------------------------------------------------------
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: config.FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});
const PORT = config.PORT;
// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------
app.use(cors({ origin: config.FRONTEND_URL }));
app.use(secureHeaders);
app.get("/favicon.ico", (_, res) => res.sendStatus(204));
app.get("/api/health", (_, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
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
app.use("/api/certificates", certificateRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/enterprise-security", enterpriseSecurityRoutes);
// Setup Socket.io Handlers
setupSocketHandlers(io);
// -----------------------------------------------------------------------------
// GLOBAL ERROR HANDLER
// -----------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
    console.error("----- UNHANDLED ERROR -----");
    console.error(err);
    console.error("----- END ERROR -----");
    res.status(500).json({
        message: isProduction
            ? "Internal server error"
            : err.message
    });
});
// -----------------------------------------------------------------------------
// PRODUCTION STATIC FILES
// -----------------------------------------------------------------------------
if (isProduction) {
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
const gracefulShutdown = async (signal) => {
    console.log(`\n🔄 Received ${signal}. Shutting down...`);
    // Force exit after 5 seconds if cleanup hangs
    const forceExit = setTimeout(() => {
        console.log("⚠️ Shutdown timed out, forcing exit.");
        process.exit(1);
    }, 5000);
    try {
        await aiWorkerService.shutdown();
        await pool.end();
        clearTimeout(forceExit);
        console.log("✅ Shutdown complete");
        process.exit(0);
    }
    catch (err) {
        console.error("❌ Shutdown failed:", err);
        process.exit(1);
    }
};
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
const bootstrapServer = async () => {
    try {
        console.log("🚀 Starting bootstrap...");
        console.log("Initializing database connection...");
        const connected = await testConnection();
        if (!connected) {
            console.error("❌ Database connection failed.");
            process.exit(1);
        }
        console.log("✅ Database connection verified.");
        // Start background workers
        ExamResumptionModule.init();
        SessionJobsService.start();
        httpServer.listen(PORT, config.HOST, () => {
            console.log(`📡 Server running on port ${PORT}`);
            console.log(`🌍 Accessible at http://${config.HOST}:${PORT}`);
            console.log("⚡ ATS Monolithic Application ready with Socket.io!");
        });
        console.log("🤖 Initializing AI Worker in background...");
        void aiWorkerService.initialize()
            .then(() => {
            console.log("✅ AI Worker ready");
        })
            .catch((err) => {
            console.error("❌ AI Worker failed to initialize:", err);
        });
    }
    catch (error) {
        console.error("💥 Failed to start server:", error);
        process.exit(1);
    }
};
bootstrapServer();
