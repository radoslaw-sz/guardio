/**
 * Policy plugin entry in guardio config.
 * Use "path" for a custom plugin (directory with index.js/index.mjs; default export = instance).
 */
export interface PolicyPluginConfigEntry {
  type: "policy";
  name: string;
  /** Directory to custom plugin (relative to config file or absolute). Must contain index.js or index.mjs with default export = policy instance. */
  path?: string;
}

/**
 * Storage plugin entry in guardio config.
 * Use "path" for a custom plugin (directory with index.js/index.mjs; default export = instance).
 */
export interface StoragePluginConfigEntry {
  type: "storage";
  name: string;
  /** Directory to custom plugin (relative to config file or absolute). Must contain index.js or index.mjs with default export = storage adapter instance. */
  path?: string;
  config?: Record<string, unknown>;
}

/**
 * EventSink plugin entry in guardio config.
 * Use "path" for a custom plugin (directory with index.js/index.mjs; default export = instance).
 */
export interface EventSinkPluginConfigEntry {
  type: "eventSink";
  name: string;
  /** Directory to custom plugin (relative to config file or absolute). Must contain index.js or index.mjs with default export = event sink instance. */
  path?: string;
  config?: Record<string, unknown>;
}

/**
 * EventSinkStore plugin entry in guardio config (fetches events for dashboard).
 * Use "path" for a custom plugin (directory with index.js/index.mjs; default export = instance).
 */
export interface EventSinkStorePluginConfigEntry {
  type: "eventSinkStore";
  name: string;
  /** Directory to custom plugin (relative to config file or absolute). Must contain index.js or index.mjs with default export = event sink store instance. */
  path?: string;
  config?: Record<string, unknown>;
}

/**
 * Any plugin entry in guardio config.
 */
export type PluginConfigEntry =
  | PolicyPluginConfigEntry
  | StoragePluginConfigEntry
  | EventSinkPluginConfigEntry
  | EventSinkStorePluginConfigEntry;

/**
 * MCP server to proxy to (HTTP/SSE URL only).
 */
export interface GuardioServerConfigUrl {
  type: "url";
  /** Unique name used as URL segment: /{name}/sse and /{name}/messages. Must be unique across servers. */
  name: string;
  url: string;
  /** Optional headers (e.g. Authorization). */
  headers?: Record<string, string>;
  /** Request timeout in ms. Defaults to 30000. */
  timeoutMs?: number;
}

/** Server config: only HTTP/SSE URL is supported. */
export type GuardioServerConfig = GuardioServerConfigUrl;

/**
 * Listen address for the Guardio HTTP server. Clients (e.g. AI Agents) connect to this URL.
 */
export interface GuardioClientConfig {
  /** Port the HTTP server listens on. Default 3939. */
  port?: number;
  /** Host to bind. Default "127.0.0.1". Use "0.0.0.0" for external connections. */
  host?: string;
  /**
   * @deprecated Guardio is HTTP-only; mode is ignored. Use port/host to configure the server.
   */
  mode?: "http";
}

/**
 * Guardio config file shape (default export of guardio.config.ts / .json).
 */
export interface GuardioConfig {
  /** MCP servers to proxy to (HTTP/SSE URL). At least one; each must have a unique name. */
  servers: GuardioServerConfig[];
  /** Where Guardio HTTP server listens (port, host). Optional; defaults port 3939, host 127.0.0.1. */
  client?: GuardioClientConfig;
  plugins: PluginConfigEntry[];
}
