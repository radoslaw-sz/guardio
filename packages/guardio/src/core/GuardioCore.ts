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
  DashboardSimulationSettings,
  DashboardSimulationToolSetting,
  UpdateSimulationSettingsBody,
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
import { SimulationService } from "./services/simulation-service.js";

export class GuardioCore {
  private readonly config: GuardioCoreConfig;
  private pluginManager: PluginManager | null = null;

  private serverTransports = new Map<string, IServerTransport>();
  private clientTransport: IClientTransport | null = null;
  private readonly toolsDiscovery: ToolsDiscoveryService;
  private readonly policyInstanceService: PolicyInstanceService;
  private readonly simulationService: SimulationService;

  private static readonly GLOBAL_SETTINGS_SCOPE_TYPE = "global";
  private static readonly GLOBAL_SETTINGS_SCOPE_ID = "global";

  constructor(config: GuardioCoreConfig) {
    this.config = config;
    this.toolsDiscovery = new ToolsDiscoveryService(
      this.config.servers,
      this.config.coreRepository,
    );
    this.policyInstanceService = new PolicyInstanceService(
      this.config.coreRepository,
    );
    this.simulationService = new SimulationService();
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
        handleGetSimulationSettings: () => this.getSimulationSettings(),
        handleUpdateSimulationSettings: (body) =>
          this.updateSimulationSettings(body),
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
      async ({
        body,
        reply,
        serverName,
        agentId,
        agentNameSnapshot,
        guardioMode,
      }) => {
        try {
          const transport = this.serverTransports.get(serverName);
          if (!transport?.getRemotePostUrl()) {
            reply(503, "Remote MCP not ready");
            return;
          }
          const result = await this.handlePostMessage({
            body,
            serverName,
            agentId: agentId ?? null,
            agentNameSnapshot: agentNameSnapshot ?? null,
            guardioMode: guardioMode ?? null,
          });
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

  /** GET /api/testing/simulation: read Simulation Mode configuration for dashboard. */
  private async getSimulationSettings(): Promise<
    DashboardSimulationSettings | null
  > {
    const repo = this.config.coreRepository;
    if (!repo.getRuntimeSetting) return null;

    const global = await repo.getRuntimeSetting(
      "simulation_mode",
      GuardioCore.GLOBAL_SETTINGS_SCOPE_TYPE,
      GuardioCore.GLOBAL_SETTINGS_SCOPE_ID,
    );
    const tools =
      (await repo.getRuntimeSetting(
        "simulation_tools",
        GuardioCore.GLOBAL_SETTINGS_SCOPE_TYPE,
        GuardioCore.GLOBAL_SETTINGS_SCOPE_ID,
      )) as DashboardSimulationToolSetting[] | null;

    const globalSimulated =
      !!global &&
      typeof global === "object" &&
      (global as { enabled?: boolean }).enabled === true;

    const settings: DashboardSimulationSettings = {
      globalSimulated,
      tools: Array.isArray(tools) ? tools : [],
    };
    return settings;
  }

  /** PUT /api/testing/simulation: update Simulation Mode configuration from dashboard. */
  private async updateSimulationSettings(
    body: UpdateSimulationSettingsBody,
  ): Promise<{ error?: string }> {
    const repo = this.config.coreRepository;
    if (!repo.setRuntimeSetting) {
      return { error: "Runtime settings are not supported by this storage" };
    }

    if (!Array.isArray(body.tools)) {
      return { error: "tools must be an array" };
    }

    const seen = new Set<string>();
    for (const entry of body.tools) {
      if (
        !entry ||
        typeof entry.serverName !== "string" ||
        typeof entry.toolName !== "string" ||
        typeof entry.simulated !== "boolean"
      ) {
        return {
          error:
            "Each tool entry must include serverName (string), toolName (string), and simulated (boolean)",
        };
      }
      const key = `${entry.serverName}::${entry.toolName}`;
      if (seen.has(key)) {
        return { error: "Duplicate serverName + toolName entries are not allowed" };
      }
      seen.add(key);
    }

    await repo.setRuntimeSetting(
      "simulation_mode",
      { enabled: body.globalSimulated === true },
      GuardioCore.GLOBAL_SETTINGS_SCOPE_TYPE,
      GuardioCore.GLOBAL_SETTINGS_SCOPE_ID,
    );
    await repo.setRuntimeSetting(
      "simulation_tools",
      body.tools,
      GuardioCore.GLOBAL_SETTINGS_SCOPE_TYPE,
      GuardioCore.GLOBAL_SETTINGS_SCOPE_ID,
    );

    return {};
  }

  /**
   * Handle POST /messages (HTTP client): resolve policies from DB for context, run policy via Processor, then forward to remote if not handled.
   */
  async handlePostMessage(input: {
    body: string;
    serverName: string;
    agentId: string | null;
    agentNameSnapshot: string | null;
    guardioMode: string | null;
  }): Promise<{ status: number; body: string }> {
    const { body, serverName, agentId, agentNameSnapshot, guardioMode } = input;
    const transport = this.serverTransports.get(serverName);
    const url = transport?.getRemotePostUrl() ?? null;

    if (!url) {
      logger.warn("POST /messages: remote MCP not ready");
      return { status: 503, body: "Remote MCP not ready" };
    }
    try {
      let toolName: string | null = null;
      let parsedRequest: JsonRpcRequest | null = null;
      try {
        parsedRequest = JSON.parse(body) as JsonRpcRequest;
        if (parsedRequest.method === "tools/call") {
          toolName = parsedRequest.params?.name ?? "(unknown)";
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

      // Determine Simulation Mode state for this request (if any), so that
      // processing events can be annotated consistently for both simulated
      // and non-simulated environments.
      const repo = this.config.coreRepository;
      let simulationContext:
        | {
          enabled: boolean;
          source: "global" | "header" | "tool";
        }
        | undefined;
      if (repo.getRuntimeSetting && parsedRequest?.method === "tools/call") {
        const runtimeSetting = await repo.getRuntimeSetting(
          "simulation_mode",
          GuardioCore.GLOBAL_SETTINGS_SCOPE_TYPE,
          GuardioCore.GLOBAL_SETTINGS_SCOPE_ID,
        );
        const globalSimEnabled =
          !!runtimeSetting &&
          typeof runtimeSetting === "object" &&
          (runtimeSetting as { enabled?: boolean }).enabled === true;
        const headerSimEnabled =
          !globalSimEnabled && guardioMode?.toLowerCase() === "simulation";

        // Per-tool simulation override list (from dashboard settings).
        let toolSimEnabled = false;
        if (!globalSimEnabled && !headerSimEnabled && toolName) {
          const toolsSetting = (await repo.getRuntimeSetting(
            "simulation_tools",
            GuardioCore.GLOBAL_SETTINGS_SCOPE_TYPE,
            GuardioCore.GLOBAL_SETTINGS_SCOPE_ID,
          )) as DashboardSimulationToolSetting[] | null;
          if (Array.isArray(toolsSetting)) {
            toolSimEnabled = toolsSetting.some(
              (t) =>
                t &&
                t.serverName === serverName &&
                t.toolName === toolName &&
                t.simulated === true,
            );
          }
        }

        if (globalSimEnabled || headerSimEnabled || toolSimEnabled) {
          simulationContext = {
            enabled: true,
            source: globalSimEnabled ? "global" : headerSimEnabled ? "header" : "tool",
          };
        }

        logger.debug(
          {
            serverName,
            toolName,
            requestId: parsedRequest.id,
            guardioMode,
            globalSimEnabled,
            headerSimEnabled,
            toolSimEnabled,
            simulationContext,
          },
          "Simulation gate evaluated",
        );
      }

      const processResult = await processMessage({
        body,
        policyPlugins,
        eventSinks,
        agentId,
        agentNameSnapshot,
        simulation: simulationContext,
      });
      if (processResult.handled) {
        if (processResult.body)
          this.sendToClient(processResult.body, serverName);
        return { status: processResult.status, body: processResult.body };
      }

      const bodyToSend = processResult.bodyToSend;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(bodyToSend) as JsonRpcRequest;
      } catch {
        request = {};
      }

      const method = request.method;
      if (method === "tools/call") {
        logger.debug(
          {
            serverName,
            requestId: request.id,
            toolName: (request.params as { name?: string } | undefined)?.name,
            argsKeys:
              request.params && typeof request.params === "object"
                ? Object.keys((request.params as { arguments?: unknown }).arguments ?? {})
                : undefined,
          },
          "tools/call parsed for proxying",
        );
      }

      // Simulation Mode gate: after policies, before upstream MCP call.
      const simulationActive =
        method === "tools/call" && !!simulationContext && simulationContext.enabled;

      if (simulationActive) {
        const sim = simulationContext!;
        logger.info(
          {
            serverName,
            toolName:
              (request.params as { name?: string } | undefined)?.name ??
              "(unknown)",
            requestId: request.id,
            source: sim.source,
          },
          "Simulation active: returning simulated result (skipping upstream MCP)",
        );
        const tools = this.toolsDiscovery.getToolsForServer(serverName) ?? [];
        const toolName =
          (request.params as { name?: string } | undefined)?.name ??
          "(unknown)";
        const toolInfo =
          tools.find((t) => t.name === toolName) ??
          ({ name: toolName } as { name: string; inputSchema?: object });

        const simulatedResult = await this.simulationService.generateSimulatedResult(
          {
            serverName,
            tool: toolInfo,
            args: (request.params as { arguments?: unknown } | undefined)
              ?.arguments,
            agentId,
            agentNameSnapshot,
            requestId: request.id,
            source: sim.source,
          },
        );

        const responseBody = JSON.stringify({
          jsonrpc: request.jsonrpc ?? "2.0",
          id: request.id,
          result: simulatedResult,
        });

        // In MCP HTTP transport, clients typically listen on SSE for responses.
        // Mirror the "handled" path behavior by broadcasting the simulated JSON-RPC response.
        this.sendToClient(responseBody, serverName);
        logger.debug(
          { serverName, requestId: request.id, bytes: responseBody.length },
          "Simulation response broadcast to SSE clients",
        );
        return { status: 200, body: responseBody };
      }

      if (method === "tools/call") {
        logger.debug(
          {
            serverName,
            toolName:
              (request.params as { name?: string } | undefined)?.name ??
              "(unknown)",
            requestId: request.id,
            guardioMode,
            simulationContext,
          },
          "Simulation inactive: forwarding tools/call to upstream MCP",
        );
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
