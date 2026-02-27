"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, CheckCircle2, XCircle, Shield } from "lucide-react";
import { fetchEvents } from "@/lib/guardio-api";
import { RelativeTime } from "./relative-time";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: "allowed" | "denied";
  agent: string;
  tool: string;
  policy?: string;
}

function mapEventToActivity(e: {
  eventId: string;
  timestamp: string;
  eventType: string;
  actionType?: string | null;
  agentId?: string | null;
  decision?: string | null;
  policyEvaluation?: { policyName?: string } | null;
}): ActivityEntry {
  return {
    id: e.eventId,
    timestamp: e.timestamp,
    type: e.decision === "BLOCKED" ? "denied" : "allowed",
    agent: e.agentId ?? "Unknown",
    tool: e.actionType ?? e.eventType ?? "—",
    policy: e.policyEvaluation?.policyName,
  };
}

export function RecentActivity() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEvents()
      .then((info) => {
        if (cancelled || !info?.events?.length) {
          if (!cancelled) setActivities([]);
          return;
        }
        setActivities(info.events.map(mapEventToActivity));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedCount = activities.filter((a) => a.type === "allowed").length;
  const recentFive = activities.slice(0, 5);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold mb-1">Recent Activity</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {loading
                ? "Loading…"
                : `${allowedCount} allowed, ${activities.length - allowedCount} denied recently`}
            </p>
          </div>
          <Link
            href="/dashboard/activity"
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            title="View all activities"
          >
            All
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading activity…
          </p>
        ) : recentFive.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No recent activity.
          </p>
        ) : (
          <ul className="space-y-3">
            {recentFive.map((activity) => (
              <li key={activity.id}>
                <Link
                  href={`/dashboard/activity/${activity.id}`}
                  className="block p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                >
                <div className="flex items-start gap-3">
                  {/* Icon indicator */}
                  <div className="shrink-0 mt-0.5">
                    {activity.type === "allowed" ? (
                      <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="size-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>

                  {/* Activity details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {activity.type === "allowed" ? "Allowed" : "Denied"}{" "}
                        <span className="text-gray-700 dark:text-gray-300">
                          agent
                        </span>
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        <RelativeTime date={activity.timestamp} />
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {/* Agent */}
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="text-gray-600 dark:text-gray-400">
                          Agent:
                        </span>{" "}
                        <span className="font-medium">{activity.agent}</span>
                      </div>

                      {/* Tool */}
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="text-gray-600 dark:text-gray-400">
                          Tool:
                        </span>{" "}
                        <code className="ml-1 px-2 py-1 rounded text-xs font-mono bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                          {activity.tool}
                        </code>
                      </div>

                      {/* Policy */}
                      {activity.policy && (
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="text-gray-600 dark:text-gray-400">
                            Policy:
                          </span>{" "}
                          <span className="ml-1 inline-flex items-center gap-1">
                            <Shield className="size-3 text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">
                              {activity.policy}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
