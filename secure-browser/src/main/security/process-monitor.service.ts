import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProcessThreatAction = "warn" | "flag" | "close_exam";

export type ProcessThreat = {
  name: string;
  match: RegExp;
  category: "screen_capture" | "remote_desktop" | "communication" | "ai_assistant";
  action: ProcessThreatAction;
};

export type DetectedProcessThreat = ProcessThreat & {
  processName: string;
  detectedAt: string;
};

const threats: ProcessThreat[] = [
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
  const os = platform();
  if (os === "win32") return { command: "tasklist.exe", args: ["/FO", "CSV", "/NH"] };
  if (os === "darwin") return { command: "ps", args: ["-axo", "comm"] };
  return { command: "ps", args: ["-eo", "comm"] };
};

export class ProcessMonitorService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onThreat: (threat: DetectedProcessThreat) => void,
    private readonly intervalMs = 5000
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.scan(), this.intervalMs);
    void this.scan();
  }

  stop() {
    if (!this.timer) return;
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
