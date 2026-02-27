#!/usr/bin/env node
import { createInterface } from "node:readline";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { readdirSync, cpSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import decompress from "decompress";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DASHBOARD_REPO =
  process.env.GUARDIO_DASHBOARD_REPO || "radoslaw-sz/guardio";
const DASHBOARD_BRANCH = process.env.GUARDIO_DASHBOARD_BRANCH || "main";
const DASHBOARD_TARBALL_URL = `https://github.com/${DASHBOARD_REPO}/archive/refs/heads/${DASHBOARD_BRANCH}.tar.gz`;

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultAnswer = "") {
  const suffix = defaultAnswer ? ` (${defaultAnswer})` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(
        typeof answer === "string" && answer.trim() !== ""
          ? answer.trim()
          : defaultAnswer,
      );
    });
  });
}

function askYesNo(question, defaultAnswer = "n") {
  return ask(question + " (y/n)", defaultAnswer).then((a) =>
    /^y(es)?|1$/i.test(a),
  );
}

async function setupDashboardFromTarball(guardioPath) {
  const dashboardPath = join(guardioPath, "dashboard");
  console.log("Downloading dashboard from GitHub...");
  let res;
  try {
    res = await fetch(DASHBOARD_TARBALL_URL, { redirect: "follow" });
  } catch (err) {
    console.error(
      "Could not download dashboard template. Check network and GUARDIO_DASHBOARD_REPO.",
    );
    throw err;
  }
  if (!res.ok) {
    throw new Error(
      `Dashboard download failed: ${res.status} ${res.statusText}. Check repo (${DASHBOARD_REPO}) and branch (${DASHBOARD_BRANCH}).`,
    );
  }
  const tmpDir = await mkdtemp(join(tmpdir(), "guardio-dashboard-"));
  const tarPath = join(tmpDir, "archive.tar.gz");
  const w = createWriteStream(tarPath);
  await pipeline(res.body, w);
  console.log("Extracting...");
  const extractDir = join(tmpDir, "extract");
  await mkdir(extractDir, { recursive: true });
  await decompress(tarPath, extractDir);
  const topLevel = readdirSync(extractDir)[0];
  if (!topLevel) {
    throw new Error("Dashboard tarball had no top-level directory.");
  }
  const srcDashboard = join(extractDir, topLevel, "packages", "dashboard");
  if (!existsSync(srcDashboard)) {
    throw new Error(
      "Dashboard tarball missing packages/dashboard. Wrong repo or branch?",
    );
  }
  await mkdir(dashboardPath, { recursive: true });
  cpSync(srcDashboard, dashboardPath, { recursive: true });
  console.log("Installing dashboard dependencies...");
  const installResult = spawnSync(
    "pnpm",
    ["install"],
    { cwd: dashboardPath, stdio: "inherit", shell: true },
  );
  if (installResult.status !== 0) {
    const npmResult = spawnSync(
      "npm",
      ["install"],
      { cwd: dashboardPath, stdio: "inherit", shell: true },
    );
    if (npmResult.status !== 0) {
      throw new Error("Failed to install dashboard dependencies (tried pnpm and npm).");
    }
  }
}

