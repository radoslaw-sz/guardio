import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type {
  DashboardPolicyInstance,
  DashboardPolicyInstancesInfo,
} from "../transports/dashboard-api-types.js";
import {
  createPolicyPluginInstance,
  getPolicyConfigSchema,
} from "../../config/PluginManager.js";
import type {
  CreatePolicyInstanceBody,
  CreatePolicyInstanceResult,
  UpdatePolicyInstanceBody,
  UpdatePolicyInstanceResult,
} from "../transports/types.js";
import { logger } from "../../logger.js";

/**
 * Handles policy instance listing and lifecycle for the dashboard.
 */
export class PolicyInstanceService {
  private readonly repo: CoreRepository;

  constructor(repo: CoreRepository) {
    this.repo = repo;
  }

  async listPolicyInstances(): Promise<DashboardPolicyInstancesInfo | null> {
    try {
      const [instances, assignmentRows] = await Promise.all([
        this.repo.listPolicyInstances(),
        this.repo.listPolicyAssignmentRows(),
      ]);
      const byInstance = new Map<
        string,
        Array<{ agentId: string | null; toolName: string | null }>
      >();
      for (const row of assignmentRows) {
        const list = byInstance.get(row.policyInstanceId) ?? [];
        list.push({ agentId: row.agentId, toolName: row.toolName });
        byInstance.set(row.policyInstanceId, list);
      }
      const instancesWithAssignments: DashboardPolicyInstance[] =
        instances.map((inst) => {
          const assignments = byInstance.get(inst.id) ?? [];
          return {
            ...inst,
            assignments,
          };
        });
      return { instances: instancesWithAssignments };
    } catch (err) {
      logger.error({ err }, "listPolicyInstances failed");
      return null;
    }
  }

  async createPolicyInstance(
    body: CreatePolicyInstanceBody,
  ): Promise<CreatePolicyInstanceResult> {
    const schema = getPolicyConfigSchema(body.pluginName);
    let config: Record<string, unknown>;
    if (schema) {
      const parsed = schema.safeParse(body.config);
      if (!parsed.success) {
        return { error: parsed.error.message };
      }
      config = parsed.data as Record<string, unknown>;
    } else {
      try {
        createPolicyPluginInstance(body.pluginName, {});
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : `Unknown policy plugin: ${body.pluginName}`,
        };
      }
      config =
        body.config != null &&
        typeof body.config === "object" &&
        !Array.isArray(body.config)
          ? (body.config as Record<string, unknown>)
          : {};
    }
    try {
      const id = await this.repo.createPolicyInstance(
        body.pluginName,
        config,
        body.name,
        body.agentId,
        body.toolName,
      );
      return { id };
    } catch (err) {
      logger.error(
        { err, pluginName: body.pluginName },
        "createPolicyInstance failed",
      );
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create policy instance",
      };
    }
  }

  async deletePolicyInstance(policyInstanceId: string): Promise<void> {
    await this.repo.deletePolicyInstance(policyInstanceId);
  }

  async getPolicyInstance(
    id: string,
  ): Promise<DashboardPolicyInstance | null> {
    try {
      const instance = await this.repo.getPolicyInstanceById(id);
      if (!instance) return null;
      const assignmentRows = await this.repo.listPolicyAssignmentRows();
      const assignments = assignmentRows
        .filter((r) => r.policyInstanceId === id)
        .map((r) => ({ agentId: r.agentId, toolName: r.toolName }));
      return { ...instance, assignments };
    } catch (err) {
      logger.error({ err, id }, "getPolicyInstance failed");
      return null;
    }
  }

  async updatePolicyInstance(
    id: string,
    body: UpdatePolicyInstanceBody,
  ): Promise<UpdatePolicyInstanceResult> {
    const instance = await this.repo.getPolicyInstanceById(id);
    if (!instance) {
      return { error: "Policy instance not found" };
    }
    const schema = getPolicyConfigSchema(instance.pluginId);
    let config: Record<string, unknown>;
    if (schema) {
      const parsed = schema.safeParse(body.config);
      if (!parsed.success) {
        return { error: parsed.error.message };
      }
      config = parsed.data as Record<string, unknown>;
    } else {
      config =
        body.config != null &&
        typeof body.config === "object" &&
        !Array.isArray(body.config)
          ? (body.config as Record<string, unknown>)
          : {};
    }
    try {
      await this.repo.updatePolicyInstance(
        id,
        config,
        body.name,
        body.agentId,
        body.toolName,
      );
      return {};
    } catch (err) {
      logger.error({ err, id }, "updatePolicyInstance failed");
      return {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update policy instance",
      };
    }
  }
}

