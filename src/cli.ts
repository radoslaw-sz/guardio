/**
 * CLI – parse argv (including --config), build config, run GuardioCore.
 */
import { resolve, dirname } from "node:path";
import { GuardioCore } from "./core/index.js";
import { loadConfigFromPath } from "./config/index.js";

const configIdx = process.argv.indexOf("--config");
const configPathArg =
  configIdx >= 0 && process.argv[configIdx + 1]
    ? process.argv[configIdx + 1]
    : null;

async function main(): Promise<void> {
  let command: string;
  let args: string[];
  let cwd: string | undefined;
  let configPath: string | undefined;

  if (configPathArg) {
    const resolved = resolve(configPathArg);
    const config = await loadConfigFromPath(resolved);
    configPath = resolved;
    cwd = dirname(resolved);
    if (config.server?.type === "command") {
      command = config.server.command;
      const configDir = dirname(resolved);
      args = (config.server.args ?? []).map((arg) => resolve(configDir, arg));
    } else {
      command =
        process.env.GUARDIO_COMMAND ??
        process.env.MCP_REAL_TOOL_COMMAND ??
        "node";
      args = process.env.GUARDIO_ARGS
        ? process.env.GUARDIO_ARGS.split(",").map((s) => s.trim())
        : process.env.MCP_REAL_TOOL_ARGS
        ? process.env.MCP_REAL_TOOL_ARGS.split(",").map((s) => s.trim())
        : ["/path/to/your/actual-mcp-server/index.ts"];
    }
  } else {
    const dashDashIdx = process.argv.indexOf("--");
    const argvAfterDash =
      dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1) : [];
    const directArgs =
      dashDashIdx === -1 && process.argv.length >= 3
        ? process.argv.slice(2)
        : [];

    command =
      argvAfterDash.length > 0
        ? argvAfterDash[0]
        : directArgs.length > 0
        ? directArgs[0]
        : process.env.GUARDIO_COMMAND ??
          process.env.MCP_REAL_TOOL_COMMAND ??
          "node";

    args =
      argvAfterDash.length > 1
        ? argvAfterDash.slice(1)
        : directArgs.length > 1
        ? directArgs.slice(1)
        : process.env.GUARDIO_ARGS
        ? process.env.GUARDIO_ARGS.split(",").map((s) => s.trim())
        : process.env.MCP_REAL_TOOL_ARGS
        ? process.env.MCP_REAL_TOOL_ARGS.split(",").map((s) => s.trim())
        : ["/path/to/your/actual-mcp-server/index.ts"];
  }

  const core = new GuardioCore({
    command,
    args,
    cwd,
    configPath,
  });

  await core.run();
}

main().catch((err) => {
  console.error("Guardio failed to start:", err);
  process.exit(1);
});
