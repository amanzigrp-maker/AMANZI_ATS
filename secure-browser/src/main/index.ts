import { app, BrowserWindow, ipcMain, session } from "electron";

// Electron runtime stability flags
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

import path from "node:path";
import { ProcessMonitorService, DetectedProcessThreat } from "./security/process-monitor.service.js";
import { GlobalShortcutLockService } from "./security/global-shortcut-lock.service.js";
import { SecureUpdateService } from "./updates/secure-update.service.js";

const isDev =
  !app.isPackaged ||
  process.env.NODE_ENV === "development" ||
  process.env.DEBUG === "true";

const PROTOCOL = "amanzi-secure-browser";

const API_BASE_URL =
  process.env.AMANZI_API_BASE_URL ??
  (isDev ? "http://localhost:3003" : "http://3.109.90.13:3003");

const FRONTEND_BASE_URL =
  process.env.AMANZI_FRONTEND_URL ??
  (isDev ? "http://localhost:8080" : "http://3.109.90.13");

const DEFAULT_URL =
  process.env.AMANZI_EXAM_URL ?? `${FRONTEND_BASE_URL}`;

let mainWindow: BrowserWindow | null = null;
let startupUrl = DEFAULT_URL;
let lastHeartbeatTime = Date.now();

const postSecurityEvent = async (payload: Record<string, unknown>) => {
  const token =
    process.env.SECURE_BROWSER_INGEST_TOKEN ??
    process.env.AMANZI_SECURE_BROWSER_TOKEN;

  if (!token) return;

  await fetch(`${API_BASE_URL}/api/enterprise-security/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
};

/* ---------------- Deep Link ---------------- */

const handleDeepLink = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol === `${PROTOCOL}:`) {
      const dynamicUrl = parsed.searchParams.get("url");

      let finalUrl = "";

      if (dynamicUrl) {
        finalUrl = dynamicUrl;
      } else if (
        parsed.host.includes("localhost") ||
        parsed.host.includes("127.0.0.1")
      ) {
        finalUrl = `http://${parsed.host}${parsed.pathname}${parsed.search}`;
      } else {
        const targetPath = parsed.host + parsed.pathname;
        finalUrl = `${FRONTEND_BASE_URL}/${targetPath.replace(/^\/+/, "")}${parsed.search}`;
      }

      if (mainWindow) {
        void mainWindow.loadURL(finalUrl);
        mainWindow.focus();
      } else {
        startupUrl = finalUrl;
      }
    }
  } catch (err) {
    console.error("Deep link error:", err);
  }
};

/* ---------------- Single Instance ---------------- */

app.requestSingleInstanceLock();

app.on("second-instance", (event, commandLine) => {
  if (mainWindow) {
    mainWindow.restore();
    mainWindow.focus();
  }

  const url = commandLine.find((arg) =>
    arg.startsWith(`${PROTOCOL}://`)
  );

  if (url) handleDeepLink(url);
});

/* ---------------- Window ---------------- */

const createWindow = () => {
  mainWindow = new BrowserWindow({
    fullscreen: !isDev,
    kiosk: !isDev,
    width: isDev ? 1280 : undefined,
    height: isDev ? 720 : undefined,
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "preload", "index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      devTools: false,
    },
  });

  if (isDev && (process.env.OPEN_DEVTOOLS === "true" || process.env.DEBUG === "true")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  const defaultUA = mainWindow.webContents.getUserAgent();
  mainWindow.webContents.setUserAgent(
    `${defaultUA} amanzi-secure-browser`
  );

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  void mainWindow.loadURL(startupUrl);

  /* ---------------- Process Monitor ---------------- */

  const monitor = new ProcessMonitorService(
    (threat: DetectedProcessThreat) => {
      console.log("Threat detected:", threat);

      void postSecurityEvent({
        eventType: "secure_browser.process_detected",
        severity: threat.action === "close_exam" ? "critical" : "high",
        source: "secure-browser",
        payload: threat,
      });

      if (
        (threat.action === "close_exam" || threat.action === "flag") &&
        mainWindow
      ) {
        const encodedThreat = encodeURIComponent(threat.name);

        const targetUrl =
          `${FRONTEND_BASE_URL}/interview?securityHold=process&threat=${encodedThreat}`;

        const currentUrl = mainWindow.webContents.getURL();

        if (!currentUrl.includes("securityHold=process")) {
          void mainWindow.loadURL(targetUrl);
        }
      }
    }
  );

  monitor.start();

  mainWindow.on("closed", () => {
    monitor.stop();
    mainWindow = null;
  });
};

/* ---------------- App Init ---------------- */

app.whenReady().then(() => {
  new SecureUpdateService().configure();

  // Allow webcam/microphone/camera permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'camera', 'microphone', 'video', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  const url = process.argv.find((arg) =>
    arg.startsWith(`${PROTOCOL}://`)
  );
  if (url) handleDeepLink(url);

  createWindow();
});

/* ---------------- IPC ---------------- */

ipcMain.on("secure-browser:heartbeat", () => {
  lastHeartbeatTime = Date.now();
});

ipcMain.handle("secure-browser:get-env-flags", () => ({
  ENABLE_TF: process.env.AMANZI_ENABLE_TF !== "false",
  ENABLE_FACEMESH: process.env.AMANZI_ENABLE_FACEMESH !== "false",
  ENABLE_PROCTORING: process.env.AMANZI_ENABLE_PROCTORING !== "false",
  FORCE_CPU: process.env.AMANZI_FORCE_CPU === "true",
}));

ipcMain.handle("secure-browser:platform-limitations", () => ({
  platform: process.platform,
  arch: process.arch,
}));