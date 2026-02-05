import type { PolicyRequestContext } from "./PolicyTypes.js";
import type { PolicyResult } from "./PolicyTypes.js";

/**
 * Policy plugin interface for evaluating whether a tool call is allowed.
 * Implementations can perform simple checks or more complex policy logic.
 */
export interface PolicyPluginInterface {
  readonly name: string;

  /**
   * Evaluate the tool call and return a policy result.
   * @param context - Request context containing toolName and args
   * @returns "allowed" to forward without approval, "blocked" to reject, "require_approval" to ask human
   */
  evaluate(context: PolicyRequestContext): PolicyResult;
}
