import { EventEmitter } from "node:events";
import { EventSource } from "eventsource";
import type { IServerTransport } from "./types.js";
import type { GuardioServerConfigUrl } from "../../config/types.js";
import { logger } from "../../logger.js";

const RETRY_MS = 3000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * SSE URL: if config.url already ends with /sse, use it; else append /sse.
 */
function sseUrl(config: GuardioServerConfigUrl): string {
  const url = config.url.trim();
  if (url.endsWith("/sse")) return url;
  return url.replace(/\/?$/, "/") + "sse";
}

/**
 * Server transport for remote MCP over HTTP+SSE. Extends EventEmitter.
 * Emits: 'message' (line from remote), 'endpointReady' (when endpoint event received).
 */
export class SseUrlTransport extends EventEmitter implements IServerTransport {
  private readonly config: GuardioServerConfigUrl;
  private remotePostUrl: string | null = null;
  private remoteEs: EventSource | null = null;
  private readonly url: string;

  constructor(config: GuardioServerConfigUrl) {
    super();
    this.config = config;
    this.url = sseUrl(config);
  }

  /** Base URL of the remote MCP (from config). */
  getRemoteUrl(): string {
    return this.config.url.trim();
  }

  /** Used by GuardioCore when handling POST /messages to forward to remote. */
  getRemotePostUrl(): string | null {
    return this.remotePostUrl;
  }

  async start(): Promise<void> {
    this.connectToRemote();
  }

  private connectToRemote(): void {
    logger.info({ url: this.url }, "Connecting to remote MCP");
    this.remoteEs = new EventSource(this.url);

    this.remoteEs.addEventListener("endpoint", (event: MessageEvent) => {
      const data =
        typeof event.data === "string" ? event.data : String(event.data);
      this.remotePostUrl = new URL(data, this.url).href;
      logger.info({ remotePostUrl: this.remotePostUrl }, "Remote endpoint discovered");
      this.emit("endpointReady");
    });

    this.remoteEs.onmessage = (event: MessageEvent) => {
      const data =
        typeof event.data === "string" ? event.data : String(event.data);
      this.emit("message", data);
    };

    this.remoteEs.onerror = () => {
      logger.warn({ retryMs: RETRY_MS }, "Remote connection lost, retrying");
      setTimeout(() => this.connectToRemote(), RETRY_MS);
    };
  }

  async send(line: string): Promise<void> {
    const endpoint = this.remotePostUrl;
    if (!endpoint) {
      logger.debug("Send called before endpoint discovered, returning error to client");
      this.emit(
        "message",
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: "Remote endpoint not yet discovered (no endpoint event)",
          },
        })
      );
      return;
    }
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: line,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      if (res.ok && text) {
        this.emit("message", text);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, message }, "Transport send failed");
      this.emit(
        "message",
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: `Transport error: ${message}` },
        })
      );
    }
  }
}
