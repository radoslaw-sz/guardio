import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  GuardioConfig,
  InterventionPluginConfigEntry,
  PolicyPluginConfigEntry,
} from "./types.js";
import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { InterventionPluginInterface } from "../interfaces/InterventionPluginInterface.js";
import {
  DefaultPolicyPlugin,
  RegexPolicyPlugin,
} from "../plugins/policy/index.js";
import {
  DefaultInterventionPlugin,
  HttpInterventionPlugin,
} from "../plugins/intervention/index.js";

export type PolicyPluginFactory = (
  config?: Record<string, unknown>
) => PolicyPluginInterface;

export type InterventionPluginFactory = (
  config?: Record<string, unknown>
) => InterventionPluginInterface;

const policyRegistry: Record<string, PolicyPluginFactory> = {
  default: (config) => new DefaultPolicyPlugin(config ?? {}),
  regex: (config) => new RegexPolicyPlugin(config ?? {}),
};

const interventionRegistry: Record<string, InterventionPluginFactory> = {
  default: (config) => new DefaultInterventionPlugin(config),
  http: (config) => new HttpInterventionPlugin(config),
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
    `Plugin at ${pluginPath} must contain index.js or index.mjs (run build to compile index.ts).`
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
      `Plugin at ${entryPath}: default export must be the plugin instance.`
    );
  }
  return instance as T;
}

/**
 * Resolves path to config file: first .js, then .ts, then .json (from cwd).
 */
function getConfigPath(cwd: string): string | null {
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
  configPath: string
): Promise<GuardioConfig> {
  if (configPath.endsWith(".json")) {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as GuardioConfig;
  }
  const url = pathToFileURL(configPath).href;
  const mod = await import(url);
  const config = mod.default ?? mod;
  if (!config || typeof config !== "object" || !Array.isArray(config.plugins)) {
    throw new Error(
      `Invalid guardio config: expected default export with plugins array (at ${configPath})`
    );
  }
  return config as GuardioConfig;
}

export class PluginManager {
  private config: GuardioConfig | null = null;
  private configPath: string | null = null;
  private policyPlugins: PolicyPluginInterface[] | null = null;
  private interventionPlugins: InterventionPluginInterface[] | null = null;

  /**
   * Register a policy plugin factory by name (e.g. for custom plugins).
   */
  registerPolicyPlugin(name: string, factory: PolicyPluginFactory): void {
    (policyRegistry as Record<string, PolicyPluginFactory>)[name] = factory;
  }

  /**
   * Register an intervention plugin factory by name (e.g. for custom plugins).
   */
  registerInterventionPlugin(
    name: string,
    factory: InterventionPluginFactory
  ): void {
    (interventionRegistry as Record<string, InterventionPluginFactory>)[name] =
      factory;
  }

  /**
   * Load config from cwd (or optional path). Idempotent; subsequent calls use cached config if path unchanged.
   */
  async loadConfig(
    cwd: string = process.cwd(),
    configPath?: string
  ): Promise<GuardioConfig> {
    const path = configPath ?? getConfigPath(cwd);
    if (!path) {
      throw new Error(
        `No guardio config found in ${cwd}. Add guardio.config.js, guardio.config.ts, or guardio.config.json`
      );
    }
    if (this.configPath === path && this.config !== null) {
      return this.config;
    }
    this.configPath = path;
    this.config = await loadConfigFromPath(path);
    this.policyPlugins = null;
    this.interventionPlugins = null;
    return this.config;
  }

  /**
   * Get the list of policy plugin instances from the loaded config. Calls loadConfig() if not loaded.
   */
  async getPolicyPlugins(
    cwd: string = process.cwd(),
    configPath?: string
  ): Promise<PolicyPluginInterface[]> {
    await this.loadConfig(cwd, configPath);
    if (this.policyPlugins !== null) return this.policyPlugins;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is PolicyPluginConfigEntry => p.type === "policy"
    );
    const instances: PolicyPluginInterface[] = [];
    const configDir = dirname(this.configPath!);

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        const instance = await loadPluginInstance<PolicyPluginInterface>(
          entryPath
        );
        if (
          typeof instance.name !== "string" ||
          typeof instance.evaluate !== "function"
        ) {
          throw new Error(
            `Plugin at ${entry.path}: default export must be a policy instance (name, evaluate).`
          );
        }
        instances.push(instance);
      } else {
        const factory = policyRegistry[entry.name];
        if (!factory) {
          throw new Error(
            `Unknown policy plugin name: "${
              entry.name
            }". Registered: ${Object.keys(policyRegistry).join(", ")}`
          );
        }
        instances.push(factory(entry.config ?? {}));
      }
    }

    this.policyPlugins = instances;
    return instances;
  }

  /**
   * Get a single policy plugin for the core: first from config, or throws if none.
   */
  async getPolicyPlugin(
    cwd?: string,
    configPath?: string
  ): Promise<PolicyPluginInterface> {
    const list = await this.getPolicyPlugins(cwd, configPath);
    if (list.length === 0) {
      throw new Error(
        "No policy plugins in config. Add at least one plugin with type 'policy'."
      );
    }
    return list[0];
  }

  /**
   * Get the list of intervention plugin instances from the loaded config. Calls loadConfig() if not loaded.
   */
  async getInterventionPlugins(
    cwd: string = process.cwd(),
    configPath?: string
  ): Promise<InterventionPluginInterface[]> {
    await this.loadConfig(cwd, configPath);
    if (this.interventionPlugins !== null) return this.interventionPlugins;

    const plugins = (this.config!.plugins ?? []).filter(
      (p): p is InterventionPluginConfigEntry => p.type === "intervention"
    );
    const instances: InterventionPluginInterface[] = [];

    const configDir = dirname(this.configPath!);

    for (const entry of plugins) {
      if (entry.path) {
        const entryPath = resolvePluginEntryPath(entry.path, configDir);
        const instance = await loadPluginInstance<InterventionPluginInterface>(
          entryPath
        );
        if (
          typeof instance.name !== "string" ||
          typeof instance.act !== "function"
        ) {
          throw new Error(
            `Plugin at ${entry.path}: default export must be an intervention instance (name, act).`
          );
        }
        instances.push(instance);
      } else {
        const factory = interventionRegistry[entry.name];
        if (!factory) {
          throw new Error(
            `Unknown intervention plugin name: "${
              entry.name
            }". Registered: ${Object.keys(interventionRegistry).join(", ")}`
          );
        }
        instances.push(factory(entry.config ?? {}));
      }
    }

    this.interventionPlugins = instances;
    return instances;
  }
}
