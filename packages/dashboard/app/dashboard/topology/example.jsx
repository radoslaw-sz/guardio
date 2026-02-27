import { useState, useEffect, useRef, useCallback } from "react";

// ─── Theme tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0d12",
  surface: "#111520",
  surfaceHover: "#161c2e",
  border: "#1e2a42",
  borderActive: "#3b5bdb",
  agentFill: "#0f1f3d",
  agentStroke: "#3b82f6",
  agentGlow: "#3b82f640",
  proxyFill: "#1a0f3d",
  proxyStroke: "#8b5cf6",
  proxyGlow: "#8b5cf640",
  toolFill: "#0f2d1f",
  toolStroke: "#10b981",
  toolGlow: "#10b98140",
  textPrimary: "#e2e8f0",
  textSecondary: "#64748b",
  textMuted: "#334155",
  edgeAgent: "#3b82f6",
  edgeTool: "#10b981",
  dot: "#f1f5f9",
};

// ─── Data ──────────────────────────────────────────────────────────────────────
const AGENTS = [
  { id: "agent-1", label: "AI Agent", sublabel: "GPT-4o", icon: "🤖" },
  { id: "agent-2", label: "AI Agent", sublabel: "Claude 3.5", icon: "🧠" },
  { id: "agent-3", label: "AI Agent", sublabel: "Gemini Pro", icon: "✨" },
];

const TOOLS = [
  { id: "tool-1", label: "File System", sublabel: "read / write", icon: "📁" },
  { id: "tool-2", label: "Web Search", sublabel: "Brave API", icon: "🔍" },
  { id: "tool-3", label: "Database", sublabel: "Postgres MCP", icon: "🗄️" },
  { id: "tool-4", label: "Code Exec", sublabel: "Sandbox", icon: "⚡" },
];

const PROXY = { id: "proxy", label: "Guardio", sublabel: "MCP Proxy", icon: "🛡️" };

// ─── Layout math ───────────────────────────────────────────────────────────────
function computeLayout(w, h) {
  const cx = w / 2, cy = h / 2;
  const agentX = cx - 260, toolX = cx + 260;
  const agents = AGENTS.map((a, i) => {
    const total = AGENTS.length;
    const step = Math.min(100, (h * 0.55) / total);
    const y = cy + (i - (total - 1) / 2) * step;
    return { ...a, x: agentX, y };
  });
  const tools = TOOLS.map((t, i) => {
    const total = TOOLS.length;
    const step = Math.min(90, (h * 0.6) / total);
    const y = cy + (i - (total - 1) / 2) * step;
    return { ...t, x: toolX, y };
  });
  return { agents, tools, proxy: { ...PROXY, x: cx, y: cy } };
}

// ─── Animated SVG edge ────────────────────────────────────────────────────────
function AnimatedEdge({ x1, y1, x2, y2, color, active, animDir = 1, delay = 0 }) {
  const id = `grad-${Math.abs(x1 + y1 + x2 + y2) | 0}`;
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const path = `M${x1},${y1} C${mid.x},${y1} ${mid.x},${y2} ${x2},${y2}`;

  return (
    <g>
      {/* Base line */}
      <path d={path} fill="none" stroke={color} strokeWidth={active ? 2 : 1.2}
        strokeOpacity={active ? 0.7 : 0.25} />
      {/* Animated dot */}
      {active && (
        <circle r="4" fill={color} opacity="0.9">
          <animateMotion dur={`${1.6 + delay * 0.3}s`} repeatCount="indefinite"
            path={animDir === 1 ? path : path.split("").reverse().join("")}>
          </animateMotion>
        </circle>
      )}
    </g>
  );
}

