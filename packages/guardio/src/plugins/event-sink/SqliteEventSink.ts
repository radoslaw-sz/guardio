import type {
  EventSinkPluginInterface,
  GuardioEvent,
} from "../../interfaces/EventSinkPluginInterface.js";
import type { EventSinkPluginContext } from "../../interfaces/EventSinkPluginContext.js";
import { logger } from "../../logger.js";

/**
 * EventSink that persists GuardioEvent to the database via EventSinkRepository.
 * Requires context.eventSinkRepository; if missing, emit() is a no-op (logs at debug).
 */
export class SqliteEventSink implements EventSinkPluginInterface {
  readonly name = "sqlite";

  constructor(
    _config?: Record<string, unknown>,
    private readonly context?: EventSinkPluginContext,
  ) {}

  async emit(event: GuardioEvent): Promise<void> {
    const repo = this.context?.eventSinkRepository;
    if (!repo) {
      logger.debug(
        { eventId: event.eventId },
        "SqliteEventSink: no EventSinkRepository in context, skipping persist",
      );
      return;
    }
    await repo.insert(event);
  }

  async flush(): Promise<void> {
    // No batching; nothing to flush.
  }

  async shutdown(): Promise<void> {
    // No-op unless batching is added later.
  }
}
