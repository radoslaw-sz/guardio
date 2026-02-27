<p align="center">
  <img src="packages/dashboard/public/favicon.svg" alt="Guardio" width="48" height="48" />
</p>

<p align="center">
  <h1 align="center">
    Guardio
  </h1>
</p>

Guardio is a **proxy** that sits between your **AI Agent system** and the external world. It catches and evaluates messages flowing to and from **MCP tools** and other APIs before they reach the real servers. You can enforce policies (allow, block, sanitize), require approval, and observe activity—all through a **plugin system**.

<p align="center">
  <picture>
    <img alt="High view" src="./docs/high-view-2.png">
  </picture>
</p>

## Supported connections

| Connection type             | Status     | Notes                                                 |
| --------------------------- | ---------- | ----------------------------------------------------- |
| **HTTP server**             | Supported  | Guardio runs as an HTTP server; clients connect here. |
| **MCP tool (upstream)**     | Supported  | Proxying to MCP servers over HTTP/SSE.                |
| **stdio**                   | On the way | Client transport.                                     |
| **Other APIs / transports** | On the way | Extensible for more protocols.                        |

Today you run one **Guardio instance** that fronts **all** your external MCP tools and APIs (one proxy, many upstreams).

---

## Quick start

### Create a Guardio project

Scaffold a new project with config and optional plugins:

```bash
npx create-guardio
```

You will be prompted for:

- **Guardio directory** – e.g. `guardio-project` (default)
- **Guardio HTTP port** – e.g. `3939`
- **Storage and events** – optional; needed for dashboard and policy state. Choose SQLite (in-memory by default, or file `guardio.sqlite`) or PostgreSQL.
- **Example custom policy plugin?** – optional; scaffolds `plugins/example`
- **Install dashboard?** – optional; adds `@guardiojs/dashboard` and a `dashboard` run script

The scaffold creates **empty `servers`** by default. A commented example in `guardio.config.ts` shows how to add an MCP server (e.g. `{ name: "nuvei-docs", type: "url", url: "https://mcp.nuvei.com/sse" }`). All built-in policy plugins (**deny-tool-access**, **deny-regex-parameter**) are included by default.

Then:

```bash
cd <guardio-directory>
npm install   # or: pnpm install, yarn, bun install, etc.
npm run guardio
```

Point your AI Agent or MCP client at `http://127.0.0.1:<port>`. If you installed the dashboard, run `pnpm run dashboard` (or `npm run dashboard`) and point it at the same Guardio base URL.

---

## Concepts

### AI Agent connection

AI Agents (MCP clients) connect to **Guardio’s HTTP server**, not directly to the upstream MCP servers. Guardio is the single entry point.

- **SSE (stream)** – Connect to `http://<host>:<port>/{serverName}/sse` for the MCP SSE stream. Use the **server name** from your config (e.g. `nuvei-docs` → `/nuvei-docs/sse`).
- **Optional `x-agent-name`** – Send this header on the SSE connection to give the agent a human-readable name. If omitted, Guardio generates one. The connection is assigned an agent id used for policy scoping.
- **POST messages** – Send JSON-RPC to `http://<host>:<port>/{serverName}/messages`. You can send **`x-agent-id`** (the id for the SSE connection) so policies can be applied per agent.

So: one Guardio URL base, multiple paths like `/{mcp-tool}/sse` and `/{mcp-tool}/messages` for each configured upstream.

### MCP tool connection

In your config you define a **`servers`** array. Each entry has a **`name`** (unique, used in the URL path) and an **`url`** (the upstream MCP server’s HTTP/SSE base URL). Guardio proxies:

- **GET /{name}/sse** – to the upstream SSE endpoint (and manages the stream).
- **POST /{name}/messages** – to the upstream after running policies (or returns a blocked result without forwarding).

So each “MCP tool” or upstream is one entry in `servers`; a single Guardio instance serves all of them.

### Plugins

Plugins extend Guardio’s behavior. Types:

| Type               | Role                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Policy**         | Evaluate `tools/call` requests: allow, block, or modify arguments. Optional; no policies means all calls pass through. |
| **Storage**        | Persist state (e.g. policy assignments, agent list). Used by built-in policy config and dashboard.                     |
| **EventSink**      | Receive events for each processed request (e.g. ALLOWED/BLOCKED, tool name, policy).                                   |
| **EventSinkStore** | Store and query events; used by the dashboard for activity views.                                                      |

