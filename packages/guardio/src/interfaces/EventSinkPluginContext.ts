import type { EventSinkRepository } from "./EventSinkRepository.js";

/**
 * Context passed to EventSink plugin factories.
 * Contains only the repository needed for event persistence.
 * This follows the principle of least privilege - EventSink plugins
 * cannot access CoreRepository or other plugin data.
 */
export interface EventSinkPluginContext {
  eventSinkRepository?: EventSinkRepository;
}
