import type { GuardioServerConfigUrl } from "../../config/types.js";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type { DashboardMcpToolInfo } from "../transports/dashboard-api-types.js";
import { fetchToolsListViaDiscovery } from "../transports/mcp-tools-discovery.js";
import { logger } from "../../logger.js";

/**
 * Handles discovery and caching of MCP tools per server.
 *
 * Responsibilities:
 * - Load persisted tools from storage on startup.
 * - Cache tools from tools/list responses (SSE or HTTP).
 * - Kick off discovery when a remote endpoint becomes ready.
 */
export class ToolsDiscoveryService {
  private readonly servers: GuardioServerConfigUrl[];
  private readonly coreRepository: CoreRepository;

  /** Cached tools per server, filled when we proxy a tools/list response from the agent. */
  private readonly toolsListCache = new Map<string, DashboardMcpToolInfo[]>();

  /** One discovery per URL so multiple servers pointing to the same MCP don't open concurrent connections. */
  private readonly discoveryInProgressByUrl = new Map<
    string,
    Promise<DashboardMcpToolInfo[] | null>
  >();

  constructor(servers: GuardioServerConfigUrl[], coreRepository: CoreRepository) {
    this.servers = servers;
    this.coreRepository = coreRepository;
  }

  /**
   * Load persisted tools from storage into cache so dashboard shows last-known after restart.
   * Safe to call even when the repository does not implement getAllServerTools.
   */
  async loadPersistedServerTools(): Promise<void> {
    const repo = this.coreRepository;
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

  /**
   * Called for every SSE message from a remote MCP server.
   * If the message is a JSON-RPC response with result.tools, caches it.
   */
  handleSseMessage(line: string, serverName: string): void {
    this.tryCacheToolsFromSseMessage(line, serverName);
  }

  /**
   * Called when a server transport emits endpointReady.
   * Clears previous tools cache for the server, rehydrates from DB, and kicks off discovery.
   */
  handleEndpointReady(serverName: string): void {
    this.toolsListCache.delete(serverName);

    const serverConfig = this.servers.find((s) => s.name === serverName);
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
        if (tools === null) return;
        const save = this.coreRepository.saveServerTools;
        for (const s of this.servers) {
          if (s.url.trim() === url) {
            this.toolsListCache.set(s.name, tools);
            save?.(s.name, tools).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }

  /**
   * Normalize raw MCP tool list to DashboardMcpToolInfo[].
   * Exported for reuse in tests.
   */
  normalizeToolsList(tools: unknown[]): DashboardMcpToolInfo[] {
    return tools.map((t) =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as { name?: unknown }).name === "string"
        ? {
            name: (t as { name: string }).name,
            description: (t as { description?: string }).description,
            title: (t as { title?: string }).title,
            inputSchema:
              typeof (t as { inputSchema?: unknown }).inputSchema === "object" &&
              (t as { inputSchema?: object }).inputSchema !== null
                ? (t as { inputSchema: object }).inputSchema
                : undefined,
          }
        : { name: String(t) },
    );
  }

  /**
   * Get cached tools for a server (if any).
   */
  getToolsForServer(serverName: string): DashboardMcpToolInfo[] | undefined {
    return this.toolsListCache.get(serverName);
  }

  /**
   * Explicitly set cached tools for a server and persist when repository supports it.
   */
  setToolsForServer(
    serverName: string,
    tools: DashboardMcpToolInfo[],
  ): void {
    this.toolsListCache.set(serverName, tools);
    this.coreRepository.saveServerTools?.(serverName, tools).catch(() => {});
  }

  /**
   * Internal: cache tools list from an SSE JSON line when shape matches.
   */
  private tryCacheToolsFromSseMessage(
    line: string,
    serverName: string,
  ): void {
    try {
      const json = JSON.parse(line) as { result?: { tools?: unknown[] } };
      const tools = json.result?.tools;
      if (!Array.isArray(tools)) return;
      const normalized = this.normalizeToolsList(tools);
      this.toolsListCache.set(serverName, normalized);
      this.coreRepository.saveServerTools?.(serverName, normalized).catch(
        () => {},
      );
    } catch {
      // not JSON or wrong shape; ignore
    }
  }

  /**
   * Rehydrate tools from DB for all servers with this URL so dashboard shows last-known
   * until discovery completes.
   */
  private rehydrateServerToolsFromDb(url: string): void {
    const repo = this.coreRepository;
    if (!repo.getAllServerTools) return;
    repo
      .getAllServerTools()
      .then((all) => {
        for (const s of this.servers) {
          if (s.url.trim() === url && all[s.name]?.length) {
            this.toolsListCache.set(s.name, all[s.name]);
          }
        }
      })
      .catch(() => {});
  }
}

