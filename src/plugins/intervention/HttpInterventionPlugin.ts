import { createServer } from "node:http";
import { exec } from "node:child_process";
import type { InterventionPluginInterface } from "../../interfaces/InterventionPluginInterface.js";
import type { InterventionRequestContext } from "../../interfaces/InterventionTypes.js";

const DEFAULT_PORT = 3939;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface HttpInterventionPluginConfig {
  port?: number;
  timeoutMs?: number;
}

/**
 * Intervention plugin that starts an HTTP server and waits for user approve/reject
 * before the tool call is forwarded. Config: { port?, timeoutMs? }.
 */
export class HttpInterventionPlugin implements InterventionPluginInterface {
  readonly name = "http";

  private readonly port: number;
  private readonly timeoutMs: number;
  private server: ReturnType<typeof createServer> | null = null;
  private readonly pendingApprovals = new Map<
    string,
    (approved: boolean) => void
  >();
  private approvalCounter = 0;

  constructor(config: Record<string, unknown> = {}) {
    const opts = config as HttpInterventionPluginConfig;
    this.port = opts.port ?? DEFAULT_PORT;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private ensureServer(): void {
    if (this.server !== null) return;

    this.server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/") {
        const pending = Array.from(this.pendingApprovals.entries())
          .map(
            ([id]) =>
              `<li><a href="/approve/${id}">Approve ${id}</a> | <a href="/reject/${id}">Reject ${id}</a></li>`
          )
          .join("");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body>
              <h1>Guardio - Pending Approvals</h1>
              <ul>${pending || "<li>No pending approvals</li>"}</ul>
            </body>
          </html>
        `);
      } else if (req.url?.startsWith("/approve/")) {
        const id = req.url.split("/")[2];
        const resolver = this.pendingApprovals.get(id);
        if (resolver) {
          resolver(true);
          this.pendingApprovals.delete(id);
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Approved!");
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      } else if (req.url?.startsWith("/reject/")) {
        const id = req.url.split("/")[2];
        const resolver = this.pendingApprovals.get(id);
        if (resolver) {
          resolver(false);
          this.pendingApprovals.delete(id);
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Rejected!");
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      }
    });

    this.server.listen(this.port, () => {
      console.error(
        `🔐 Guardio approval server running on http://localhost:${this.port}`
      );
    });
  }

  act(context: InterventionRequestContext): Promise<boolean> {
    this.ensureServer();

    return new Promise((resolve) => {
      const id = `approval-${++this.approvalCounter}`;
      this.pendingApprovals.set(id, resolve);

      console.error("\n" + "=".repeat(60));
      console.error(`🔔 AI wants to call: ${context.toolName}`);
      console.error(`Arguments: ${JSON.stringify(context.args, null, 2)}`);
      console.error(`Approve at: http://localhost:${this.port}`);
      console.error("=".repeat(60));

      const url = `http://localhost:${this.port}`;
      const cmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "start"
          : "xdg-open";
      exec(`${cmd} ${url}`);

      setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          this.pendingApprovals.delete(id);
          console.error("\n⏱️  Approval timed out - rejecting call");
          resolve(false);
        }
      }, this.timeoutMs);
    });
  }
}
