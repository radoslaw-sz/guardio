import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "../../interfaces/index.js";
import { logger } from "../../logger.js";

/**
 * UI schema for the generic policy summary widget (agent + tool assignment).
 * Any policy can use this in getUiSchema() to show the summary in the dashboard.
 */
export const POLICY_SUMMARY_UI_SCHEMA: object = {
  effect: {
    "ui:widget": "PolicySummary",
    "ui:readonly": true,
    "ui:label": false,
  },
};

/**
 * Deny tool access policy plugin: always blocks tool calls.
 * Which tools are subject to this policy is determined by assignment outside
 * of the plugin (e.g. which tools have this policy attached). No config.
 */
export class DenyToolAccessPolicyPlugin implements PolicyPluginInterface {
  readonly name = "deny-tool-access";

  getUiSchema(): object {
    return POLICY_SUMMARY_UI_SCHEMA;
  }

  async evaluate(context: PolicyRequestContext): Promise<PolicyResult> {
    logger.debug(
      { toolName: context.toolName, plugin: this.name },
      "Tool blocked by deny-tool-access policy",
    );
    return {
      verdict: "block",
      code: "FORBIDDEN_TOOL",
      reason: `The tool '${context.toolName}' is not allowed by policy.`,
    };
  }
}
