import type { z } from "zod";
import type { PolicyRequestContext } from "./PolicyTypes.js";
import type { PolicyResult } from "./PolicyTypes.js";

/**
 * Policy plugin interface for evaluating whether a tool call is allowed.
 * Implementations can perform simple checks or more complex policy logic.
 */
export interface PolicyPluginInterface {
  readonly name: string;

  /**
   * Optional Zod schema for this plugin's config. When present, used to validate
   * config at creation time and to expose JSON Schema for the dashboard form.
   */
  getConfigSchema?(): z.ZodType;

  /**
   * Optional UI schema for the dashboard add-policy form. When present, used to
   * render a summary or custom widgets (e.g. generic "PolicySummary" widget showing
   * agent and tool assignment). Any policy can opt in by returning a uiSchema.
   */
  getUiSchema?(): object;

  /**
   * Evaluate the tool call and return a policy result.
   * @param context - Request context containing toolName and args
   * @returns Promise resolving to PolicyResult with verdict (allow | block | flag | negotiate), optional code, reason, modified_args, metadata
   */
  evaluate(context: PolicyRequestContext): Promise<PolicyResult>;
}
