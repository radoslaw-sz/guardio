import type { EventSinkStorePluginInterface } from "../../interfaces/EventSinkStorePluginInterface.js";
import type { StoredEvent } from "../../interfaces/EventSinkRepository.js";
import type { EventSinkPluginContext } from "../../interfaces/EventSinkPluginContext.js";

/**
 * EventSinkStore that fetches events from the database via EventSinkRepository.list().
 * Requires context.eventSinkRepository that implements list(); otherwise returns [].
 */
export class SqliteEventSinkStore implements EventSinkStorePluginInterface {
  readonly name = "sqlite";

  constructor(
    _config?: Record<string, unknown>,
    private readonly context?: EventSinkPluginContext,
  ) {}

  async listEvents(options?: { limit?: number }): Promise<StoredEvent[]> {
    const repo = this.context?.eventSinkRepository;
    if (!repo?.list) return [];
    return repo.list(options ?? {});
  }
}
