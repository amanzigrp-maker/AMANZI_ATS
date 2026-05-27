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
const API_BASE_URL = process.env.AMANZI_API_BASE_URL ?? (
  isDev
    ? "http://localhost:3003"
    : "http://13.232.152.176:3003"
);
const FRONTEND_BASE_URL = process.env.AMANZI_FRONTEND_URL ?? (
  isDev
    ? "http://localhost:8080"
    : "http://13.232.152.176"
);
const DEFAULT_URL = process.env.AMANZI_EXAM_URL ?? `${FRONTEND_BASE_URL}/interview`;

let mainWindow: BrowserWindow | null = null;
let startupUrl = DEFAULT_URL;

const postSecurityEvent = async (payload: Record<string, unknown>) => {
  const token = process.env.SECURE_BROWSER_INGEST_TOKEN ?? process.env.AMANZI_SECURE_BROWSER_TOKEN;
  if (!token) return;

  await fetch(`${API_BASE_URL}/api/enterprise-security/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
};

// --- PHASE 1: Protocol Registration ---
import fs from 'fs';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const handleDeepLink = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === `${PROTOCOL}:`) {
      const dynamicUrl = parsed.searchParams.get('url');
      let finalUrl = "";

      if (dynamicUrl) {
        // Build target URL and forward all outer query parameters (like email, token, password, etc.)
        const targetUrlObj = new URL(dynamicUrl);
        for (const [key, val] of parsed.searchParams.entries()) {
          if (key !== 'url') {
            targetUrlObj.searchParams.set(key, val);
          }
        }
        finalUrl = targetUrlObj.toString();
      } else if (parsed.host && (parsed.host.includes("localhost") || parsed.host.includes("127.0.0.1") || parsed.host.includes(":"))) {
        // If it includes a dynamic dev port/host, load directly
        finalUrl = `http://${parsed.host}${parsed.pathname}${parsed.search}`;
      } else {
        // Fallback to configured FRONTEND_BASE_URL
        let targetPath = parsed.host + parsed.pathname;
        targetPath = targetPath.replace(/^\/+/, ''); // Remove leading slashes
        finalUrl = `${FRONTEND_BASE_URL}/${targetPath}${parsed.search}`;
      }
      
      if (mainWindow) {
        void mainWindow.loadURL(finalUrl);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      } else {
        startupUrl = finalUrl;
      }
    }
  } catch (err: any) {
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
    if (mainWindow.isMinimized()) mainWindow.restore();
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
const handleCrash = async (title: string, message: string, options?: { reloadable?: boolean }) => {
  if (!mainWindow) return;
  console.error(`[CRASH] ${title}: ${message}`);

  if (options?.reloadable && !mainWindow.isDestroyed()) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Reload", "Quit"],
      defaultId: 0,
      cancelId: 1,
      title,
      message,
      detail: "The secure browser can attempt to recover by reloading the page.",
    });

    if (result.response === 0) {
      if (!mainWindow.isDestroyed()) {
        void mainWindow.reload();
      }
      return;
    }
  }

  dialog.showErrorBox(title, message + "\n\nPlease restart the secure browser.");
  app.quit();
};

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
      sandbox: true,
      devTools: isDev,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Append secure browser identification to the user agent
  const defaultUserAgent = mainWindow.webContents.getUserAgent();
  mainWindow.webContents.setUserAgent(`${defaultUserAgent} amanzi-secure-browser`);

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow?.focus();
  });

  // Task 3: Electron Renderer Crash Logging & Recovery
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    handleCrash(
      "Renderer Process Gone",
      `Renderer process terminated unexpectedly.\n\nDetails:\nReason: ${details.reason}\nExit Code: ${details.exitCode}`
    );
  });

  app.on("gpu-process-crashed" as any, () => {
    handleCrash(
      "GPU Process Crashed",
      "Chromium GPU process crashed. Try launching with environment flag DISABLE_GPU=true to disable GPU acceleration.",
      { reloadable: true }
    );
  });

  mainWindow.on("unresponsive", () => {
    handleCrash(
      "Renderer Unresponsive",
      "Renderer process stopped responding. The main thread may be blocked or executing an infinite loop.",
      { reloadable: true }
    );
  });

  mainWindow.webContents.on("did-fail-load", async (event, errorCode, errorDescription, validatedURL) => {
    console.error(`did-fail-load: ${validatedURL} (${errorCode}: ${errorDescription})`);

    // Ignore ERR_ABORTED (-3) as it represents a benign navigation cancellation (e.g. when replaced by a deep-link URL load)
    if (errorCode === -3) {
      return;
    }

    // Treat connection refused as a recoverable error and offer retry
    if (errorCode === -102) { // ERR_CONNECTION_REFUSED
      const result = await dialog.showMessageBox(mainWindow!, {
        type: "error",
        buttons: ["Retry", "Quit"],
        defaultId: 0,
        cancelId: 1,
        title: "Page Load Failure",
        message: `Failed to load URL: ${validatedURL}`,
        detail: `${errorDescription} (${errorCode})`,
      });

      if (result.response === 0) {
        setTimeout(() => {
          if (mainWindow) void mainWindow.loadURL(startupUrl);
        }, 1000);
        return;
      }

      app.quit();
      return;
    }

    // Fallback: treat other failures as fatal
    handleCrash(
      "Page Load Failure",
      `Failed to load URL: ${validatedURL}\n\nError: ${errorDescription} (${errorCode})`
    );
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  void mainWindow.loadURL(startupUrl);

  const shortcuts = new GlobalShortcutLockService();
  shortcuts.lock((accelerator: string) => {
    void postSecurityEvent({
      eventType: "secure_browser.shortcut_blocked",
      severity: "medium",
      source: "secure-browser",
      payload: { accelerator },
    });
  });

  const monitor = new ProcessMonitorService((threat: { action: string }) => {
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

  mainWindow.on("closed", () => {
    shortcuts.unlock();
    monitor.stop();
    mainWindow = null;
  });
};

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

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
