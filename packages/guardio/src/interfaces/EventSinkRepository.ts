import type { GuardioEvent } from "./EventSinkPluginInterface.js";

/** One row from guardio_events for dashboard / API listing. */
export interface StoredEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  actionType?: string | null;
  agentId?: string | null;
  /** Agent name from x-agent-name at request time (same as discovered at SSE connect). */
  agentNameSnapshot?: string | null;
  decision?: string | null;
  policyEvaluation?: Record<string, unknown> | null;
}

/**
 * Repository for persisting and listing GuardioEvent. Storage adapters that support
 * event sinking may expose this via getEventSinkRepository().
 */
export interface EventSinkRepository {
  insert(event: GuardioEvent): Promise<void>;

  /** List recent events (e.g. for EventSinkStore plugins or dashboard). Optional. */
  list?(options?: { limit?: number }): Promise<StoredEvent[]>;
}
