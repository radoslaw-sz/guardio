import type { PluginRepository } from "./PluginRepository.js";

/**
 * Context passed to Policy plugin factories.
 * Contains a scoped PluginRepository for plugin-specific data storage.
 * The repository is pre-scoped to the plugin's name, so all operations
 * are automatically filtered by plugin_id.
 *
 * This follows the principle of least privilege - Policy plugins
 * cannot access CoreRepository, EventSinkRepository, or other plugins' data.
 */
export interface PolicyPluginContext {
  pluginRepository?: PluginRepository;
}
