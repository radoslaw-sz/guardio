import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type {
  CoreRepository,
  Agent,
  PolicyAssignmentWithPlugin,
  PolicyInstance,
} from "../../interfaces/CoreRepository.js";

/**
 * Ensure a resource_provider row exists for the given server name (used as stable id).
 * Returns the provider's id.
 */
function ensureProviderId(db: Database.Database, serverName: string): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO resource_providers (id, name, type, status) VALUES (?, ?, 'mcp', 'disconnected')
     ON CONFLICT(name) DO NOTHING`,
  ).run(id, serverName);
  const row = db
    .prepare("SELECT id FROM resource_providers WHERE name = ?")
    .get(serverName) as { id: string } | undefined;
  if (!row)
    throw new Error(`Expected resource_provider for name=${serverName}`);
  return row.id;
}

/**
 * SQLite implementation of CoreRepository. Uses the core schema
 * (resource_providers, provider_capabilities, agents, connections, policy_instances, policy_assignments).
 */
export class SqliteCoreRepository implements CoreRepository {
  constructor(private readonly db: Database.Database) {}

  async getAgentById(id: string): Promise<Agent | null> {
    const row = this.db
      .prepare(
        `SELECT a.id, a.name, a.name_generated AS nameGenerated, rp.name AS serverName
         FROM agents a
         LEFT JOIN connections c ON c.agent_id = a.id
         LEFT JOIN resource_providers rp ON rp.id = c.provider_id
         WHERE a.id = ?`,
      )
      .get(id) as
      | {
          id: string;
          name: string | null;
          nameGenerated: number;
          serverName: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name ?? "",
      serverName: row.serverName ?? undefined,
      nameGenerated: row.nameGenerated !== 0 ? true : undefined,
    };
  }

  async saveAgent(agent: Agent): Promise<void> {
    const now = new Date().toISOString();
    const nameGenerated = agent.nameGenerated === true ? 1 : 0;
    this.db
      .prepare(
        `INSERT INTO agents (id, name, name_generated, metadata, connected_at, last_seen_at)
         VALUES (?, ?, ?, '{}', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           name_generated = excluded.name_generated,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(agent.id, agent.name, nameGenerated, now, now);
    if (agent.serverName != null && agent.serverName !== "") {
      const providerId = ensureProviderId(this.db, agent.serverName);
      this.db
        .prepare(
          `INSERT INTO connections (agent_id, provider_id, connected_at)
           VALUES (?, ?, ?)
           ON CONFLICT(agent_id, provider_id) DO NOTHING`,
        )
        .run(agent.id, providerId, now);
    }
  }

  async deleteConnection(agentId: string, serverName: string): Promise<void> {
    const row = this.db
      .prepare("SELECT id FROM resource_providers WHERE name = ?")
      .get(serverName) as { id: string } | undefined;
    if (row) {
      this.db
        .prepare(
          "DELETE FROM connections WHERE agent_id = ? AND provider_id = ?",
        )
        .run(agentId, row.id);
    }
    const remaining = this.db
      .prepare("SELECT 1 FROM connections WHERE agent_id = ?")
      .get(agentId);
    if (!remaining) {
      this.db.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
    }
  }

  async listAgents(): Promise<Agent[]> {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.name, a.name_generated AS nameGenerated, rp.name AS serverName
         FROM agents a
         INNER JOIN connections c ON c.agent_id = a.id
         INNER JOIN resource_providers rp ON rp.id = c.provider_id`,
      )
      .all() as Array<{
      id: string;
      name: string | null;
      nameGenerated: number;
      serverName: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "",
      serverName: r.serverName ?? undefined,
      nameGenerated: r.nameGenerated !== 0 ? true : undefined,
    }));
  }

  async deleteAgent(id: string): Promise<void> {
    this.db.prepare("DELETE FROM connections WHERE agent_id = ?").run(id);
    this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  }

  async getPoliciesForContext(
    agentId: string | null,
    toolName: string | null,
    providerId?: string | null,
  ): Promise<PolicyAssignmentWithPlugin[]> {
    const rows = this.db
      .prepare(
        `
        SELECT a.id, a.policy_instance_id AS policyInstanceId, p.plugin_id AS pluginId, p.config
        FROM policy_assignments a
        JOIN policy_instances p ON p.id = a.policy_instance_id
        WHERE p.is_enabled = 1
          AND (a.agent_id IS NULL OR a.agent_id = ?)
          AND (a.provider_id IS NULL OR a.provider_id = ?)
          AND (a.capability_name IS NULL OR a.capability_name = ?)
        ORDER BY a.priority DESC
       `,
      )
      .all(agentId ?? null, providerId ?? null, toolName ?? null) as Array<{
      id: string;
      policyInstanceId: string;
      pluginId: string;
      config: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      policyInstanceId: r.policyInstanceId,
      pluginId: r.pluginId ?? "",
      config: r.config != null ? (JSON.parse(r.config) as unknown) : null,
    }));
  }

  async listPolicyInstances(): Promise<PolicyInstance[]> {
    const rows = this.db
      .prepare(
        `SELECT id, plugin_id AS pluginId, name, config, is_enabled AS isEnabled
         FROM policy_instances ORDER BY name IS NULL, name, id`,
      )
      .all() as Array<{
      id: string;
      pluginId: string | null;
      name: string | null;
      config: string | null;
      isEnabled: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      pluginId: r.pluginId ?? "",
      name: r.name ?? undefined,
      config: r.config != null ? (JSON.parse(r.config) as unknown) : {},
      isEnabled: r.isEnabled !== 0,
    }));
  }

  async getPolicyInstanceById(id: string): Promise<PolicyInstance | null> {
    const row = this.db
      .prepare(
        `SELECT id, plugin_id AS pluginId, name, config, is_enabled AS isEnabled
         FROM policy_instances WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          pluginId: string | null;
          name: string | null;
          config: string | null;
          isEnabled: number;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      pluginId: row.pluginId ?? "",
      name: row.name ?? undefined,
      config: row.config != null ? (JSON.parse(row.config) as unknown) : {},
      isEnabled: row.isEnabled !== 0,
    };
  }

  async updatePolicyInstance(
    id: string,
    config: unknown,
    name?: string,
    agentId?: string | null,
    toolName?: string | null,
    providerId?: string | null,
  ): Promise<void> {
    const configJson = JSON.stringify(config ?? {});
    this.db
      .prepare(`UPDATE policy_instances SET config = ?, name = ? WHERE id = ?`)
      .run(configJson, name ?? "", id);
    this.db
      .prepare("DELETE FROM policy_assignments WHERE policy_instance_id = ?")
      .run(id);
    const assignAgentId = agentId !== undefined ? agentId : null;
    const assignCapabilityName = toolName !== undefined ? toolName : null;
    const assignProviderId = providerId !== undefined ? providerId : null;
    const assignId = uuidv4();
    this.db
      .prepare(
        `INSERT INTO policy_assignments (id, policy_instance_id, agent_id, provider_id, capability_name, priority, created_at)
         VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
      )
      .run(assignId, id, assignAgentId, assignProviderId, assignCapabilityName);
  }

  async listPolicyAssignmentRows(): Promise<
    Array<{
      policyInstanceId: string;
      agentId: string | null;
      toolName: string | null;
    }>
  > {
    const rows = this.db
      .prepare(
        `SELECT policy_instance_id AS policyInstanceId, agent_id AS agentId, capability_name AS toolName
         FROM policy_assignments`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      policyInstanceId:
        (r.policyInstanceId as string) ??
        (r.policy_instance_id as string) ??
        "",
      agentId: (r.agentId ?? r.agent_id ?? null) as string | null,
      toolName: (r.toolName ?? r.capability_name ?? null) as string | null,
    }));
  }

  async createPolicyInstance(
    pluginId: string,
    config: unknown,
    name?: string,
    agentId?: string | null,
    toolName?: string | null,
    providerId?: string | null,
  ): Promise<string> {
    const id = uuidv4();
    const configJson = JSON.stringify(config ?? {});
    this.db
      .prepare(
        `INSERT INTO policy_instances (id, plugin_id, name, config, is_enabled, created_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'))`,
      )
      .run(id, pluginId, name ?? "", configJson);
    const assignAgentId = agentId !== undefined ? agentId : null;
    const assignCapabilityName = toolName !== undefined ? toolName : null;
    const assignProviderId = providerId !== undefined ? providerId : null;
    const assignId = uuidv4();
    this.db
      .prepare(
        `INSERT INTO policy_assignments (id, policy_instance_id, agent_id, provider_id, capability_name, priority, created_at)
         VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
      )
      .run(assignId, id, assignAgentId, assignProviderId, assignCapabilityName);
    return id;
  }

  async assignPolicy(
    agentId: string | null,
    toolName: string | null,
    policyId: string,
    providerId?: string | null,
  ): Promise<void> {
    const id = uuidv4();
    this.db
      .prepare(
        `INSERT INTO policy_assignments (id, policy_instance_id, agent_id, provider_id, capability_name, priority, created_at)
         VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
      )
      .run(id, policyId, agentId, providerId ?? null, toolName);
  }

  async deletePolicyInstance(policyInstanceId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM policy_assignments WHERE policy_instance_id = ?")
      .run(policyInstanceId);
    this.db
      .prepare("DELETE FROM policy_instances WHERE id = ?")
      .run(policyInstanceId);
  }

  async deletePolicyAssignment(assignmentId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM policy_assignments WHERE id = ?")
      .run(assignmentId);
  }

  async saveServerTools(
    serverName: string,
    tools: Array<{
      name: string;
      description?: string;
      title?: string;
      inputSchema?: object;
    }>,
  ): Promise<void> {
    const providerId = ensureProviderId(this.db, serverName);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE resource_providers SET last_discovery_at = ?, status = 'connected' WHERE id = ?`,
      )
      .run(now, providerId);
    this.db
      .prepare(
        `DELETE FROM provider_capabilities WHERE provider_id = ? AND capability_type = 'tool'`,
      )
      .run(providerId);
    const insertCap = this.db.prepare(
      `INSERT INTO provider_capabilities (id, provider_id, capability_type, name, description, schema, status, discovered_at, last_seen_at)
       VALUES (?, ?, 'tool', ?, ?, ?, 'available', ?, ?)`,
    );
    for (const t of tools) {
      const schemaJson =
        t.inputSchema != null ? JSON.stringify(t.inputSchema) : null;
      insertCap.run(
        uuidv4(),
        providerId,
        t.name,
        t.description ?? t.title ?? null,
        schemaJson,
        now,
        now,
      );
    }
  }

  async getAllServerTools(): Promise<
    Record<
      string,
      Array<{
        name: string;
        description?: string;
        title?: string;
        inputSchema?: object;
      }>
    >
  > {
    const rows = this.db
      .prepare(
        `SELECT rp.name AS serverName, pc.name AS toolName, pc.description, pc.schema
         FROM provider_capabilities pc
         JOIN resource_providers rp ON rp.id = pc.provider_id
         WHERE pc.capability_type = 'tool' AND rp.type = 'mcp'`,
      )
      .all() as Array<{
      serverName: string;
      toolName: string;
      description: string | null;
      schema: string | null;
    }>;
    const out: Record<
      string,
      Array<{
        name: string;
        description?: string;
        title?: string;
        inputSchema?: object;
      }>
    > = {};
    for (const r of rows) {
      if (!out[r.serverName]) out[r.serverName] = [];
      let inputSchema: object | undefined;
      if (r.schema) {
        try {
          inputSchema = JSON.parse(r.schema) as object;
        } catch {
          // skip invalid JSON
        }
      }
      out[r.serverName].push({
        name: r.toolName,
        description: r.description ?? undefined,
        inputSchema,
      });
    }
    return out;
  }
}
