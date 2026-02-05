/**
 * Policy plugin entry in guardio config.
 * Use "path" for a custom plugin (directory with index.js/index.mjs; default export = instance).
 */
export interface PolicyPluginConfigEntry {
  type: "policy";
  name: string;
  /** Directory to custom plugin (relative to config file or absolute). Must contain index.js or index.mjs with default export = policy instance. */
  path?: string;
  config?: Record<string, unknown>;
}

/**
 * Intervention plugin entry in guardio config.
 * Use "path" for a custom plugin (directory with index.js/index.mjs; default export = instance).
 */
export interface InterventionPluginConfigEntry {
  type: "intervention";
  name: string;
  /** Directory to custom plugin (relative to config file or absolute). Must contain index.js or index.mjs with default export = intervention instance. */
  path?: string;
  config?: Record<string, unknown>;
}

/**
 * Any plugin entry in guardio config.
 */
export type PluginConfigEntry =
  | PolicyPluginConfigEntry
  | InterventionPluginConfigEntry;

/**
 * MCP server to proxy to (spawn command).
 */
export interface GuardioServerConfig {
  type: "command";
  command: string;
  args: string[];
}

/**
 * Guardio config file shape (default export of guardio.config.ts / .json).
 */
export interface GuardioConfig {
  /** MCP server to proxy to. When present, CLI uses this instead of argv. */
  server?: GuardioServerConfig;
  plugins: PluginConfigEntry[];
}
