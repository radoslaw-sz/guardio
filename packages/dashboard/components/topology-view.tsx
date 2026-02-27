"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BaseEdge,
  getBezierPath,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  Handle,
  Position,
  Panel,
} from "@xyflow/react";
import { Monitor, Shield, Server } from "lucide-react";
import {
  fetchConnectionInfo,
  getConnections,
  getGuardioConnectionUrl,
  getRemoteMcps,
} from "@/lib/guardio-api";
import type {
  DashboardConnectionInfo,
  DashboardActiveClientInfo,
  RemoteMcpInfo,
} from "@/lib/guardio-api";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import "@xyflow/react/dist/style.css";

// ─── Layout constants ───────────────────────────────────────────────────────
const LAYOUT = {
  width: 280,
  height: 420,
  agentX: 120,
  proxyX: 400,
  toolX: 680,
  rowGap: 100,
};
const PROXY_ID = "guardio-proxy";

// Node data shapes for custom nodes (cast from NodeProps data so it's not `unknown`)
interface AgentNodeData {
  label: string;
  sublabel?: string;
  connectionHighlight?: boolean;
}
interface ProxyNodeData {
  label: string;
  sublabel: string;
  connectionHighlight?: boolean;
}
interface ToolNodeData {
  label: string;
  sublabel: string;
  connected?: boolean;
  connectionHighlight?: boolean;
}

