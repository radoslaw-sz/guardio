import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "../../interfaces/index.js";

export interface DefaultPolicyPluginConfig {
  /** Tool name(s) to block. If the call’s tool name is in this list, it is blocked. */
  blockedTools: string[];
}

/**
 * Default policy plugin: block calls by tool name.
 * Config is required: { blockedTools: ["tool_a", "tool_b"] }. No default block list.
 */
export class DefaultPolicyPlugin implements PolicyPluginInterface {
  readonly name = "default";

  private readonly blockedTools: Set<string>;

  constructor(config: Record<string, unknown>) {
    const { blockedTools } = config as unknown as DefaultPolicyPluginConfig;
    if (!Array.isArray(blockedTools)) {
      throw new Error(
        "DefaultPolicyPlugin requires config.blockedTools (array of tool names)"
      );
    }
    this.blockedTools = new Set(
      blockedTools.filter((t): t is string => typeof t === "string")
    );
  }

  evaluate(context: PolicyRequestContext): PolicyResult {
    if (this.blockedTools.has(context.toolName)) return "blocked";
    return "allowed";
  }
}
