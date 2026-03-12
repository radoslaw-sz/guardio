import type { Pool, PoolConfig } from "pg";
import { Pool as PgPool } from "pg";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type {
  StorageAdapter,
  StorageConnectionResult,
} from "../../interfaces/StorageAdapter.js";
import type {
  EventSinkRepository,
  StoredEvent,
} from "../../interfaces/EventSinkRepository.js";
import type {
  PluginRepository,
  PluginDocument,
  PluginDocumentFilter,
} from "../../interfaces/PluginRepository.js";
import type { GuardioEvent } from "../../interfaces/EventSinkPluginInterface.js";
import { PostgresCoreRepository } from "./PostgresCoreRepository.js";
import { logger } from "../../logger.js";
import { randomUUID } from "node:crypto";

/**
 * Configuration for the PostgreSQL storage plugin.
 *
 * @example Connection string
 * ```ts
 * { type: "storage", name: "postgres", config: { connectionString: "postgresql://user:pass@host:5432/dbname" } }
 * ```
 *
 * @example Discrete options
 * ```ts
 * { type: "storage", name: "postgres", config: { host: "localhost", port: 5432, user: "guardio", password: "...", database: "guardio" } }
 * ```
 */
export interface PostgresStoragePluginConfig {
  /** PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/dbname). */
  connectionString?: string;
  /** Database host (used when connectionString is not set). */
  host?: string;
  /** Database port (default 5432). */
  port?: number;
  /** Database user. */
  user?: string;
  /** Database password. */
  password?: string;
  /** Database name. */
  database?: string;
  /** SSL mode: true, false, or object for pg. */
  ssl?: boolean | object;
}

const POSTGRES_DDL = `
-- Resource providers (MCP servers, REST APIs, etc.)
CREATE TABLE IF NOT EXISTS resource_providers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'disconnected',
  config      JSONB,
  last_discovery_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cached capabilities per provider
CREATE TABLE IF NOT EXISTS provider_capabilities (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES resource_providers(id) ON DELETE CASCADE,
  capability_type TEXT NOT NULL DEFAULT 'tool',
  name            TEXT NOT NULL,
  description     TEXT,
  schema          JSONB,
  status          TEXT NOT NULL DEFAULT 'available',
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ,
  UNIQUE(provider_id, capability_type, name)
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  name_generated BOOLEAN NOT NULL DEFAULT false,
  api_key_hash TEXT,
  metadata     JSONB,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

-- Agent <-> provider connections
CREATE TABLE IF NOT EXISTS connections (
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES resource_providers(id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, provider_id)
);

-- Policy instances
CREATE TABLE IF NOT EXISTS policy_instances (
  id         TEXT PRIMARY KEY,
  plugin_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  config     JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy assignments
CREATE TABLE IF NOT EXISTS policy_assignments (
  id                 TEXT PRIMARY KEY,
  policy_instance_id TEXT NOT NULL REFERENCES policy_instances(id) ON DELETE CASCADE,
  agent_id           TEXT REFERENCES agents(id) ON DELETE CASCADE,
  provider_id        TEXT REFERENCES resource_providers(id) ON DELETE CASCADE,
  capability_name    TEXT,
  priority           INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_agent    ON connections(agent_id);
CREATE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_provider ON provider_capabilities(provider_id);
CREATE INDEX IF NOT EXISTS idx_assignments_agent    ON policy_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_assignments_provider ON policy_assignments(provider_id);

-- Guardio events (event sink)
CREATE TABLE IF NOT EXISTS guardio_events (
  event_id             TEXT PRIMARY KEY,
  schema_version       TEXT NOT NULL,
  timestamp            TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  action_type          TEXT,
  agent_id             TEXT,
  agent_name_snapshot  TEXT,
  trace_id             TEXT,
  span_id              TEXT,
  target_resource      TEXT,
  decision             TEXT,
  policy_evaluation    JSONB,
  request_payload      JSONB,
  response_payload     JSONB,
  metrics              JSONB,
  metadata             JSONB,
  http_status          INTEGER,
  error_code           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plugin data storage (for policy plugins to store custom data)
CREATE TABLE IF NOT EXISTS plugin_data (
  id              TEXT PRIMARY KEY,
  plugin_id       VARCHAR(100) NOT NULL,
  context_key     VARCHAR(255),
  data            JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugin_data_lookup ON plugin_data(plugin_id, context_key);
`;

function jsonOrNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return value;
}

/**
 * PostgreSQL implementation of EventSinkRepository. Inserts and lists GuardioEvent from guardio_events table.
 */
class PostgresEventSinkRepository implements EventSinkRepository {
  constructor(private readonly pool: Pool) {}

