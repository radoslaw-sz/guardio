import type { GuardioServerConfigUrl } from "../../config/types.js";
import type { IServerTransport } from "./types.js";
import { SseUrlTransport } from "./sse-url-transport.js";

/**
 * Creates a server transport from config.
 * Default is HTTP/SSE (url).
 */
export function createServerTransport(
  serverConfig: GuardioServerConfigUrl,
): IServerTransport {
  return new SseUrlTransport(serverConfig);
}
