import type { GuardioConfig } from "./src/config/types.js";

const config: GuardioConfig = {
  servers: [
    {
      name: "nuvei-docs",
      type: "url",
      url: "https://mcp.nuvei.com/sse",
    },
    {
      name: "nuvei-docs-backup",
      type: "url",
      url: "https://mcp.nuvei.com/sse",
    },
  ],
  client: {
    mode: "http",
    port: 3939,
  },
  plugins: [
    {
      type: "storage",
      name: "sqlite",
      config: { database: "guardio.sqlite" },
    },
    {
      type: "eventSink",
      name: "sqlite",
      config: { database: "guardio.sqlite" },
    },
    {
      type: "eventSinkStore",
      name: "sqlite",
      config: { database: "guardio.sqlite" },
    },
    {
      type: "policy",
      name: "deny-tool-access",
    },
    {
      type: "policy",
      name: "deny-regex-parameter",
    },
  ],
};

export default config;
