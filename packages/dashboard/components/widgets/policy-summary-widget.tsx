"use client";

import type { WidgetProps } from "@rjsf/utils";
import type { PolicyAssignment } from "@/components/policy-assignment-selector";
import type { DashboardConnectionInfo } from "@/lib/guardio-api";

/** Form context for the generic policy summary widget (agent + tool assignment). */
export interface PolicySummaryFormContext {
  assignment?: PolicyAssignment;
  connectionInfo?: DashboardConnectionInfo | null;
}

function getAgentLabel(
  assignment: PolicyAssignment | undefined,
  connectionInfo: DashboardConnectionInfo | null | undefined,
): string {
  if (!assignment?.agentId) return "All agents";
  const client = connectionInfo?.clients?.find((c) => c.id === assignment.agentId);
  return client?.name ?? assignment.agentId;
}

function getToolLabel(assignment: PolicyAssignment | undefined): string {
  if (!assignment?.toolName) return "All tools";
  return assignment.toolName;
}

/**
 * Generic RJSF widget for policy summary: shows agent and tool assignment.
 * Any policy can use this via getUiSchema() returning { effect: { "ui:widget": "PolicySummary", ... } }.
 */
export function PolicySummaryWidget(props: WidgetProps) {
  const formContext = (props.registry.formContext ?? {}) as PolicySummaryFormContext;
  const { assignment, connectionInfo } = formContext;
  const agentLabel = getAgentLabel(assignment, connectionInfo);
  const toolLabel = getToolLabel(assignment);

  return (
    <div
      className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
      role="status"
    >
      <p className="font-medium">
        <span className="text-amber-700 dark:text-amber-300">{agentLabel}</span>
        {" will not have access to tool "}
        <span className="text-amber-700 dark:text-amber-300">{toolLabel}</span>
        .
      </p>
    </div>
  );
}
