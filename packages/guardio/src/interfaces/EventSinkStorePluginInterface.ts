import type { StoredEvent } from "./EventSinkRepository.js";

/**
 * Plugin that fetches (lists) guardio_events for the dashboard. Receives EventSinkPluginContext
 * at construction so it can use context.eventSinkRepository?.list() for reading events.
 */
export interface EventSinkStorePluginInterface {
  readonly name: string;

  /**
   * List recent events for dashboard activity. Called by GET /api/events.
   */
  listEvents(options?: { limit?: number }): Promise<StoredEvent[]>;
}
