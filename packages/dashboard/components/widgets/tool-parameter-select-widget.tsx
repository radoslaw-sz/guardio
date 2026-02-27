"use client";

import type { WidgetProps } from "@rjsf/utils";
import type {
  PolicySummaryFormContext,
} from "@/components/widgets/policy-summary-widget";
import type {
  DashboardConnectionInfo,
  RemoteMcpToolInfo,
} from "@/lib/guardio-api";

function getParamNames(tool: RemoteMcpToolInfo): string[] {
  const schema = tool.inputSchema as
    | { properties?: Record<string, unknown> }
    | undefined;
  if (!schema?.properties || typeof schema.properties !== "object") return [];
  return Object.keys(schema.properties);
}

function findToolByName(
  connectionInfo: DashboardConnectionInfo | null | undefined,
  toolName: string,
): RemoteMcpToolInfo | null {
  if (!connectionInfo?.servers?.length) return null;
  for (const server of connectionInfo.servers) {
    if (!server.tools?.length) continue;
    const tool = server.tools.find((t) => t.name === toolName);
    if (tool) return tool;
  }
  return null;
}

/**
 * RJSF widget for selecting a tool parameter. Used by the deny-regex-parameter policy for
 * rules[].parameter_name. Only configurable when a tool is selected in
 * Assignment; options are loaded from that tool's inputSchema.
 */
export function ToolParameterSelectWidget(props: WidgetProps) {
  const formContext = (props.registry.formContext ??
    {}) as PolicySummaryFormContext;
  const { assignment, connectionInfo } = formContext;
  const { value, onChange, id, required, readonly } = props;
  const toolName = assignment?.toolName ?? null;

  const hasAssignment = Boolean(toolName);
  const tool = hasAssignment
    ? findToolByName(connectionInfo, toolName!)
    : null;
  const paramNames = tool ? getParamNames(tool) : [];
  const displayValue = value === undefined || value === null ? "" : String(value);

  const selectClass =
    "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-foreground disabled:opacity-50 disabled:cursor-not-allowed";

  if (!hasAssignment) {
    return (
      <div className="space-y-1">
        <select
          id={id}
          className={selectClass}
          value=""
          disabled
          aria-describedby={id ? `${id}__help` : undefined}
        >
          <option value="">Select a tool in Assignment above to choose a parameter</option>
        </select>
        <p id={id ? `${id}__help` : undefined} className="text-xs text-muted-foreground">
          Leave empty to match tool name.
        </p>
      </div>
    );
  }

  if (tool === null) {
    return (
      <div className="space-y-1">
        <select
          id={id}
          className={selectClass}
          value=""
          disabled
          aria-describedby={id ? `${id}__help` : undefined}
        >
          <option value="">Tool not found (reconnect or refresh)</option>
        </select>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={selectClass}
      value={displayValue}
      required={required}
      readOnly={readonly}
      aria-describedby={id ? `${id}__help` : undefined}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next);
      }}
    >
      <option value="">Tool name (no parameter)</option>
      {paramNames.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
