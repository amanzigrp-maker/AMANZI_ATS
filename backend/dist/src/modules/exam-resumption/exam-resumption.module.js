import { HeartbeatMonitorWorker } from "./workers/heartbeat-monitor.worker";
import { ExpiredSessionCleanupWorker } from "./workers/expired-session-cleanup.worker";
import { SnapshotGarbageCollector } from "./workers/snapshot-garbage-collector.worker";
import { StaleSnapshotReaper } from "./workers/stale-snapshot-reaper.worker";
export class ExamResumptionModule {
    static init() {
        console.log("🛠️  Initializing Exam Resumption Module...");
        HeartbeatMonitorWorker.start();
        ExpiredSessionCleanupWorker.start();
        SnapshotGarbageCollector.start();
        StaleSnapshotReaper.start();
        console.log("✅ Exam Resumption Module Ready.");
    }
}
