import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  GuardioConfig,
  EventSinkPluginConfigEntry,
  EventSinkStorePluginConfigEntry,
  PolicyPluginConfigEntry,
  StoragePluginConfigEntry,
} from "./types.js";
import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { EventSinkPluginInterface } from "../interfaces/EventSinkPluginInterface.js";
import type { EventSinkStorePluginInterface } from "../interfaces/EventSinkStorePluginInterface.js";
import type { GuardioPluginContext } from "../interfaces/GuardioPluginContext.js";
import type { StorageAdapter } from "../interfaces/StorageAdapter.js";
import type { z } from "zod";
import {
  DenyToolAccessPolicyPlugin,
  POLICY_SUMMARY_UI_SCHEMA,
  DenyRegexParameterPolicyPlugin,
  DENY_REGEX_PARAMETER_UI_SCHEMA,
  denyRegexParameterConfigSchema,
} from "../plugins/policy/index.js";
import {
  SqliteStoragePlugin,
  PostgresStoragePlugin,
} from "../plugins/storage/index.js";
import {
  SqliteEventSink,
  PostgresEventSink,
} from "../plugins/event-sink/index.js";
import {
  SqliteEventSinkStore,
  PostgresEventSinkStore,
} from "../plugins/event-sink-store/index.js";
import { logger } from "../logger.js";

export type PolicyPluginFactory = (
  config: Record<string, unknown>,
) => PolicyPluginInterface;

/** Policy plugin descriptor (name + optional schema + optional uiSchema) for dashboard; no instance created. */
export interface PolicyPluginDescriptor {
  name: string;
  type: "policy";
  path?: string;
  configSchema?: z.ZodType;
  /** Optional RJSF uiSchema for the add-policy form (e.g. summary widget). */
  uiSchema?: object;
}

export type StoragePluginFactory = (
  config?: Record<string, unknown>,
) => StorageAdapter;

export type EventSinkPluginFactory = (
  config?: Record<string, unknown>,
  context?: GuardioPluginContext,
) => EventSinkPluginInterface;

export type EventSinkStorePluginFactory = (
  config?: Record<string, unknown>,
  context?: GuardioPluginContext,
) => EventSinkStorePluginInterface;

/** Registered policy plugin names (from config or registerPolicyPlugin). */
const policyPluginNames = new Set<string>([
  "deny-tool-access",
  "deny-regex-parameter",
]);

/** Factories for instantiating policy plugins by name (used when resolving from DB). */
const policyFactories: Record<string, PolicyPluginFactory> = {
  "deny-tool-access": () => new DenyToolAccessPolicyPlugin(),
  "deny-regex-parameter": (config) =>
    new DenyRegexParameterPolicyPlugin(config),
};

const policySchemaRegistry: Record<string, () => z.ZodType> = {
  "deny-regex-parameter": () => denyRegexParameterConfigSchema,
};

const policyUiSchemaRegistry: Record<string, () => object> = {
  "deny-tool-access": () => POLICY_SUMMARY_UI_SCHEMA,
  "deny-regex-parameter": () => DENY_REGEX_PARAMETER_UI_SCHEMA,
};

/**
 * Get the Zod config schema for a built-in policy plugin by name.
 * Returns undefined for unknown or dynamic plugins.
 */
export function getPolicyConfigSchema(name: string): z.ZodType | undefined {
  return policySchemaRegistry[name]?.();
}

/**
 * Get the UI schema for a built-in policy plugin by name (e.g. for summary widget).
 * Returns undefined when the plugin has no uiSchema.
 */
export function getPolicyUiSchema(name: string): object | undefined {
  return policyUiSchemaRegistry[name]?.();
}

/**
 * Create a policy plugin instance by name with the given config (e.g. from DB).
 * Used when processing messages; config is required.
 */
export function createPolicyPluginInstance(
  name: string,
  config: Record<string, unknown>,
): PolicyPluginInterface {
  const factory = policyFactories[name];
  if (!factory) {
    throw new Error(
      `Unknown policy plugin name: "${name}". Registered: ${[...policyPluginNames].join(", ")}`,
    );
  }
  return factory(config);
}

const storageRegistry: Record<string, StoragePluginFactory> = {
  sqlite: (config) => new SqliteStoragePlugin(config ?? {}),
  postgres: (config) => new PostgresStoragePlugin(config ?? {}),
};

