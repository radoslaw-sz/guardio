"use client";

import { useEffect, useState } from "react";
import {
  fetchConnectionInfo,
  getRemoteMcps,
  type DashboardActiveClientInfo,
  type DashboardConnectionInfo,
  type RemoteMcpInfo,
} from "@/lib/guardio-api";

export interface PolicyAssignment {
  /** When null/undefined, policy applies to all agents. */
  agentId: string | null;
  /** When null/undefined, policy applies to all tools. */
  toolName: string | null;
}

export interface PolicyAssignmentSelectorProps {
  value: PolicyAssignment;
  onChange: (assignment: PolicyAssignment) => void;
  /** Optional class for the container. */
  className?: string;
  /** When true, show a short description. */
  showDescription?: boolean;
}

const GLOBAL_AGENT_VALUE = "";
const GLOBAL_TOOL_VALUE = "";

/** Build a flat list of tools from servers. Value is tool name; key is unique per server+tool for React. */
function getToolOptions(servers: RemoteMcpInfo[]): { key: string; value: string; label: string }[] {
  const nameCounts = new Map<string, number>();
  const options: { key: string; value: string; label: string }[] = [];
  for (const server of servers) {
    const serverName = server.name ?? "(unknown)";
    if (!server.tools?.length) continue;
    for (const tool of server.tools) {
      const name = tool.name;
      if (!name) continue;
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
  }
  for (const server of servers) {
    const serverName = server.name ?? "(unknown)";
    if (!server.tools?.length) continue;
    for (const tool of server.tools) {
      const name = tool.name;
      if (!name) continue;
      const count = nameCounts.get(name) ?? 1;
      options.push({
        key: `${serverName}:${name}`,
        value: name,
        label: count > 1 ? `${name} (${serverName})` : name,
      });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function PolicyAssignmentSelector({
  value,
  onChange,
  className = "",
  showDescription = true,
}: PolicyAssignmentSelectorProps) {
  const [info, setInfo] = useState<DashboardConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);

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

  const agents: DashboardActiveClientInfo[] = info?.clients ?? [];
  const servers = getRemoteMcps(info);
  const toolOptions = getToolOptions(servers);

  const handleAgentChange = (agentId: string) => {
    onChange({
      ...value,
      agentId: agentId === GLOBAL_AGENT_VALUE ? null : agentId,
    });
  };

  const handleToolChange = (toolName: string) => {
    onChange({
      ...value,
      toolName: toolName === GLOBAL_TOOL_VALUE ? null : toolName,
    });
  }

  const selectClass =
    "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-foreground";

  if (loading) {
    return (
      <div className={className}>
        <div className="h-10 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className={className}>
      {showDescription && (
        <p className="text-xs text-muted-foreground mb-3">
          Optionally restrict this policy to a specific agent or tool. Leave as &quot;All agents&quot; / &quot;All tools&quot; to apply globally.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Agent
          </label>
          <select
            className={selectClass}
            value={value.agentId ?? GLOBAL_AGENT_VALUE}
            onChange={(e) => handleAgentChange(e.target.value)}
          >
            <option value={GLOBAL_AGENT_VALUE}>All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Tool
          </label>
          <select
            className={selectClass}
            value={value.toolName ?? GLOBAL_TOOL_VALUE}
            onChange={(e) => handleToolChange(e.target.value)}
          >
            <option value={GLOBAL_TOOL_VALUE}>All tools</option>
            {toolOptions.map((t) => (
              <option key={t.key} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
