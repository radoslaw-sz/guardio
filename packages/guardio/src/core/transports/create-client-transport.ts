import type { GuardioClientConfig } from "../../config/types.js";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type {
  IClientTransport,
  ClientTransportDashboardHooks,
  EventBus,
} from "./types.js";
import { HttpClientTransport } from "./http-client.js";
import { logger } from "../../logger.js";

const DEFAULT_CLIENT: GuardioClientConfig = { mode: "http" };

export type ClientTransportType = "http" | "stdio";

export type ClientTransportFactory = (
  clientConfig: GuardioClientConfig | null | undefined,
  options: CreateClientTransportOptions,
) => IClientTransport;

const clientTransportRegistry: Record<ClientTransportType, ClientTransportFactory> =
  {
    http: (clientConfig, options) => {
      const client = clientConfig ?? DEFAULT_CLIENT;
      const port = client.port ?? 8080;
      const host = client.host;
      const serverNames = options.serverNames ?? [];
      logger.debug(
        { port, host, serverNames },
        "Creating HTTP client transport",
      );
      return new HttpClientTransport({
        port,
        host,
        serverNames,
        dashboardHooks: options.dashboardHooks,
        eventBus: options.eventBus,
        coreRepository: options.coreRepository,
      });
    },
    // Placeholder for future stdio client transport implementation.
    stdio: () => {
      throw new Error(
        'Client transport type "stdio" is not implemented yet. Use type "http".',
      );
    },
  };

export function registerClientTransport(
  type: ClientTransportType,
  factory: ClientTransportFactory,
): void {
  clientTransportRegistry[type] = factory;
}

export interface CreateClientTransportOptions {
  /** Dashboard/control-plane API handlers. Called by transport on GET /api/connection and GET /api/policies. */
  dashboardHooks?: ClientTransportDashboardHooks;
  /** Server names (mcp-id) for path-based routes: /{name}/sse and /{name}/messages. Required for HTTP mode. */
  serverNames?: string[];
  /** General-purpose event bus; subscribe before passing so no events are missed. */
  eventBus?: EventBus;
  /** Core repository (mandatory; storage adapter provides it). */
  coreRepository: CoreRepository;
}

/**
 * Creates a client transport from config. Wire events in core via setupEventHandlers().
 * Optionally pass dashboardHooks for GET /api/connection and GET /api/policies.
 * For HTTP mode, pass serverNames so the transport registers /:mcpId/sse and /:mcpId/messages.
 */
export function createClientTransport(
  clientConfig: GuardioClientConfig | null | undefined,
  options: CreateClientTransportOptions,
): IClientTransport {
  const type: ClientTransportType =
    (clientConfig?.type as ClientTransportType | undefined) ??
    (clientConfig?.mode as ClientTransportType | undefined) ??
    "http";
  const factory = clientTransportRegistry[type] ?? clientTransportRegistry.http;
  return factory(clientConfig, options);
}