  async list(options?: { limit?: number }): Promise<StoredEvent[]> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 1000);
    const result = await this.pool.query(
      `SELECT event_id AS "eventId", timestamp, event_type AS "eventType", action_type AS "actionType",
              agent_id AS "agentId", agent_name_snapshot AS "agentNameSnapshot", decision, policy_evaluation AS "policyEvaluation"
       FROM guardio_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(
      (r: {
        eventId: string;
        timestamp: string;
        eventType: string;
        actionType: string | null;
        agentId: string | null;
        agentNameSnapshot: string | null;
        decision: string | null;
        policyEvaluation: Record<string, unknown> | null;
      }) => ({
        eventId: r.eventId,
        timestamp: r.timestamp,
        eventType: r.eventType,
        actionType: r.actionType ?? undefined,
        agentId: r.agentId ?? undefined,
        agentNameSnapshot: r.agentNameSnapshot ?? undefined,
        decision: r.decision ?? undefined,
        policyEvaluation: r.policyEvaluation ?? undefined,
      }),
    );
  }

  async insert(event: GuardioEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO guardio_events (
        event_id, schema_version, timestamp, event_type, action_type,
        agent_id, agent_name_snapshot, trace_id, span_id, target_resource, decision,
        policy_evaluation, request_payload, response_payload, metrics, metadata,
        http_status, error_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        event.eventId,
        event.schemaVersion,
        event.timestamp,
        event.eventType,
        event.actionType ?? null,
        event.agentId ?? null,
        event.agentNameSnapshot ?? null,
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
      ],
    );
  }
}

/**
 * PostgreSQL implementation of PluginRepository.
 * Scoped to a specific pluginId - all operations are automatically filtered.
 */
class PostgresPluginRepository implements PluginRepository {
  constructor(
    private readonly pool: Pool,
    private readonly pluginId: string,
  ) {}

  async saveDocument(
    contextKey: string,
    data: Record<string, unknown>,
    id?: string,
  ): Promise<string> {
    const docId = id ?? randomUUID();
    await this.pool.query(
      `INSERT INTO plugin_data (id, plugin_id, context_key, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         data = EXCLUDED.data,
         updated_at = now()`,
      [docId, this.pluginId, contextKey, data],
    );
    return docId;
  }

  async getDocument(contextKey: string): Promise<PluginDocument | null> {
    const result = await this.pool.query(
      `SELECT id, context_key AS "contextKey", data, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM plugin_data
       WHERE plugin_id = $1 AND context_key = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [this.pluginId, contextKey],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as {
      id: string;
      contextKey: string;
      data: Record<string, unknown>;
      createdAt: Date;
      updatedAt: Date;
    };
    return {
      id: row.id,
      contextKey: row.contextKey,
      data: row.data,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listDocuments(contextKey?: string): Promise<PluginDocument[]> {
    let query = `SELECT id, context_key AS "contextKey", data,
                        created_at AS "createdAt", updated_at AS "updatedAt"
                 FROM plugin_data
                 WHERE plugin_id = $1`;
    const params: unknown[] = [this.pluginId];

    if (contextKey !== undefined) {
      query += ` AND context_key = $2`;
      params.push(contextKey);
    }
    query += ` ORDER BY updated_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(
      (row: {
        id: string;
        contextKey: string;
        data: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: row.id,
        contextKey: row.contextKey,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }),
    );
  }

  async queryDocuments(filter: PluginDocumentFilter): Promise<PluginDocument[]> {
    let query = `SELECT id, context_key AS "contextKey", data,
                        created_at AS "createdAt", updated_at AS "updatedAt"
                 FROM plugin_data
                 WHERE plugin_id = $1`;
    const params: unknown[] = [this.pluginId];
    let paramIndex = 2;

    if (filter.contextKey !== undefined) {
      if (filter.contextKey.includes("%")) {
        query += ` AND context_key LIKE $${paramIndex}`;
      } else {
        query += ` AND context_key = $${paramIndex}`;
      }
      params.push(filter.contextKey);
      paramIndex++;
    }

    if (filter.dataFilter !== undefined) {
      query += ` AND data @> $${paramIndex}`;
      params.push(JSON.stringify(filter.dataFilter));
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(
      (row: {
        id: string;
        contextKey: string;
        data: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: row.id,
        contextKey: row.contextKey,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }),
    );
  }

  async deleteDocument(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM plugin_data WHERE id = $1 AND plugin_id = $2`,
      [id, this.pluginId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Built-in storage adapter using PostgreSQL. Creates resource_providers, provider_capabilities,
 * agents, connections, policy_instances, policy_assignments, and guardio_events tables.
 * Uses JSONB for JSON columns, BOOLEAN for flags, TIMESTAMPTZ for timestamps.
 */
export class PostgresStoragePlugin implements StorageAdapter {
  readonly name = "postgres";

  private pool: Pool | null = null;
  private _repository: PostgresCoreRepository | null = null;
  private _eventSinkRepository: PostgresEventSinkRepository | null = null;
  private readonly poolConfig: PoolConfig;

  constructor(config: Record<string, unknown> = {}) {
    const c = config as PostgresStoragePluginConfig;
    if (c.connectionString) {
      this.poolConfig = { connectionString: c.connectionString };
    } else {
      this.poolConfig = {
        host: c.host ?? "localhost",
        port: c.port ?? 5432,
        user: c.user,
        password: c.password,
        database: c.database,
        ssl: c.ssl,
      };
    }
  }

  async start(): Promise<void> {
    const pool = new PgPool(this.poolConfig);
    try {
      await pool.query(POSTGRES_DDL);
      logger.debug(
        { database: this.poolConfig.database ?? this.poolConfig.connectionString?.replace(/:[^:@]+@/, ":****@") },
        "PostgreSQL storage tables created",
      );
    } finally {
      await pool.end();
    }
  }

  async connect(): Promise<StorageConnectionResult> {
    try {
      this.pool = new PgPool(this.poolConfig);
      this._repository = new PostgresCoreRepository(this.pool);
      this._eventSinkRepository = new PostgresEventSinkRepository(this.pool);
      return { ok: true, client: this.pool };
    } catch (err) {
      logger.error(
        { err, database: this.poolConfig.database ?? "connectionString" },
        "PostgreSQL connect failed",
      );
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

  getPluginRepository(pluginId: string): PluginRepository | undefined {
    if (!this.pool) return undefined;
    return new PostgresPluginRepository(this.pool, pluginId);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this._repository = null;
      this._eventSinkRepository = null;
      logger.debug(
        { database: this.poolConfig.database ?? "connectionString" },
        "PostgreSQL disconnected",
      );
    }
  }

  async end(): Promise<void> {
    await this.disconnect();
  }
}
