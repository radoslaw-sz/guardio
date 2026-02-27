/**
 * CLI – load config and start Guardio as an HTTP server only.
 * Requires server.type "url" (upstream MCP via HTTP/SSE). Clients connect to Guardio via HTTP.
 */
import { resolve, dirname } from "node:path";
import { GuardioHttpServer } from "./server/index.js";
import { loadConfigFromPath, getConfigPath } from "./config/index.js";
import { logger } from "./logger.js";

const configIdx = process.argv.indexOf("--config");
const configPathArg =
  configIdx >= 0 && process.argv[configIdx + 1]
    ? process.argv[configIdx + 1]
    : null;

const DEFAULT_PORT = 3939;
const DEFAULT_HOST = "127.0.0.1";

async function main(): Promise<void> {
  logger.debug({ argv: process.argv }, "CLI starting");
  const resolved = configPathArg
    ? resolve(configPathArg)
    : getConfigPath(process.cwd());
  if (!resolved) {
    logger.error(
      "No guardio config found. Use --config guardio.config.json or add guardio.config.js/ts/json in cwd.",
    );
    process.exit(1);
  }
  logger.info({ configPath: resolved }, "Loading config");
  const config = await loadConfigFromPath(resolved);
  const configPath = resolved;
  const cwd = dirname(resolved);

  if (!Array.isArray(config.servers)) {
    logger.error(
      "Servers must be an array.",
    );
    process.exit(1);
  }

  const serverNameRe = /^[a-zA-Z0-9_-]+$/;
  const names = new Set<string>();
  for (const s of config.servers) {
    if (s.type !== "url" || !s.url || !s.name) {
      logger.error(
        'Each server must have name, type: "url", and url.',
      );
      process.exit(1);
    }
    if (!serverNameRe.test(s.name)) {
      logger.error(
        { name: s.name },
        'Server name must be a valid path segment (e.g. [a-zA-Z0-9_-]+).',
      );
      process.exit(1);
    }
    if (names.has(s.name)) {
      logger.error(
        { name: s.name },
        'Duplicate server name.',
      );
      process.exit(1);
    }
    names.add(s.name);
  }

  const servers = config.servers.map((s) => ({
    name: s.name,
    type: "url" as const,
    url: s.url,
    headers: s.headers,
    timeoutMs: s.timeoutMs,
  }));

  const portEnv =
    process.env.GUARDIO_HTTP_PORT ?? process.env.GUARDIO_CLIENT_PORT;
  const port =
    portEnv != null && portEnv !== ""
      ? parseInt(portEnv, 10)
      : (config.client?.port ?? DEFAULT_PORT);
  const host =
    process.env.GUARDIO_HTTP_HOST ?? config.client?.host ?? DEFAULT_HOST;

  if (port == null || Number.isNaN(port)) {
    logger.error(
      "Set client.port in config or GUARDIO_HTTP_PORT (default " +
        DEFAULT_PORT +
        ").",
    );
    process.exit(1);
  }

  logger.info({ port, host }, "Starting HTTP server");
  const httpServer = new GuardioHttpServer({
    servers,
    listen: { port, host },
    cwd,
    configPath,
  });
  // run() resolves when SIGINT/SIGTERM triggers graceful shutdown
  await httpServer.run();
}

main().catch((err) => {
  logger.error({ err }, "Guardio failed to start");
  process.exit(1);
});
