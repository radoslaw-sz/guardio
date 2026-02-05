/**
 * Context passed to intervention plugin's act() for a tool call request.
 */
export interface InterventionRequestContext {
  toolName: string;
  args: unknown;
}
