#!/usr/bin/env node
import { createInterface } from "node:readline";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultAnswer = "") {
  const suffix = defaultAnswer ? ` (${defaultAnswer})` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(
        typeof answer === "string" && answer.trim() !== ""
          ? answer.trim()
          : defaultAnswer
      );
    });
  });
}

async function main() {
  console.log("\nCreate Guardio\n");

  const guardioDir = await ask("Guardio directory", "./mcp-server-gated");
  const guardioPath = resolve(process.cwd(), guardioDir);

  const command = await ask("MCP Server command", "node");
  const argsStr = await ask(
    "MCP Server args",
    "path/to/your-mcp-server/index.js"
  );
  const args = argsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const serverConfig = { type: "command", command, args };

  const config = {
    server: serverConfig,
    plugins: [
      { type: "policy", name: "default", config: { blockedTools: [] } },
      {
        type: "policy",
        name: "example",
        path: "./plugins/example",
        config: {},
      },
    ],
  };

  await mkdir(guardioPath, { recursive: true });
  await mkdir(resolve(guardioPath, "bin"), { recursive: true });
  await mkdir(resolve(guardioPath, "plugins", "example"), { recursive: true });

  const packageJson = {
    name: "guardio-project",
    private: true,
    type: "module",
    description: "Guardio-gated MCP server with optional local plugins",
    scripts: {
      build: "tsc",
      guardio: "node bin/guardio.mjs",
    },
    dependencies: { "@guardiojs/guardio": "*" },
    devDependencies: {
      typescript: "^5.6.0",
      "@types/node": "^22.0.0",
    },
  };
  await writeFile(
    resolve(guardioPath, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf-8"
  );

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
    },
    include: ["plugins/**/*.ts"],
  };
  await writeFile(
    resolve(guardioPath, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2),
    "utf-8"
  );

  await writeFile(
    resolve(guardioPath, "guardio.config.json"),
    JSON.stringify(config, null, 2),
    "utf-8"
  );

  const binContent = `#!/usr/bin/env node
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, "..", "guardio.config.json");
const result = spawnSync(
  "npx",
  ["-y", "@guardiojs/guardio", "--config", configPath],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
`;

  const binPath = resolve(guardioPath, "bin", "guardio.mjs");
  await writeFile(binPath, binContent, "utf-8");
  await chmod(binPath, 0o755);

  const examplePluginContent = `import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "@guardiojs/guardio";

/**
 * Example policy plugin: implements PolicyPluginInterface.
 * Reference in guardio.config.json with: { "type": "policy", "name": "example", "path": "./plugins/example" }
 * Default export must be the plugin instance.
 */
class ExamplePolicyPlugin implements PolicyPluginInterface {
  readonly name = "example";

  evaluate(context: PolicyRequestContext): PolicyResult {
    // Example: allow all calls. Replace with your policy logic.
    return "allowed";
  }
}

export default new ExamplePolicyPlugin();
`;

  await writeFile(
    resolve(guardioPath, "plugins", "example", "index.ts"),
    examplePluginContent,
    "utf-8"
  );

  const pluginsReadme = `# Custom plugins (path-based)

Add a plugin by setting \`path\` in \`guardio.config.json\` to a directory that contains \`index.js\` or \`index.mjs\` (compile from \`index.ts\` with \`npm run build\`).

- The directory must have \`index.js\` or \`index.mjs\` whose **default export is the plugin instance** (no descriptor).
- Policy: implement \`PolicyPluginInterface\` (name, evaluate). Config: \`{ "type": "policy", "name": "my-policy", "path": "./plugins/my-policy" }\`.
- Intervention: implement \`InterventionPluginInterface\` (name, act). Config: \`{ "type": "intervention", "name": "my-intervention", "path": "./plugins/my-intervention" }\`.

Import types from "@guardiojs/guardio". See example/ for a policy plugin.
`;

  await writeFile(
    resolve(guardioPath, "plugins", "README.md"),
    pluginsReadme,
    "utf-8"
  );

  const relativeBin = `${guardioDir}/bin/guardio.mjs`;
  const absoluteBin = resolve(guardioPath, "bin", "guardio.mjs");

  console.log("\n---\n");
  console.log("Next steps");
  console.log("  cd " + guardioDir + " && npm install");
  console.log("  npm run build   # compile plugins (index.ts → index.js)");
  console.log("");
  console.log("Add to MCP client");
  console.log("# Copy/paste the shown command\n");
  console.log(relativeBin);
  console.log("\n# Or use absolute path:\n");
  console.log(absoluteBin);
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