const eventSinkRegistry: Record<string, EventSinkPluginFactory> = {
  sqlite: (config, context) => new SqliteEventSink(config, context),
  postgres: (config, context) => new PostgresEventSink(config, context),
};

const eventSinkStoreRegistry: Record<string, EventSinkStorePluginFactory> = {
  sqlite: (config, context) => new SqliteEventSinkStore(config, context),
  postgres: (config, context) => new PostgresEventSinkStore(config, context),
};

/** Entry filenames to load from a plugin directory (first found wins). */
const PLUGIN_ENTRY_NAMES = ["index.js", "index.mjs"];

/**
 * Resolve plugin directory to an entry file (index.js or index.mjs). Path is relative to configDir or absolute.
 */
function resolvePluginEntryPath(pluginPath: string, configDir: string): string {
  const dir = resolve(configDir, pluginPath);
  for (const name of PLUGIN_ENTRY_NAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Plugin at ${pluginPath} must contain index.js or index.mjs (run build to compile index.ts).`,
  );
}

/**
 * Load plugin instance from a directory: import index.js/index.mjs, return default export (the instance).
 */
async function loadPluginInstance<T>(entryPath: string): Promise<T> {
  const url = pathToFileURL(entryPath).href;
  const mod = await import(url);
  const instance = mod?.default ?? mod;
  if (!instance || typeof instance !== "object") {
    throw new Error(
      `Plugin at ${entryPath}: default export must be the plugin instance.`,
    );
  }
  return instance as T;
}

/**
 * Resolves path to config file: first .js, then .ts, then .json (from cwd).
 */
export function getConfigPath(cwd: string): string | null {
  const names = [
    "guardio.config.js",
    "guardio.config.ts",
    "guardio.config.json",
  ];
  for (const name of names) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Loads GuardioConfig from a path. Supports .json (readFile + parse) and .js/.ts (dynamic import).
 */
export async function loadConfigFromPath(
  configPath: string,
): Promise<GuardioConfig> {
  logger.debug({ configPath }, "Loading config from path");
  if (configPath.endsWith(".json")) {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as GuardioConfig;
  }
  const url = pathToFileURL(configPath).href;
  const mod = await import(url);
  const config = mod.default ?? mod;
  if (!config || typeof config !== "object" || !Array.isArray(config.plugins)) {
    logger.error(
      { configPath },
      "Invalid guardio config: expected default export with plugins array",
    );
    throw new Error(
      `Invalid guardio config: expected default export with plugins array (at ${configPath})`,
    );
  }
  logger.debug(
    { configPath, pluginCount: config.plugins.length },
    "Config loaded",
  );
  return config as GuardioConfig;
}

export class PluginManager {
  private config: GuardioConfig | null = null;
  private configPath: string | null = null;
  private policyPlugins: PolicyPluginInterface[] | null = null;
  private storagePlugins: StorageAdapter[] | null = null;
  private eventSinkPlugins: EventSinkPluginInterface[] | null = null;
  private eventSinkStorePlugins: EventSinkStorePluginInterface[] | null = null;

  /**
   * Register a policy plugin factory by name (e.g. for custom plugins).
   */
  registerPolicyPlugin(name: string, factory: PolicyPluginFactory): void {
    policyPluginNames.add(name);
    (policyFactories as Record<string, PolicyPluginFactory>)[name] = factory;
  }

  /**
   * Register a storage plugin factory by name (e.g. for custom plugins).
   */
  registerStoragePlugin(name: string, factory: StoragePluginFactory): void {
    (storageRegistry as Record<string, StoragePluginFactory>)[name] = factory;
  }

  /**
   * Register an event sink plugin factory by name (e.g. for custom plugins).
   */
  registerEventSinkPlugin(
    name: string,
    factory: EventSinkPluginFactory,
  ): void {
    (eventSinkRegistry as Record<string, EventSinkPluginFactory>)[name] =
      factory;
  }

  /**
   * Register an event sink store plugin factory by name (e.g. for custom plugins).
   */
  registerEventSinkStorePlugin(
    name: string,
    factory: EventSinkStorePluginFactory,
  ): void {
    (eventSinkStoreRegistry as Record<string, EventSinkStorePluginFactory>)[name] =
      factory;
  }

  /**
   * Load config from cwd (or optional path). Idempotent; subsequent calls use cached config if path unchanged.
   */
  async loadConfig(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<GuardioConfig> {
    const path = configPath ?? getConfigPath(cwd);
    if (!path) {
      logger.error({ cwd }, "No guardio config found");
      throw new Error(
        `No guardio config found in ${cwd}. Add guardio.config.js, guardio.config.ts, or guardio.config.json`,
      );
    }
    if (this.configPath === path && this.config !== null) {
      logger.debug("Using cached config");
      return this.config;
    }
    this.configPath = path;
    this.config = await loadConfigFromPath(path);
    this.policyPlugins = null;
    this.storagePlugins = null;
    this.eventSinkPlugins = null;
    this.eventSinkStorePlugins = null;
    return this.config;
  }

  /**
   * Get policy plugin descriptors from config (type + name, optional path and config schema).
   * No plugin instances are created; used for dashboard GET /api/policies.
   */
  async getPolicyPluginDescriptors(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<PolicyPluginDescriptor[]> {
    await this.loadConfig(cwd, configPath);
    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is PolicyPluginConfigEntry => p.type === "policy",
    );
    return plugins.map((entry) => ({
      name: entry.name,
      type: "policy" as const,
      ...(entry.path != null && { path: entry.path }),
      configSchema: getPolicyConfigSchema(entry.name),
      uiSchema: getPolicyUiSchema(entry.name),
    }));
  }

  /**
   * Get the list of policy plugin instances from the loaded config. Calls loadConfig() if not loaded.
   * Prefer resolving policies from DB per request; this is for legacy or path-based plugins.
   */
  async getPolicyPlugins(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<PolicyPluginInterface[]> {
    await this.loadConfig(cwd, configPath);
    if (this.policyPlugins !== null) return this.policyPlugins;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is PolicyPluginConfigEntry => p.type === "policy",
    );
    const instances: PolicyPluginInterface[] = [];
    const configDir = dirname(this.configPath!);

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading policy plugin from path",
        );
        const instance =
          await loadPluginInstance<PolicyPluginInterface>(entryPath);
        if (
          typeof instance.name !== "string" ||
          typeof instance.evaluate !== "function"
        ) {
          logger.error(
            { path: entry.path },
            "Plugin default export must be a policy instance (name, evaluate)",
          );
          throw new Error(
            `Plugin at ${entry.path}: default export must be a policy instance (name, evaluate).`,
          );
        }
        instances.push(instance);
      } else {
        if (!policyPluginNames.has(entry.name)) {
          logger.error(
            { name: entry.name, registered: [...policyPluginNames] },
            "Unknown policy plugin name",
          );
          throw new Error(
            `Unknown policy plugin name: "${
              entry.name
            }". Registered: ${[...policyPluginNames].join(", ")}`,
          );
        }
        logger.debug(
          { name: entry.name },
          "Skipping built-in policy plugin (instances resolved from DB per request)",
        );
      }
    }

    this.policyPlugins = instances;
    logger.debug(
      { count: instances.length, names: instances.map((p) => p.name) },
      "Policy plugins resolved",
    );
    return instances;
  }

  /**
   * Get the list of storage plugin instances from the loaded config. Calls loadConfig() if not loaded.
   */
  async getStoragePlugins(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<StorageAdapter[]> {
    await this.loadConfig(cwd, configPath);
    if (this.storagePlugins !== null) return this.storagePlugins;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is StoragePluginConfigEntry => p.type === "storage",
    );
    const instances: StorageAdapter[] = [];
    const configDir = dirname(this.configPath!);

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading storage plugin from path",
        );
        const instance = await loadPluginInstance<StorageAdapter>(entryPath);
        if (
          typeof instance.name !== "string" ||
          typeof instance.start !== "function" ||
          typeof instance.connect !== "function" ||
          typeof instance.getRepository !== "function" ||
          typeof instance.disconnect !== "function" ||
          typeof instance.end !== "function"
        ) {
          logger.error(
            { path: entry.path },
            "Plugin default export must be a storage adapter instance (name, start, connect, getRepository, disconnect, end)",
          );
          throw new Error(
            `Plugin at ${entry.path}: default export must be a storage adapter instance (name, start, connect, getRepository, disconnect, end).`,
          );
        }
        instances.push(instance);
      } else {
        const factory = storageRegistry[entry.name];
        if (!factory) {
          logger.error(
            { name: entry.name, registered: Object.keys(storageRegistry) },
            "Unknown storage plugin name",
          );
          throw new Error(
            `Unknown storage plugin name: "${
              entry.name
            }". Registered: ${Object.keys(storageRegistry).join(", ")}`,
          );
        }
        logger.debug(
          { name: entry.name },
          "Instantiating built-in storage plugin",
        );
        instances.push(factory(entry.config ?? {}));
      }
    }

    this.storagePlugins = instances;
    logger.debug(
      { count: instances.length, names: instances.map((p) => p.name) },
      "Storage plugins resolved",
    );
    return instances;
  }

  /**
   * Get the list of event sink plugin instances from the loaded config. Calls loadConfig() if not loaded.
   * Builds GuardioPluginContext from the first storage adapter (if any) and passes it to built-in event sink factories.
   */
  async getEventSinkPlugins(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<EventSinkPluginInterface[]> {
    await this.loadConfig(cwd, configPath);
    if (this.eventSinkPlugins !== null) return this.eventSinkPlugins;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is EventSinkPluginConfigEntry => p.type === "eventSink",
    );
    const instances: EventSinkPluginInterface[] = [];
    const configDir = dirname(this.configPath!);

    const storageAdapters = await this.getStoragePlugins(cwd, configPath);
    const context: GuardioPluginContext = {
      storage: storageAdapters[0],
    };

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading event sink plugin from path",
        );
        const instance =
          await loadPluginInstance<EventSinkPluginInterface>(entryPath);
        if (
          typeof instance.name !== "string" ||
          typeof instance.emit !== "function"
        ) {
          logger.error(
            { path: entry.path },
            "Plugin default export must be an event sink instance (name, emit)",
          );
          throw new Error(
            `Plugin at ${entry.path}: default export must be an event sink instance (name, emit).`,
          );
        }
        instances.push(instance);
      } else {
        const factory = eventSinkRegistry[entry.name];
        if (!factory) {
          logger.error(
            { name: entry.name, registered: Object.keys(eventSinkRegistry) },
            "Unknown event sink plugin name",
          );
          throw new Error(
            `Unknown event sink plugin name: "${
              entry.name
            }". Registered: ${Object.keys(eventSinkRegistry).join(", ")}`,
          );
        }
        logger.debug(
          { name: entry.name },
          "Instantiating built-in event sink plugin",
        );
        instances.push(factory(entry.config ?? {}, context));
      }
    }

    this.eventSinkPlugins = instances;
    logger.debug(
      { count: instances.length, names: instances.map((p) => p.name) },
      "Event sink plugins resolved",
    );
    return instances;
  }

  /**
   * Get the list of event sink store plugin instances from the loaded config. Calls loadConfig() if not loaded.
   * Builds GuardioPluginContext from the first storage adapter (if any) and passes it to built-in event sink store factories.
   */
  async getEventSinkStorePlugins(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<EventSinkStorePluginInterface[]> {
    await this.loadConfig(cwd, configPath);
    if (this.eventSinkStorePlugins !== null) return this.eventSinkStorePlugins;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is EventSinkStorePluginConfigEntry => p.type === "eventSinkStore",
    );
    const instances: EventSinkStorePluginInterface[] = [];
    const configDir = dirname(this.configPath!);

    const storageAdapters = await this.getStoragePlugins(cwd, configPath);
    const context: GuardioPluginContext = {
      storage: storageAdapters[0],
    };

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading event sink store plugin from path",
        );
        const instance =
          await loadPluginInstance<EventSinkStorePluginInterface>(entryPath);
        if (
          typeof instance.name !== "string" ||
          typeof instance.listEvents !== "function"
        ) {
          logger.error(
            { path: entry.path },
            "Plugin default export must be an event sink store instance (name, listEvents)",
          );
          throw new Error(
            `Plugin at ${entry.path}: default export must be an event sink store instance (name, listEvents).`,
          );
        }
        instances.push(instance);
      } else {
        const factory = eventSinkStoreRegistry[entry.name];
        if (!factory) {
          logger.error(
            {
              name: entry.name,
              registered: Object.keys(eventSinkStoreRegistry),
            },
            "Unknown event sink store plugin name",
          );
          throw new Error(
            `Unknown event sink store plugin name: "${
              entry.name
            }". Registered: ${Object.keys(eventSinkStoreRegistry).join(", ")}`,
          );
        }
        logger.debug(
          { name: entry.name },
          "Instantiating built-in event sink store plugin",
        );
        instances.push(factory(entry.config ?? {}, context));
      }
    }

    this.eventSinkStorePlugins = instances;
    logger.debug(
      { count: instances.length, names: instances.map((p) => p.name) },
      "Event sink store plugins resolved",
    );
    return instances;
  }
}
