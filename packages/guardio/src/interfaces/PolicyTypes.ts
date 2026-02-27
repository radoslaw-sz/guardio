/**
 * Context passed to policy evaluation for a tool call request.
 */
export interface PolicyRequestContext {
  toolName: string;
  args: unknown;
}

export type PolicyVerdict = "allow" | "block" | "flag" | "negotiate";

export interface PolicyResult {
  /**
   * The core decision.
   * - allow: Proceed.
   * - block: Stop immediately.
   * - flag: Allow, but mark as suspicious (shadow mode).
   * - negotiate: Ask the user/agent for confirmation.
   */
  verdict: PolicyVerdict;

  /**
   * A unique code for your Dashboard/Analytics.
   * Essential for grouping similar violations in your stats.
   * e.g., "RATE_LIMIT_EXCEEDED", "PII_DETECTED", "FORBIDDEN_TOOL"
   */
  code?: string;

  /**
   * A human/LLM-readable explanation.
   * If blocked, this string goes back to the AI Agent so it can retry correctly.
   * e.g., "You exceeded the limit of 5 requests per minute."
   */
  reason?: string;

  /**
   * For policies that sanitize data (e.g., removing a credit card number).
   * If present, Guardio should replace the original params with these.
   */
  modified_args?: Record<string, unknown>;

  /**
   * Arbitrary data for plugins to communicate with the Dashboard.
   * e.g., { current_usage: 45, max_usage: 50, plugin_version: "1.2.0" }
   */
  metadata?: Record<string, unknown>;
}
