// Programmatic API: core, interfaces, config, and default plugins
export { GuardioCore } from "./core/index.js";
export type {
  GuardioCoreConfig,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./core/index.js";
export { PluginManager, loadConfigFromPath } from "./config/index.js";
export type {
  PolicyPluginFactory,
  InterventionPluginFactory,
  GuardioConfig,
  GuardioServerConfig,
  PolicyPluginConfigEntry,
  InterventionPluginConfigEntry,
  PluginConfigEntry,
} from "./config/index.js";
export type {
  PolicyPluginInterface,
  NotificationPluginInterface,
  InterventionPluginInterface,
  InterventionResult,
  PolicyRequestContext,
  PolicyResult,
  InterventionRequestContext,
} from "./interfaces/index.js";
export {
  DefaultPolicyPlugin,
  RegexPolicyPlugin,
  type DefaultPolicyPluginConfig,
  type RegexPolicyPluginConfig,
  type RegexPolicyRule,
  type RegexPolicyRuleResult,
} from "./plugins/policy/index.js";
export { DefaultNotificationPlugin } from "./plugins/notification/index.js";
export {
  DefaultInterventionPlugin,
  HttpInterventionPlugin,
  type HttpInterventionPluginConfig,
} from "./plugins/intervention/index.js";
