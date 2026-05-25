"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalShortcutLockService = void 0;
const electron_1 = require("electron");
class GlobalShortcutLockService {
    shortcuts = [
        "Alt+Tab",
        "CommandOrControl+Tab",
        "CommandOrControl+Shift+Tab",
        "CommandOrControl+Escape",
        "PrintScreen",
        "Super+D",
        "CommandOrControl+Alt+Delete",
    ];
    lock(onBlocked) {
        for (const accelerator of this.shortcuts) {
            try {
                electron_1.globalShortcut.register(accelerator, () => onBlocked(accelerator));
            }
            catch {
                onBlocked(`${accelerator}:registration_failed`);
            }
        }
    }
    unlock() {
        electron_1.globalShortcut.unregisterAll();
    }
}
exports.GlobalShortcutLockService = GlobalShortcutLockService;
electron_1.app.on("will-quit", () => {
    electron_1.globalShortcut.unregisterAll();
});
