import { z } from "zod";
import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "../../interfaces/index.js";
import { logger } from "../../logger.js";

const denyRegexParameterRuleSchema = z.object({
  /** Tool name this rule applies to (exact match, e.g. "get_weather"). */
  name: z.string().min(1),
  /** If set, the regex is applied to this argument's value; empty string means match tool name. Required; use "" for "tool name". */
  parameter_name: z.string(),
  /** Regex pattern. When it matches the target string, the call is blocked. */
  regex: z.string().min(1),
  /** Optional RegExp flags (e.g. "i" for case-insensitive). */
  flags: z.string().optional(),
});

export const denyRegexParameterConfigSchema = z.object({
  /** List of rules. When a rule matches, the call is blocked. */
  rules: z.array(denyRegexParameterRuleSchema).min(1),
});

export type DenyRegexParameterRule = z.infer<typeof denyRegexParameterRuleSchema>;
export type DenyRegexParameterPolicyPluginConfig = z.infer<
  typeof denyRegexParameterConfigSchema
>;

/**
 * RJSF ui_schema for the deny-regex-parameter policy: renders rules[].parameter_name with
 * ToolParameterSelect widget so it is conditional on dashboard Assignment (tool).
 */
export const DENY_REGEX_PARAMETER_UI_SCHEMA: object = {
  rules: {
    items: {
      parameter_name: {
        "ui:widget": "ToolParameterSelect",
        "ui:options": { dependsOnAssignment: true },
        "ui:placeholder": "Leave empty to match tool name",
      },
    },
  },
};

function getStringToTest(
  context: PolicyRequestContext,
  parameterName?: string,
): string {
  if (parameterName == null || parameterName === "") {
    return context.toolName;
  }
  const args = context.args as Record<string, unknown> | null | undefined;
  const value = args?.[parameterName];
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

/**
 * Policy plugin that blocks tool calls when a rule's regex matches the tool name or a parameter value.
 * Each rule targets a tool by name and a parameter (or tool name when empty); the regex is run on
 * that value. If any rule matches, the call is blocked. No configurable result—always block.
 *
 * Config is required (e.g. from DB): { rules: [ { name, parameter_name, regex, flags? }, ... ] }
 */
export class DenyRegexParameterPolicyPlugin implements PolicyPluginInterface {
  readonly name = "deny-regex-parameter";

  private readonly rules: Array<{
    name: string;
    parameterName: string;
    regex: RegExp;
    pattern: string;
  }>;

  getConfigSchema(): z.ZodType {
    return denyRegexParameterConfigSchema;
  }

  getUiSchema(): object {
    return DENY_REGEX_PARAMETER_UI_SCHEMA;
  }

  constructor(config: Record<string, unknown>) {
    const parsed = denyRegexParameterConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(
        `DenyRegexParameterPolicyPlugin invalid config: ${parsed.error.message}`,
      );
    }
    const { rules } = parsed.data;
    this.rules = rules.map((rule) => ({
      name: rule.name,
      parameterName: rule.parameter_name,
      regex: new RegExp(rule.regex, rule.flags ?? ""),
      pattern: rule.regex,
    }));
  }

  async evaluate(context: PolicyRequestContext): Promise<PolicyResult> {
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      if (context.toolName !== rule.name) continue;
      const str = getStringToTest(context, rule.parameterName);
      const matched = rule.regex.test(str);
      if (matched) {
        logger.debug(
          {
            toolName: context.toolName,
            plugin: this.name,
            ruleIndex: i,
            pattern: rule.pattern,
          },
          "Deny-regex-parameter policy rule matched",
        );
        return {
          verdict: "block",
          code: "REGEX_POLICY_MATCH",
          reason: `Input matched policy rule (pattern: ${rule.pattern}).`,
        };
      }
    }
    return { verdict: "allow" };
  }
}
