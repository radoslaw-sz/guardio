import { EventEmitter } from "node:events";
import { GuardioCore } from "../core/index.js";
import type { GuardioServerConfigUrl } from "../config/types.js";
import { PluginManager } from "../config/PluginManager.js";
import type { StorageAdapter } from "../interfaces/StorageAdapter.js";
import { logger } from "../logger.js";

export interface GuardioHttpServerConfig {
  servers: GuardioServerConfigUrl[];
  listen: { port: number; host?: string };
  cwd: string;
  configPath: string;
}

/**
 * Standalone HTTP server that proxies MCP to remote URL(s). Uses GuardioCore with
 * client transport = HTTP (listen on port) and server transport(s) = URL per server.
 * Requires at least one storage plugin in config. Starts storage (start + connect) before
 * core, and disconnects storage on stop (SIGINT/SIGTERM).
 */
export class GuardioHttpServer {
  private readonly config: GuardioHttpServerConfig;
  private core: GuardioCore | null = null;
  private storageAdapters: StorageAdapter[] = [];
  private signalHandlersAttached = false;

  constructor(config: GuardioHttpServerConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    const { cwd, configPath } = this.config;

    const pluginManager = new PluginManager();
    const adapters = await pluginManager.getStoragePlugins(cwd, configPath);
    if (adapters.length === 0) {
      throw new Error(
        'At least one storage plugin must be configured in plugins (type: "storage"). Add e.g. { type: "storage", name: "sqlite", config: { database: "guardio.sqlite" } }.',
      );
    }

    for (const adapter of adapters) {
      const result = await Promise.resolve(adapter.connect());
      if (!result.ok) {
        throw new Error(`Storage plugin "${adapter.name}" failed to connect.`);
      }
      logger.debug({ name: adapter.name }, "Storage plugin connected");
      await Promise.resolve(adapter.start());
      logger.debug({ name: adapter.name }, "Storage plugin started");
    }
    this.storageAdapters = adapters;

    const coreRepository = adapters[0]?.getRepository?.();
    if (!coreRepository) {
      throw new Error("Storage adapter did not provide a repository.");
    }

    const eventSinkStores = await pluginManager.getEventSinkStorePlugins(
      cwd,
      configPath,
    );
    const eventSinkStore = eventSinkStores[0];

    const eventBus = new EventEmitter();

    logger.info(
      { port: this.config.listen.port, host: this.config.listen.host },
      "Guardio HTTP server starting",
    );
    const core = new GuardioCore({
      servers: this.config.servers,
      client: {
        mode: "http",
        port: this.config.listen.port,
        host: this.config.listen.host,
      },
      cwd: this.config.cwd,
      configPath: this.config.configPath,
      eventBus,
      coreRepository,
      eventSinkStore,
      pluginManager,
    });
    this.core = core;
    await core.run();

    return new Promise<void>((resolve) => {
      const bound = (): void => {
        void (async (): Promise<void> => {
          if (!this.signalHandlersAttached) return;
          this.signalHandlersAttached = false;
          process.off("SIGINT", bound);
          process.off("SIGTERM", bound);
          try {
            await this.stop();
          } catch (err) {
            logger.error({ err }, "Error during shutdown");
          }
          resolve();
        })();
      };
      this.signalHandlersAttached = true;
      process.on("SIGINT", bound);
      process.on("SIGTERM", bound);
    });
  }

  /**
   * Gracefully stop: disconnect and end storage adapters, then stop the core (HTTP server).
   * Idempotent.
   */
  async stop(): Promise<void> {
    for (const adapter of this.storageAdapters) {
      try {
        await Promise.resolve(adapter.end());
        await Promise.resolve(adapter.disconnect());
        logger.debug({ name: adapter.name }, "Storage plugin stopped");
      } catch (err) {
        logger.warn({ err, name: adapter.name }, "Storage plugin stop error");
      }
    }
    this.storageAdapters = [];

    if (this.core) {
      await this.core.stop();
      this.core = null;
    }
    logger.info("Guardio HTTP server stopped");
  }
}
