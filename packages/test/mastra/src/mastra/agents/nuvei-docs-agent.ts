import { Agent } from '@mastra/core/agent';
import { nuveiDocsMcpClient } from '../mcp/nuvei-docs-client';

export const nuveiDocsAgent = new Agent({
  id: 'nuvei-docs-agent',
  name: 'Nuvei Docs Agent',
  instructions: `
    You are a helpful assistant with access to Nuvei documentation via MCP tools.
    Use the available tools to answer questions about Nuvei APIs, integration, payments, and documentation.
    Prefer using the Nuvei docs tools to fetch up-to-date information rather than relying on general knowledge.
  `,
  model: {
    id: 'custom/mistral',
    url: "http://localhost:11434/v1"
  },
  tools: await nuveiDocsMcpClient.listTools(),
});
