"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FormProps } from "@rjsf/core";
import Form from "@rjsf/shadcn";
import validator from "@rjsf/validator-ajv8";
import type {
  DashboardConnectionInfo,
  DashboardPolicyEntry,
} from "@/lib/guardio-api";
import {
  fetchPoliciesInfo,
  fetchConnectionInfo,
  createPolicyInstance,
  type CreatePolicyInstanceResult,
} from "@/lib/guardio-api";
import type { PolicyAssignment } from "@/components/policy-assignment-selector";
import { Button } from "@/components/ui/button";
import {
  PolicySummaryWidget,
  type PolicySummaryFormContext,
} from "@/components/widgets/policy-summary-widget";
import { ToolParameterSelectWidget } from "@/components/widgets/tool-parameter-select-widget";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ShieldPlus } from "lucide-react";

/** Policies that have a non-empty config schema (show normal RJSF config form). */
const hasConfigSchema = (p: DashboardPolicyEntry) =>
  p.configSchema != null && Object.keys(p.configSchema).length > 0;

/** Synthetic schema when a policy has uiSchema but no config (single "effect" field for summary widget). */
const SUMMARY_EFFECT_SCHEMA = {
  type: "object",
  properties: {
    effect: {
      type: "string",
      title: "Effect",
      readOnly: true,
    },
  },
} as const;

export interface AddPolicyFormProps {
  /** Called after a policy instance is successfully created (e.g. to refetch the list). */
  onCreated?: () => void;
  /** When true, form is embedded in a dialog; use this formId on the external submit button (form attribute). */
  formId?: string;
  /** When true, render submit/reset buttons inside the form. When false (e.g. in dialog), omit them for external footer. */
  showActions?: boolean;
  /** Optional assignment: agent and/or tool. When omitted, policy is created with global assignment. */
  assignment?: PolicyAssignment;
}

/** Form id used when form is in a dialog; use for footer submit button's form attribute. */
export const ADD_POLICY_FORM_ID = "add-policy-form";
const DEFAULT_FORM_ID = ADD_POLICY_FORM_ID;

export function AddPolicyForm({
  onCreated,
  formId = DEFAULT_FORM_ID,
  showActions = true,
  assignment,
}: AddPolicyFormProps) {
  const [policies, setPolicies] = useState<DashboardPolicyEntry[]>([]);
  const [connectionInfo, setConnectionInfo] =
    useState<DashboardConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPoliciesInfo()
      .then((info) => {
        if (!cancelled && info?.policies) setPolicies(info.policies);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionInfo()
      .then((info) => {
        if (!cancelled) setConnectionInfo(info);
      })
      .catch(() => {
        if (!cancelled) setConnectionInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedName, setSelectedName] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<CreatePolicyInstanceResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [instanceName, setInstanceName] = useState("");

  const selected = policies.find((p) => p.name === selectedName);
  const hasConfig = selected ? hasConfigSchema(selected) : false;
  const schema = hasConfig
    ? (selected?.configSchema as object)
    : selected
      ? SUMMARY_EFFECT_SCHEMA
      : undefined;
  const uiSchema = selected?.uiSchema ?? undefined;
  const formContext: PolicySummaryFormContext | undefined =
    selected?.uiSchema != null ? { assignment, connectionInfo } : undefined;

  const handleSubmit = async (
    data: { formData?: Record<string, unknown> },
    _event: FormEvent,
  ) => {
    if (!selectedName) return;
    const rawFormData = data.formData ?? {};
    const config = hasConfig ? rawFormData : {};
    setSubmitting(true);
    setResult(null);
    try {
      const res = await createPolicyInstance({
        pluginName: selectedName,
        config,
        name: instanceName.trim() || undefined,
        agentId: assignment?.agentId ?? undefined,
        toolName: assignment?.toolName ?? undefined,
      });
      setResult(res);
      if ("id" in res) {
        setFormData({});
        setInstanceName("");
        onCreated?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  if (policies.length === 0) {
    return (
      <Empty className="border border-dashed rounded-xl border-muted-foreground/25 bg-muted/30 min-h-[280px]">
        <EmptyContent>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldPlus className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No policy plugins configured</EmptyTitle>
            <EmptyDescription>
              Add policy plugins in your Guardio config to create policy instances. Once configured, you can create and assign policies from this page.
            </EmptyDescription>
          </EmptyHeader>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div
      className={
        showActions
          ? "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 mb-6"
          : "space-y-4"
      }
    >
      {showActions && (
        <>
          <h3 className="font-semibold text-sm mb-3">Add policy instance</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Choose a policy type and fill the config. The instance can then be
            assigned to agents or tools.
          </p>
        </>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Policy type
          </label>
          <select
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2"
            value={selectedName}
            onChange={(e) => {
              setSelectedName(e.target.value);
              setFormData({});
              setResult(null);
            }}
          >
            <option value="">Select...</option>
            {policies.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {selectedName && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Instance name (optional)
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2"
              placeholder="e.g. Block weather in EU"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
          </div>
        )}
        {schema && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-900/50">
            <Form
              id={formId}
              schema={schema}
              uiSchema={uiSchema as FormProps["uiSchema"]}
              validator={validator}
              formData={formData}
              formContext={formContext}
              widgets={{
                PolicySummary: PolicySummaryWidget,
                ToolParameterSelect: ToolParameterSelectWidget,
              }}
              onChange={({ formData: fd }) =>
                setFormData((fd as Record<string, unknown>) ?? {})
              }
              onSubmit={handleSubmit}
              showErrorList="top"
              liveValidate
              className="add-policy-rjsf"
            >
              {showActions && (
                <div className="mt-4 flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating…" : "Create policy instance"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFormData({});
                      setResult(null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </Form>
          </div>
        )}
        {result != null && (
          <div
            className={
              "error" in result
                ? "text-sm text-amber-600 dark:text-amber-400"
                : "text-sm text-green-600 dark:text-green-400"
            }
          >
            {"error" in result
              ? result.error
              : `Created policy instance: ${result.id}`}
          </div>
        )}
      </div>
    </div>
  );
}
