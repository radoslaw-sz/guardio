"use client";

import { useEffect, useState } from "react";
import type { DashboardPoliciesInfo } from "@/lib/guardio-api";
import { fetchPoliciesInfo, getGuardioPoliciesUrl } from "@/lib/guardio-api";
import { Card } from "@/components/ui/card";

export function PoliciesList() {
  const [info, setInfo] = useState<DashboardPoliciesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPoliciesInfo()
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
      <div className="space-y-3">
        <Card className="h-20 p-0 animate-pulse bg-gray-100 dark:bg-gray-800" />
        <Card className="h-20 p-0 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <div className="font-medium text-sm text-amber-800 dark:text-amber-200">
          Unable to load policies
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
          Ensure Guardio is running and configured (e.g. {getGuardioPoliciesUrl()})
        </div>
      </Card>
    );
  }

  const { policies } = info;

  if (policies.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No policies configured in guardio.config.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {policies.map((policy, idx) => (
        <li key={`${policy.name}-${idx}`}>
          <Card className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">{policy.name}</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {policy.type}
              </span>
            </div>
            {policy.path != null && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                <span className="text-gray-500 dark:text-gray-500">Path: </span>
                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                  {policy.path}
                </code>
              </div>
            )}
            {policy.config != null && Object.keys(policy.config).length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Config
                </div>
                <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto border border-gray-200 dark:border-gray-800">
                  {JSON.stringify(policy.config, null, 2)}
                </pre>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
