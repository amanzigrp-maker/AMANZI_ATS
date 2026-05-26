import { HeartbeatService } from "../services/heartbeat.service";
export class HeartbeatMonitorWorker {
    static interval = null;
    static start() {
        console.log("🚀 Starting HeartbeatMonitorWorker (every 15s)...");
        this.interval = setInterval(async () => {
            await HeartbeatService.detectMissingHeartbeats();
        }, 15000);
    }
    static stop() {
        if (this.interval)
            clearInterval(this.interval);
    }
}
