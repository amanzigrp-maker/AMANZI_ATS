import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { ProcessMonitorService } from "./security/process-monitor.service.js";
import { GlobalShortcutLockService } from "./security/global-shortcut-lock.service.js";
import { SecureUpdateService } from "./updates/secure-update.service.js";
// GPU stability configuration switches (Task 9)
if (process.env.DISABLE_GPU === 'true' || process.env.AMANZI_DISABLE_GPU === 'true') {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
}
if (process.env.DISABLE_SOFTWARE_RASTERIZER === 'true') {
    app.commandLine.appendSwitch('disable-software-rasterizer');
}
if (process.env.IGNORE_GPU_BLACKLIST === 'true') {
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
}
const isDev = !app.isPackaged || process.env.NODE_ENV === "development" || process.env.DEBUG === "true";
const PROTOCOL = "amanzi-secure-browser";
const API_BASE_URL = process.env.AMANZI_API_BASE_URL ?? (isDev
    ? "http://localhost:3003"
    : "http://13.232.152.176:3003");
const FRONTEND_BASE_URL = process.env.AMANZI_FRONTEND_URL ?? (isDev
    ? "http://localhost:8080"
    : "http://13.232.152.176");
const DEFAULT_URL = process.env.AMANZI_EXAM_URL ?? `${FRONTEND_BASE_URL}/interview`;
let mainWindow = null;
let startupUrl = DEFAULT_URL;
let lastHeartbeatTime = Date.now();
const postSecurityEvent = async (payload) => {
    const token = process.env.SECURE_BROWSER_INGEST_TOKEN ?? process.env.AMANZI_SECURE_BROWSER_TOKEN;
    if (!token)
        return;
    await fetch(`${API_BASE_URL}/api/enterprise-security/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    }).catch(() => undefined);
};
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
}
else {
    app.setAsDefaultProtocolClient(PROTOCOL);
}
const handleDeepLink = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === `${PROTOCOL}:`) {
            let targetPath = parsed.host + parsed.pathname;
            targetPath = targetPath.replace(/^\/+/, ''); // Remove leading slashes
            const finalUrl = `${FRONTEND_BASE_URL}/${targetPath}${parsed.search}`;
            if (mainWindow) {
                void mainWindow.loadURL(finalUrl);
                if (mainWindow.isMinimized())
                    mainWindow.restore();
                mainWindow.focus();
            }
            else {
                startupUrl = finalUrl;
            }
        }
    }
    catch (err) {
        console.error("Invalid deep link payload:", err);
    }
};
// Handle Windows/Linux cold starts with URL arguments
const initialUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
if (initialUrl) {
    handleDeepLink(initialUrl);
}
// --- PHASE 4: Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}
app.on("second-instance", (event, commandLine) => {
    // Focus window on duplicate launch
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.focus();
    }
    // Parse URL from commandLine for Windows/Linux
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
        handleDeepLink(url);
    }
});
// macOS open-url event
app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});
import { dialog } from "electron";
const handleCrash = (title, message) => {
    if (!mainWindow)
        return;
    console.error(`[CRASH] ${title}: ${message}`);
    dialog.showErrorBox(title, message + "\n\nPlease restart the secure browser.");
    app.quit();
};
const createWindow = () => {
    mainWindow = new BrowserWindow({
        fullscreen: true,
        kiosk: true,
        show: false,
        webPreferences: {
            preload: path.join(app.getAppPath(), "dist", "preload", "index.js"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            devTools: isDev,
        },
    });
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    // Task 3: Electron Renderer Crash Logging & Recovery
    mainWindow.webContents.on("render-process-gone", (event, details) => {
        handleCrash("Renderer Process Gone", `Renderer process terminated unexpectedly.\n\nDetails:\nReason: ${details.reason}\nExit Code: ${details.exitCode}`);
    });
    app.on("gpu-process-crashed", () => {
        handleCrash("GPU Process Crashed", "Chromium GPU process crashed. Try launching with environment flag DISABLE_GPU=true to disable GPU acceleration.");
    });
    mainWindow.on("unresponsive", () => {
        handleCrash("Renderer Unresponsive", "Renderer process stopped responding. The main threat loop might be blocked or executing an infinite loop.");
    });
    mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
        console.error(`did-fail-load: ${validatedURL} (${errorCode}: ${errorDescription})`);
        handleCrash("Page Load Failure", `Failed to load URL: ${validatedURL}\n\nError: ${errorDescription} (${errorCode})`);
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    void mainWindow.loadURL(startupUrl);
    const shortcuts = new GlobalShortcutLockService();
    shortcuts.lock((accelerator) => {
        void postSecurityEvent({
            eventType: "secure_browser.shortcut_blocked",
            severity: "medium",
            source: "secure-browser",
            payload: { accelerator },
        });
    });
    const monitor = new ProcessMonitorService((threat) => {
        void postSecurityEvent({
            eventType: "secure_browser.process_detected",
            severity: threat.action === "close_exam" ? "critical" : "high",
            source: "secure-browser",
            payload: threat,
        });
        if (threat.action === "close_exam" && mainWindow) {
            void mainWindow.loadURL(`${startupUrl}?securityHold=process`);
        }
    });
    monitor.start();
    // Start Heartbeat Checker
    lastHeartbeatTime = Date.now();
    const heartbeatChecker = setInterval(() => {
        if (!mainWindow)
            return;
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
        if (timeSinceLastHeartbeat > 15000) {
            handleCrash("Renderer Heartbeat Timeout", "The renderer process has stopped responding. The main loop might be blocked or executing an infinite loop.");
            clearInterval(heartbeatChecker);
        }
    }, 5000);
    mainWindow.on("closed", () => {
        shortcuts.unlock();
        monitor.stop();
        clearInterval(heartbeatChecker);
        mainWindow = null;
    });
};
app.whenReady().then(async () => {
    new SecureUpdateService().configure();
    createWindow();
});
ipcMain.handle("secure-browser:platform-limitations", () => ({
    shortcutLocking: "Best effort. Alt+Tab, Ctrl+Alt+Delete, Command+Tab, and OS task switching cannot be guaranteed in consumer OS userland.",
    processMonitoring: "Best effort. Requires adequate permissions and can be bypassed by renamed binaries, kernel-level tampering, or external devices.",
    integrity: "Strongest with signed builds, notarization, and external manifest verification.",
}));
ipcMain.handle("secure-browser:get-env-flags", () => ({
    ENABLE_TF: process.env.ENABLE_TF !== 'false',
    ENABLE_FACEMESH: process.env.ENABLE_FACEMESH !== 'false',
    ENABLE_PROCTORING: process.env.ENABLE_PROCTORING !== 'false',
    FORCE_CPU: process.env.FORCE_CPU === 'true' || process.env.DISABLE_WEBGL === 'true' || process.env.AMANZI_FORCE_CPU === 'true'
}));
ipcMain.on("secure-browser:heartbeat", () => {
    lastHeartbeatTime = Date.now();
});