// ─── Node card ────────────────────────────────────────────────────────────────
function NodeCard({ node, type, active, onClick, x, y }) {
  const [hovered, setHovered] = useState(false);
  const W = type === "proxy" ? 120 : 110;
  const H = type === "proxy" ? 80 : 64;
  const colors = {
    agent: { fill: C.agentFill, stroke: C.agentStroke, glow: C.agentGlow },
    proxy: { fill: C.proxyFill, stroke: C.proxyStroke, glow: C.proxyGlow },
    tool: { fill: C.toolFill, stroke: C.toolStroke, glow: C.toolGlow },
  }[type];

  const highlighted = active || hovered;

  return (
    <g transform={`translate(${x - W / 2},${y - H / 2})`}
      style={{ cursor: "pointer" }}
      onClick={() => onClick(node)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {/* Glow */}
      {highlighted && (
        <rect x={-6} y={-6} width={W + 12} height={H + 12} rx={14}
          fill={colors.glow} />
      )}
      {/* Card body */}
      <rect x={0} y={0} width={W} height={H} rx={10}
        fill={highlighted ? colors.fill : "#0c1118"}
        stroke={highlighted ? colors.stroke : C.border}
        strokeWidth={highlighted ? 1.5 : 1}
        style={{ transition: "all 0.2s" }} />
      {/* Icon */}
      <text x={W / 2} y={type === "proxy" ? 28 : 22} textAnchor="middle"
        fontSize={type === "proxy" ? 22 : 18}>{node.icon}</text>
      {/* Label */}
      <text x={W / 2} y={type === "proxy" ? 50 : 40} textAnchor="middle"
        fill={C.textPrimary} fontSize={type === "proxy" ? 12 : 11}
        fontFamily="'DM Mono', monospace" fontWeight="600">{node.label}</text>
      {/* Sublabel */}
      <text x={W / 2} y={type === "proxy" ? 64 : 52} textAnchor="middle"
        fill={colors.stroke} fontSize={9} fontFamily="monospace"
        opacity="0.8">{node.sublabel}</text>
      {/* Active indicator */}
      {active && <circle cx={W - 10} cy={10} r={4} fill={colors.stroke}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
      </circle>}
    </g>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────
function DetailPanel({ selected, layout }) {
  if (!selected) return (
    <div style={{
      padding: "20px 24px", borderTop: `1px solid ${C.border}`,
      background: C.surface, color: C.textSecondary,
      fontSize: 13, fontFamily: "monospace", minHeight: 80,
      display: "flex", alignItems: "center", gap: 8
    }}>
      <span style={{ opacity: 0.4 }}>◈</span>
      Click any node to inspect its connections
    </div>
  );

  const isProxy = selected.id === "proxy";
  const isAgent = selected.id.startsWith("agent");
  const isTool = selected.id.startsWith("tool");

  const connections = isProxy
    ? { from: AGENTS.map(a => a.label + " (" + a.sublabel + ")"), to: TOOLS.map(t => t.label + " (" + t.sublabel + ")") }
    : isAgent
      ? { from: [selected.label + " → Guardio"], to: TOOLS.map(t => "↳ " + t.label) }
      : { from: AGENTS.map(a => a.label + " → Guardio →"), to: [selected.label] };

  const colors = isProxy ? C.proxyStroke : isAgent ? C.agentStroke : C.toolStroke;

  return (
    <div style={{
      padding: "16px 24px", borderTop: `1px solid ${C.border}`,
      background: C.surface, minHeight: 80, display: "flex", gap: 32
    }}>
      <div>
        <div style={{ color: colors, fontSize: 11, fontFamily: "monospace",
          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          {selected.icon} {selected.label}
        </div>
        <div style={{ color: C.textSecondary, fontSize: 12, fontFamily: "monospace" }}>
          {isProxy && <span>Intercepts all Agent↔Tool traffic • Applies policy • Logs calls</span>}
          {isAgent && <span>Sends MCP tool calls through Guardio proxy</span>}
          {isTool && <span>Receives filtered requests from Guardio</span>}
        </div>
      </div>
      <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 24 }}>
        <div style={{ color: C.textMuted, fontSize: 10, fontFamily: "monospace",
          textTransform: "uppercase", marginBottom: 6 }}>Active connections</div>
        {(isProxy ? AGENTS : isAgent ? TOOLS : AGENTS).map((n, i) => (
          <div key={i} style={{ color: C.textSecondary, fontSize: 11,
            fontFamily: "monospace", lineHeight: "1.8" }}>
            <span style={{ color: colors }}>→</span> {n.label}
            <span style={{ color: C.textMuted }}> · {n.sublabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: C.agentStroke, label: "AI Agent" },
    { color: C.proxyStroke, label: "Guardio Proxy" },
    { color: C.toolStroke, label: "MCP Tool" },
  ];
  return (
    <div style={{
      position: "absolute", top: 16, right: 16, display: "flex", flexDirection: "column",
      gap: 6, background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 14px"
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <span style={{ color: C.textSecondary, fontSize: 11, fontFamily: "monospace" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function GuardioTopology() {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 420 });
  const [selected, setSelected] = useState(null);
  const [animated, setAnimated] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const { agents, tools, proxy } = computeLayout(dims.w, dims.h);

  const isActive = (id) => {
    if (!selected) return false;
    if (selected.id === id) return true;
    if (selected.id === "proxy") return true;
    if (selected.id.startsWith("agent") && id.startsWith("tool")) return true;
    if (selected.id.startsWith("agent") && id === "proxy") return true;
    if (selected.id.startsWith("tool") && id === "proxy") return true;
    if (selected.id.startsWith("tool") && id.startsWith("agent")) return true;
    return false;
  };

  const handleClick = (node) => {
    setSelected(prev => prev?.id === node.id ? null : node);
  };

  // Grid dots background
  const dots = [];
  const spacing = 28;
  for (let x = spacing; x < dims.w; x += spacing) {
    for (let y = spacing; y < dims.h; y += spacing) {
      dots.push(`${x},${y}`);
    }
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
      flexDirection: "column", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
        background: C.surface, display: "flex", alignItems: "center",
        justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%",
            background: C.proxyStroke, boxShadow: `0 0 8px ${C.proxyStroke}` }}>
            <div style={{}} />
          </div>
          <span style={{ color: C.textPrimary, fontSize: 14, fontWeight: 700,
            letterSpacing: "0.05em" }}>GUARDIO · TOPOLOGY VIEW</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setAnimated(p => !p)}
            style={{
              background: animated ? `${C.proxyStroke}20` : "transparent",
              border: `1px solid ${animated ? C.proxyStroke : C.border}`,
              color: animated ? C.proxyStroke : C.textSecondary,
              borderRadius: 6, padding: "4px 12px", fontSize: 11,
              cursor: "pointer", fontFamily: "monospace"
            }}>
            {animated ? "● LIVE" : "○ PAUSED"}
          </button>
          <button
            onClick={() => setSelected(null)}
            style={{
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.textSecondary, borderRadius: 6, padding: "4px 12px",
              fontSize: 11, cursor: "pointer", fontFamily: "monospace"
            }}>
            RESET
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, position: "relative",
        minHeight: 380, overflow: "hidden" }}>
        <svg width={dims.w} height={dims.h} style={{ display: "block" }}>
          {/* Dot grid */}
          <g opacity="0.12">
            {dots.map(d => {
              const [x, y] = d.split(",");
              return <circle key={d} cx={x} cy={y} r={1} fill={C.dot} />;
            })}
          </g>

          {/* Column labels */}
          <text x={agents[0]?.x} y={32} textAnchor="middle"
            fill={C.agentStroke} fontSize={10} fontFamily="monospace"
            opacity="0.6" letterSpacing="0.1em">AI AGENTS</text>
          <text x={proxy.x} y={32} textAnchor="middle"
            fill={C.proxyStroke} fontSize={10} fontFamily="monospace"
            opacity="0.6" letterSpacing="0.1em">PROXY</text>
          <text x={tools[0]?.x} y={32} textAnchor="middle"
            fill={C.toolStroke} fontSize={10} fontFamily="monospace"
            opacity="0.6" letterSpacing="0.1em">MCP TOOLS</text>

          {/* Agent → Proxy edges */}
          {agents.map((a, i) => (
            <AnimatedEdge key={a.id}
              x1={a.x + 55} y1={a.y}
              x2={proxy.x - 60} y2={proxy.y}
              color={C.edgeAgent}
              active={animated && isActive(a.id)}
              animDir={1} delay={i} />
          ))}

          {/* Proxy → Tool edges */}
          {tools.map((t, i) => (
            <AnimatedEdge key={t.id}
              x1={proxy.x + 60} y1={proxy.y}
              x2={t.x - 55} y2={t.y}
              color={C.edgeTool}
              active={animated && isActive(t.id)}
              animDir={1} delay={i} />
          ))}

          {/* Agent nodes */}
          {agents.map(a => (
            <NodeCard key={a.id} node={a} type="agent"
              active={isActive(a.id)}
              onClick={handleClick}
              x={a.x} y={a.y} />
          ))}

          {/* Tool nodes */}
          {tools.map(t => (
            <NodeCard key={t.id} node={t} type="tool"
              active={isActive(t.id)}
              onClick={handleClick}
              x={t.x} y={t.y} />
          ))}

          {/* Proxy node (rendered last = on top) */}
          <NodeCard node={proxy} type="proxy"
            active={isActive("proxy")}
            onClick={handleClick}
            x={proxy.x} y={proxy.y} />

          {/* Flow label */}
          <text x={proxy.x} y={dims.h - 16} textAnchor="middle"
            fill={C.textMuted} fontSize={10} fontFamily="monospace">
            All Agent↔Tool traffic routes through Guardio
          </text>
        </svg>

        <Legend />
      </div>

      {/* Detail panel */}
      <DetailPanel selected={selected} layout={{ agents, tools, proxy }} />
    </div>
  );
}
