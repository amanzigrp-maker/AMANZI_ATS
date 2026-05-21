import { app, globalShortcut } from "electron";
export class GlobalShortcutLockService {
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
                globalShortcut.register(accelerator, () => onBlocked(accelerator));
            }
            catch {
                onBlocked(`${accelerator}:registration_failed`);
            }
        }
    }
    unlock() {
        globalShortcut.unregisterAll();
    }
}
app.on("will-quit", () => {
    globalShortcut.unregisterAll();
});
