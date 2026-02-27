#!/usr/bin/env node
/**
 * Bin entrypoint for @guardiojs/dashboard.
 * Runs the Next.js app from a writable run directory to avoid ENOENT and
 * multiple-React issues when the package lives inside node_modules (e.g. pnpm).
 */
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, cpSync, symlinkSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next", { paths: [pkgRoot] });
const argv = process.argv.slice(2);
const prodIndex = argv.indexOf("--prod");
const isProd = prodIndex !== -1;
const nextArgs = isProd ? argv.filter((_, i) => i !== prodIndex) : argv;

// Writable dir in the user's project so .next and cache work; keeps React isolated
const runDir = resolve(process.cwd(), ".guardio-dashboard");

const SOURCE_DIRS = ["app", "components", "public", "hooks", "lib"];
const SOURCE_FILES = [
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "postcss.config.mjs",
  "tsconfig.json",
  "components.json",
  "next-env.d.ts",
  "package.json",
];

function ensureRunDir() {
  if (!existsSync(runDir)) {
    mkdirSync(runDir, { recursive: true });
  }

  for (const d of SOURCE_DIRS) {
    const src = join(pkgRoot, d);
    const dest = join(runDir, d);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true, force: true });
    }
  }

  for (const f of SOURCE_FILES) {
    const src = join(pkgRoot, f);
    const dest = join(runDir, f);
    if (existsSync(src)) {
      cpSync(src, dest, { force: true });
    }
  }

  const runDirNodeModules = join(runDir, "node_modules");
  if (!existsSync(runDirNodeModules)) {
    const pkgNodeModules = join(pkgRoot, "node_modules");
    const dashboardNodeModules = existsSync(pkgNodeModules)
      ? pkgNodeModules
      : join(pkgRoot, "..");
    symlinkSync(dashboardNodeModules, runDirNodeModules);
  }
}

function run(command, args = [], opts = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: runDir,
    ...opts,
  });
  if (result.signal) process.exit(129);
  process.exit(result.status ?? 0);
}

ensureRunDir();

if (isProd) {
  const buildDir = join(runDir, ".next");
  if (!existsSync(buildDir)) {
    run("node", [nextBin, "build"]);
  }
  run("node", [nextBin, "start", ...nextArgs]);
} else {
  run("node", [nextBin, "dev", ...nextArgs]);
}
