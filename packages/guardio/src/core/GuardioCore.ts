import type { GuardioCoreConfig } from "./types.js";
import type { JsonRpcRequest } from "./types.js";
import { PluginManager } from "../config/PluginManager.js";
import {
  createServerTransport,
  createClientTransport,
  type IServerTransport,
  type IClientTransport,
} from "./transports/index.js";
import type {
  DashboardConnectionInfo,
  DashboardPoliciesInfo,
  DashboardPolicyEntry,
  DashboardPolicyInstance,
  DashboardPolicyInstancesInfo,
  DashboardEventsInfo,
} from "./transports/dashboard-api-types.js";
import { processMessage } from "./Processor.js";
import { logger } from "../logger.js";
import { ToolsDiscoveryService } from "./services/tools-discovery-service.js";
import { buildConnectionInfo } from "./services/connection-info-service.js";
import { PolicyInstanceService } from "./services/policy-instance-service.js";
import { listEventsForDashboard } from "./services/events-query-service.js";
import { instantiatePolicyPlugins } from "./services/policy-instantiation.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CreatePolicyInstanceBody, CreatePolicyInstanceResult, UpdatePolicyInstanceBody, UpdatePolicyInstanceResult } from "./transports/types.js";

export class GuardioCore {
  private readonly config: GuardioCoreConfig;
  private pluginManager: PluginManager | null = null;

  private serverTransports = new Map<string, IServerTransport>();
  private clientTransport: IClientTransport | null = null;
  private readonly toolsDiscovery: ToolsDiscoveryService;
  private readonly policyInstanceService: PolicyInstanceService;

  constructor(config: GuardioCoreConfig) {
    this.config = config;
    this.toolsDiscovery = new ToolsDiscoveryService(
      this.config.servers,
      this.config.coreRepository,
    );
    this.policyInstanceService = new PolicyInstanceService(
      this.config.coreRepository,
    );
  }

  async run(): Promise<void> {
    logger.info("Starting Guardio core");

    await this.loadPlugins();

    const serverNames = this.config.servers.map((s) => s.name);
    for (const serverConfig of this.config.servers) {
      const transport = createServerTransport(serverConfig);
      this.serverTransports.set(serverConfig.name, transport);
    }
    this.clientTransport = createClientTransport(this.config.client, {
      dashboardHooks: {
        handleConnectionRequest: () => this.getConnectionInfo(),
        handlePoliciesRequest: () => this.getPoliciesInfo(),
        handleListPolicyInstances: () => this.listPolicyInstances(),
        handleListEvents: () => this.listEvents(),
        handleCreatePolicyInstance: (body) => this.createPolicyInstance(body),
        handleDeletePolicyInstance: (id) => this.deletePolicyInstance(id),
        handleGetPolicyInstance: (id) => this.getPolicyInstance(id),
        handleUpdatePolicyInstance: (id, body) =>
          this.updatePolicyInstance(id, body),
      },
      serverNames,
      eventBus: this.config.eventBus,
      coreRepository: this.config.coreRepository,
    });

    this.setupEventHandlers();

    for (const transport of this.serverTransports.values()) {
      await transport.start();
    }
    await this.clientTransport.start();
    await this.toolsDiscovery.loadPersistedServerTools();
    logger.info("Core started");
  }

  /** Returns the client transport after run(); used by the server to attach subscribers. */
  getClientTransport(): IClientTransport | null {
    return this.clientTransport;
  }

  /**
   * Gracefully stop the core: close client transport (HTTP server).
   * Idempotent.
   */
  async stop(): Promise<void> {
    if (
      this.clientTransport &&
      "close" in this.clientTransport &&
      typeof this.clientTransport.close === "function"
    ) {
      await (this.clientTransport as { close: () => Promise<void> }).close();
      this.clientTransport = null;
    }
    logger.debug("Core stopped");
  }

