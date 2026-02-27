import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { GuardioCoreConfig } from "./types.js";
import type { JsonRpcRequest } from "./types.js";
import {
  getPolicyConfigSchema,
  createPolicyPluginInstance,
  PluginManager,
} from "../config/PluginManager.js";
import {
  createServerTransport,
  createClientTransport,
  type IServerTransport,
  type IClientTransport,
} from "./transports/index.js";
import { fetchToolsListViaDiscovery } from "./transports/mcp-tools-discovery.js";
import type {
  DashboardConnectionInfo,
  DashboardMcpToolInfo,
  DashboardPoliciesInfo,
  DashboardPolicyEntry,
  DashboardPolicyInstance,
  DashboardPolicyInstancesInfo,
  DashboardEventsInfo,
} from "./transports/dashboard-api-types.js";
import type {
  CreatePolicyInstanceBody,
  CreatePolicyInstanceResult,
  UpdatePolicyInstanceBody,
  UpdatePolicyInstanceResult,
} from "./transports/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { processMessage } from "./Processor.js";
import { logger } from "../logger.js";

export class GuardioCore {
  private readonly config: GuardioCoreConfig;
  private pluginManager: PluginManager | null = null;

  private serverTransports = new Map<string, IServerTransport>();
  private clientTransport: IClientTransport | null = null;
  /** Cached tools per server, filled when we proxy a tools/list response from the agent. */
  private readonly toolsListCache = new Map<string, DashboardMcpToolInfo[]>();
  /** One discovery per URL so multiple servers pointing to the same MCP don't open concurrent connections. */
  private readonly discoveryInProgressByUrl = new Map<
    string,
    Promise<DashboardMcpToolInfo[] | null>
  >();

  constructor(config: GuardioCoreConfig) {
    this.config = config;
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
    await this.loadPersistedServerTools();
    logger.info("Core started");
  }

