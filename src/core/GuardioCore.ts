import { spawn } from "node:child_process";
import * as readline from "node:readline";
import type { PolicyPluginInterface } from "../interfaces/PolicyPluginInterface.js";
import type { InterventionPluginInterface } from "../interfaces/InterventionPluginInterface.js";
import type { GuardioCoreConfig } from "./types.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { PluginManager } from "../config/PluginManager.js";

export class GuardioCore {
  private readonly config: GuardioCoreConfig;
  private policyPlugins: PolicyPluginInterface[] = [];
  private interventionPlugins: InterventionPluginInterface[] = [];

  private child: ReturnType<typeof spawn> | null = null;
  private appInterface: readline.Interface | null = null;
  private toolInterface: readline.Interface | null = null;

  private pendingResponseId: string | number | null = null;
  private readonly appQueue: string[] = [];

  constructor(config: GuardioCoreConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    const pluginManager = new PluginManager();
    const cwd = this.config.cwd ?? process.cwd();
    this.policyPlugins = await pluginManager.getPolicyPlugins(
      cwd,
      this.config.configPath
    );
    if (this.policyPlugins.length === 0) {
      throw new Error(
        "No policy plugins in config. Add at least one plugin with type 'policy'."
      );
    }
    this.interventionPlugins = await pluginManager.getInterventionPlugins(
      cwd,
      this.config.configPath
    );

    this.child = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "inherit"],
    });

    this.appInterface = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });

    this.toolInterface = readline.createInterface({
      input: this.child.stdout!,
      terminal: false,
    });

    this.attachAppHandler();
    this.attachToolHandler();
  }

  private sendErrorResponse(
    id: string | number | undefined,
    message: string
  ): void {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message },
      }) + "\n"
    );
  }

  private async processAppLine(line: string): Promise<void> {
    try {
      const request = JSON.parse(line) as JsonRpcRequest;

      if (request.method === "tools/call") {
        const toolName = request.params?.name ?? "(unknown)";
        const args = request.params?.arguments;
        const context = { toolName, args };
        for (const policy of this.policyPlugins) {
          const result = policy.evaluate(context);
          if (result === "blocked") {
            console.error(
              `[SECURITY] Blocked attempt to call: ${toolName} (policy: ${policy.name})`
            );
            this.sendErrorResponse(request.id, "Security Layer: Call Rejected");
            this.drainAppQueue();
            return;
          }
        }

        if (this.interventionPlugins.length > 0) {
          const interventionContext = { toolName, args };
          for (const plugin of this.interventionPlugins) {
            const actResult = await Promise.resolve(
              plugin.act(interventionContext)
            );
            if (actResult === false) {
              this.sendErrorResponse(
                request.id,
                `Call to ${toolName} was rejected by intervention plugin ${plugin.name}`
              );
              this.drainAppQueue();
              return;
            }
          }
        }

        this.pendingResponseId = request.id ?? null;
        this.child!.stdin?.write(line + "\n");
        return;
      }

      this.child!.stdin?.write(line + "\n");
    } catch {
      this.child!.stdin?.write(line + "\n");
    }
  }

  private drainAppQueue(): void {
    this.pendingResponseId = null;
    while (this.appQueue.length > 0) {
      const line = this.appQueue.shift();
      if (line !== undefined) this.processAppLine(line);
    }
  }

  private attachAppHandler(): void {
    this.appInterface!.on("line", async (line: string) => {
      if (this.pendingResponseId !== null) {
        this.appQueue.push(line);
        return;
      }
      await this.processAppLine(line);
    });
  }

  private attachToolHandler(): void {
    this.toolInterface!.on("line", (line: string) => {
      process.stdout.write(line + "\n");

      if (this.pendingResponseId !== null) {
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          if (response.id === this.pendingResponseId) this.drainAppQueue();
        } catch {
          // not JSON or no id – keep waiting
        }
      }
    });
  }
}
