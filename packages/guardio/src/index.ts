// Programmatic API: core, interfaces, config, server, and default plugins
export { logger } from "./logger.js";
export type { Logger } from "./logger.js";
export { GuardioCore } from "./core/index.js";
export type {
  GuardioCoreConfig,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./core/index.js";
export { GuardioHttpServer } from "./server/index.js";
export type { GuardioHttpServerConfig } from "./server/index.js";
export {
  PluginManager,
  loadConfigFromPath,
  getConfigPath,
  getPolicyConfigSchema,
  createPolicyPluginInstance,
} from "./config/index.js";
export type {
  PolicyPluginFactory,
  PolicyPluginDescriptor,
  StoragePluginFactory,
  GuardioConfig,
  GuardioServerConfig,
  GuardioServerConfigUrl,
  GuardioClientConfig,
  PolicyPluginConfigEntry,
  StoragePluginConfigEntry,
  PluginConfigEntry,
} from "./config/index.js";
export type {
  PolicyPluginInterface,
  NotificationPluginInterface,
  StorageAdapter,
  StorageConnectionResult,
  CoreRepository,
  Agent,
  PolicyAssignment,
  PolicyAssignmentWithPlugin,
  PolicyRequestContext,
  PolicyResult,
  PolicyVerdict,
} from "./interfaces/index.js";
export {
  DenyToolAccessPolicyPlugin,
  POLICY_SUMMARY_UI_SCHEMA,
  DenyRegexParameterPolicyPlugin,
  type DenyRegexParameterPolicyPluginConfig,
  type DenyRegexParameterRule,
} from "./plugins/policy/index.js";
export { DefaultNotificationPlugin } from "./plugins/notification/index.js";
export {
  SqliteStoragePlugin,
  type SqliteStoragePluginConfig,
  PostgresStoragePlugin,
  type PostgresStoragePluginConfig,
} from "./plugins/storage/index.js";
