/**
 * Context passed to policy evaluation for a tool call request.
 */
export interface PolicyRequestContext {
  toolName: string;
  args: unknown;
}

/**
 * Result of policy evaluation: allow, block, or require human approval.
 */
export type PolicyResult = "allowed" | "blocked" | "require_approval";
