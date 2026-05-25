"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("amanziSecureBrowser", {
    platformLimitations: () => electron_1.ipcRenderer.invoke("secure-browser:platform-limitations"),
    getEnvFlags: () => electron_1.ipcRenderer.invoke("secure-browser:get-env-flags"),
    sendHeartbeat: () => electron_1.ipcRenderer.send("secure-browser:heartbeat"),
});
