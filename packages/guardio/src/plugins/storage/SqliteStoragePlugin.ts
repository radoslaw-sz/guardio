import Database from "better-sqlite3";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type {
  StorageAdapter,
  StorageConnectionResult,
} from "../../interfaces/StorageAdapter.js";
import type {
  EventSinkRepository,
  StoredEvent,
} from "../../interfaces/EventSinkRepository.js";
import type { GuardioEvent } from "../../interfaces/EventSinkPluginInterface.js";
import { SqliteCoreRepository } from "./SqliteCoreRepository.js";
import { logger } from "../../logger.js";

export interface SqliteStoragePluginConfig {
  /** Path to the SQLite database file. Set this for file-based storage. */
  database?: string;
  /** Use an in-memory database. Set to true for in-memory; cannot be used together with database. */
  inMemory?: boolean;
}

const ERR_BOTH =
  "SqliteStoragePlugin: set either 'database' (file path) or 'inMemory: true', not both.";
const ERR_NEITHER =
  "SqliteStoragePlugin: set either 'database' (file path) or 'inMemory: true'.";

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

/**
 * SQLite implementation of EventSinkRepository. Inserts and lists GuardioEvent from guardio_events table.
 */
class SqliteEventSinkRepository implements EventSinkRepository {
  constructor(private readonly db: Database.Database) {}

