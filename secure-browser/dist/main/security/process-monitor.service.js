"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessMonitorService = void 0;
const node_child_process_1 = require("node:child_process");
const node_os_1 = require("node:os");
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const threats = [
    { name: "OBS", match: /\b(obs|obs64)\b/i, category: "screen_capture", action: "close_exam" },
    { name: "AnyDesk", match: /anydesk/i, category: "remote_desktop", action: "close_exam" },
    { name: "TeamViewer", match: /teamviewer/i, category: "remote_desktop", action: "close_exam" },
    { name: "Discord", match: /discord/i, category: "communication", action: "flag" },
    { name: "Zoom", match: /\bzoom\b/i, category: "communication", action: "flag" },
    { name: "ChatGPT Desktop", match: /chatgpt/i, category: "ai_assistant", action: "close_exam" },
    { name: "Screen Capture", match: /(snippingtool|screenrec|camtasia|loom|sharex|bandicam)/i, category: "screen_capture", action: "close_exam" },
    { name: "Remote Desktop", match: /(mstsc|vnc|parsecd|chrome remote desktop|rustdesk)/i, category: "remote_desktop", action: "close_exam" },
];
const processListCommand = () => {
    const os = (0, node_os_1.platform)();
    if (os === "win32")
        return { command: "tasklist.exe", args: ["/FO", "CSV", "/NH"] };
    if (os === "darwin")
        return { command: "ps", args: ["-axo", "comm"] };
    return { command: "ps", args: ["-eo", "comm"] };
};
class ProcessMonitorService {
    onThreat;
    intervalMs;
    timer = null;
    constructor(onThreat, intervalMs = 5000) {
        this.onThreat = onThreat;
        this.intervalMs = intervalMs;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => void this.scan(), this.intervalMs);
        void this.scan();
    }
    stop() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = null;
    }
    async scan() {
        const { command, args } = processListCommand();
        const { stdout } = await execFileAsync(command, args, { windowsHide: true });
        const processes = stdout.split(/\r?\n/).map((line) => line.replace(/^"|"$/g, "").split('","')[0]).filter(Boolean);
        for (const processName of processes) {
            const threat = threats.find((item) => item.match.test(processName));
            if (threat) {
                this.onThreat({ ...threat, processName, detectedAt: new Date().toISOString() });
            }
        }
    }
}
exports.ProcessMonitorService = ProcessMonitorService;
