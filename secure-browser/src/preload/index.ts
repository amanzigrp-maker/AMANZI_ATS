import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("amanziSecureBrowser", {
  platformLimitations: () => ipcRenderer.invoke("secure-browser:platform-limitations"),
  getEnvFlags: () => ipcRenderer.invoke("secure-browser:get-env-flags"),
});
