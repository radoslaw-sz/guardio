import type {
  GuardioServerConfig,
  GuardioServerConfigUrl,
} from "../../config/types.js";
import type { IServerTransport } from "./types.js";
import { SseUrlTransport } from "./sse-url-transport.js";

export type ServerTransportFactory = (
  serverConfig: GuardioServerConfigUrl,
) => IServerTransport;

const serverTransportRegistry: Record<GuardioServerConfig["type"], ServerTransportFactory> =
  {
    url: (config: GuardioServerConfigUrl) => new SseUrlTransport(config),
  };

export function registerServerTransport(
  type: GuardioServerConfig["type"],
  factory: ServerTransportFactory,
): void {
  serverTransportRegistry[type] = factory;
}

/**
 * Creates a server transport from config.
 * Default is HTTP/SSE (url).
 */
export function createServerTransport(
  serverConfig: GuardioServerConfigUrl,
): IServerTransport {
  const factory = serverTransportRegistry[serverConfig.type]!;
  return factory(serverConfig);
}
