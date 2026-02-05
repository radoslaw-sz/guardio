export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: { name?: string; arguments?: unknown };
}

export interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface GuardioCoreConfig {
  /** Command to run the real MCP server (e.g. "node") */
  command: string;
  /** Arguments for the command (e.g. ["/path/to/server.js"]) */
  args: string[];
  /** Cwd for resolving guardio.config (default: process.cwd()) */
  cwd?: string;
  /** Explicit path to guardio config file (optional) */
  configPath?: string;
}
