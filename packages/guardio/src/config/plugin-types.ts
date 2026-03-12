import type { z } from "zod";
import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { PolicyPluginContext } from "../interfaces/PolicyPluginContext.js";

/**
 * Factory function to create policy plugin instances with config from DB.
 */
export type PolicyPluginFactory = (
  config: Record<string, unknown>,
  context?: PolicyPluginContext,
) => PolicyPluginInterface;

/**
 * Policy plugin descriptor (name + optional schema + optional uiSchema) for dashboard.
 * No instance created; used for listing available plugins.
 */
export interface PolicyPluginDescriptor {
  name: string;
  type: "policy";
  path?: string;
  configSchema?: z.ZodType;
  /** Optional RJSF uiSchema for the add-policy form (e.g. summary widget). */
  uiSchema?: object;
}

/**
 * Factory-based plugin definition for policy plugins.
 * Both built-in and custom plugins use this format.
 *
 * @example
 * ```ts
 * // plugins/my-policy/index.ts
 * import { z } from "zod";
 * import type { PolicyPluginDefinition } from "@guardiojs/guardio";
 *
 * const configSchema = z.object({ maxLength: z.number().min(1) });
 *
 * const definition: PolicyPluginDefinition = {
 *   name: "my-policy",
 *   factory: (config, context) => new MyPolicyPlugin(config, context),
 *   configSchema,
 *   uiSchema: { maxLength: { "ui:widget": "updown" } },
 * };
 * export default definition;
 * ```
 */
export interface PolicyPluginDefinition {
  /** Unique plugin name (used in DB and config). */
  name: string;
  /** Factory function to create plugin instances with config from DB. */
  factory: PolicyPluginFactory;
  /** Optional Zod schema for config validation in dashboard. */
  configSchema?: z.ZodType;
  /** Optional RJSF uiSchema for custom form widgets in dashboard. */
  uiSchema?: object;
}
