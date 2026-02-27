import { MCPClient } from "@mastra/mcp";

/**
 * MCP client for Nuvei documentation server (SSE) backup.
 * Exposes Nuvei docs tools for use with Mastra agents via listTools() or listToolsets().
 */
export const nuveiDocsMcpClientBackup = new MCPClient({
  id: "nuvei-docs-mcp-client-backup",
  servers: {
    "nuvei-docs-backup": {
      url: new URL("http://localhost:3939/nuvei-docs-backup/sse"),
      timeout: 60000,
      fetch: async (url, init) => {
        return fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            "x-agent-name": "nuvei-docs-agent-backup",
          }
        });
      },
    },
  },
});
