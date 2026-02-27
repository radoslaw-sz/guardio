import type { GuardioConfig } from "./src/config/types.js";

const config: GuardioConfig = {
  servers: [],
  client: {
    mode: "http",
    port: 3939,
  },
  plugins: [
    {
      type: "storage",
      name: "sqlite",
      config: { inMemory: true },
    },
    {
      type: "eventSink",
      name: "sqlite",
      config: { inMemory: true },
    },
    {
      type: "eventSinkStore",
      name: "sqlite",
      config: { inMemory: true },
    },
    {
      type: "policy",
      name: "deny-tool-access",
    },
    {
      type: "policy",
      name: "deny-regex-parameter",
    }
  ],
};

export default config;
