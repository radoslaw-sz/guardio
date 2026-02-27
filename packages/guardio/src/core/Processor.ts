import { createRequire } from "node:module";
import { v7 as uuidv7 } from "uuid";
import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { PolicyResult } from "../interfaces/PolicyTypes.js";
import type { EventSinkPluginInterface } from "../interfaces/EventSinkPluginInterface.js";
import type { GuardioEvent } from "../interfaces/EventSinkPluginInterface.js";
import type {
  JsonRpcRequest,
  GuardioBlockedResult,
} from "./types.js";
import { GuardioAction } from "./types.js";
import { logger } from "../logger.js";

export interface ProcessResultHandled {
  handled: true;
  status: number;
  body: string;
}

export interface ProcessResultForward {
  handled: false;
  bodyToSend: string;
}

export type ProcessResult = ProcessResultHandled | ProcessResultForward;

export interface ProcessInput {
  body: string;
  policyPlugins: PolicyPluginInterface[];
  /** Optional event sinks to emit processing result events. */
  eventSinks?: EventSinkPluginInterface[];
  /** Optional agent id for event correlation. */
  agentId?: string | null;
  /** Optional trace id for event correlation. */
  traceId?: string;
}

function getGuardioVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Build a successful JSON-RPC response for blocked/rejected tool calls.
 */
function buildGuardioBlockedResponse(
  id: string | number | undefined,
  options: {
    toolName: string;
    reason: "blocked" | "rejected";
    policy?: string;
    plugin?: string;
    policyCode?: string;
    policyReason?: string;
  },
): string {
  if (id === undefined || id === null) {
    return "";
  }
  const action =
    options.reason === "blocked"
      ? GuardioAction.TOOL_BLOCKED
      : GuardioAction.POLICY_VIOLATION;
  const policyId = options.policy ?? options.plugin ?? "Guardio";
  const detail =
    options.policyReason?.trim() ||
    (options.reason === "blocked"
      ? "Policy denied the request."
      : "Policy denied the request.");
  const text = `🚫 [Guardio] Access Denied. The tool '${options.toolName}' was ${options.reason === "blocked" ? "blocked" : "rejected"} by '${policyId}'. Reason: ${detail}`;

  const result: GuardioBlockedResult = {
    content: [{ type: "text", text }],
    isError: true,
    _guardio: {
      version: getGuardioVersion(),
      requestId: id,
      timestamp: new Date().toISOString(),
      policyId,
      action,
      ...(options.policyCode != null && { code: options.policyCode }),
      ...(options.policyReason != null && { reason: options.policyReason }),
    },
  };

  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result,
  });
}

/** Build a GuardioEvent for the result of processing a tools/call request. */
function buildProcessingEvent(
  input: ProcessInput,
  request: JsonRpcRequest,
  toolName: string,
  outcome: {
    decision: "ALLOWED" | "BLOCKED";
    policyName?: string;
    policyCode?: string;
    policyReason?: string;
    httpStatus?: number;
  },
): GuardioEvent {
  return {
    eventId: uuidv7(),
    timestamp: new Date().toISOString(),
    schemaVersion: "0.1.0",
    eventType: "tools/call",
    actionType: toolName,
    ...(input.agentId != null && input.agentId !== "" && { agentId: input.agentId }),
    ...(input.traceId != null && input.traceId !== "" && { traceId: input.traceId }),
    targetResource: toolName,
    decision: outcome.decision,
    policyEvaluation:
      outcome.decision === "BLOCKED" && outcome.policyName
        ? {
            policyName: outcome.policyName,
            ...(outcome.policyCode != null && { code: outcome.policyCode }),
            ...(outcome.policyReason != null && { reason: outcome.policyReason }),
          }
        : undefined,
    requestPayload: {
      method: request.method,
      toolName,
      requestId: request.id,
    },
    ...(outcome.httpStatus != null && { httpStatus: outcome.httpStatus }),
  };
}

/**
 * Emit processing result to all event sinks. Fire-and-forget; logs errors but does not throw.
 */
async function emitProcessingEvent(
  eventSinks: EventSinkPluginInterface[],
  event: GuardioEvent,
): Promise<void> {
  if (eventSinks.length === 0) return;
  await Promise.all(
    eventSinks.map((sink) =>
      sink.emit(event).catch((err) => {
        logger.warn({ err, sink: sink.name, eventId: event.eventId }, "EventSink emit failed");
      }),
    ),
  );
}

/**
 * Processes incoming POST /messages body. For tools/call requests, runs policy
 * plugins and either returns a handled result (status + body) when blocked, or
 * a forward result (bodyToSend) for GuardioCore to proxy to the remote MCP.
 * When eventSinks are provided, emits a GuardioEvent describing the processing result.
 */
export async function processMessage(input: ProcessInput): Promise<ProcessResult> {
  const { body, policyPlugins, eventSinks = [] } = input;

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(body) as JsonRpcRequest;
  } catch {
    return { handled: false, bodyToSend: body };
  }

  if (request.method !== "tools/call") {
    return { handled: false, bodyToSend: body };
  }

  const toolName = request.params?.name ?? "(unknown)";
  let args = request.params?.arguments;

  logger.debug(
    { toolName, requestId: request.id, args },
    "Evaluating tools/call (HTTP)",
  );

  for (const policy of policyPlugins) {
    const result: PolicyResult = await policy.evaluate({ toolName, args });
    if (result.verdict === "block") {
      logger.warn(
        { toolName, policy: policy.name },
        "Call blocked by policy",
      );
      const responseBody = buildGuardioBlockedResponse(request.id, {
        toolName,
        reason: "blocked",
        policy: policy.name,
        policyCode: result.code,
        policyReason: result.reason,
      });
      const event = buildProcessingEvent(input, request, toolName, {
        decision: "BLOCKED",
        policyName: policy.name,
        policyCode: result.code,
        policyReason: result.reason,
        httpStatus: 200,
      });
      await emitProcessingEvent(eventSinks, event);
      return {
        handled: true,
        status: 200,
        body: responseBody || "",
      };
    }
    if (
      result.modified_args != null &&
      typeof result.modified_args === "object"
    ) {
      args = { ...(args as object), ...result.modified_args };
    }
  }

  const bodyToSend = JSON.stringify({
    ...request,
    params: { ...request.params, arguments: args },
  });

  const event = buildProcessingEvent(input, request, toolName, {
    decision: "ALLOWED",
  });
  await emitProcessingEvent(eventSinks, event);

  return { handled: false, bodyToSend };
}
