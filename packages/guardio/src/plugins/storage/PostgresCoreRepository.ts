import type { Pool } from "pg";
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
async function ensureProviderId(
  pool: Pool,
  serverName: string,
): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO resource_providers (id, name, type, status) VALUES ($1, $2, 'mcp', 'disconnected')
     ON CONFLICT(name) DO NOTHING`,
    [id, serverName],
  );
  const result = await pool.query(
    "SELECT id FROM resource_providers WHERE name = $1",
    [serverName],
  );
  const row = result.rows[0] as { id: string } | undefined;
  if (!row)
    throw new Error(`Expected resource_provider for name=${serverName}`);
  return row.id;
}

/**
 * PostgreSQL implementation of CoreRepository. Uses the core schema
 * (resource_providers, provider_capabilities, agents, connections, policy_instances, policy_assignments).
 */
export class PostgresCoreRepository implements CoreRepository {
  constructor(private readonly pool: Pool) {}

  async getAgentById(id: string): Promise<Agent | null> {
    const result = await this.pool.query(
      `SELECT a.id, a.name, a.name_generated AS "nameGenerated", rp.name AS "serverName"
       FROM agents a
       LEFT JOIN connections c ON c.agent_id = a.id
       LEFT JOIN resource_providers rp ON rp.id = c.provider_id
       WHERE a.id = $1`,
      [id],
    );
    const row = result.rows[0] as
      | {
          id: string;
          name: string | null;
          nameGenerated: boolean;
          serverName: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name ?? "",
      serverName: row.serverName ?? undefined,
      nameGenerated: row.nameGenerated ? true : undefined,
    };
  }

  async saveAgent(agent: Agent): Promise<void> {
    const now = new Date().toISOString();
    const nameGenerated = agent.nameGenerated === true;
    await this.pool.query(
      `INSERT INTO agents (id, name, name_generated, metadata, connected_at, last_seen_at)
       VALUES ($1, $2, $3, '{}', $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         name = EXCLUDED.name,
         name_generated = EXCLUDED.name_generated,
         last_seen_at = EXCLUDED.last_seen_at`,
      [agent.id, agent.name, nameGenerated, now, now],
    );
    if (agent.serverName != null && agent.serverName !== "") {
      const providerId = await ensureProviderId(this.pool, agent.serverName);
      await this.pool.query(
        `INSERT INTO connections (agent_id, provider_id, connected_at)
         VALUES ($1, $2, $3)
         ON CONFLICT(agent_id, provider_id) DO NOTHING`,
        [agent.id, providerId, now],
      );
    }
  }

  async deleteConnection(agentId: string, serverName: string): Promise<void> {
    const provResult = await this.pool.query(
      "SELECT id FROM resource_providers WHERE name = $1",
      [serverName],
    );
    const provRow = provResult.rows[0] as { id: string } | undefined;
    if (provRow) {
      await this.pool.query(
        "DELETE FROM connections WHERE agent_id = $1 AND provider_id = $2",
        [agentId, provRow.id],
      );
    }
    const remaining = await this.pool.query(
      "SELECT 1 FROM connections WHERE agent_id = $1",
      [agentId],
    );
    if (remaining.rows.length === 0) {
      await this.pool.query("DELETE FROM agents WHERE id = $1", [agentId]);
    }
  }

  async listAgents(): Promise<Agent[]> {
    const result = await this.pool.query(
      `SELECT a.id, a.name, a.name_generated AS "nameGenerated", rp.name AS "serverName"
       FROM agents a
       INNER JOIN connections c ON c.agent_id = a.id
       INNER JOIN resource_providers rp ON rp.id = c.provider_id`,
    );
    return result.rows.map((r: { id: string; name: string | null; nameGenerated: boolean; serverName: string | null }) => ({
      id: r.id,
      name: r.name ?? "",
      serverName: r.serverName ?? undefined,
      nameGenerated: r.nameGenerated ? true : undefined,
    }));
  }

  async deleteAgent(id: string): Promise<void> {
    await this.pool.query("DELETE FROM connections WHERE agent_id = $1", [id]);
    await this.pool.query("DELETE FROM agents WHERE id = $1", [id]);
  }

  async getPoliciesForContext(
    agentId: string | null,
    toolName: string | null,
    providerId?: string | null,
  ): Promise<PolicyAssignmentWithPlugin[]> {
    const result = await this.pool.query(
      `SELECT a.id, a.policy_instance_id AS "policyInstanceId", p.plugin_id AS "pluginId", p.config
       FROM policy_assignments a
       JOIN policy_instances p ON p.id = a.policy_instance_id
       WHERE p.is_enabled = true
         AND (a.agent_id IS NULL OR a.agent_id = $1)
         AND (a.provider_id IS NULL OR a.provider_id = $2)
         AND (a.capability_name IS NULL OR a.capability_name = $3)
       ORDER BY a.priority DESC`,
      [agentId ?? null, providerId ?? null, toolName ?? null],
    );
    return result.rows.map(
      (r: { id: string; policyInstanceId: string; pluginId: string; config: unknown }) => ({
        id: r.id,
        policyInstanceId: r.policyInstanceId,
        pluginId: r.pluginId ?? "",
        config: r.config ?? null,
      }),
    );
  }

  async listPolicyInstances(): Promise<PolicyInstance[]> {
    const result = await this.pool.query(
      `SELECT id, plugin_id AS "pluginId", name, config, is_enabled AS "isEnabled"
       FROM policy_instances ORDER BY name IS NULL, name, id`,
    );
    return result.rows.map(
      (r: { id: string; pluginId: string | null; name: string | null; config: unknown; isEnabled: boolean }) => ({
        id: r.id,
        pluginId: r.pluginId ?? "",
        name: r.name ?? undefined,
        config: r.config ?? {},
        isEnabled: r.isEnabled,
      }),
    );
  }

  async getPolicyInstanceById(id: string): Promise<PolicyInstance | null> {
    const result = await this.pool.query(
      `SELECT id, plugin_id AS "pluginId", name, config, is_enabled AS "isEnabled"
       FROM policy_instances WHERE id = $1`,
      [id],
    );
    const row = result.rows[0] as
      | {
          id: string;
          pluginId: string | null;
          name: string | null;
          config: unknown;
          isEnabled: boolean;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      pluginId: row.pluginId ?? "",
      name: row.name ?? undefined,
      config: row.config ?? {},
      isEnabled: row.isEnabled,
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
    await this.pool.query(
      `UPDATE policy_instances SET config = $1, name = $2 WHERE id = $3`,
      [configJson, name ?? "", id],
    );
    await this.pool.query(
      "DELETE FROM policy_assignments WHERE policy_instance_id = $1",
      [id],
    );
    const assignAgentId = agentId !== undefined ? agentId : null;
    const assignCapabilityName = toolName !== undefined ? toolName : null;
    const assignProviderId = providerId !== undefined ? providerId : null;
    const assignId = uuidv4();
    await this.pool.query(
      `INSERT INTO policy_assignments (id, policy_instance_id, agent_id, provider_id, capability_name, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, now())`,
      [assignId, id, assignAgentId, assignProviderId, assignCapabilityName],
    );
  }

  async listPolicyAssignmentRows(): Promise<
    Array<{
      policyInstanceId: string;
      agentId: string | null;
      toolName: string | null;
    }>
  > {
    const result = await this.pool.query(
      `SELECT policy_instance_id AS "policyInstanceId", agent_id AS "agentId", capability_name AS "toolName"
       FROM policy_assignments`,
    );
    return result.rows.map(
      (r: { policyInstanceId: string; agentId: string | null; toolName: string | null }) => ({
        policyInstanceId: r.policyInstanceId ?? "",
        agentId: r.agentId ?? null,
        toolName: r.toolName ?? null,
      }),
    );
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
    await this.pool.query(
      `INSERT INTO policy_instances (id, plugin_id, name, config, is_enabled, created_at)
       VALUES ($1, $2, $3, $4, true, now())`,
      [id, pluginId, name ?? "", configJson],
    );
    const assignAgentId = agentId !== undefined ? agentId : null;
    const assignCapabilityName = toolName !== undefined ? toolName : null;
    const assignProviderId = providerId !== undefined ? providerId : null;
    const assignId = uuidv4();
    await this.pool.query(
      `INSERT INTO policy_assignments (id, policy_instance_id, agent_id, provider_id, capability_name, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, now())`,
      [assignId, id, assignAgentId, assignProviderId, assignCapabilityName],
    );
    return id;
  }

  async assignPolicy(
    agentId: string | null,
    toolName: string | null,
    policyId: string,
    providerId?: string | null,
  ): Promise<void> {
    const id = uuidv4();
    await this.pool.query(
      `INSERT INTO policy_assignments (id, policy_instance_id, agent_id, provider_id, capability_name, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, now())`,
      [id, policyId, agentId, providerId ?? null, toolName],
    );
  }

  async deletePolicyInstance(policyInstanceId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM policy_assignments WHERE policy_instance_id = $1",
      [policyInstanceId],
    );
    await this.pool.query("DELETE FROM policy_instances WHERE id = $1", [
      policyInstanceId,
    ]);
  }

  async deletePolicyAssignment(assignmentId: string): Promise<void> {
    await this.pool.query("DELETE FROM policy_assignments WHERE id = $1", [
      assignmentId,
    ]);
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
    const providerId = await ensureProviderId(this.pool, serverName);
    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE resource_providers SET last_discovery_at = $1, status = 'connected' WHERE id = $2`,
      [now, providerId],
    );
    await this.pool.query(
      `DELETE FROM provider_capabilities WHERE provider_id = $1 AND capability_type = 'tool'`,
      [providerId],
    );
    for (const t of tools) {
      const schemaJson =
        t.inputSchema != null ? JSON.stringify(t.inputSchema) : null;
      await this.pool.query(
        `INSERT INTO provider_capabilities (id, provider_id, capability_type, name, description, schema, status, discovered_at, last_seen_at)
         VALUES ($1, $2, 'tool', $3, $4, $5, 'available', $6, $7)`,
        [
          uuidv4(),
          providerId,
          t.name,
          t.description ?? t.title ?? null,
          schemaJson,
          now,
          now,
        ],
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
    const result = await this.pool.query(
      `SELECT rp.name AS "serverName", pc.name AS "toolName", pc.description, pc.schema
       FROM provider_capabilities pc
       JOIN resource_providers rp ON rp.id = pc.provider_id
       WHERE pc.capability_type = 'tool' AND rp.type = 'mcp'`,
    );
    const out: Record<
      string,
      Array<{
        name: string;
        description?: string;
        title?: string;
        inputSchema?: object;
      }>
    > = {};
    for (const r of result.rows as Array<{
      serverName: string;
      toolName: string;
      description: string | null;
      schema: object | string | null;
    }>) {
      if (!out[r.serverName]) out[r.serverName] = [];
      let inputSchema: object | undefined;
      if (r.schema != null) {
        try {
          inputSchema =
            typeof r.schema === "string"
              ? (JSON.parse(r.schema) as object)
              : r.schema;
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
