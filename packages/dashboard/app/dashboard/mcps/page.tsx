"use client"

import { useCallback, useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { fetchConnectionInfo, getRemoteMcps, type RemoteMcpInfo, type RemoteMcpToolInfo } from "@/lib/guardio-api";
import { Card } from "@/components/ui/card";
import { ChevronRight, RefreshCw, Wrench } from "lucide-react";

function getParamNames(tool: RemoteMcpToolInfo): string[] {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  if (!schema?.properties || typeof schema.properties !== "object") return [];
  return Object.keys(schema.properties);
}

function ToolRow({ tool }: { tool: RemoteMcpToolInfo }) {
  const params = getParamNames(tool);
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5 text-sm">
      <div className="font-mono font-medium text-gray-900 dark:text-gray-100">{tool.name}</div>
      {(tool.title || tool.description) && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
          {tool.title ?? tool.description}
        </div>
      )}
      {params.length > 0 && (
        <div className="text-xs text-gray-500 mt-1.5">
          <span className="font-medium">Parameters:</span>{" "}
          <span className="font-mono">{params.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

export default function McpsPage() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchConnectionInfo>>>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchConnectionInfo()
      .then((data) => setInfo(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionInfo()
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mcps = getRemoteMcps(info);
  const connectedCount = mcps.filter((m) => m.connected).length;
  const totalTools = mcps.reduce((acc, m) => acc + (m.tools?.length ?? 0), 0);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>MCPs</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Stats - same style as connection-status cards */}
          <div className="grid auto-rows-min gap-4 md:grid-cols-3 my-4">
            <Card className="h-[8rem] px-6 py-8 flex flex-col justify-center bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-sm font-medium text-blue-600 dark:text-blue-300 mb-2">Total MCPs</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-50">{mcps.length}</div>
              <div className="text-xs text-blue-700 dark:text-blue-200 mt-0.5">Remote servers configured</div>
            </Card>
            <Card className="h-[8rem] px-6 py-8 flex flex-col justify-center bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border border-green-200/50 dark:border-green-800/50">
              <div className="text-sm font-medium text-green-600 dark:text-green-300 mb-2">Connected</div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-50">{connectedCount}</div>
              <div className="text-xs text-green-700 dark:text-green-200 mt-0.5">Ready for requests</div>
            </Card>
            <Card className="h-[8rem] px-6 py-8 flex flex-col justify-center bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900 border border-violet-200/50 dark:border-violet-800/50">
              <div className="text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">Tools discovered</div>
              <div className="text-2xl font-bold text-violet-900 dark:text-violet-50">{totalTools}</div>
              <div className="text-xs text-violet-700 dark:text-violet-200 mt-0.5">Across all MCPs</div>
            </Card>
          </div>

          {/* MCP Servers list - Discovery-style card with refresh */}
          <Card className="bg-white dark:bg-gray-950 px-6 py-8 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">MCP Servers</h2>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            {loading && mcps.length === 0 ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : mcps.length === 0 ? (
              <p className="text-sm text-gray-500">No remote MCPs configured.</p>
            ) : (
              <div className="space-y-3">
                {mcps.map((m: RemoteMcpInfo, idx: number) => (
                  <Card
                    key={m.name ?? idx}
                    className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{m.name}</div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">{m.remoteUrl}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            m.connected
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }`}
                        >
                          {m.connected ? "connected" : "disconnected"}
                        </div>
                        {m.remotePostUrl ? (
                          <div className="text-xs text-gray-500 max-w-[200px] truncate" title={m.remotePostUrl}>
                            POST endpoint ready
                          </div>
                        ) : (
                          <div className="text-xs text-amber-600">Endpoint not yet discovered</div>
                        )}
                      </div>
                    </div>

                    {/* Tools as capabilities-style list */}
                    {m.tools && m.tools.length > 0 && (
                      <div className="mt-3">
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                            <ChevronRight className="h-3.5 w-3.5 data-[state=open]:rotate-90 transition-transform" />
                            <Wrench className="h-3.5 w-3.5" />
                            Tools ({m.tools.length})
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 flex flex-wrap gap-2 pl-5">
                              {m.tools.map((tool) => (
                                <span
                                  key={tool.name}
                                  className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded"
                                  title={tool.description ?? tool.title}
                                >
                                  {tool.name}
                                </span>
                              ))}
                            </div>
                            <ul className="mt-3 space-y-2 pl-5">
                              {m.tools.map((tool) => (
                                <li key={tool.name}>
                                  <ToolRow tool={tool} />
                                </li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}
                    {m.connected && (!m.tools || m.tools.length === 0) && (
                      <div className="text-xs text-gray-500 mt-2 italic">
                        Tools list not yet received (send tools/list to populate).
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