  private async loadPlugins(): Promise<void> {
    if (this.config.pluginManager) {
      this.pluginManager = this.config.pluginManager;
      logger.debug("Using provided PluginManager (connected storage for event sinks)");
    } else {
      this.pluginManager = new PluginManager();
      const cwd = this.config.cwd ?? process.cwd();
      await this.pluginManager.loadConfig(cwd, this.config.configPath);
      logger.debug(
        "Config loaded (policy instances resolved from DB per request)",
      );
    }
  }

  private setupEventHandlers(): void {
    if (!this.clientTransport) return;

    this.clientTransport.on(
      "postRequest",
      async ({ body, reply, serverName, agentId, agentNameSnapshot }) => {
        try {
          const transport = this.serverTransports.get(serverName);
          if (!transport?.getRemotePostUrl()) {
            reply(503, "Remote MCP not ready");
            return;
          }
          const result = await this.handlePostMessage(
            body,
            serverName,
            agentId ?? null,
            agentNameSnapshot ?? null,
          );
          reply(result.status, result.body);
        } catch (err) {
          logger.error({ err }, "POST /messages failed");
          reply(500, "Proxy Error");
        }
      },
    );

    for (const [serverName, transport] of this.serverTransports) {
      transport.on("message", (line: string) => {
        this.toolsDiscovery.handleSseMessage(line, serverName);
        this.clientTransport?.send(line, serverName);
      });
      transport.on("endpointReady", () => {
        if (typeof this.clientTransport?.setRemoteReady === "function") {
          this.clientTransport.setRemoteReady(serverName);
        }
        this.toolsDiscovery.handleEndpointReady(serverName);
      });
    }
  }

  private sendToClient(message: string, serverName: string): void {
    this.clientTransport?.send(message, serverName);
  }

  /** Dashboard GET /api/connection: build connection info from transports. */
  private async getConnectionInfo(): Promise<DashboardConnectionInfo | null> {
    return buildConnectionInfo({
      clientConfig: this.config.client,
      clientTransport: this.clientTransport,
      serverTransports: this.serverTransports,
      coreRepository: this.config.coreRepository,
      toolsByServer: (name) => this.toolsDiscovery.getToolsForServer(name),
    });
  }

  /** GET /api/policy-instances: list policy instances from storage with assignment summary. */
  private async listPolicyInstances(): Promise<DashboardPolicyInstancesInfo | null> {
    return this.policyInstanceService.listPolicyInstances();
  }

  /** GET /api/events: list recent guardio_events for dashboard activity (via EventSinkStore plugin). */
  private async listEvents(): Promise<DashboardEventsInfo | null> {
    return listEventsForDashboard(this.config.eventSinkStore);
  }

  /** POST /api/policy-instances: validate config and create a policy instance. */
  private async createPolicyInstance(
    body: CreatePolicyInstanceBody,
  ): Promise<CreatePolicyInstanceResult> {
    return this.policyInstanceService.createPolicyInstance(body);
  }

  /** DELETE /api/policy-instances/:id: remove a policy instance and its assignments. */
  private async deletePolicyInstance(policyInstanceId: string): Promise<void> {
    await this.policyInstanceService.deletePolicyInstance(policyInstanceId);
  }

  /** GET /api/policy-instances/:id: get one policy instance with assignments. */
  private async getPolicyInstance(
    id: string,
  ): Promise<DashboardPolicyInstance | null> {
    return this.policyInstanceService.getPolicyInstance(id);
  }

  /** PATCH /api/policy-instances/:id: update config, name, and assignment. */
  private async updatePolicyInstance(
    id: string,
    body: UpdatePolicyInstanceBody,
  ): Promise<UpdatePolicyInstanceResult> {
    return this.policyInstanceService.updatePolicyInstance(id, body);
  }

