/** MCP tool (from tools/list); optional in connection info. */
export interface RemoteMcpToolInfo {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: object;
}

/**
 * One upstream MCP server in connection info.
 */
export interface RemoteMcpInfo {
  /** Server name (mcp-id); used for path /{name}/sse. */
  name?: string;
  remoteUrl: string;
  remotePostUrl: string | null;
  connected: boolean;
  /** Cached from upstream tools/list when available. */
  tools?: RemoteMcpToolInfo[];
}

/** Single active SSE client (included in connection when available). */
export interface DashboardActiveClientInfo {
  id: string;
  name: string;
  nameGenerated: boolean;
  /** Server (mcp-id) this client is connected to; used for topology. */
  serverName?: string;
}

/** One connection between an active SSE client (agent) and an MCP server. */
export interface DashboardConnection {
  agentId: string;
  serverName: string;
  agentName?: string;
}

/**
 * Shape of Guardio GET /api/connection response (dashboard connection info).
 * Only servers, clients and connections are required for the dashboard.
 */
export interface DashboardConnectionInfo {
  /** Guardio gateway info (listen address, mode, active SSE count). */
  client?: {
    mode: "http" | "stdio";
    listenPort?: number;
    listenHost?: string;
    activeSseClients: number;
    remoteReady: boolean;
  } | null;
  /** Remote MCP servers. */
  servers?: Array<{
    name: string;
    remoteUrl: string;
    remotePostUrl: string | null;
    connected: boolean;
    tools?: RemoteMcpToolInfo[];
  }>;
  /** Active SSE clients (agents). */
  clients?: DashboardActiveClientInfo[];
  /** Agent ↔ MCP server edges. */
  connections?: DashboardConnection[];
}

/** Get the list of agent↔MCP connections from connection info. */
export function getConnections(info: DashboardConnectionInfo | null): DashboardConnection[] {
  return info?.connections ?? [];
}

/** Remote MCP servers for UI (from connection info). */
export function getRemoteMcps(info: DashboardConnectionInfo | null): RemoteMcpInfo[] {
  if (!info?.servers?.length) return [];
  return info.servers.map((s) => ({
    name: s.name,
    remoteUrl: s.remoteUrl,
    remotePostUrl: s.remotePostUrl,
    connected: s.connected,
    tools: s.tools,
  }));
}

const defaultBaseUrl =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GUARDIO_API_URL
    ? process.env.NEXT_PUBLIC_GUARDIO_API_URL
    : "http://127.0.0.1:3939";

export function getGuardioConnectionUrl(): string {
  const base = defaultBaseUrl.replace(/\/$/, "");
  return `${base}/api/connection`;
}

export async function fetchConnectionInfo(): Promise<DashboardConnectionInfo | null> {
  try {
    const res = await fetch(getGuardioConnectionUrl(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardConnectionInfo;
  } catch {
    return null;
  }
}

/** Policy entry from Guardio config (GET /api/policies). */
export interface DashboardPolicyEntry {
  name: string;
  type: "policy";
  path?: string;
  config?: Record<string, unknown>;
  /** JSON Schema for this policy's config; used to build the add-policy form. */
  configSchema?: object;
  /** Optional RJSF uiSchema (from plugin getUiSchema); e.g. for generic summary widget. */
  uiSchema?: object;
}

export interface DashboardPoliciesInfo {
  policies: DashboardPolicyEntry[];
}

export function getGuardioPoliciesUrl(): string {
  const base = defaultBaseUrl.replace(/\/$/, "");
  return `${base}/api/policies`;
}

export async function fetchPoliciesInfo(): Promise<DashboardPoliciesInfo | null> {
  try {
    const res = await fetch(getGuardioPoliciesUrl(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardPoliciesInfo;
  } catch {
    return null;
  }
}

/** Single assignment scope (agent + tool) for a policy instance. */
export interface DashboardPolicyAssignmentScope {
  agentId: string | null;
  toolName: string | null;
}

/** Policy instance (from GET /api/policy-instances). */
export interface DashboardPolicyInstance {
  id: string;
  pluginId: string;
  name?: string;
  config: unknown;
  isEnabled: boolean;
  /** Assignment rows for this instance. Omitted when empty. */
  assignments?: DashboardPolicyAssignmentScope[];
}

export interface DashboardPolicyInstancesInfo {
  instances: DashboardPolicyInstance[];
}

export function getGuardioPolicyInstancesUrl(): string {
  const base = defaultBaseUrl.replace(/\/$/, "");
  return `${base}/api/policy-instances`;
}

export async function fetchPolicyInstances(): Promise<DashboardPolicyInstancesInfo | null> {
  try {
    const res = await fetch(getGuardioPolicyInstancesUrl(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardPolicyInstancesInfo;
  } catch {
    return null;
  }
}

/** Request body for creating a policy instance. */
export interface CreatePolicyInstanceBody {
  pluginName: string;
  config: unknown;
  name?: string;
  /** When omitted, policy is globally assigned. When provided, creates that assignment. */
  agentId?: string | null;
  toolName?: string | null;
}

/** Result of creating a policy instance. */
export type CreatePolicyInstanceResult =
  | { id: string }
  | { error: string };

export async function createPolicyInstance(
  body: CreatePolicyInstanceBody,
): Promise<CreatePolicyInstanceResult> {
  const res = await fetch(getGuardioPolicyInstancesUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as CreatePolicyInstanceResult;
  if (!res.ok && !("error" in data)) {
    return { error: res.statusText || "Failed to create policy instance" };
  }
  return data;
}

export async function fetchPolicyInstance(
  id: string,
): Promise<DashboardPolicyInstance | null> {
  try {
    const res = await fetch(`${getGuardioPolicyInstancesUrl()}/${id}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardPolicyInstance;
  } catch {
    return null;
  }
}

/** Request body for updating a policy instance (PATCH). */
export interface UpdatePolicyInstanceBody {
  config: unknown;
  name?: string;
  agentId?: string | null;
  toolName?: string | null;
}

export async function updatePolicyInstance(
  id: string,
  body: UpdatePolicyInstanceBody,
): Promise<void> {
  const res = await fetch(`${getGuardioPolicyInstancesUrl()}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text) as { error?: string };
      message = json.error ?? res.statusText;
    } catch {
      message = text || res.statusText;
    }
    throw new Error(message);
  }
}

export async function deletePolicyInstance(policyInstanceId: string): Promise<void> {
  const res = await fetch(`${getGuardioPolicyInstancesUrl()}/${policyInstanceId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text) as { error?: string };
      message = json.error ?? res.statusText;
    } catch {
      message = text || res.statusText;
    }
    throw new Error(message);
  }
}

/** Single event from GET /api/events (guardio_events for activity feed). */
export interface DashboardActivityEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  actionType?: string | null;
  agentId?: string | null;
  decision?: string | null;
  policyEvaluation?: { policyName?: string; code?: string; reason?: string } | null;
}

export interface DashboardEventsInfo {
  events: DashboardActivityEvent[];
}

export function getGuardioEventsUrl(): string {
  const base = defaultBaseUrl.replace(/\/$/, "");
  return `${base}/api/events`;
}

export async function fetchEvents(): Promise<DashboardEventsInfo | null> {
  try {
    const res = await fetch(getGuardioEventsUrl(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardEventsInfo;
  } catch {
    return null;
  }
}

/** Fetch a single event by id (from the events list). Returns null if not found. */
export async function fetchEvent(
  eventId: string,
): Promise<DashboardActivityEvent | null> {
  const info = await fetchEvents();
  const event = info?.events?.find((e) => e.eventId === eventId) ?? null;
  return event;
}

