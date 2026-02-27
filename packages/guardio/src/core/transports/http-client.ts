import type { ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { v4 as uuidv4 } from "uuid";
import {
  uniqueNamesGenerator,
  adjectives,
  animals,
  colors,
} from "unique-names-generator";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type {
  IClientTransport,
  ClientTransportDashboardHooks,
  EventBus,
  AgentDiscoveredPayload,
} from "./types.js";
import { BusTopic } from "./types.js";
import type {
  DashboardActiveClientInfo,
  DashboardPolicyInstancesInfo,
} from "./dashboard-api-types.js";
import type {
  PostRequestPayload,
  CreatePolicyInstanceBody,
  CreatePolicyInstanceResult,
  UpdatePolicyInstanceBody,
  UpdatePolicyInstanceResult,
} from "./types.js";
import { logger } from "../../logger.js";

const HEALTH_PATH = "/health";
const API_CONNECTION_PATH = "/api/connection";
const API_POLICIES_PATH = "/api/policies";
const API_POLICY_INSTANCES_PATH = "/api/policy-instances";
const API_EVENTS_PATH = "/api/events";

/**
 * We need to hold open SSE response streams in memory so we can write to them on broadcast.
 * The DB cannot represent live HTTP connections; only these handles let us call res.write().
 */
interface SseStreamHandle {
  id: string;
  serverName: string;
  res: ServerResponse;
}

/**
 * HTTP client transport: GET /:mcpId/sse (SSE stream), POST /:mcpId/messages (emit postRequest),
 * GET /api/connection and GET /api/policies (dashboard, via hooks).
 * mcpId must be one of the configured server names.
 * Active agent data is in coreRepository; sseStreams only holds the open response streams needed for broadcast.
 */
export class HttpClientTransport extends EventEmitter implements IClientTransport {
  private fastify: Fastify.FastifyInstance | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly serverNames: Set<string>;
  private readonly dashboardHooks: ClientTransportDashboardHooks | undefined;
  private readonly eventBus: EventBus | undefined;
  private readonly coreRepository: CoreRepository;
  /** Open SSE response streams; required to broadcast (res.write) and to call deleteAgent on close. */
  private readonly sseStreams = new Set<SseStreamHandle>();
  private readonly remoteReadyByServer = new Set<string>();

  constructor(options: {
    port: number;
    host?: string;
    serverNames: string[];
    dashboardHooks?: ClientTransportDashboardHooks;
    /** Event bus; agent.discovered is emitted here so subscribers can attach before start. */
    eventBus?: EventBus;
    /** Core repository (mandatory; storage adapter provides it). Used to persist agents. */
    coreRepository: CoreRepository;
  }) {
    super();
    this.port = options.port;
    this.host = options.host ?? "127.0.0.1";
    this.serverNames = new Set(options.serverNames);
    this.dashboardHooks = options.dashboardHooks;
    this.eventBus = options.eventBus;
    this.coreRepository = options.coreRepository;
  }

  setRemoteReady(serverName: string): void {
    this.remoteReadyByServer.add(serverName);
    this.broadcast(`event: endpoint\ndata: /${serverName}/messages\n\n`, serverName);
  }

  private broadcast(data: string, serverName?: string): void {
    for (const handle of this.sseStreams) {
      if (serverName != null && handle.serverName !== serverName) continue;
      if (!handle.res.writableEnded) handle.res.write(data);
    }
  }

  getActiveSseClients(): number {
    return this.sseStreams.size;
  }

  async getActiveClientsInfo(): Promise<DashboardActiveClientInfo[]> {
    const agents = await this.coreRepository.listAgents();
    const liveKeys = new Set([...this.sseStreams].map((h) => `${h.id}\t${h.serverName}`));
    const filtered = agents.filter((a) => liveKeys.has(`${a.id}\t${a.serverName ?? ""}`));
    if (agents.length !== filtered.length) {
      logger.debug(
        { fromDb: agents.length, liveStreams: this.sseStreams.size, afterFilter: filtered.length },
        "getActiveClientsInfo: filtered out stale DB connections",
      );
    }
    return filtered.map((a) => ({
      id: a.id,
      name: a.name,
      nameGenerated: a.nameGenerated ?? false,
      serverName: a.serverName,
    }));
  }

  getRemoteReady(): boolean {
    return this.remoteReadyByServer.size > 0;
  }

  async start(): Promise<void> {
    const app = Fastify({ logger: false });

    await app.register(fastifyCors, {
      origin: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "x-agent-name"],
    });

    app.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_req, body, done) => done(null, body as string)
    );

    app.get(HEALTH_PATH, async (_request, reply) => {
      return reply.status(200).send({ status: "ok" });
    });

    app.get(API_CONNECTION_PATH, async (_request, reply) => {
      const handler = this.dashboardHooks?.handleConnectionRequest;
      if (!handler) {
        return reply.status(404).send({ error: "Dashboard connection handler not configured" });
      }
      try {
        const data = await handler();
        if (data == null) {
          return reply.status(503).send({ error: "Connection info not available" });
        }
        return reply.status(200).type("application/json").send(data);
      } catch (err) {
        logger.error({ err }, "GET /api/connection failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.get(API_POLICIES_PATH, async (_request, reply) => {
      const handler = this.dashboardHooks?.handlePoliciesRequest;
      if (!handler) {
        return reply.status(404).send({ error: "Dashboard policies handler not configured" });
      }
      try {
        const data = await handler();
        if (data == null) {
          return reply.status(503).send({ error: "Policies info not available" });
        }
        return reply.status(200).type("application/json").send(data);
      } catch (err) {
        logger.error({ err }, "GET /api/policies failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.get(API_POLICY_INSTANCES_PATH, async (_request, reply) => {
      const handler = this.dashboardHooks?.handleListPolicyInstances;
      if (!handler) {
        return reply.status(404).send({ error: "List policy instances not configured" });
      }
      try {
        const data = await handler();
        if (data == null) {
          return reply.status(503).send({ error: "Policy instances not available" });
        }
        return reply.status(200).type("application/json").send(data);
      } catch (err) {
        logger.error({ err }, "GET /api/policy-instances failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.get(API_EVENTS_PATH, async (request, reply) => {
      const handler = this.dashboardHooks?.handleListEvents;
      if (!handler) {
        return reply.status(404).send({ error: "List events not configured" });
      }
      try {
        const data = await handler();
        if (data == null) {
          return reply.status(503).send({ error: "Events not available" });
        }
        return reply.status(200).type("application/json").send(data);
      } catch (err) {
        logger.error({ err }, "GET /api/events failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.post(API_POLICY_INSTANCES_PATH, async (request, reply) => {
      const handler = this.dashboardHooks?.handleCreatePolicyInstance;
      if (!handler) {
        return reply.status(404).send({ error: "Create policy instance not configured" });
      }
      let body = request.body as unknown;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body) as unknown;
        } catch {
          return reply.status(400).send({ error: "Invalid JSON body" });
        }
      }
      if (body == null || typeof body !== "object" || typeof (body as CreatePolicyInstanceBody).pluginName !== "string") {
        return reply.status(400).send({ error: "Body must include pluginName (string)" });
      }
      const { pluginName, config, name, agentId, toolName } = body as CreatePolicyInstanceBody;
      try {
        const result: CreatePolicyInstanceResult = await handler({
          pluginName,
          config,
          name,
          agentId,
          toolName,
        });
        if ("error" in result) {
          return reply.status(400).type("application/json").send(result);
        }
        return reply.status(201).type("application/json").send(result);
      } catch (err) {
        logger.error({ err }, "POST /api/policy-instances failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.get<{ Params: { id: string } }>(`${API_POLICY_INSTANCES_PATH}/:id`, async (request, reply) => {
      const handler = this.dashboardHooks?.handleGetPolicyInstance;
      if (!handler) {
        return reply.status(404).send({ error: "Get policy instance not configured" });
      }
      const id = request.params?.id;
      if (!id) {
        return reply.status(400).send({ error: "Missing policy instance id" });
      }
      try {
        const instance = await handler(id);
        if (instance == null) {
          return reply.status(404).send({ error: "Policy instance not found" });
        }
        return reply.status(200).type("application/json").send(instance);
      } catch (err) {
        logger.error({ err, policyInstanceId: id }, "GET /api/policy-instances/:id failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.patch<{ Params: { id: string } }>(`${API_POLICY_INSTANCES_PATH}/:id`, async (request, reply) => {
      const handler = this.dashboardHooks?.handleUpdatePolicyInstance;
      if (!handler) {
        return reply.status(404).send({ error: "Update policy instance not configured" });
      }
      const id = request.params?.id;
      if (!id) {
        return reply.status(400).send({ error: "Missing policy instance id" });
      }
      let body = request.body as unknown;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body) as unknown;
        } catch {
          return reply.status(400).send({ error: "Invalid JSON body" });
        }
      }
      if (body == null || typeof body !== "object" || !("config" in (body as object))) {
        return reply.status(400).send({ error: "Body must include config" });
      }
      const { config, name, agentId, toolName } = body as UpdatePolicyInstanceBody;
      try {
        const result: UpdatePolicyInstanceResult = await handler(id, {
          config: config ?? {},
          name,
          agentId,
          toolName,
        });
        if (result?.error) {
          return reply.status(400).type("application/json").send({ error: result.error });
        }
        return reply.status(204).send();
      } catch (err) {
        logger.error({ err, policyInstanceId: id }, "PATCH /api/policy-instances/:id failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.delete<{ Params: { id: string } }>(`${API_POLICY_INSTANCES_PATH}/:id`, async (request, reply) => {
      const handler = this.dashboardHooks?.handleDeletePolicyInstance;
      if (!handler) {
        return reply.status(404).send({ error: "Delete policy instance not configured" });
      }
      const id = request.params?.id;
      if (!id) {
        return reply.status(400).send({ error: "Missing policy instance id" });
      }
      try {
        await handler(id);
        return reply.status(204).send();
      } catch (err) {
        logger.error({ err, policyInstanceId: id }, "DELETE /api/policy-instances/:id failed");
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    app.get<{ Params: { mcpId: string } }>("/:mcpId/sse", async (request, reply) => {
      const mcpId = request.params?.mcpId;
      if (!mcpId || !this.serverNames.has(mcpId)) {
        return reply.status(404).send({ error: "Unknown server" });
      }
      reply.hijack();
      const res = reply.raw;
      const headerName = (request.headers["x-agent-name"] as string | undefined)?.trim();
      const nameGenerated = !headerName;
      const name =
        headerName ||
        uniqueNamesGenerator({
          dictionaries: [adjectives, colors, animals],
          length: 2,
          separator: "-",
        });
      const id = uuidv4();
      const handle: SseStreamHandle = { id, serverName: mcpId, res };
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      logger.debug({ id, name, nameGenerated, serverName: mcpId }, "SSE client connected");
      const payload: AgentDiscoveredPayload = { id, name };
      this.coreRepository
        .saveAgent({ id, name, serverName: mcpId, nameGenerated })
        .catch((err) => {
          logger.warn({ err, id, name }, "Failed to persist agent on connect");
        });
      if (this.eventBus) {
        this.eventBus.emit(BusTopic.AGENT_DISCOVERED, payload);
      }
      this.sseStreams.add(handle);
      logger.debug({ sseStreams: this.sseStreams.size }, "SSE client connected");
      if (this.remoteReadyByServer.has(mcpId)) {
        res.write(`event: endpoint\ndata: /${mcpId}/messages\n\n`);
      }
      request.raw.on("close", () => {
        this.sseStreams.delete(handle);
        this.coreRepository.deleteConnection(handle.id, handle.serverName).catch((err) => {
          logger.warn({ err, id: handle.id, serverName: handle.serverName }, "Failed to delete connection on disconnect");
        });
        logger.debug({ id: handle.id, serverName: handle.serverName, sseStreams: this.sseStreams.size }, "SSE client disconnected");
      });
    });

    app.post<{ Params: { mcpId: string } }>("/:mcpId/messages", async (request, reply) => {
      const mcpId = request.params?.mcpId;
      if (!mcpId || !this.serverNames.has(mcpId)) {
        return reply.status(404).send({ error: "Unknown server" });
      }
      const body = typeof request.body === "string" ? request.body : "";
      const agentId = (request.headers["x-agent-id"] as string | undefined)?.trim() ?? null;
      let replied = false;
      const payload: PostRequestPayload = {
        body,
        serverName: mcpId,
        agentId: agentId || null,
        reply: (status: number, responseBody: string) => {
          if (replied) return;
          replied = true;
          reply.status(status).type("application/json").send(responseBody);
          resolveReply();
        },
      };
      const listeners = this.listenerCount("postRequest");
      if (listeners === 0) {
        logger.warn("POST /:mcpId/messages: no postRequest listener (core not wired)");
        return reply.status(503).type("text/plain").send("Remote MCP not ready");
      }
      let resolveReply!: () => void;
      const replyPromise = new Promise<void>((resolve) => {
        resolveReply = resolve;
      });
      this.emit("postRequest", payload);
      await replyPromise;
    });

    this.fastify = app;
    await new Promise<void>((resolve, reject) => {
      app.listen({ port: this.port, host: this.host }, (err) => {
        if (err) {
          logger.error({ err }, "HTTP server listen failed");
          reject(err);
          return;
        }
        logger.info(
          {
            url: `http://${this.host}:${this.port}`,
            ssePathPattern: "/:mcpId/sse",
            serverNames: [...this.serverNames],
            healthPath: HEALTH_PATH,
          },
          "Proxy running; add SSE URL to client (e.g. /{serverName}/sse)"
        );
        resolve();
      });
    });
  }

  send(message: string, serverName?: string): void {
    this.broadcast(`data: ${message}\n\n`, serverName);
  }

  /** Close the HTTP server. Idempotent. */
  async close(): Promise<void> {
    if (this.fastify) {
      await this.fastify.close();
      this.fastify = null;
      logger.debug("HTTP server closed");
    }
  }
}
