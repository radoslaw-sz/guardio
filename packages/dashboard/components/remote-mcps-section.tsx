"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DashboardConnectionInfo } from "@/lib/guardio-api";
import { getRemoteMcps } from "@/lib/guardio-api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface RemoteMcpsProps {
  info: DashboardConnectionInfo;
}

export function RemoteMcpsSection({ info }: RemoteMcpsProps) {
  const [open, setOpen] = useState(false);
  const client = info.client;
  const remoteMcps = getRemoteMcps(info);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden"
    >
      <CollapsibleTrigger className="group flex w-full items-start justify-between gap-2 p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
        <div>
          <h3 className="text-base font-semibold mb-1">Remote MCPs</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Upstream MCP servers Guardio proxies to — details below.
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0 mt-0.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-6 pb-6 pt-0">
          {remoteMcps.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No remote MCP configured or discovered yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {remoteMcps.map((mcp, idx) => (
                <li
                  key={idx}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                >
                  {mcp.name != null && (
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">
                      {mcp.name}
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate max-w-[80%]">
                      {mcp.remoteUrl}
                    </span>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                        mcp.connected
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}
                    >
                      {mcp.connected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  {mcp.name != null && client?.listenPort != null && (
                    <div
                      className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1"
                      title={`http://${client?.listenHost ?? "127.0.0.1"}:${client.listenPort}/${mcp.name}/sse`}
                    >
                      SSE: http://{client?.listenHost ?? "127.0.0.1"}:
                      {client.listenPort}/{mcp.name}/sse
                    </div>
                  )}
                  {mcp.remotePostUrl ? (
                    <div
                      className="text-xs text-gray-500 dark:text-gray-400 truncate"
                      title={mcp.remotePostUrl}
                    >
                      POST {mcp.remotePostUrl}
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600 dark:text-amber-400">
                      Endpoint not yet discovered
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
