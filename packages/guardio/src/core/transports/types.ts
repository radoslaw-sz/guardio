import type { EventEmitter } from "node:events";
import type {
  DashboardConnectionInfo,
  DashboardPoliciesInfo,
  DashboardPolicyInstance,
  DashboardPolicyInstancesInfo,
  DashboardEventsInfo,
  DashboardActiveClientInfo,
} from "./dashboard-api-types.js";

/**
 * Payload for HTTP POST /messages: body, server name (mcp-id from path), and callback to send the HTTP response.
 */
export interface PostRequestPayload {
  body: string;
  /** Server name from path segment (/:mcpId/messages). Used to route to the correct upstream transport. */
  serverName: string;
  reply: (status: number, body: string) => void;
  /** Optional agent id (e.g. from x-agent-id header). When null, only global and tool-scoped policy assignments apply. */
  agentId?: string | null;
}

/**
 * Base transport interface: send + start + event emitter.
 * Implementations extend EventEmitter and emit domain events instead of taking callbacks.
 */
export interface ITransport extends EventEmitter {
  send(message: string): void | Promise<void>;
  start(): Promise<void>;
}

/**
 * Server transport (to remote MCP). Extends ITransport.
 * Emits: 'message' (line: string), 'endpointReady' ().
 * Must be started before send() is used. getRemotePostUrl() is available after 'endpointReady'.
 */
export interface IServerTransport extends ITransport {
  send(line: string): Promise<void>;
  /** Base/SSE URL of the remote MCP (from config). */
  getRemoteUrl(): string;
  /** URL for POST requests to remote MCP; null until endpoint event received. */
  getRemotePostUrl(): string | null;
}

/** Payload for the 'agent.discovered' topic when an agent connects via SSE. */
export interface AgentDiscoveredPayload {
  id: string;
  name: string;
}

/** Topic names for the event bus. Use these when emitting or subscribing. */
export const BusTopic = {
  AGENT_DISCOVERED: "agent.discovered",
} as const;

export type BusTopicName = (typeof BusTopic)[keyof typeof BusTopic];

/**
 * General-purpose event bus. Use topic strings (e.g. BusTopic.AGENT_DISCOVERED) to emit
 * or subscribe. Create one (e.g. new EventEmitter()), attach subscribers first, then pass
 * to GuardioCore so no events are missed. Compatible with Node's EventEmitter.
 */
export interface EventBus {
  emit(topic: string, payload?: unknown): boolean;
  on(topic: string, handler: (payload: unknown) => void): unknown;
}

/**
 * Client transport (from AI Agent). Extends ITransport.
 * Emits: 'message' (line: string) for stdio-style lines; 'postRequest' (payload: PostRequestPayload) for HTTP POST /messages;
 * Emits to config.eventBus under BusTopic.AGENT_DISCOVERED when an agent connects via SSE.
 * Optional setRemoteReady(serverName) for HTTP mode when server signals endpoint is ready.
 */
export interface IClientTransport extends ITransport {
  /** When serverName is provided, broadcast only to clients connected to that server. */
  send(message: string, serverName?: string): void;
  /** Broadcast endpoint path to clients of the given server (HTTP mode). */
  setRemoteReady?(serverName: string): void;
  /** Number of active SSE clients (for dashboard). */
  getActiveSseClients?(): number;
  /** Active SSE clients list (id, name, nameGenerated); merged into GET /api/connection by transport. */
  getActiveClientsInfo?(): DashboardActiveClientInfo[] | Promise<DashboardActiveClientInfo[]>;
  /** Whether remote MCP endpoint has been advertised to clients (per-server in multi-server mode). */
  getRemoteReady?(): boolean;
}

/** @deprecated Use IServerTransport. */
export type McpTransport = IServerTransport;

/** @deprecated Use IClientTransport. */
export type ClientTransport = IClientTransport;

/** Body for POST /api/policy-instances. */
export interface CreatePolicyInstanceBody {
  pluginName: string;
  config: unknown;
  name?: string;
  /** When omitted, policy is globally assigned (null, null). When provided, creates that assignment. */
  agentId?: string | null;
  toolName?: string | null;
}

/** Result of creating a policy instance. */
export type CreatePolicyInstanceResult =
  | { id: string }
  | { error: string };

/**
 * Optional hooks for dashboard/control-plane API. Passed from GuardioCore into the client transport.
 * Transport calls these when GET/POST /api/* is requested; no events, direct callbacks.
 */
export interface ClientTransportDashboardHooks {
  /** GET /api/connection → handler returns connection info. */
  handleConnectionRequest?: () => Promise<DashboardConnectionInfo | null>;
  /** GET /api/policies → handler returns policies list. */
  handlePoliciesRequest?: () => Promise<DashboardPoliciesInfo | null>;
  /** GET /api/policy-instances → list policy instances. */
  handleListPolicyInstances?: () => Promise<DashboardPolicyInstancesInfo | null>;

  /** GET /api/events → list recent activity events (guardio_events). */
  handleListEvents?: () => Promise<DashboardEventsInfo | null>;

  /** POST /api/policy-instances → create a policy instance; returns { id } or { error }. */
  handleCreatePolicyInstance?: (
    body: CreatePolicyInstanceBody,
  ) => Promise<CreatePolicyInstanceResult>;

  /** DELETE /api/policy-instances/:id → delete a policy instance. */
  handleDeletePolicyInstance?: (policyInstanceId: string) => Promise<void>;

  /** GET /api/policy-instances/:id → get one policy instance with assignments. */
  handleGetPolicyInstance?: (id: string) => Promise<DashboardPolicyInstance | null>;

  /** PATCH /api/policy-instances/:id → update config, name, and assignment. */
  handleUpdatePolicyInstance?: (
    id: string,
    body: UpdatePolicyInstanceBody,
  ) => Promise<UpdatePolicyInstanceResult>;
}

/** Body for PATCH /api/policy-instances/:id. */
export interface UpdatePolicyInstanceBody {
  config: unknown;
  name?: string;
  agentId?: string | null;
  toolName?: string | null;
}

/** Result of updating a policy instance. */
export type UpdatePolicyInstanceResult = { error?: string };