function buildTopology(
  clients: DashboardActiveClientInfo[],
  servers: RemoteMcpInfo[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const centerY = LAYOUT.height / 2;

  // Agent nodes (left column) — only when there are real clients, no placeholder
  const agentCount = clients.length;
  const agentStartY = centerY - ((agentCount - 1) * LAYOUT.rowGap) / 2;
  clients.forEach((client, i) => {
    const id = client.id ?? `agent-${i}`;
    const y = agentStartY + (agentCount === 1 ? 0 : i * (LAYOUT.rowGap / (agentCount - 1 || 1)));
    nodes.push({
      id,
      type: "agent",
      position: { x: LAYOUT.agentX - 55, y: y - 32 },
      data: {
        label: client.name ?? "AI Agent",
        sublabel: client.nameGenerated ? "(auto)" : (client.id?.slice(0, 8) ?? ""),
      },
      sourcePosition: Position.Right,
    });
    edges.push({ id: `e-${id}-proxy`, source: id, target: PROXY_ID });
  });

  // Proxy node (center)
  nodes.push({
    id: PROXY_ID,
    type: "proxy",
    position: { x: LAYOUT.proxyX - 60, y: centerY - 40 },
    data: { label: "Guardio", sublabel: "MCP Proxy" },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });

  // Tool nodes (right column)
  const toolCount = Math.max(1, servers.length);
  const toolStartY = centerY - ((toolCount - 1) * LAYOUT.rowGap) / 2;
  const tools =
    servers.length > 0
      ? servers
      : [
          {
            name: "(default)",
            remoteUrl: "",
            remotePostUrl: null,
            connected: false,
          } as RemoteMcpInfo,
        ];

  tools.forEach((server, i) => {
    const id = `tool-${server.name ?? i}`;
    const y = toolStartY + i * (tools.length === 1 ? 0 : LAYOUT.rowGap / (toolCount - 1 || 1));
    const displayName = (server.name ?? "(default)") === "(default)" ? "Remote MCP" : (server.name ?? "MCP");
    nodes.push({
      id,
      type: "tool",
      position: { x: LAYOUT.toolX - 55, y: y - 32 },
      data: {
        label: displayName,
        sublabel: server.connected ? "Connected" : "Disconnected",
        connected: server.connected,
      },
      targetPosition: Position.Left,
    });
    edges.push({ id: `e-proxy-${id}`, source: PROXY_ID, target: id });
  });

  return { nodes, edges };
}

/** Tool node id for a given server name (must match buildTopology). */
function toolIdForServer(serverName: string): string {
  return `tool-${serverName}`;
}

/**
 * Returns the set of tool node ids that the given agent is connected to (from connections).
 */
function getConnectedToolIdsForAgent(agentId: string, connections: { agentId: string; serverName: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const c of connections) {
    if (c.agentId === agentId) ids.add(toolIdForServer(c.serverName));
  }
  return ids;
}

/**
 * Returns the set of agent node ids that are connected to the given tool (from connections).
 * Tool id must match buildTopology format, e.g. "tool-(default)" or "tool-<serverName>".
 */
function getConnectedAgentIdsForTool(toolId: string, connections: { agentId: string; serverName: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const c of connections) {
    if (toolIdForServer(c.serverName) === toolId) ids.add(c.agentId);
  }
  return ids;
}

/** Returns true if this edge is part of the path between the selected node and its related nodes. */
function isEdgeHighlighted(
  edge: Edge,
  selectedNodeId: string | null,
  connectedToolIdsForSelectedAgent: Set<string> | null,
  connectedAgentIdsForSelectedTool: Set<string> | null,
  allToolIds: Set<string>,
  allAgentIds: Set<string>
): boolean {
  if (!selectedNodeId) return false;
  const isAgent = selectedNodeId !== PROXY_ID && !selectedNodeId.startsWith("tool-");
  const isTool = selectedNodeId.startsWith("tool-");
  const isProxy = selectedNodeId === PROXY_ID;
  if (isProxy) return true;
  // Agent selected: highlight agent→proxy and proxy→tool (related tools only)
  if (isAgent) {
    if (edge.source === selectedNodeId && edge.target === PROXY_ID) return true;
    if (edge.source === PROXY_ID) {
      const related = connectedToolIdsForSelectedAgent?.size
        ? connectedToolIdsForSelectedAgent
        : allToolIds;
      return related.has(edge.target);
    }
    return false;
  }
  // Tool selected: highlight only related agent→proxy and proxy→this tool
  if (isTool) {
    if (edge.source === PROXY_ID && edge.target === selectedNodeId) return true;
    if (edge.target === PROXY_ID) {
      const related = connectedAgentIdsForSelectedTool?.size
        ? connectedAgentIdsForSelectedTool
        : allAgentIds;
      return related.has(edge.source);
    }
    return false;
  }
  return false;
}

/** Stroke color for a highlighted edge: agent side = chart-1, tool side = chart-2. */
function getHighlightStroke(edge: Edge): string {
  return edge.target === PROXY_ID ? "var(--color-chart-1)" : "var(--color-chart-2)";
}

// ─── Animated edge (curved Bezier; bold + colored when highlighted) ───────────
function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const dimStroke = (style as { stroke?: string } | undefined)?.stroke ?? "var(--color-border)";
  const highlighted = (data?.highlighted as boolean) ?? false;
  const highlightColor = (data?.highlightColor as string) ?? dimStroke;

  const pathStyle = highlighted
    ? { stroke: highlightColor, strokeWidth: 3, strokeOpacity: 0.9 }
    : { stroke: dimStroke, strokeWidth: 1.2, strokeOpacity: 0.25 };

  const dotColor = highlighted ? highlightColor : dimStroke;

  return (
    <>
      <BaseEdge id={id} path={path} style={pathStyle} />
      <circle r="4" fill={dotColor} opacity={highlighted ? 0.95 : 0.5}>
        <animateMotion dur="1.8s" repeatCount="indefinite" path={path} />
      </circle>
    </>
  );
}

const edgeTypes = { animated: AnimatedEdge };

