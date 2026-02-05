import type { InterventionRequestContext } from "./InterventionTypes.js";

/**
 * Return type of act(): void/true = continue and forward; false = reject the call.
 */
export type InterventionResult =
  | void
  | boolean
  | Promise<void>
  | Promise<boolean>;

/**
 * Intervention plugin interface: run side effects when a tool call is about to be forwarded
 * (e.g. logging, approval UI). Receives config from guardio config.
 * Return false (or Promise<false>) to reject the call; void/true to continue.
 */
export interface InterventionPluginInterface {
  readonly name: string;

  /**
   * Act on the tool call (e.g. log, show approval UI). Called when the call is allowed and before forwarding.
   * @param context - Request context containing toolName and args
   * @returns false to reject the call; void or true to continue
   */
  act(context: InterventionRequestContext): InterventionResult;
}
