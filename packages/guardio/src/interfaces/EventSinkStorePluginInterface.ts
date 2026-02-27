import type { GuardioPluginContext } from "./GuardioPluginContext.js";
import type { StoredEvent } from "./EventSinkRepository.js";

/**
 * Plugin that fetches (lists) guardio_events for the dashboard. Receives GuardioPluginContext
 * at construction so it can use context.storage.getEventSinkRepository()?.list() or similar.
 */
export interface EventSinkStorePluginInterface {
  readonly name: string;

  /**
   * List recent events for dashboard activity. Called by GET /api/events.
   */
  listEvents(options?: { limit?: number }): Promise<StoredEvent[]>;
}
