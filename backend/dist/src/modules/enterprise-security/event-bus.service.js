import { redisService } from "../../lib/redis";
import { logDebug } from "../../lib/logging";
class EnterpriseEventBus {
    channel = "amanzi.enterprise-security.events";
    subscribers = new Set();
    subscribe(subscriber) {
        this.subscribers.add(subscriber);
        return () => this.subscribers.delete(subscriber);
    }
    async publish(event) {
        const enriched = {
            ...event,
            severity: event.severity ?? "info",
            source: event.source ?? "backend",
            createdAt: event.createdAt ?? new Date().toISOString(),
        };
        const client = redisService.getClient();
        if (client) {
            await client.publish(this.channel, JSON.stringify(enriched));
        }
        await Promise.allSettled([...this.subscribers].map((subscriber) => subscriber(enriched)));
        logDebug(`Enterprise event published: ${enriched.eventType}`);
    }
}
export const enterpriseEventBus = new EnterpriseEventBus();
