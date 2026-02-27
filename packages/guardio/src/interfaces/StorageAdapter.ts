/**
 * Result returned by StorageAdapter.connect(). Adapters can attach their DB client for use by other code.
 */
export interface StorageConnectionResult {
  ok: boolean;
  /** Adapter-specific client (e.g. DB connection pool). */
  client?: unknown;
}

import type { CoreRepository } from "./CoreRepository.js";
import type { EventSinkRepository } from "./EventSinkRepository.js";

/**
 * Storage adapter interface for database lifecycle: schema setup, connect, disconnect, teardown.
 * Plugins implement this to provide storage backends configurable via guardio.config.ts.
 * After connect(), getRepository() returns the core repository for agents and policy resolution.
 */
export interface StorageAdapter {
  readonly name: string;

  /**
   * Establish connection to the database.
   * @returns Connection result with ok and optional client.
   */
  connect(): StorageConnectionResult | Promise<StorageConnectionResult>;

  /**
   * Return the core repository for this adapter. Must be called after connect().
   * Use adapter.getRepository() for data access (e.g. adapter.getRepository().getPoliciesForContext(...)).
   */
  getRepository(): CoreRepository;

  /**
   * Optional: return a repository for persisting GuardioEvent. When implemented, event-sink plugins can use it.
   */
  getEventSinkRepository?(): EventSinkRepository | undefined;

  /**
   * Create tables / schema. Called after connect.
   */
  start(): void | Promise<void>;

  /**
   * Teardown and cleanup. Called when shutting down. Before disconnect.
   */
  end(): void | Promise<void>;

  /**
   * Disconnect from the database.
   */
  disconnect(): void | Promise<void>;
}
