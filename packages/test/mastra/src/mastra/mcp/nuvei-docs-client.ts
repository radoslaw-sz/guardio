import { MCPClient } from "@mastra/mcp";

/**
 * MCP client for Nuvei documentation server (SSE).
 * Exposes Nuvei docs tools for use with Mastra agents via listTools() or listToolsets().
 */
export const nuveiDocsMcpClient = new MCPClient({
  id: "nuvei-docs-mcp-client",
  servers: {
    "nuvei-docs": {
      // url: new URL('https://mcp.nuvei.com/sse'),
      url: new URL("http://localhost:3939/nuvei-docs/sse"),
      timeout: 60000,
      fetch: async (url, init) => {
        return fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            "x-agent-name": "nuvei-docs-agent",
          }
        });
      }
    },
  },
});