  /** Load persisted tools from storage into cache so dashboard shows last-known after restart. */
  private async loadPersistedServerTools(): Promise<void> {
    const repo = this.config.coreRepository;
    if (!repo.getAllServerTools) return;
    try {
      const all = await repo.getAllServerTools();
      for (const [name, tools] of Object.entries(all)) {
        if (tools?.length) this.toolsListCache.set(name, tools);
      }
    } catch (err) {
      logger.debug({ err }, "Load persisted server tools failed");
    }
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
      async ({ body, reply, serverName, agentId }) => {
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
        this.tryCacheToolsFromSseMessage(line, serverName);
        this.clientTransport?.send(line, serverName);
      });
      transport.on("endpointReady", () => {
        this.toolsListCache.delete(serverName);
        if (typeof this.clientTransport?.setRemoteReady === "function") {
          this.clientTransport.setRemoteReady(serverName);
        }
        const serverConfig = this.config.servers.find(
          (s) => s.name === serverName,
        );
        if (!serverConfig) return;
        const url = serverConfig.url.trim();
        this.rehydrateServerToolsFromDb(url);
        let promise = this.discoveryInProgressByUrl.get(url);
        if (!promise) {
          promise = fetchToolsListViaDiscovery(serverConfig).finally(() => {
            this.discoveryInProgressByUrl.delete(url);
          });
          this.discoveryInProgressByUrl.set(url, promise);
        }
        promise
          .then((tools) => {
            if (tools !== null) {
              const save = this.config.coreRepository.saveServerTools;
              for (const s of this.config.servers) {
                if (s.url.trim() === url) {
                  this.toolsListCache.set(s.name, tools);
                  save?.(s.name, tools).catch(() => {});
                }
              }
            }
          })
          .catch(() => {});
      });
    }
  }

  private sendToClient(message: string, serverName: string): void {
    this.clientTransport?.send(message, serverName);
  }

  /** Normalize raw MCP tool list to DashboardMcpToolInfo[]. */
  private normalizeToolsList(tools: unknown[]): DashboardMcpToolInfo[] {
    return tools.map((t) =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as { name?: unknown }).name === "string"
        ? {
            name: (t as { name: string }).name,
            description: (t as { description?: string }).description,
            title: (t as { title?: string }).title,
            inputSchema:
              typeof (t as { inputSchema?: unknown }).inputSchema ===
                "object" && (t as { inputSchema?: object }).inputSchema !== null
                ? (t as { inputSchema: object }).inputSchema
                : undefined,
          }
        : { name: String(t) },
    );
  }

  /**
   * If the message is a JSON-RPC response with result.tools (e.g. from SSE after 202 Accepted),
   * cache it for connection info. No-op if not valid or not a tools list response.
   */
  private tryCacheToolsFromSseMessage(line: string, serverName: string): void {
    try {
      const json = JSON.parse(line) as { result?: { tools?: unknown[] } };
      const tools = json.result?.tools;
      if (!Array.isArray(tools)) return;
      const normalized = this.normalizeToolsList(tools);
      this.toolsListCache.set(serverName, normalized);
      this.config.coreRepository
        .saveServerTools?.(serverName, normalized)
        .catch(() => {});
    } catch {
      // not JSON or wrong shape; ignore
    }
  }

  /** Rehydrate tools from DB for all servers with this URL so dashboard shows last-known until discovery completes. */
  private rehydrateServerToolsFromDb(url: string): void {
    const repo = this.config.coreRepository;
    if (!repo.getAllServerTools) return;
    repo
      .getAllServerTools()
      .then((all) => {
        for (const s of this.config.servers) {
          if (s.url.trim() === url && all[s.name]?.length) {
            this.toolsListCache.set(s.name, all[s.name]);
          }
        }
      })
      .catch(() => {});
  }

  /** Dashboard GET /api/connection: build connection info from transports. */
  private async getConnectionInfo(): Promise<DashboardConnectionInfo | null> {
    const client = this.clientTransport
      ? {
          mode: "http" as const,
          listenPort: this.config.client?.port,
          listenHost: this.config.client?.host,
          activeSseClients: this.clientTransport.getActiveSseClients?.() ?? 0,
          remoteReady: this.clientTransport.getRemoteReady?.() ?? false,
        }
      : null;
    const servers = [...this.serverTransports.entries()].map(
      ([name, transport]) => ({
        name,
        remoteUrl: transport.getRemoteUrl(),
        remotePostUrl: transport.getRemotePostUrl(),
        connected: !!transport.getRemotePostUrl(),
        tools: this.toolsListCache.get(name),
      }),
    );
    const clients = this.clientTransport?.getActiveClientsInfo
      ? await this.clientTransport.getActiveClientsInfo()
      : [];
    const connections = clients.map((c) => ({
      agentId: c.id,
      serverName: c.serverName ?? "",
      agentName: c.name,
    }));
    logger.debug(
      {
        clientsCount: clients.length,
        connectionsCount: connections.length,
        activeSseClients: client?.activeSseClients,
      },
      "getConnectionInfo",
    );
    return { client, servers, clients, connections };
  }

  /** GET /api/policy-instances: list policy instances from storage with assignment summary. */
  private async listPolicyInstances(): Promise<DashboardPolicyInstancesInfo | null> {
    try {
      const [instances, assignmentRows] = await Promise.all([
        this.config.coreRepository.listPolicyInstances(),
        this.config.coreRepository.listPolicyAssignmentRows(),
      ]);
      const byInstance = new Map<
        string,
        Array<{ agentId: string | null; toolName: string | null }>
      >();
      for (const row of assignmentRows) {
        const list = byInstance.get(row.policyInstanceId) ?? [];
        list.push({ agentId: row.agentId, toolName: row.toolName });
        byInstance.set(row.policyInstanceId, list);
      }
      const instancesWithAssignments = instances.map((inst) => {
        const assignments = byInstance.get(inst.id) ?? [];
        return {
          ...inst,
          assignments,
        };
      });
      return { instances: instancesWithAssignments };
    } catch (err) {
      logger.error({ err }, "listPolicyInstances failed");
      return null;
    }
  }

  /** GET /api/events: list recent guardio_events for dashboard activity (via EventSinkStore plugin). */
  private async listEvents(): Promise<DashboardEventsInfo | null> {
    const store = this.config.eventSinkStore;
    if (!store) return null;
    try {
      const events = await store.listEvents({ limit: 500 });
      return {
        events: events.map((e) => ({
          eventId: e.eventId,
          timestamp: e.timestamp,
          eventType: e.eventType,
          actionType: e.actionType ?? null,
          agentId: e.agentId ?? null,
          decision: e.decision ?? null,
          policyEvaluation: e.policyEvaluation ?? null,
        })),
      };
    } catch (err) {
      logger.error({ err }, "listEvents failed");
      return null;
    }
  }

  /** POST /api/policy-instances: validate config and create a policy instance. */
  private async createPolicyInstance(
    body: CreatePolicyInstanceBody,
  ): Promise<CreatePolicyInstanceResult> {
    const schema = getPolicyConfigSchema(body.pluginName);
    let config: Record<string, unknown>;
    if (schema) {
      const parsed = schema.safeParse(body.config);
      if (!parsed.success) {
        return { error: parsed.error.message };
      }
      config = parsed.data as Record<string, unknown>;
    } else {
      try {
        createPolicyPluginInstance(body.pluginName, {});
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : `Unknown policy plugin: ${body.pluginName}`,
        };
      }
      config =
        body.config != null &&
        typeof body.config === "object" &&
        !Array.isArray(body.config)
          ? (body.config as Record<string, unknown>)
          : {};
    }
    try {
      const id = await this.config.coreRepository.createPolicyInstance(
        body.pluginName,
        config,
        body.name,
        body.agentId,
        body.toolName,
      );
      return { id };
    } catch (err) {
      logger.error(
        { err, pluginName: body.pluginName },
        "createPolicyInstance failed",
      );
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create policy instance",
      };
    }
  }

  /** DELETE /api/policy-instances/:id: remove a policy instance and its assignments. */
  private async deletePolicyInstance(policyInstanceId: string): Promise<void> {
    await this.config.coreRepository.deletePolicyInstance(policyInstanceId);
  }

  /** GET /api/policy-instances/:id: get one policy instance with assignments. */
  private async getPolicyInstance(
    id: string,
  ): Promise<DashboardPolicyInstance | null> {
    try {
      const instance =
        await this.config.coreRepository.getPolicyInstanceById(id);
      if (!instance) return null;
      const assignmentRows =
        await this.config.coreRepository.listPolicyAssignmentRows();
      const assignments = assignmentRows
        .filter((r) => r.policyInstanceId === id)
        .map((r) => ({ agentId: r.agentId, toolName: r.toolName }));
      return { ...instance, assignments };
    } catch (err) {
      logger.error({ err, id }, "getPolicyInstance failed");
      return null;
    }
  }

  /** PATCH /api/policy-instances/:id: update config, name, and assignment. */
  private async updatePolicyInstance(
    id: string,
    body: UpdatePolicyInstanceBody,
  ): Promise<UpdatePolicyInstanceResult> {
    const instance = await this.config.coreRepository.getPolicyInstanceById(id);
    if (!instance) {
      return { error: "Policy instance not found" };
    }
    const schema = getPolicyConfigSchema(instance.pluginId);
    let config: Record<string, unknown>;
    if (schema) {
      const parsed = schema.safeParse(body.config);
      if (!parsed.success) {
        return { error: parsed.error.message };
      }
      config = parsed.data as Record<string, unknown>;
    } else {
      config =
        body.config != null &&
        typeof body.config === "object" &&
        !Array.isArray(body.config)
          ? (body.config as Record<string, unknown>)
          : {};
    }
    try {
      await this.config.coreRepository.updatePolicyInstance(
        id,
        config,
        body.name,
        body.agentId,
        body.toolName,
      );
      return {};
    } catch (err) {
      logger.error({ err, id }, "updatePolicyInstance failed");
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update policy instance",
      };
    }
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
      const policyPlugins: PolicyPluginInterface[] = [];
      for (const a of assignments) {
        if (a.config == null || typeof a.config !== "object") {
          logger.warn(
            { assignmentId: a.id, pluginId: a.pluginId },
            "Policy assignment has no config; skipping",
          );
          continue;
        }
        try {
          policyPlugins.push(
            createPolicyPluginInstance(
              a.pluginId,
              a.config as Record<string, unknown>,
            ),
          );
        } catch (err) {
          logger.warn(
            { err, pluginId: a.pluginId, assignmentId: a.id },
            "Failed to instantiate policy plugin for assignment; skipping",
          );
        }
      }

      const cwd = this.config.cwd ?? process.cwd();
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
            const normalized = this.normalizeToolsList(tools as unknown[]);
            this.toolsListCache.set(serverName, normalized);
            this.config.coreRepository
              .saveServerTools?.(serverName, normalized)
              .catch(() => {});
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