  /** Dashboard GET /api/policies: list policy plugin descriptors from config (names + config schemas). */
  private async getPoliciesInfo(): Promise<DashboardPoliciesInfo | null> {
    if (!this.pluginManager) return null;
    const cwd = this.config.cwd ?? process.cwd();
    const descriptors = await this.pluginManager.getPolicyPluginDescriptors(
      cwd,
      this.config.configPath,
    );
    const policies: DashboardPolicyEntry[] = descriptors.map((d) => {
      const entry: DashboardPolicyEntry = {
        name: d.name,
        type: "policy" as const,
      };
      if (d.configSchema) {
        try {
          entry.configSchema = zodToJsonSchema(d.configSchema, {
            name: `${d.name}Config`,
          }) as object;
        } catch (err) {
          logger.warn(
            { err, plugin: d.name },
            "Failed to get config schema for policy",
          );
        }
      }
      if (d.uiSchema) {
        entry.uiSchema = d.uiSchema;
      }
      return entry;
    });
    return { policies };
  }

  /**
   * Handle POST /messages (HTTP client): resolve policies from DB for context, run policy via Processor, then forward to remote if not handled.
   */
  async handlePostMessage(
    body: string,
    serverName: string,
    agentId: string | null = null,
    agentNameSnapshot: string | null = null,
  ): Promise<{ status: number; body: string }> {
    const transport = this.serverTransports.get(serverName);
    const url = transport?.getRemotePostUrl() ?? null;

    if (!url) {
      logger.warn("POST /messages: remote MCP not ready");
      return { status: 503, body: "Remote MCP not ready" };
    }
    try {
      let toolName: string | null = null;
      try {
        const request = JSON.parse(body) as JsonRpcRequest;
        if (request.method === "tools/call") {
          toolName = request.params?.name ?? "(unknown)";
        }
      } catch {
        // not JSON or missing params; forward as-is
      }

      const assignments =
        await this.config.coreRepository.getPoliciesForContext(
          agentId,
          toolName,
        );

      const cwd = this.config.cwd ?? process.cwd();
      const storageAdapters = this.pluginManager
        ? await this.pluginManager.getStoragePlugins(cwd, this.config.configPath)
        : [];
      const storageAdapter = storageAdapters[0];

      const policyPlugins = instantiatePolicyPlugins(assignments, storageAdapter);

      const eventSinks = this.pluginManager
        ? await this.pluginManager.getEventSinkPlugins(
            cwd,
            this.config.configPath,
          )
        : [];

      const processResult = await processMessage({
        body,
        policyPlugins,
        eventSinks,
        agentId,
        agentNameSnapshot,
      });
      if (processResult.handled) {
        if (processResult.body)
          this.sendToClient(processResult.body, serverName);
        return { status: processResult.status, body: processResult.body };
      }

      const bodyToSend = processResult.bodyToSend;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(body) as JsonRpcRequest;
      } catch {
        request = {};
      }
      const methodFromBodyToSend =
        bodyToSend !== body
          ? (() => {
              try {
                return (JSON.parse(bodyToSend) as JsonRpcRequest).method;
              } catch {
                return undefined;
              }
            })()
          : request.method;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyToSend,
      });
      const text = await response.text();

      const isToolsListRequest = methodFromBodyToSend === "tools/list";
      const isAsyncAccept =
        response.status === 202 &&
        (text === "Accepted" || text.trim() === "Accepted");

      if (isToolsListRequest && response.ok && !isAsyncAccept) {
        try {
          const json = JSON.parse(text) as { result?: { tools?: unknown[] } };
          const tools = json.result?.tools;
          if (Array.isArray(tools)) {
            const normalized = this.toolsDiscovery.normalizeToolsList(
              tools as unknown[],
            );
            this.toolsDiscovery.setToolsForServer(serverName, normalized);
          }
        } catch {
          // not JSON or wrong shape; response still forwarded to client
        }
      }

      return { status: response.status, body: text };
    } catch (err) {
      logger.error({ err }, "Forward POST failed");
      return { status: 500, body: "Proxy Error" };
    }
  }
}
