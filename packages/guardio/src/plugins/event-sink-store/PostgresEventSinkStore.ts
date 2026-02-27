import type { EventSinkStorePluginInterface } from "../../interfaces/EventSinkStorePluginInterface.js";
import type { StoredEvent } from "../../interfaces/EventSinkRepository.js";
import type { GuardioPluginContext } from "../../interfaces/GuardioPluginContext.js";

/**
 * EventSinkStore that fetches events from the database via the storage adapter's
 * EventSinkRepository.list(). Requires context.storage with getEventSinkRepository()
 * that implements list(); otherwise returns [].
 * Use with the "postgres" storage plugin so events are read from PostgreSQL.
 */
export class PostgresEventSinkStore implements EventSinkStorePluginInterface {
  readonly name = "postgres";

  constructor(
    _config?: Record<string, unknown>,
    private readonly context?: GuardioPluginContext,
  ) {}

  async listEvents(options?: { limit?: number }): Promise<StoredEvent[]> {
    const repo = this.context?.storage?.getEventSinkRepository?.();
    if (!repo?.list) return [];
    return repo.list(options ?? {});
  }
}
