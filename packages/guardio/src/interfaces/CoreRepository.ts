/**
 * Core domain types and repository interface for Guardio storage.
 * Storage adapters that support the core schema expose a repository via getRepository().
 */

export interface Agent {
  id: string;
  name: string;
  /** Server (mcp-id) this agent is connected to; set when saving on SSE connect. */
  serverName?: string;
  /** Whether the display name was auto-generated. */
  nameGenerated?: boolean;
}

export interface PolicyAssignment {
  id: string;
  policyInstanceId: string;
  /** The JSON config for this specific policy instance. */
  config: unknown;
}

/** Assignment plus plugin id; returned by getPoliciesForContext so the core can instantiate by plugin name. */
export interface PolicyAssignmentWithPlugin extends PolicyAssignment {
  pluginId: string;
}

export interface PolicyInstance {
  id: string;
  pluginId: string;
  name?: string;
  config: unknown;
  isEnabled: boolean;
}

/**
 * Repository abstraction over the core schema (agents, policy_instances, policy_assignments).
 * Obtain from a connected StorageAdapter via adapter.getRepository().
 */
export interface CoreRepository {
  // Agent methods
  getAgentById(id: string): Promise<Agent | null>;
  saveAgent(agent: Agent): Promise<void>;
  /** Remove one connection (agent + server). Deletes the agent if they have no connections left. */
  deleteConnection(agentId: string, serverName: string): Promise<void>;
  /** Remove an agent and all their connections. */
  deleteAgent(id: string): Promise<void>;
  /** List all connections (one row per agent+server; same agent can appear for multiple servers). */
  listAgents(): Promise<Agent[]>;
  /** Get agent by display name and server (e.g. for resolving x-agent-name on POST /messages). Returns null if not found. */
  getAgentByName(name: string, serverName: string): Promise<Agent | null>;

  /**
   * Resolution query: policies that apply to the given context.
   * agentId null = "All Agents"; toolName null = "All Tools"; providerId null = all providers.
   * Returns assignments with policy instance config and pluginId, ordered by priority (higher first).
   */
  getPoliciesForContext(
    agentId: string | null,
    toolName: string | null,
    providerId?: string | null,
  ): Promise<PolicyAssignmentWithPlugin[]>;

  /** List all policy instances. */
  listPolicyInstances(): Promise<PolicyInstance[]>;

  /** Get a single policy instance by id. */
  getPolicyInstanceById(id: string): Promise<PolicyInstance | null>;

  /** Update a policy instance (config, name) and replace its assignments with a single one. */
  updatePolicyInstance(
    id: string,
    config: unknown,
    name?: string,
    agentId?: string | null,
    toolName?: string | null,
    providerId?: string | null,
  ): Promise<void>;

  /**
   * List all policy assignment rows (agent + tool scope per assignment).
   * Used by the dashboard to show assignment summary per instance.
   */
  listPolicyAssignmentRows(): Promise<
    Array<{
      policyInstanceId: string;
      agentId: string | null;
      toolName: string | null;
    }>
  >;

  /**
   * Create a policy instance (plugin type + config). Optionally assign it at creation time.
   * When agentId, toolName, and providerId are omitted, creates one assignment with (null, null, null) = globally assigned.
   * Returns the new instance id.
   */
  createPolicyInstance(
    pluginId: string,
    config: unknown,
    name?: string,
    agentId?: string | null,
    toolName?: string | null,
    providerId?: string | null,
  ): Promise<string>;

  /**
   * Create a policy assignment: link a policy instance to an agent, provider, and/or capability.
   * policyId is the policy_instance id.
   */
  assignPolicy(
    agentId: string | null,
    toolName: string | null,
    policyId: string,
    providerId?: string | null,
  ): Promise<void>;

  /**
   * Delete a policy instance. Also removes all its policy assignments.
   */
  deletePolicyInstance(policyInstanceId: string): Promise<void>;

  /**
   * Delete a single policy assignment by id.
   */
  deletePolicyAssignment(assignmentId: string): Promise<void>;

  /**
   * Persisted MCP tools cache (optional). When implemented, tools are loaded on startup
   * and saved whenever the cache is updated.
   */
  saveServerTools?(
    serverName: string,
    tools: Array<{
      name: string;
      description?: string;
      title?: string;
      inputSchema?: object;
    }>,
  ): Promise<void>;

  /** Load all persisted server tools (serverName -> tools array). Optional. */
  getAllServerTools?(): Promise<
    Record<
      string,
      Array<{
        name: string;
        description?: string;
        title?: string;
        inputSchema?: object;
      }>
    >
  >;
}
