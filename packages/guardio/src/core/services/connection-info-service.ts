import type { GuardioClientConfig } from "../../config/types.js";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type {
  DashboardConnectionInfo,
  DashboardMcpToolInfo,
} from "../transports/dashboard-api-types.js";
import type {
  IClientTransport,
  IServerTransport,
} from "../transports/types.js";
import { logger } from "../../logger.js";

export interface ConnectionInfoDeps {
  clientConfig?: GuardioClientConfig;
  clientTransport: IClientTransport | null;
  serverTransports: Map<string, IServerTransport>;
  coreRepository: CoreRepository;
  toolsByServer: (serverName: string) => DashboardMcpToolInfo[] | undefined;
}

/**
 * Builds connection info for the dashboard (/api/connection) based on transports,
 * cached tools, and active agents in storage.
 */
export async function buildConnectionInfo(
  deps: ConnectionInfoDeps,
): Promise<DashboardConnectionInfo | null> {
  const { clientTransport, clientConfig, serverTransports, coreRepository } =
    deps;

  const client = clientTransport
    ? {
        mode: "http" as const,
        listenPort: clientConfig?.port,
        listenHost: clientConfig?.host,
        activeSseClients: clientTransport.getActiveSseClients?.() ?? 0,
        remoteReady: clientTransport.getRemoteReady?.() ?? false,
      }
    : null;

  const servers = [...serverTransports.entries()].map(
    ([name, transport]) => ({
      name,
      remoteUrl: transport.getRemoteUrl(),
      remotePostUrl: transport.getRemotePostUrl(),
      connected: !!transport.getRemotePostUrl(),
      tools: deps.toolsByServer(name),
    }),
  );

  const clients = clientTransport?.getActiveClientsInfo
    ? await clientTransport.getActiveClientsInfo()
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

