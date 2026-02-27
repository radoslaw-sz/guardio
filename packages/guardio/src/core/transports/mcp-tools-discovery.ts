import { EventSource } from "eventsource";
import type { GuardioServerConfigUrl } from "../../config/types.js";
import type { DashboardMcpToolInfo } from "./dashboard-api-types.js";
import { logger } from "../../logger.js";

const DEFAULT_DISCOVERY_TIMEOUT_MS = 15_000;
const INITIALIZE_ID = 1;
const TOOLS_LIST_ID = 2;

function sseUrl(config: GuardioServerConfigUrl): string {
  const url = config.url.trim();
  if (url.endsWith("/sse")) return url;
  return url.replace(/\/?$/, "/") + "sse";
}

function normalizeTools(tools: unknown[]): DashboardMcpToolInfo[] {
  return tools.map((t) =>
    typeof t === "object" && t !== null && typeof (t as { name?: unknown }).name === "string"
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
      : { name: String(t) }
  );
}

function parseToolsFromJsonRpc(text: string): unknown[] | null {
  try {
    const json = JSON.parse(text) as { result?: { tools?: unknown[] } };
    const tools = json.result?.tools;
    return Array.isArray(tools) ? tools : null;
  } catch {
    return null;
  }
}

/**
 * Wait for the next SSE message that matches the predicate, or timeout.
 */
function waitForSseMessage(
  es: EventSource,
  predicate: (data: string) => boolean,
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      es.onmessage = null;
      resolve(null);
    }, timeoutMs);
    es.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      if (predicate(data)) {
        clearTimeout(t);
        es.onmessage = null;
        resolve(data);
      }
    };
  });
}

/**
 * Open a short-lived connection to the MCP, run initialize → initialized → tools/list,
 * and return the tools list. Uses a separate SSE connection so the main proxy session is untouched.
 * Returns null on timeout, network error, or if the server does not return a tools list.
 */
export async function fetchToolsListViaDiscovery(
  config: GuardioServerConfigUrl,
  timeoutMs: number = DEFAULT_DISCOVERY_TIMEOUT_MS,
): Promise<DashboardMcpToolInfo[] | null> {
  const url = sseUrl(config);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  return new Promise((resolve) => {
    const es = new EventSource(url);
    let settled = false;
    const finish = (result: DashboardMcpToolInfo[] | null) => {
      if (settled) return;
      settled = true;
      es.close();
      resolve(result);
    };

    const overallTimeout = setTimeout(() => finish(null), timeoutMs);

    es.addEventListener("endpoint", (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      const postUrl = new URL(data, url).href;

      (async () => {
        try {
          // 1. Initialize
          const initBody = JSON.stringify({
            jsonrpc: "2.0",
            id: INITIALIZE_ID,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: { roots: { listChanged: true }, sampling: {} },
              clientInfo: { name: "Guardio-Discovery", version: "1.0.0" },
            },
          });
          const initRes = await fetch(postUrl, { method: "POST", headers, body: initBody });
          const initText = await initRes.text();

          if (initRes.status === 202) {
            const initResponse = await waitForSseMessage(
              es,
              (data) => {
                try {
                  const j = JSON.parse(data) as { id?: number };
                  return j.id === INITIALIZE_ID;
                } catch {
                  return false;
                }
              },
              timeoutMs,
            );
            if (initResponse == null) {
              finish(null);
              return;
            }
          } else if (!initRes.ok) {
            finish(null);
            return;
          }

          // 2. Initialized notification
          const initializedBody = JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          });
          await fetch(postUrl, { method: "POST", headers, body: initializedBody });

          // 3. Tools/list
          const toolsListBody = JSON.stringify({
            jsonrpc: "2.0",
            id: TOOLS_LIST_ID,
            method: "tools/list",
            params: {},
          });
          const toolsRes = await fetch(postUrl, { method: "POST", headers, body: toolsListBody });
          const toolsText = await toolsRes.text();

          if (toolsRes.status === 202) {
            const toolsResponse = await waitForSseMessage(
              es,
              (data) => {
                const tools = parseToolsFromJsonRpc(data);
                return tools !== null;
              },
              timeoutMs,
            );
            if (toolsResponse) {
              const tools = parseToolsFromJsonRpc(toolsResponse);
              if (tools) finish(normalizeTools(tools));
              else finish(null);
            } else {
              finish(null);
            }
          } else if (toolsRes.ok && toolsText) {
            const tools = parseToolsFromJsonRpc(toolsText);
            if (tools) finish(normalizeTools(tools));
            else finish(null);
          } else {
            finish(null);
          }
        } catch (err) {
          logger.debug({ err, url }, "MCP tools discovery failed");
          finish(null);
        } finally {
          clearTimeout(overallTimeout);
        }
      })();
    });

    es.onerror = () => {
      clearTimeout(overallTimeout);
      finish(null);
    };
  });
}
