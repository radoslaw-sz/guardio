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
import type {
  PolicyPluginFactory,
  PolicyPluginDefinition,
  PolicyPluginDescriptor,
} from "./plugin-types.js";
import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { EventSinkPluginInterface } from "../interfaces/EventSinkPluginInterface.js";
import type { EventSinkStorePluginInterface } from "../interfaces/EventSinkStorePluginInterface.js";
import type { EventSinkPluginContext } from "../interfaces/EventSinkPluginContext.js";
import type { PolicyPluginContext } from "../interfaces/PolicyPluginContext.js";
import type { StorageAdapter } from "../interfaces/StorageAdapter.js";
import type { z } from "zod";
import {
  denyToolAccessDefinition,
  denyRegexParameterDefinition,
  rateLimitToolDefinition,
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

// Re-export types for backward compatibility
export type { PolicyPluginFactory, PolicyPluginDefinition, PolicyPluginDescriptor };

/**
 * Type guard to check if an export is a PolicyPluginDefinition.
 */
function isPolicyPluginDefinition(obj: unknown): obj is PolicyPluginDefinition {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "name" in obj &&
    typeof (obj as PolicyPluginDefinition).name === "string" &&
    "factory" in obj &&
    typeof (obj as PolicyPluginDefinition).factory === "function"
  );
}

export type StoragePluginFactory = (
  config?: Record<string, unknown>,
) => StorageAdapter;

export type EventSinkPluginFactory = (
  config?: Record<string, unknown>,
  context?: EventSinkPluginContext,
) => EventSinkPluginInterface;

export type EventSinkStorePluginFactory = (
  config?: Record<string, unknown>,
  context?: EventSinkPluginContext,
) => EventSinkStorePluginInterface;

/** Built-in policy plugins - registered at module load. */
const BUILT_IN_POLICY_PLUGINS: PolicyPluginDefinition[] = [
  denyToolAccessDefinition,
  denyRegexParameterDefinition,
  rateLimitToolDefinition,
];

/** Registered policy plugin names (from built-in or registerPolicyPlugin). */
const policyPluginNames = new Set<string>();

/** Factories for instantiating policy plugins by name (used when resolving from DB). */
const policyFactories: Record<string, PolicyPluginFactory> = {};

const policySchemaRegistry: Record<string, () => z.ZodType> = {};

const policyUiSchemaRegistry: Record<string, () => object> = {};

// Register built-in plugins at module load
for (const def of BUILT_IN_POLICY_PLUGINS) {
  policyPluginNames.add(def.name);
  policyFactories[def.name] = def.factory;
  if (def.configSchema) {
    policySchemaRegistry[def.name] = () => def.configSchema!;
  }
  if (def.uiSchema) {
    policyUiSchemaRegistry[def.name] = () => def.uiSchema!;
  }
}

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
 * @param name The plugin name (e.g. "deny-tool-access")
 * @param config The plugin configuration from the database
 * @param context Optional PolicyPluginContext with scoped PluginRepository
 */
