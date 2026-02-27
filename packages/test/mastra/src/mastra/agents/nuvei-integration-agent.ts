import { Agent } from "@mastra/core/agent";
import { nuveiDocsMcpClientBackup } from "../mcp/nuvei-docs-client-backup";

export const nuveiIntegrationAgent = new Agent({
  id: "nuvei-integration-agent",
  name: "Nuvei Integration Agent",
  instructions: `
    You are a Nuvei integration specialist. You have access to Nuvei documentation via MCP tools.

    Your role is to help developers and teams:
    - Integrate Nuvei payment and checkout APIs into their applications
    - Find the right endpoints, parameters, and flows from the docs
    - Resolve integration issues using up-to-date Nuvei documentation

    Always use the Nuvei docs tools to look up current API details, examples, and requirements.
    Give concise, actionable answers and cite doc sources when relevant.
  `,
  model: "google/gemini-2.5-pro",
  tools: await nuveiDocsMcpClientBackup.listTools(),
});
