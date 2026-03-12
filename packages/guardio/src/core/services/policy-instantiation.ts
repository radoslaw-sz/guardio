import type { PolicyPluginInterface } from "../../interfaces/PolicyPluginInterface.js";
import type { PolicyAssignmentWithPlugin } from "../../interfaces/CoreRepository.js";
import type { StorageAdapter } from "../../interfaces/StorageAdapter.js";
import type { PolicyPluginContext } from "../../interfaces/PolicyPluginContext.js";
import { createPolicyPluginInstance } from "../../config/PluginManager.js";
import { logger } from "../../logger.js";

/**
 * Instantiate policy plugins from assignments resolved by CoreRepository.getPoliciesForContext.
 * Invalid assignments are logged and skipped.
 * @param assignments Policy assignments from the repository
 * @param storageAdapter Optional storage adapter to provide PluginRepository to policies
 */
export function instantiatePolicyPlugins(
  assignments: PolicyAssignmentWithPlugin[],
  storageAdapter?: StorageAdapter,
): PolicyPluginInterface[] {
  const policyPlugins: PolicyPluginInterface[] = [];
  for (const a of assignments) {
    if (a.config == null || typeof a.config !== "object") {
      logger.warn(
        { assignmentId: a.id, pluginId: a.pluginId },
        "Policy assignment has no config; skipping",
      );
      continue;
    }
    try {
      const context: PolicyPluginContext | undefined = storageAdapter
        ? { pluginRepository: storageAdapter.getPluginRepository?.(a.pluginId) }
        : undefined;
      policyPlugins.push(
        createPolicyPluginInstance(
          a.pluginId,
          a.config as Record<string, unknown>,
          context,
        ),
      );
    } catch (err) {
      logger.warn(
        { err, pluginId: a.pluginId, assignmentId: a.id },
        "Failed to instantiate policy plugin for assignment; skipping",
      );
    }
  }
  return policyPlugins;
}

