import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "../../interfaces/index.js";

/**
 * Result when a rule's regex matches. Maps to PolicyResult.
 */
export type RegexPolicyRuleResult = "blocked" | "require_approval";

/**
 * One rule: apply regex when the tool name matches; optionally restrict to a specific argument.
 */
export interface RegexPolicyRule {
  /** Tool name this rule applies to (exact match, e.g. "get_weather"). */
  name: string;
  /** If set, the regex is applied to this argument's value; otherwise to the tool name. */
  parameter_name?: string;
  /** Regex pattern. When it matches the target string, the rule's result is applied. */
  regex: string;
  /** Optional RegExp flags (e.g. "i" for case-insensitive). */
  flags?: string;
  /** Policy result when the regex matches. Default "blocked". */
  result?: RegexPolicyRuleResult;
}

export interface RegexPolicyPluginConfig {
  /** List of rules. When a rule matches, its result (blocked or require_approval) is returned. */
  rules: RegexPolicyRule[];
}

function getStringToTest(
  context: PolicyRequestContext,
  parameterName?: string
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

const LOG_PREFIX = "[RegexPolicyPlugin]";

/**
 * Policy plugin that blocks tool calls based on rules aligned to the tools/call schema.
 * Each rule targets a tool by name and optionally a parameter; the regex is run on
 * that parameter's value (or the tool name). If any rule matches, the call is blocked.
 *
 * Config: { rules: [ { name: "get_weather", parameter_name: "location", regex: "...", flags?: "i" }, ... ], debug?: boolean }
 */
export class RegexPolicyPlugin implements PolicyPluginInterface {
  readonly name = "regex";

  private readonly rules: Array<{
    name: string;
    parameterName?: string;
    regex: RegExp;
    pattern: string;
    result: PolicyResult;
  }>;

  constructor(config: Record<string, unknown> = {}) {
    const { rules } = config as unknown as RegexPolicyPluginConfig;
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error(
        "RegexPolicyPlugin requires config.rules (non-empty array of { name, regex, result?, parameter_name?, flags? })"
      );
    }
    this.rules = rules.map((rule, i) => {
      if (typeof rule.name !== "string" || !rule.name) {
        throw new Error(
          `RegexPolicyPlugin rules[${i}].name must be a non-empty string`
        );
      }
      if (typeof rule.regex !== "string" || !rule.regex) {
        throw new Error(
          `RegexPolicyPlugin rules[${i}].regex must be a non-empty string`
        );
      }
      const result =
        rule.result === "require_approval" ? "require_approval" : "blocked";
      return {
        name: rule.name,
        parameterName:
          typeof rule.parameter_name === "string"
            ? rule.parameter_name
            : undefined,
        regex: new RegExp(rule.regex, rule.flags ?? ""),
        pattern: rule.regex,
        result,
      };
    });
  }

  evaluate(context: PolicyRequestContext): PolicyResult {
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      if (context.toolName !== rule.name) continue;
      const str = getStringToTest(context, rule.parameterName);
      const matched = rule.regex.test(str);
      if (matched) {
        return rule.result;
      }
    }
    return "allowed";
  }
}