// ─── Custom node components (shadcn-aligned) ──────────────────────────────────
function AgentNode({ data, selected }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const connectionHighlight = d.connectionHighlight;
  return (
    <div
      className={cn(
        "relative rounded-lg border px-3 py-2.5 min-w-[110px] text-center transition-colors",
        "bg-card text-card-foreground border-border ring-ring/10",
        selected && "ring-2 ring-chart-1 border-chart-1",
        connectionHighlight && !selected && "ring-2 ring-chart-1/70 border-chart-1/50"
      )}
    >
      {selected && (
        <span
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-chart-1 topology-pulse-dot"
          aria-hidden
        />
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-2 !bg-chart-1 !border-chart-1" />
      <Monitor className="mx-auto size-5 text-chart-1 mb-1" />
      <div className="font-medium text-foreground text-xs truncate" title={d.label}>
        {d.label}
      </div>
      {d.sublabel != null && d.sublabel !== "" && (
        <div className="text-[10px] text-muted-foreground font-mono truncate">{d.sublabel}</div>
      )}
    </div>
  );
}

function ProxyNode({ data, selected }: NodeProps) {
  const d = data as unknown as ProxyNodeData;
  const connectionHighlight = d.connectionHighlight;
  return (
    <div
      className={cn(
        "relative rounded-lg border px-3 py-2.5 min-w-[120px] text-center transition-colors",
        "bg-card text-card-foreground border-border ring-ring/10",
        selected && "ring-2 ring-primary border-primary",
        connectionHighlight && !selected && "ring-2 ring-primary/70 border-primary/50"
      )}
    >
      {selected && (
        <span
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary topology-pulse-dot"
          aria-hidden
        />
      )}
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-2 !bg-primary !border-primary" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-2 !bg-primary !border-primary" />
      <Shield className="mx-auto size-5 text-primary mb-1" />
      <div className="font-medium text-foreground text-xs truncate">{d.label}</div>
      <div className="text-[10px] text-muted-foreground font-mono">{d.sublabel}</div>
    </div>
  );
}

function ToolNode({ data, selected }: NodeProps) {
  const d = data as unknown as ToolNodeData;
  const connected = d.connected;
  const connectionHighlight = d.connectionHighlight;
  return (
    <div
      className={cn(
        "relative rounded-lg border px-3 py-2.5 min-w-[110px] text-center transition-colors",
        "bg-card text-card-foreground border-border ring-ring/10",
        selected && "ring-2 ring-chart-2 border-chart-2",
        connectionHighlight && !selected && "ring-2 ring-chart-2/70 border-chart-2/50"
      )}
    >
      {selected && (
        <span
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-chart-2 topology-pulse-dot"
          aria-hidden
        />
      )}
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-2 !bg-chart-2 !border-chart-2" />
      <Server className="mx-auto size-5 text-chart-2 mb-1" />
      <div className="font-medium text-foreground text-xs truncate" title={d.label}>
        {d.label}
      </div>
      <div
        className={cn(
          "text-[10px] font-mono",
          connected ? "text-chart-2" : "text-muted-foreground"
        )}
      >
        {d.sublabel}
      </div>
    </div>
  );
}

const nodeTypes = { agent: AgentNode, proxy: ProxyNode, tool: ToolNode };

// ─── Detail panel (below topology, inspired by example) ───────────────────────
function TopologyDetailPanel({
  selectedNodeId,
  nodes,
  clients,
  servers,
  connections,
}: {
  selectedNodeId: string | null;
  nodes: Node[];
  clients: DashboardActiveClientInfo[];
  servers: RemoteMcpInfo[];
  connections: { agentId: string; serverName: string; agentName?: string }[];
}) {
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const isProxy = selectedNodeId === PROXY_ID;
  const isAgent =
    selectedNodeId && selectedNodeId !== PROXY_ID && !selectedNodeId.startsWith("tool-");
  const isTool = selectedNodeId?.startsWith("tool-");

  if (!selectedNode) {
    return (
      <div className="flex min-h-[88px] items-center gap-2 border-t border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
        <span className="opacity-50">◈</span>
        Click any node to inspect its connections
      </div>
    );
  }

  const data = selectedNode.data as Record<string, unknown>;
  const label = (data?.label as string) ?? selectedNodeId;
  const sublabel = (data?.sublabel as string) ?? "";

  const agentNodes = nodes.filter((n) => n.type === "agent");
  const toolNodes = nodes.filter((n) => n.type === "tool");

  const connectedToolsForAgent =
    isAgent && selectedNodeId
      ? (() => {
          const set = getConnectedToolIdsForAgent(selectedNodeId, connections);
          if (set.size) return [...set].map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as Node[];
          return toolNodes;
        })()
      : [];
  const connectedAgentsForTool =
    isTool && selectedNodeId
      ? connections
          .filter((c) => toolIdForServer(c.serverName) === selectedNodeId)
          .map((c) => clients.find((cl) => cl.id === c.agentId)?.name ?? c.agentId)
      : [];

  const accentClass = isProxy
    ? "text-primary"
    : isAgent
      ? "text-chart-1"
      : "text-chart-2";

  return (
    <div className="flex min-h-[88px] flex-col gap-4 border-t border-border bg-muted/30 px-4 py-4 sm:flex-row sm:gap-8">
      <div className="min-w-0 flex-1">
        <div className={cn("mb-1.5 text-xs font-medium uppercase tracking-wider", accentClass)}>
          {isProxy && <Shield className="mr-1.5 inline size-3.5" />}
          {isAgent && <Monitor className="mr-1.5 inline size-3.5" />}
          {isTool && <Server className="mr-1.5 inline size-3.5" />}
          {label}
        </div>
        <p className="text-sm text-muted-foreground">
          {isProxy &&
            "Intercepts all Agent↔Tool traffic · Applies policy · Logs calls"}
          {isAgent && "Sends MCP tool calls through Guardio proxy"}
          {isTool && "Receives filtered requests from Guardio"}
        </p>
        {sublabel && (
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{sublabel}</p>
        )}
        {isTool && selectedNodeId && (() => {
          const serverName = selectedNodeId.startsWith("tool-") ? selectedNodeId.slice(5) : null;
          const server = servers.find(
            (s) => (s.name ?? "(default)") === (serverName ?? "(default)")
          );
          return server?.remoteUrl ? (
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={server.remoteUrl}>
              {server.remoteUrl}
            </p>
          ) : null;
        })()}
      </div>
      <div className="flex shrink-0 flex-col border-l border-border pl-6">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Active connections
        </div>
        <div className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
          {isProxy &&
            agentNodes.map((n) => {
              const d = n.data as Record<string, unknown>;
              const lbl = String(d?.label ?? n.id);
              const sub = d?.sublabel != null ? String(d.sublabel) : "";
              return (
                <div key={n.id}>
                  <span className={accentClass}>→</span> {lbl}
                  {sub && <span className="ml-1 text-muted-foreground/80">· {sub}</span>}
                </div>
              );
            })}
          {isProxy &&
            toolNodes.map((n) => {
              const d = n.data as Record<string, unknown>;
              const lbl = String(d?.label ?? n.id);
              const sub = d?.sublabel != null ? String(d.sublabel) : "";
              return (
                <div key={n.id}>
                  <span className={accentClass}>→</span> {lbl}
                  {sub && <span className="ml-1 text-muted-foreground/80">· {sub}</span>}
                </div>
              );
            })}
          {isAgent &&
            connectedToolsForAgent.map((n) => {
              const d = n.data as Record<string, unknown>;
              const lbl = String(d?.label ?? n.id);
              const sub = d?.sublabel != null ? String(d.sublabel) : "";
              return (
                <div key={n.id}>
                  <span className={accentClass}>→</span> {lbl}
                  {sub && <span className="ml-1 text-muted-foreground/80">· {sub}</span>}
                </div>
              );
            })}
          {isTool &&
            connectedAgentsForTool.map((name, i) => (
              <div key={i}>
                <span className={accentClass}>→</span> {name}
              </div>
            ))}
          {((isAgent && connectedToolsForAgent.length === 0) ||
            (isTool && connectedAgentsForTool.length === 0)) && (
            <span className="italic text-muted-foreground/80">None</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────
export function TopologyView() {
  const [info, setInfo] = useState<DashboardConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const servers = useMemo(() => getRemoteMcps(info ?? null), [info]);
  const clients = useMemo(() => info?.clients ?? [], [info]);
  const connections = useMemo(() => getConnections(info ?? null), [info]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const connectedToolIdsForSelectedAgent = useMemo(() => {
    if (!selectedNodeId || selectedNodeId === PROXY_ID || selectedNodeId.startsWith("tool-"))
      return null;
    return getConnectedToolIdsForAgent(selectedNodeId, connections);
  }, [selectedNodeId, connections]);

  const connectedAgentIdsForSelectedTool = useMemo(() => {
    if (!selectedNodeId || !selectedNodeId.startsWith("tool-")) return null;
    return getConnectedAgentIdsForTool(selectedNodeId, connections);
  }, [selectedNodeId, connections]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildTopology(clients, servers),
    [clients, servers]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    // onSelectionChange receives only selected nodes
    const id = selectedNodes[0]?.id ?? null;
    setSelectedNodeId(id);
  }, []);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const allToolIds = useMemo(
    () => new Set(initialNodes.filter((n) => n.type === "tool").map((n) => n.id)),
    [initialNodes]
  );
  const allAgentIds = useMemo(
    () => new Set(initialNodes.filter((n) => n.type === "agent").map((n) => n.id)),
    [initialNodes]
  );

  const highlightedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedNodeId) return set;
    if (selectedNodeId === PROXY_ID) {
      initialNodes.forEach((n) => set.add(n.id));
      return set;
    }
    set.add(PROXY_ID);
    if (selectedNodeId.startsWith("tool-")) {
      const agentIds =
        connectedAgentIdsForSelectedTool?.size
          ? connectedAgentIdsForSelectedTool
          : allAgentIds;
      agentIds.forEach((id) => set.add(id));
      return set;
    }
    const toolIds =
      connectedToolIdsForSelectedAgent?.size ? connectedToolIdsForSelectedAgent : allToolIds;
    toolIds.forEach((id) => set.add(id));
    return set;
  }, [
    selectedNodeId,
    initialNodes,
    allAgentIds,
    allToolIds,
    connectedToolIdsForSelectedAgent,
    connectedAgentIdsForSelectedTool,
  ]);

  // When selection changes, mark edges (highlighted + color) and nodes (connectionHighlight)
  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        const highlighted = isEdgeHighlighted(
          e,
          selectedNodeId,
          connectedToolIdsForSelectedAgent,
          connectedAgentIdsForSelectedTool,
          allToolIds,
          allAgentIds
        );
        return {
          ...e,
          data: {
            ...(e.data ?? {}),
            highlighted,
            highlightColor: highlighted ? getHighlightStroke(e) : undefined,
          },
        };
      })
    );
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...(n.data ?? {}), connectionHighlight: highlightedNodeIds.has(n.id) },
      }))
    );
  }, [
    selectedNodeId,
    connectedToolIdsForSelectedAgent,
    connectedAgentIdsForSelectedTool,
    allToolIds,
    allAgentIds,
    highlightedNodeIds,
    setEdges,
    setNodes,
  ]);

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

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: "var(--color-border)" },
      type: "animated" as const,
    }),
    []
  );

  const noAgents = clients.length === 0;

  if (loading) {
    return (
      <Card className="p-8 animate-pulse border-border bg-card">
        <div className="h-6 bg-muted rounded w-1/3 mb-6" />
        <div className="space-y-4">
          <div className="h-64 bg-muted/50 rounded-lg" />
        </div>
      </Card>
    );
  }

  if (error || !info) {
    return (
      <Card className="p-4 border-destructive/30 bg-destructive/5">
        <div className="font-medium text-sm text-foreground">Unable to reach Guardio</div>
        <div className="text-xs text-muted-foreground mt-1">
          Ensure Guardio is running (e.g. {getGuardioConnectionUrl()})
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border bg-card p-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">Topology: AI Agents ↔ MCP Tools</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connections between clients, Guardio proxy, and remote MCP servers. Drag nodes to rearrange.
        </p>
      </div>
      <div className="h-[420px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={handleSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="bg-background topology-react-flow"
        >
          <Background className="bg-background" gap={16} size={0.5} color="var(--color-border)" />
          {noAgents && (
            <Panel position="top-left" className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              No active AI agents. Connect a client to see it here.
            </Panel>
          )}
          <Controls
            className="topology-controls"
            showInteractive={false}
          />
          <Panel position="top-right" className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full bg-chart-1" /> AI Agent
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full bg-primary" /> Guardio Proxy
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full bg-chart-2" /> MCP Tool
            </div>
          </Panel>
        </ReactFlow>
      </div>
      <TopologyDetailPanel
        selectedNodeId={selectedNodeId}
        nodes={initialNodes}
        clients={clients}
        servers={servers}
        connections={connections}
      />
    </Card>
  );
}
