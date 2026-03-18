import type { DashboardMcpToolInfo } from "../transports/dashboard-api-types.js";
import { createRequire } from "node:module";
import type { GuardioSimulatedResult } from "../types.js";
import { GuardioAction } from "../types.js";
export interface SimulationContext {
  serverName: string;
  tool: DashboardMcpToolInfo;
  args: unknown;
  agentId: string | null;
  agentNameSnapshot: string | null;
  requestId: string | number | undefined;
  source?: "global" | "header" | "tool";
}

function getGuardioVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export class SimulationService {
  async generateSimulatedResult(
    context: SimulationContext,
  ): Promise<unknown> {
    const toolName = context.tool?.name ?? "(unknown)";
    const requestId = context.requestId ?? "(unknown)";
    const source = context.source;

    // Return an MCP-style tool result that agents can parse consistently,
    // similar in shape to the blocked/rejected Guardio response.
    const text =
      `🧪 [Guardio] Simulated tool execution.\n` +
      `Tool: ${toolName}\n` +
      `Server: ${context.serverName}\n` +
      `RequestId: ${String(requestId)}\n` +
      (source ? `SimulationSource: ${source}\n` : "") +
      `\n` +
      `Args:\n` +
      `${safeJson(context.args)}`;

    const result = {
      content: [{ type: "text", text }],
      isError: false,
      _guardio: {
        version: getGuardioVersion(),
        requestId,
        timestamp: new Date().toISOString(),
        action: GuardioAction.TOOL_SIMULATED,
        simulation: { enabled: true, ...(source ? { source } : {}) },
        toolName,
        serverName: context.serverName,
      },
    } satisfies GuardioSimulatedResult;

    return result;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}
