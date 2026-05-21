import { redisService } from "../../lib/redis";
import { logDebug } from "../../lib/logging";
import type { EnterpriseSecurityEvent } from "./types";

type LocalSubscriber = (event: EnterpriseSecurityEvent) => void | Promise<void>;

class EnterpriseEventBus {
  private readonly channel = "amanzi.enterprise-security.events";
  private readonly subscribers = new Set<LocalSubscriber>();

  subscribe(subscriber: LocalSubscriber) {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  async publish(event: EnterpriseSecurityEvent) {
    const enriched: EnterpriseSecurityEvent = {
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
