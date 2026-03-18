"use client";

import { useEffect, useState } from "react";
import { getRemoteMcps, type RemoteMcpInfo } from "@/lib/guardio-api";
import {
  fetchConnectionInfo,
  fetchSimulationSettings,
  updateSimulationSettings,
  type DashboardSimulationSettings,
} from "@/lib/guardio-api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SimulationPageContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalSimulated, setGlobalSimulated] = useState(false);
  const [tools, setTools] = useState<
    { serverName: string; toolName: string; simulated: boolean }[]
  >([]);
  const [mcps, setMcps] = useState<RemoteMcpInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [conn, sim] = await Promise.all([
          fetchConnectionInfo(),
          fetchSimulationSettings(),
        ]);
        if (cancelled) return;
        const remoteMcps = getRemoteMcps(conn);
        setMcps(remoteMcps);
        if (sim) {
          setGlobalSimulated(sim.globalSimulated);
          setTools(sim.tools ?? []);
        } else {
          setGlobalSimulated(false);
          setTools([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load simulation data",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySimulationSettings = async (
    nextGlobalSimulated: boolean,
    nextTools: { serverName: string; toolName: string; simulated: boolean }[],
  ) => {
    setSaving(true);
    setError(null);
    try {
      const payload: DashboardSimulationSettings = {
        globalSimulated: nextGlobalSimulated,
        tools: nextTools,
      };
      const result = await updateSimulationSettings(payload);
      if (result && result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update simulation data",
      );
    } finally {
      setSaving(false);
    }
  };

  const computeNextTools = (
    current: { serverName: string; toolName: string; simulated: boolean }[],
    serverName: string,
    toolName: string,
  ) => {
    const existingIndex = current.findIndex(
      (t) => t.serverName === serverName && t.toolName === toolName,
    );
    if (existingIndex >= 0) {
      const next = [...current];
      next[existingIndex] = {
        ...next[existingIndex],
        simulated: !next[existingIndex].simulated,
      };
      return next;
    }
    return [...current, { serverName, toolName, simulated: true }];
  };

  const handleToggleGlobal = (next: boolean) => {
    setGlobalSimulated(next);
    void applySimulationSettings(next, tools);
  };

  const handleToggleTool = (serverName: string, toolName: string) => {
    setTools((current) => {
      const nextTools = computeNextTools(current, serverName, toolName);
      void applySimulationSettings(globalSimulated, nextTools);
      return nextTools;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid auto-rows-min gap-4 md:grid-cols-2">
          <Card className="h-[7rem] animate-pulse bg-muted" />
          <Card className="h-[7rem] animate-pulse bg-muted" />
        </div>
        <Card className="h-40 animate-pulse bg-muted" />
      </div>
    );
  }

  const mcpsWithTools = mcps.filter((m) => (m.tools?.length ?? 0) > 0);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid auto-rows-min gap-4 md:grid-cols-2">
        <Card className="px-6 py-5 border border-blue-200/60 dark:border-blue-900/60 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
          <CardHeader className="px-0 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Global simulation</CardTitle>
                <CardDescription>
                  Control whether all tools are simulated, or only those explicitly
                  configured below.
                </CardDescription>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  globalSimulated
                    ? "bg-emerald-200/80 text-emerald-900 dark:bg-emerald-800/80 dark:text-emerald-100"
                    : "bg-slate-200/80 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100"
                }`}
              >
                {globalSimulated ? "Simulation enabled" : "Simulation disabled"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                  Global simulation mode
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  {globalSimulated
                    ? "All tools will be simulated, regardless of per-tool settings."
                    : "Only tools with simulation enabled below will be simulated."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Off</span>
                <Switch
                  checked={globalSimulated}
                  onCheckedChange={handleToggleGlobal}
                  disabled={saving}
                />
                <span className="text-xs text-muted-foreground">On</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="hidden md:block" />
      </div>

      <Card
        className={`px-6 py-5 border border-gray-200 dark:border-gray-800 relative ${
          globalSimulated ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <CardHeader className="px-0 pb-3">
          <CardTitle>Per-tool simulation</CardTitle>
          <CardDescription>
            Toggle simulation for individual tools when global simulation is turned off.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {mcps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No MCP servers discovered yet. Connect a client and run
              <span className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                tools/list
              </span>
              to see tools here.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Server</TableHead>
                    <TableHead>Tool</TableHead>
                    <TableHead className="text-right">Simulated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mcps.flatMap((mcp) =>
                    (mcp.tools ?? []).map((tool) => {
                      const entry = tools.find(
                        (t) =>
                          t.serverName === (mcp.name ?? "") &&
                          t.toolName === tool.name,
                      );
                      const simulated = entry?.simulated ?? false;
                      return (
                        <TableRow key={`${mcp.name ?? ""}::${tool.name}`}>
                          <TableCell className="text-xs">
                            {mcp.name ?? "(unknown)"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="font-mono text-[11px]">
                              {tool.name}
                            </div>
                            {tool.description && (
                              <div className="text-[11px] text-muted-foreground">
                                {tool.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={simulated}
                              onCheckedChange={() =>
                                handleToggleTool(mcp.name ?? "", tool.name)
                              }
                              disabled={saving || globalSimulated}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {globalSimulated && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm border border-dashed border-muted-foreground/40">
              Per-tool settings are ignored while global simulation is enabled.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

