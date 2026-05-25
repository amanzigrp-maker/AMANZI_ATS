"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureUpdateService = void 0;
const electronUpdater = __importStar(require("electron-updater"));
const { autoUpdater } = electronUpdater;
class SecureUpdateService {
    configure() {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.allowPrerelease = false;
        autoUpdater.disableWebInstaller = true;
    }
    async enforceMinimumVersion(currentVersion, minimumVersion) {
        if (this.compareVersions(currentVersion, minimumVersion) < 0) {
            await autoUpdater.checkForUpdatesAndNotify();
            return { allowed: false, reason: "Security update required" };
        }
        return { allowed: true };
    }
    compareVersions(a, b) {
        const left = a.split(".").map(Number);
        const right = b.split(".").map(Number);
        for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
            const delta = (left[index] ?? 0) - (right[index] ?? 0);
            if (delta !== 0)
                return delta;
        }
        return 0;
    }
}
exports.SecureUpdateService = SecureUpdateService;
