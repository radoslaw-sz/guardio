/**
 * Dashboard API response types. Align with packages/dashboard/lib/guardio-api.ts.
 */

/** Single active SSE client (included in connection when transport provides it). */
export interface DashboardActiveClientInfo {
  id: string;
  name: string;
  nameGenerated: boolean;
  /** Server (mcp-id) this client is connected to; used for topology. */
  serverName?: string;
}

/** MCP tool shape (from tools/list); used in connection info when we've seen a tools/list response. */
export interface DashboardMcpToolInfo {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: object;
}

/** Single remote MCP server in connection info. */
export interface DashboardServerInfo {
  name: string;
  remoteUrl: string;
  remotePostUrl: string | null;
  connected: boolean;
  /** Cached from upstream tools/list response when we proxy it (optional). */
  tools?: DashboardMcpToolInfo[];
}

/** One connection between an active SSE client (agent) and an MCP server. */
export interface DashboardConnection {
  agentId: string;
  serverName: string;
  agentName?: string;
}

/** GET /api/connection response. */
export interface DashboardConnectionInfo {
  client: {
    mode: "http" | "stdio";
    listenPort?: number;
    listenHost?: string;
    activeSseClients: number;
    remoteReady: boolean;
  } | null;
  /** Remote MCP servers (multi-server mode). */
  servers: DashboardServerInfo[];
  /** @deprecated Use servers. Single server for backward compat. */
  server?: {
    remoteUrl: string;
    remotePostUrl: string | null;
    connected: boolean;
  } | null;
  /** Active SSE clients list; set by transport (extension, not from hook). */
  clients?: DashboardActiveClientInfo[];
  /** Explicit list of connections: which agent is connected to which MCP server. */
  connections?: DashboardConnection[];
}

/** Policy entry for GET /api/policies. */
export interface DashboardPolicyEntry {
  name: string;
  type: "policy";
  path?: string;
  config?: Record<string, unknown>;
  /** JSON Schema for this policy's config; used by the dashboard to build the add-policy form. */
  configSchema?: object;
  /** Optional RJSF uiSchema (e.g. from getUiSchema); used to render summary or custom widgets. */
  uiSchema?: object;
}

/** GET /api/policies response. */
export interface DashboardPoliciesInfo {
  policies: DashboardPolicyEntry[];
}

/** Single assignment scope (agent + tool) for dashboard display. */
export interface DashboardPolicyAssignmentScope {
  agentId: string | null;
  toolName: string | null;
}

/** Policy instance (from DB). */
export interface DashboardPolicyInstance {
  id: string;
  pluginId: string;
  name?: string;
  config: unknown;
  isEnabled: boolean;
  /** Assignment rows for this instance (agent/tool scope per row). Omitted when empty. */
  assignments?: DashboardPolicyAssignmentScope[];
}

/** GET /api/policy-instances response. */
export interface DashboardPolicyInstancesInfo {
  instances: DashboardPolicyInstance[];
}

/** Single event from GET /api/events (guardio_events row for activity feed). */
export interface DashboardActivityEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  actionType?: string | null;
  agentId?: string | null;
  /** Agent name from x-agent-name at request time. */
  agentNameSnapshot?: string | null;
  decision?: string | null;
  policyEvaluation?: { policyName?: string; code?: string; reason?: string } | null;
}

/** GET /api/events response. */
export interface DashboardEventsInfo {
  events: DashboardActivityEvent[];
}
