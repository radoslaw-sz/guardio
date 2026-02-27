export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: { name?: string; arguments?: unknown };
}

/**
 * Successful JSON-RPC result returned when Guardio blocks or rejects a tool call.
 * Returned as result (not error) so AI Agent frameworks don't treat it as a fatal error.
 */
export interface GuardioBlockedResult {
  /** MCP-style content for the agent to display. */
  content: Array<{ type: "text"; text: string }>;
  /** Indicates this is a blocked/rejected outcome, not a normal tool result. */
  isError: true;
  /** Guardio metadata; prefixed to avoid clashing with MCP result fields. */
  _guardio: {
    version: string;
    requestId: string | number;
    timestamp: string;
    /** Policy plugin name that blocked/rejected. */
    policyId: string;
    /** Action type e.g. TOOL_BLOCKED, POLICY_VIOLATION. */
    action: string;
    /** Optional policy code for Dashboard/Analytics (e.g. RATE_LIMIT_EXCEEDED). */
    code?: string;
    /** Optional human/LLM-readable reason from the policy. */
    reason?: string;
  };
}

export interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

import type {
  GuardioServerConfigUrl,
  GuardioClientConfig,
} from "../config/types.js";
import type { EventBus } from "./transports/types.js";
import type { CoreRepository } from "../interfaces/CoreRepository.js";
import type { EventSinkStorePluginInterface } from "../interfaces/EventSinkStorePluginInterface.js";
import type { PluginManager } from "../config/PluginManager.js";

export interface GuardioCoreConfig {
  /** MCP servers to proxy to (HTTP/SSE URL only). At least one; each has a unique name. */
  servers: GuardioServerConfigUrl[];
  /** How the AI client connects to Guardio. Default: { mode: "stdio" }. */
  client?: GuardioClientConfig;
  /** Cwd for resolving guardio.config (default: process.cwd()) */
  cwd?: string;
  /** Explicit path to guardio config file (optional) */
  configPath?: string;
  /** General-purpose event bus (topic-based); subscribe before passing so no events are missed. */
  eventBus?: EventBus;
  /** Core repository (mandatory when using HTTP server; storage adapter provides it). */
  coreRepository: CoreRepository;
  /** Optional event sink store for GET /api/events (from PluginManager.getEventSinkStorePlugins). */
  eventSinkStore?: EventSinkStorePluginInterface;
  /** Optional PluginManager to use for event sinks (must have connected storage). When provided, getEventSinkPlugins() uses its storage in context so events can be persisted. */
  pluginManager?: PluginManager;
}

/**
 * Action names for result._guardio.action when Guardio blocks or rejects a tool call.
 * We return a successful JSON-RPC result (not an error), so numeric error codes are not used.
 * These strings identify the kind of denial for the AI Agent / client.
 */
export const GuardioAction = {
  /** Tool was blocked by a policy plugin. */
  TOOL_BLOCKED: "TOOL_BLOCKED",
  /** Policy violation (e.g. tool call denied by policy). */
  POLICY_VIOLATION: "POLICY_VIOLATION",
} as const;
