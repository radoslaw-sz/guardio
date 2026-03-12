import { describe, it, expect } from "vitest";
import { ToolsDiscoveryService } from "../services/tools-discovery-service.js";
import type { GuardioServerConfigUrl } from "../../config/types.js";
import type { CoreRepository } from "../../interfaces/CoreRepository.js";
import type { DashboardMcpToolInfo } from "../transports/dashboard-api-types.js";

const servers: GuardioServerConfigUrl[] = [
  { type: "url", name: "test-server", url: "http://example.com/sse" },
];

const inMemoryTools: Record<string, DashboardMcpToolInfo[]> = {};

const coreRepositoryMock: CoreRepository = {
  // Agent methods (not used in these tests)
  getAgentById: async () => null,
  saveAgent: async () => {},
  deleteConnection: async () => {},
  deleteAgent: async () => {},
  listAgents: async () => [],
  getAgentByName: async () => null,

  // Policy methods (not used in these tests)
  getPoliciesForContext: async () => [],
  listPolicyInstances: async () => [],
  getPolicyInstanceById: async () => null,
  updatePolicyInstance: async () => {},
  listPolicyAssignmentRows: async () => [],
  createPolicyInstance: async () => "id",
  assignPolicy: async () => {},
  deletePolicyInstance: async () => {},
  deletePolicyAssignment: async () => {},

  // Tools cache
  async saveServerTools(serverName, tools) {
    inMemoryTools[serverName] = tools;
  },
  async getAllServerTools() {
    return inMemoryTools;
  },
};

describe("ToolsDiscoveryService", () => {
  it("normalizeToolsList maps basic tool entries", () => {
    const service = new ToolsDiscoveryService(servers, coreRepositoryMock);
    const normalized = service.normalizeToolsList([
      {
        name: "t1",
        description: "d1",
        title: "T1",
        inputSchema: { type: "object" },
      },
      "plain-name",
    ]);

    expect(normalized[0].name).toBe("t1");
    expect(normalized[0].description).toBe("d1");
    expect(normalized[0].title).toBe("T1");
    expect(normalized[0].inputSchema).toEqual({ type: "object" });

    expect(normalized[1].name).toBe("plain-name");
  });

  it("setToolsForServer caches and persists tools", async () => {
    const service = new ToolsDiscoveryService(servers, coreRepositoryMock);
    const tools = service.normalizeToolsList([{ name: "cached" }]);

    service.setToolsForServer("test-server", tools);
    expect(service.getToolsForServer("test-server")?.[0].name).toBe("cached");

    const all = await coreRepositoryMock.getAllServerTools!();
    expect(Array.isArray(all["test-server"])).toBe(true);
    expect(all["test-server"][0].name).toBe("cached");
  });
});

