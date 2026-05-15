
import { HeartbeatService } from "../services/heartbeat.service";

export class HeartbeatMonitorWorker {
    private static interval: NodeJS.Timeout | null = null;

    public static start() {
        console.log("🚀 Starting HeartbeatMonitorWorker (every 15s)...");
        this.interval = setInterval(async () => {
            await HeartbeatService.detectMissingHeartbeats();
        }, 15000);
    }

    public static stop() {
        if (this.interval) clearInterval(this.interval);
    }
}
