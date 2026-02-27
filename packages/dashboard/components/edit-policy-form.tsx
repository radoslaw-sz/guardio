"use client";

import { useState, useEffect, type FormEvent } from "react";
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
  updatePolicyInstance,
  type DashboardPolicyInstance,
} from "@/lib/guardio-api";
import type { PolicyAssignment } from "@/components/policy-assignment-selector";
import { Button } from "@/components/ui/button";
import {
  PolicySummaryWidget,
  type PolicySummaryFormContext,
} from "@/components/widgets/policy-summary-widget";
import { ToolParameterSelectWidget } from "@/components/widgets/tool-parameter-select-widget";

const hasConfigSchema = (p: DashboardPolicyEntry) =>
  p.configSchema != null && Object.keys(p.configSchema).length > 0;

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

export interface EditPolicyFormProps {
  instance: DashboardPolicyInstance;
  assignment: PolicyAssignment;
  onSaved?: () => void;
}

export const EDIT_POLICY_FORM_ID = "edit-policy-form";

export function EditPolicyForm({
  instance,
  assignment,
  onSaved,
}: EditPolicyFormProps) {
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

  const [formData, setFormData] = useState<Record<string, unknown>>(() =>
    typeof instance.config === "object" &&
    instance.config !== null &&
    !Array.isArray(instance.config)
      ? (instance.config as Record<string, unknown>)
      : {},
  );
  const [instanceName, setInstanceName] = useState(instance.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = policies.find((p) => p.name === instance.pluginId);
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
    const rawFormData = data.formData ?? {};
    const config = hasConfig ? rawFormData : {};
    setSubmitting(true);
    setError(null);
    try {
      await updatePolicyInstance(instance.id, {
        config,
        name: instanceName.trim() || undefined,
        agentId: assignment?.agentId ?? undefined,
        toolName: assignment?.toolName ?? undefined,
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const resetToSaved = () => {
    setFormData(
      typeof instance.config === "object" &&
        instance.config !== null &&
        !Array.isArray(instance.config)
        ? (instance.config as Record<string, unknown>)
        : {},
    );
    setInstanceName(instance.name ?? "");
    setError(null);
  };

  if (loading || policies.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 mb-6">
      <h3 className="font-semibold text-sm mb-3">Edit policy instance</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Policy type cannot be changed. Update the assignment, name, and config
        below.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Policy type
          </label>
          <div className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-muted/50 dark:bg-muted/20 text-sm px-3 py-2 text-muted-foreground">
            {instance.pluginId}
          </div>
        </div>
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
        {schema && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/50 dark:bg-gray-900/50">
            <Form
              id={EDIT_POLICY_FORM_ID}
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
              <div className="mt-4 flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="outline" onClick={resetToSaved}>
                  Reset to saved
                </Button>
              </div>
            </Form>
          </div>
        )}
        {error != null && (
          <div className="text-sm text-amber-600 dark:text-amber-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
