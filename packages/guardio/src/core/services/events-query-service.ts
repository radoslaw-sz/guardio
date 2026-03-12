import type { EventSinkStorePluginInterface } from "../../interfaces/EventSinkStorePluginInterface.js";
import type { DashboardEventsInfo } from "../transports/dashboard-api-types.js";
import { logger } from "../../logger.js";

/**
 * Fetches recent Guardio events for the dashboard (/api/events) from an EventSinkStore plugin.
 */
export async function listEventsForDashboard(
  store: EventSinkStorePluginInterface | undefined,
): Promise<DashboardEventsInfo | null> {
  if (!store) return null;
  try {
    const events = await store.listEvents({ limit: 500 });
    return {
      events: events.map((e) => ({
        eventId: e.eventId,
        timestamp: e.timestamp,
        eventType: e.eventType,
        actionType: e.actionType ?? null,
        agentId: e.agentId ?? null,
        agentNameSnapshot: e.agentNameSnapshot ?? null,
        decision: e.decision ?? null,
        policyEvaluation: e.policyEvaluation ?? null,
      })),
    };
  } catch (err) {
    logger.error({ err }, "listEvents failed");
    return null;
  }
}