**Built-in plugins:**

- **Policy:** `deny-tool-access`, `deny-regex-parameter` (both are added by default when you scaffold with `create-guardio`)
- **Storage / EventSink / EventSinkStore:** `sqlite` or `postgres`
  - **sqlite:** `config: { inMemory: true }` (default) or `config: { database: "guardio.sqlite" }` for a file
  - **postgres:** `config: { connectionString: "postgresql://user:pass@host:5432/dbname" }` or discrete `host`, `port`, `user`, `password`, `database`, `ssl`

You register plugins in **`guardio.config.ts`** in the **`plugins`** array. Policy config for built-ins is typically managed at runtime (e.g. via the dashboard), not in the config file.

### Create a custom plugin

Use a **path-based** plugin: in config add an entry with **`path`** pointing to a directory that contains **`index.js`** or **`index.mjs`** (build from `index.ts` if needed). The module’s **default export must be the plugin instance**.

Example for a custom policy:

```ts
// plugins/my-policy/index.ts
import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
} from "@guardiojs/guardio";

class MyPolicyPlugin implements PolicyPluginInterface {
  readonly name = "my-policy";
  async evaluate(context: PolicyRequestContext): Promise<PolicyResult> {
    // allow | block | modify args
    return Promise.resolve({ verdict: "allow" });
  }
}
export default new MyPolicyPlugin();
```

In config:

```ts
{ type: "policy", name: "my-policy", path: "./plugins/my-policy" }
```

If you chose “Add example custom policy plugin” when running `npx create-guardio`, see the generated `plugins/example` folder.

---

## Processing

### Evaluating policy

When a **`tools/call`** request hits Guardio (POST `/{serverName}/messages`):

1. Guardio resolves which **policy plugins** apply (from storage, optionally scoped by agent and tool).
2. Each policy’s **`evaluate`** is run with the tool name and arguments.
3. If any policy returns **block**, the call is **not** forwarded. Guardio responds with a **success** JSON-RPC result that includes a human-readable message and **`_guardio`** metadata (so agent frameworks don’t treat it as a fatal error).
4. If all policies **allow**, the request (with any **modified arguments**) is forwarded to the upstream MCP server and the response is proxied back.

Non–`tools/call` messages are forwarded without policy evaluation.

### Emitting events

If **EventSink** plugins are configured, Guardio emits a **GuardioEvent** for each processed `tools/call` (both allowed and blocked). The event includes:

- **decision** – `ALLOWED` or `BLOCKED`
- **tool name**, **request id**, **agent id** (if present)
- For blocks: **policy name**, **code**, **reason**

EventSinkStore (e.g. sqlite or postgres) persists these for the dashboard and for your own auditing.

---

## Configuration and running

- **Config file:** `guardio.config.ts` (or pass `--config <path>`). It must export a **`GuardioConfig`** with **`servers`** (array of `{ name, type: "url", url }`; can be empty) and **`plugins`**. The scaffold adds a commented example server in the config so you can uncomment and edit to add MCP upstreams.
- **Client (HTTP server):** Optional **`client`** with **`port`** (default `3939`) and **`host`** (default `127.0.0.1`). Override with **`GUARDIO_HTTP_PORT`** and **`GUARDIO_HTTP_HOST`**.
- **Debug:** `GUARDIO_DEBUG=1` to log request/response flow.

Blocked tool calls return a **success** result with **`result.isError: true`** and **`result._guardio`** (version, requestId, timestamp, policyId, action). See the repo for the full response shape.

---

## Dashboard

The **dashboard** (`@guardiojs/dashboard`) is a Next.js web UI for Guardio. It lets you view activity (allowed/blocked tool calls), manage policies, and inspect agents and topology. You can add it when scaffolding with `npx create-guardio` (choose “Install dashboard?”), or install it later: `pnpm add @guardiojs/dashboard`. The package exposes a **`dashboard`** bin, so in your project run **`pnpm run dashboard`** (or add a script `"dashboard": "dashboard"` and use `npm run dashboard`). By default it starts in dev mode; use `pnpm run dashboard -- --prod` for a production build. Set the Guardio server URL via env (e.g. `NEXT_PUBLIC_GUARDIO_URL=http://127.0.0.1:3939 pnpm run dashboard`).

---

## License

Apache-2.0
