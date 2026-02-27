import type { StorageAdapter } from "./StorageAdapter.js";

/**
 * Context passed to plugin factories (e.g. EventSink) when instantiating.
 * Allows plugins to use shared resources like storage without depending on concrete implementations.
 */
export interface GuardioPluginContext {
  storage?: StorageAdapter;
}