  async list(options?: { limit?: number }): Promise<StoredEvent[]> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 1000);
    const rows = this.db
      .prepare(
        `SELECT event_id AS eventId, timestamp, event_type AS eventType, action_type AS actionType,
                agent_id AS agentId, decision, policy_evaluation AS policyEvaluation
         FROM guardio_events
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      eventId: string;
      timestamp: string;
      eventType: string;
      actionType: string | null;
      agentId: string | null;
      decision: string | null;
      policyEvaluation: string | null;
    }>;
    return rows.map((r) => ({
      eventId: r.eventId,
      timestamp: r.timestamp,
      eventType: r.eventType,
      actionType: r.actionType ?? undefined,
      agentId: r.agentId ?? undefined,
      decision: r.decision ?? undefined,
      policyEvaluation: r.policyEvaluation
        ? (JSON.parse(r.policyEvaluation) as Record<string, unknown>)
        : undefined,
    }));
  }

  async insert(event: GuardioEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO guardio_events (
          event_id, schema_version, timestamp, event_type, action_type,
          agent_id, trace_id, span_id, target_resource, decision,
          policy_evaluation, request_payload, response_payload, metrics, metadata,
          http_status, error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.eventId,
        event.schemaVersion,
        event.timestamp,
        event.eventType,
        event.actionType ?? null,
        event.agentId ?? null,
        event.traceId ?? null,
        event.spanId ?? null,
        event.targetResource ?? null,
        event.decision ?? null,
        jsonOrNull(event.policyEvaluation),
        jsonOrNull(event.requestPayload),
        jsonOrNull(event.responsePayload),
        jsonOrNull(event.metrics),
        jsonOrNull(event.metadata),
        event.httpStatus ?? null,
        event.errorCode ?? null,
      );
  }
}

/**
 * Built-in storage adapter using SQLite. Creates resource_providers, provider_capabilities,
 * agents, connections, policy_instances, and policy_assignments tables.
 * SQLite uses TEXT for UUIDs and JSON (no native JSONB); booleans as INTEGER 0/1.
 */
export class SqliteStoragePlugin implements StorageAdapter {
  readonly name = "sqlite";

  private db: Database.Database | null = null;
  private _repository: SqliteCoreRepository | null = null;
  private _eventSinkRepository: SqliteEventSinkRepository | null = null;
  private readonly databasePath: string;
  private readonly inMemory: boolean;

  constructor(config: Record<string, unknown> = {}) {
    const { database, inMemory } = config as SqliteStoragePluginConfig;
    const useMemory = inMemory === true;
    const hasPath =
      database !== undefined &&
      database !== null &&
      String(database).trim() !== "";

    if (useMemory && hasPath) {
      throw new Error(ERR_BOTH);
    }
    if (!useMemory && !hasPath) {
      throw new Error(ERR_NEITHER);
    }

    this.inMemory = useMemory;
    this.databasePath = useMemory ? ":memory:" : (database as string);
  }

  private logContext(): { database?: string; inMemory?: boolean } {
    return this.inMemory ? { inMemory: true } : { database: this.databasePath };
  }

  start(): void {
    if (!this.db) {
      this.db =
        this.inMemory
          ? new Database(":memory:")
          : new Database(this.databasePath);
    }
    this.db.exec(`
        -- Resource providers (MCP servers, REST APIs, etc.)
        CREATE TABLE IF NOT EXISTS resource_providers (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL UNIQUE,
          type        TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'disconnected',
          config      TEXT,
          last_discovery_at TEXT,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Cached capabilities per provider
        CREATE TABLE IF NOT EXISTS provider_capabilities (
          id              TEXT PRIMARY KEY,
          provider_id     TEXT NOT NULL REFERENCES resource_providers(id) ON DELETE CASCADE,
          capability_type TEXT NOT NULL DEFAULT 'tool',
          name            TEXT NOT NULL,
          description     TEXT,
          schema          TEXT,
          status          TEXT NOT NULL DEFAULT 'available',
          discovered_at   TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at    TEXT,
          UNIQUE(provider_id, capability_type, name)
        );

        -- Agents
        CREATE TABLE IF NOT EXISTS agents (
          id           TEXT PRIMARY KEY,
          name         TEXT NOT NULL,
          name_generated INTEGER NOT NULL DEFAULT 0,
          api_key_hash TEXT,
          metadata     TEXT,
          connected_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT
        );

        -- Agent <-> provider connections
        CREATE TABLE IF NOT EXISTS connections (
          agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          provider_id TEXT NOT NULL REFERENCES resource_providers(id) ON DELETE CASCADE,
          connected_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (agent_id, provider_id)
        );

        -- Policy instances
        CREATE TABLE IF NOT EXISTS policy_instances (
          id         TEXT PRIMARY KEY,
          plugin_id  TEXT NOT NULL,
          name       TEXT NOT NULL,
          config     TEXT,
          is_enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Policy assignments
        CREATE TABLE IF NOT EXISTS policy_assignments (
          id                 TEXT PRIMARY KEY,
          policy_instance_id TEXT NOT NULL REFERENCES policy_instances(id) ON DELETE CASCADE,
          agent_id           TEXT REFERENCES agents(id) ON DELETE CASCADE,
          provider_id        TEXT REFERENCES resource_providers(id) ON DELETE CASCADE,
          capability_name    TEXT,
          priority           INTEGER NOT NULL DEFAULT 0,
          created_at         TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_connections_agent    ON connections(agent_id);
        CREATE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider_id);
        CREATE INDEX IF NOT EXISTS idx_capabilities_provider ON provider_capabilities(provider_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_agent    ON policy_assignments(agent_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_provider ON policy_assignments(provider_id);

        -- Guardio events (event sink)
        CREATE TABLE IF NOT EXISTS guardio_events (
          event_id         TEXT PRIMARY KEY,
          schema_version   TEXT NOT NULL,
          timestamp        TEXT NOT NULL,
          event_type       TEXT NOT NULL,
          action_type      TEXT,
          agent_id         TEXT,
          trace_id         TEXT,
          span_id          TEXT,
          target_resource  TEXT,
          decision         TEXT,
          policy_evaluation TEXT,
          request_payload  TEXT,
          response_payload TEXT,
          metrics          TEXT,
          metadata         TEXT,
          http_status      INTEGER,
          error_code       TEXT,
          created_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    logger.debug(this.logContext(), "SQLite storage tables created");
  }

  connect(): StorageConnectionResult {
    try {
      if (!this.db) {
        this.db =
          this.inMemory
            ? new Database(":memory:")
            : new Database(this.databasePath);
      }
      this._repository = new SqliteCoreRepository(this.db);
      this._eventSinkRepository = new SqliteEventSinkRepository(this.db);
      return { ok: true, client: this.db };
    } catch (err) {
      logger.error({ err, ...this.logContext() }, "SQLite connect failed");
      return { ok: false };
    }
  }

  getRepository(): CoreRepository {
    if (!this._repository) {
      throw new Error("Storage adapter not connected; call connect() first.");
    }
    return this._repository;
  }

  getEventSinkRepository(): EventSinkRepository | undefined {
    return this._eventSinkRepository ?? undefined;
  }

  disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this._repository = null;
      this._eventSinkRepository = null;
      logger.debug(this.logContext(), "SQLite disconnected");
    }
  }

  end(): void {
    this.disconnect();
  }
}