export function createPolicyPluginInstance(
  name: string,
  config: Record<string, unknown>,
  context?: PolicyPluginContext,
): PolicyPluginInterface {
  const factory = policyFactories[name];
  if (!factory) {
    throw new Error(
      `Unknown policy plugin name: "${name}". Registered: ${[...policyPluginNames].join(", ")}`,
    );
  }
  return factory(config, context);
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
 * Load plugin default export from a directory: import index.js/index.mjs, return default export.
 */
async function loadPluginExport<T>(entryPath: string): Promise<T> {
  const url = pathToFileURL(entryPath).href;
  const mod = await import(url);
  const exported = mod?.default ?? mod;
  if (!exported || typeof exported !== "object") {
    throw new Error(
      `Plugin at ${entryPath}: default export must be a plugin definition.`,
    );
  }
  return exported as T;
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
   * Register a Zod config schema for a policy plugin (e.g. for custom plugins).
   * This enables config validation when creating policies via the dashboard.
   */
  registerPolicySchema(name: string, schema: z.ZodType): void {
    (policySchemaRegistry as Record<string, () => z.ZodType>)[name] = () => schema;
  }

  /**
   * Register a UI schema for a policy plugin (e.g. for custom plugins).
   * This enables custom form widgets in the dashboard's add-policy form.
   */
  registerPolicyUiSchema(name: string, uiSchema: object): void {
    (policyUiSchemaRegistry as Record<string, () => object>)[name] = () => uiSchema;
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
   * For path-based plugins, loads the plugin definition to extract schema/uiSchema.
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
    const configDir = dirname(this.configPath!);
    const descriptors: PolicyPluginDescriptor[] = [];

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        const exported = await loadPluginExport<unknown>(entryPath);

        if (!isPolicyPluginDefinition(exported)) {
          throw new Error(
            `Plugin at ${entry.path}: default export must be a PolicyPluginDefinition with 'name' and 'factory'.`,
          );
        }

        this.registerPolicyPluginDefinition(exported);
        descriptors.push({
          name: exported.name,
          type: "policy" as const,
          path: entry.path,
          configSchema: exported.configSchema,
          uiSchema: exported.uiSchema,
        });
      } else {
        descriptors.push({
          name: entry.name,
          type: "policy" as const,
          configSchema: getPolicyConfigSchema(entry.name),
          uiSchema: getPolicyUiSchema(entry.name),
        });
      }
    }

    return descriptors;
  }

  /**
   * Register a factory-based PolicyPluginDefinition (factory, schema, uiSchema).
   * Called automatically when loading path-based plugins that export a definition.
   */
  private registerPolicyPluginDefinition(definition: PolicyPluginDefinition): void {
    const { name, factory, configSchema, uiSchema } = definition;
    this.registerPolicyPlugin(name, factory);
    if (configSchema) {
      this.registerPolicySchema(name, configSchema);
    }
    if (uiSchema) {
      this.registerPolicyUiSchema(name, uiSchema);
    }
    logger.debug(
      { name, hasSchema: !!configSchema, hasUiSchema: !!uiSchema },
      "Registered factory-based policy plugin from path",
    );
  }

  /**
   * Load and register all policy plugins from the config. Calls loadConfig() if not loaded.
   *
   * All policy plugins (both built-in and path-based) are factory-based.
   * Instances are resolved from DB per request via `createPolicyPluginInstance`.
   * This method registers path-based plugins so their factories are available.
   */
  async loadPolicyPlugins(
    cwd: string = process.cwd(),
    configPath?: string,
  ): Promise<void> {
    await this.loadConfig(cwd, configPath);
    if (this.policyPlugins !== null) return;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is PolicyPluginConfigEntry => p.type === "policy",
    );
    const configDir = dirname(this.configPath!);

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading policy plugin from path",
        );
        const exported = await loadPluginExport<unknown>(entryPath);

        if (!isPolicyPluginDefinition(exported)) {
          logger.error(
            { path: entry.path },
            "Plugin default export must be a PolicyPluginDefinition",
          );
          throw new Error(
            `Plugin at ${entry.path}: default export must be a PolicyPluginDefinition with 'name' and 'factory'.`,
          );
        }

        this.registerPolicyPluginDefinition(exported);
        logger.debug(
          { name: exported.name, path: entry.path },
          "Registered policy plugin (instances resolved from DB per request)",
        );
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
          "Built-in policy plugin registered (instances resolved from DB per request)",
        );
      }
    }

    this.policyPlugins = [];
    logger.debug("Policy plugins loaded and registered");
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
        const instance = await loadPluginExport<StorageAdapter>(entryPath);
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
   * Builds EventSinkPluginContext with only eventSinkRepository (least privilege).
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
    const storageAdapter = storageAdapters[0];
    const context: EventSinkPluginContext = {
      eventSinkRepository: storageAdapter?.getEventSinkRepository?.(),
    };

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading event sink plugin from path",
        );
        const instance =
          await loadPluginExport<EventSinkPluginInterface>(entryPath);
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
   * Builds EventSinkPluginContext with only eventSinkRepository (least privilege).
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
    const storageAdapter = storageAdapters[0];
    const context: EventSinkPluginContext = {
      eventSinkRepository: storageAdapter?.getEventSinkRepository?.(),
    };

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        logger.debug(
          { path: entry.path, entryPath },
          "Loading event sink store plugin from path",
        );
        const instance =
          await loadPluginExport<EventSinkStorePluginInterface>(entryPath);
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