async function main() {
  console.log("\nCreate Guardio\n");

  const guardioDir = await ask("Guardio directory", "guardio-project");
  const guardioPath = resolve(process.cwd(), guardioDir);

  const portStr = await ask("Guardio HTTP server port", "3939");
  const port = parseInt(portStr, 10) || 3939;

  const useStorage = await askYesNo(
    "Use storage and events (for dashboard / policy state)?",
    "n",
  );

  // All built-in policy plugins by default
  const plugins = [
    { type: "policy", name: "deny-tool-access" },
    { type: "policy", name: "deny-regex-parameter" },
  ];

  if (useStorage) {
    console.log("  1) sqlite (in-memory or file)");
    console.log("  2) postgres");
    const storageBackend = await ask("Storage backend (1-2)", "1");
    if (storageBackend === "2") {
      const pgConnectionString = await ask(
        "PostgreSQL connection string",
        "postgresql://localhost:5432/guardio",
      );
      const pgConfig = { connectionString: pgConnectionString };
      plugins.push({ type: "storage", name: "postgres", config: pgConfig });
      plugins.push({ type: "eventSink", name: "postgres" });
      plugins.push({ type: "eventSinkStore", name: "postgres" });
    } else {
      const sqliteInMemory = await askYesNo(
        "Use in-memory SQLite? (y = in-memory, n = file guardio.sqlite)",
        "y",
      );
      const sqliteConfig = sqliteInMemory
        ? { inMemory: true }
        : { database: "guardio.sqlite" };
      plugins.push({ type: "storage", name: "sqlite", config: sqliteConfig });
      plugins.push({ type: "eventSink", name: "sqlite", config: sqliteConfig });
      plugins.push({
        type: "eventSinkStore",
        name: "sqlite",
        config: sqliteConfig,
      });
    }
  }

  const addExamplePlugin = await askYesNo(
    "Add example custom policy plugin?",
    "n",
  );
  if (addExamplePlugin) {
    plugins.push({ type: "policy", name: "example", path: "./plugins/example" });
  }

  const installDashboard = await askYesNo("Install dashboard?", "n");

  const config = {
    servers: [],
    client: { port, host: "127.0.0.1" },
    plugins,
  };

  await mkdir(guardioPath, { recursive: true });

  const packageJson = {
    name: "guardio-project",
    private: true,
    type: "module",
    description: "Guardio-gated MCP server with optional local plugins",
    scripts: {
      build: "tsc",
      guardio:
        "node --import tsx ./node_modules/@guardiojs/guardio/dist/cli.js --config guardio.config.ts",
    },
    dependencies: { "@guardiojs/guardio": "*" },
    devDependencies: {
      typescript: "^5.6.0",
      "@types/node": "^22.0.0",
      tsx: "^4.19.0",
    },
  };
  if (installDashboard) {
    packageJson.scripts.dashboard = "cd dashboard && npm run dev";
  }
  await writeFile(
    resolve(guardioPath, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf-8",
  );

  if (installDashboard) {
    await setupDashboardFromTarball(guardioPath);
  }

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
    },
    include: ["guardio.config.ts", "plugins/**/*.ts"],
  };
  await writeFile(
    resolve(guardioPath, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2),
    "utf-8",
  );

  const configTsContent = `import type { GuardioConfig } from "@guardiojs/guardio";

// Example server (uncomment and add to servers array to proxy an MCP server):
// { name: "nuvei-docs", type: "url", url: "https://mcp.nuvei.com/sse" }

const config: GuardioConfig = ${JSON.stringify(config, null, 2).replace(/^/gm, "  ")};

export default config;
`;
  await writeFile(
    resolve(guardioPath, "guardio.config.ts"),
    configTsContent,
    "utf-8",
  );

  if (addExamplePlugin) {
    await mkdir(resolve(guardioPath, "plugins", "example"), { recursive: true });
    const examplePluginContent = `import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "@guardiojs/guardio";

/**
 * Example policy plugin: implements PolicyPluginInterface.
 * Reference in guardio.config.ts with: { type: "policy", name: "example", path: "./plugins/example" }
 * Default export must be the plugin instance.
 */
class ExamplePolicyPlugin implements PolicyPluginInterface {
  readonly name = "example";

  async evaluate(context: PolicyRequestContext): Promise<PolicyResult> {
    // Example: allow all calls. Replace with your policy logic.
    return Promise.resolve({ verdict: "allow" });
  }
}

export default new ExamplePolicyPlugin();
`;
    await writeFile(
      resolve(guardioPath, "plugins", "example", "index.ts"),
      examplePluginContent,
      "utf-8",
    );
  }

  await mkdir(resolve(guardioPath, "plugins"), { recursive: true });
  const pluginsReadme = `# Custom plugins (path-based)

Add a plugin by setting \`path\` in \`guardio.config.ts\` to a directory that contains \`index.js\` or \`index.mjs\` (compile from \`index.ts\` with \`npm run build\`).

- The directory must have \`index.js\` or \`index.mjs\` whose **default export is the plugin instance** (no descriptor).
- Policy: implement \`PolicyPluginInterface\` (name, evaluate returning Promise<PolicyResult>). Config: \`{ "type": "policy", "name": "my-policy", "path": "./plugins/my-policy" }\`.

Import types from "@guardiojs/guardio".${addExamplePlugin ? " See example/ for a policy plugin." : ""}
`;
  await writeFile(
    resolve(guardioPath, "plugins", "README.md"),
    pluginsReadme,
    "utf-8",
  );

  console.log("\n---\n");
  console.log("Next steps");
  console.log("  cd " + guardioDir);
  console.log(
    "  npm install   # or: pnpm install, yarn, bun install, etc.",
  );
  if (addExamplePlugin) {
    console.log("  npm run build   # compile plugins (index.ts → index.js)");
  }
  console.log("");
  console.log("Run Guardio as HTTP server:");
  console.log("  npm run guardio");
  console.log("");
  if (installDashboard) {
    console.log("Run dashboard (standalone copy from GitHub; point at Guardio URL):");
    console.log("  pnpm run dashboard   # or: npm run dashboard");
    console.log("  # Guardio base URL: http://127.0.0.1:" + port);
    console.log("");
  }
  console.log("Add to MCP client (use URL):");
  console.log('  "url": "http://127.0.0.1:' + port + '"');
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
