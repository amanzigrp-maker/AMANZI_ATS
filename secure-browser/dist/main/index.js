"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const process_monitor_service_js_1 = require("./security/process-monitor.service.js");
const global_shortcut_lock_service_js_1 = require("./security/global-shortcut-lock.service.js");
const secure_update_service_js_1 = require("./updates/secure-update.service.js");
// GPU stability configuration switches (Task 9)
if (process.env.DISABLE_GPU === 'true' || process.env.AMANZI_DISABLE_GPU === 'true') {
    electron_1.app.commandLine.appendSwitch('disable-gpu');
    electron_1.app.commandLine.appendSwitch('disable-gpu-compositing');
}
if (process.env.DISABLE_SOFTWARE_RASTERIZER === 'true') {
    electron_1.app.commandLine.appendSwitch('disable-software-rasterizer');
}
if (process.env.IGNORE_GPU_BLACKLIST === 'true') {
    electron_1.app.commandLine.appendSwitch('ignore-gpu-blacklist');
}
const isDev = !electron_1.app.isPackaged || process.env.NODE_ENV === "development" || process.env.DEBUG === "true";
const PROTOCOL = "amanzi-secure-browser";
const API_BASE_URL = process.env.AMANZI_API_BASE_URL ?? (isDev
    ? "http://localhost:3003"
    : "http://35.154.121.208:3003");
const FRONTEND_BASE_URL = process.env.AMANZI_FRONTEND_URL ?? (isDev
    ? "http://localhost:8080"
    : "http://35.154.121.208");
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
        electron_1.app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [node_path_1.default.resolve(process.argv[1])]);
    }
}
else {
    electron_1.app.setAsDefaultProtocolClient(PROTOCOL);
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
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
    process.exit(0);
}
electron_1.app.on("second-instance", (event, commandLine) => {
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
electron_1.app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});
const electron_2 = require("electron");
const handleCrash = (title, message) => {
    if (!mainWindow)
        return;
    console.error(`[CRASH] ${title}: ${message}`);
    electron_2.dialog.showErrorBox(title, message + "\n\nPlease restart the secure browser.");
    electron_1.app.quit();
};
const createWindow = () => {
    mainWindow = new electron_1.BrowserWindow({
        fullscreen: true,
        kiosk: true,
        show: false,
        webPreferences: {
            preload: node_path_1.default.join(electron_1.app.getAppPath(), "dist", "preload", "index.js"),
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
    electron_1.app.on("gpu-process-crashed", () => {
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
    const shortcuts = new global_shortcut_lock_service_js_1.GlobalShortcutLockService();
    shortcuts.lock((accelerator) => {
        void postSecurityEvent({
            eventType: "secure_browser.shortcut_blocked",
            severity: "medium",
            source: "secure-browser",
            payload: { accelerator },
        });
    });
    const monitor = new process_monitor_service_js_1.ProcessMonitorService((threat) => {
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
electron_1.app.whenReady().then(async () => {
    new secure_update_service_js_1.SecureUpdateService().configure();
    createWindow();
});
electron_1.ipcMain.handle("secure-browser:platform-limitations", () => ({
    shortcutLocking: "Best effort. Alt+Tab, Ctrl+Alt+Delete, Command+Tab, and OS task switching cannot be guaranteed in consumer OS userland.",
    processMonitoring: "Best effort. Requires adequate permissions and can be bypassed by renamed binaries, kernel-level tampering, or external devices.",
    integrity: "Strongest with signed builds, notarization, and external manifest verification.",
}));
electron_1.ipcMain.handle("secure-browser:get-env-flags", () => ({
    ENABLE_TF: process.env.ENABLE_TF !== 'false',
    ENABLE_FACEMESH: process.env.ENABLE_FACEMESH !== 'false',
    ENABLE_PROCTORING: process.env.ENABLE_PROCTORING !== 'false',
    FORCE_CPU: process.env.FORCE_CPU === 'true' || process.env.DISABLE_WEBGL === 'true' || process.env.AMANZI_FORCE_CPU === 'true'
}));
electron_1.ipcMain.on("secure-browser:heartbeat", () => {
    lastHeartbeatTime = Date.now();
});
