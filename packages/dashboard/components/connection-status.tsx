"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DashboardConnectionInfo } from "@/lib/guardio-api";
import {
  fetchConnectionInfo,
  getGuardioConnectionUrl,
  getRemoteMcps,
} from "@/lib/guardio-api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";

export function ConnectionStatus() {
  const [info, setInfo] = useState<DashboardConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionInfo()
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
          setError(data === null);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6 animate-pulse bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
            <div className="h-4 bg-blue-200/50 dark:bg-blue-800/50 rounded w-1/3 mb-4" />
            <div className="h-8 bg-blue-200/50 dark:bg-blue-800/50 rounded w-1/2 mb-2" />
            <div className="h-3 bg-blue-200/50 dark:bg-blue-800/50 rounded w-2/3" />
          </Card>
          <Card className="p-6 animate-pulse bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900">
            <div className="h-4 bg-violet-200/50 dark:bg-violet-800/50 rounded w-1/3 mb-4" />
            <div className="h-8 bg-violet-200/50 dark:bg-violet-800/50 rounded w-1/2 mb-2" />
            <div className="h-3 bg-violet-200/50 dark:bg-violet-800/50 rounded w-2/3" />
          </Card>
          <Card className="p-6 animate-pulse bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
            <div className="h-4 bg-green-200/50 dark:bg-green-800/50 rounded w-1/3 mb-4" />
            <div className="h-8 bg-green-200/50 dark:bg-green-800/50 rounded w-1/2 mb-2" />
            <div className="h-3 bg-green-200/50 dark:bg-green-800/50 rounded w-2/3" />
          </Card>
        </div>
        <Card className="mt-6 p-6 animate-pulse bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        </Card>
      </>
    );
  }

  if (error || !info) {
    return (
      <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <div className="font-medium text-sm text-amber-800 dark:text-amber-200">
          Unable to reach Guardio
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
          Ensure Guardio is running and dashboard is configured with{" "}
          <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
            NEXT_PUBLIC_GUARDIO_API_URL
          </code>{" "}
          (e.g. {getGuardioConnectionUrl()})
        </div>
      </Card>
    );
  }

  const client = info.client;
  const clients = info.clients ?? [];
  const remoteMcps = getRemoteMcps(info);
  const connectedCount = remoteMcps.filter((m) => m.connected).length;
  const totalCount = remoteMcps.length;

  return (
    <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1 — Guardio Gateway (running = we reached the API; show listen address) */}
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200/50 dark:border-blue-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-blue-600 dark:text-blue-300">
              Guardio Gateway
            </span>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-200/80 text-blue-900 dark:bg-blue-800/80 dark:text-blue-100">
              Running
            </span>
          </div>
          {client?.mode === "http" && client.listenPort != null ? (
            <div className="space-y-2">
              <div className="text-sm text-blue-900 dark:text-blue-50">
                <span className="text-blue-700 dark:text-blue-200 block mb-1">
                  Listening on
                </span>
                <span className="font-mono text-xs break-all">
                  http://{client.listenHost ?? "127.0.0.1"}:{client.listenPort}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-blue-700 dark:text-blue-200">
              {client
                ? "Stdio mode or listen address not available."
                : "Gateway reached; listen details not reported."}
            </div>
          )}
        </Card>

        {/* Card 2 — Active clients */}
        <Card className="p-6 bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900 border border-violet-200/50 dark:border-violet-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-violet-600 dark:text-violet-300">
              Active clients
            </span>
            {clients.length > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-violet-200/80 text-violet-900 dark:bg-violet-800/80 dark:text-violet-100">
                All connected
              </span>
            )}
          </div>
          {clients.length === 0 ? (
            <div className="text-sm text-violet-700 dark:text-violet-200">
              No active SSE clients.
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm text-violet-900 dark:text-violet-50">
              <span className="text-violet-700 dark:text-violet-200">
                SSE Clients
              </span>
              <span className="font-semibold">{clients.length}</span>
            </div>
          )}
        </Card>

        {/* Card 3 — Remote MCPs summary */}
        <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border border-green-200/50 dark:border-green-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-green-600 dark:text-green-300">
              Remote MCPs
            </span>
            {totalCount > 0 && (
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  connectedCount === totalCount
                    ? "bg-green-200/80 text-green-900 dark:bg-green-800/80 dark:text-green-100"
                    : connectedCount > 0
                      ? "bg-amber-200/80 text-amber-900 dark:bg-amber-800/80 dark:text-amber-100"
                      : "bg-red-200/80 text-red-900 dark:bg-red-800/80 dark:text-red-100"
                }`}
              >
                {connectedCount === totalCount
                  ? "All connected"
                  : `${connectedCount} of ${totalCount} connected`}
              </span>
            )}
          </div>
          {totalCount === 0 ? (
            <div className="text-sm text-green-800 dark:text-green-100">
              No remote MCP configured or discovered yet.
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm text-green-900 dark:text-green-50">
              <span className="text-green-700 dark:text-green-200">
                Upstream servers
              </span>
              <span className="font-semibold">{totalCount}</span>
            </div>
          )}
        </Card>
      </div>
    );
}

