"use client";

import Link from "next/link";
import { CheckCircle2, XCircle, Shield } from "lucide-react";
import { RelativeTime } from "./relative-time";
import type { ActivityEntry } from "@/lib/mock-activities";

/** Activity with timestamp serialized (e.g. from server) so RelativeTime can avoid hydration issues */
export type ActivityEntrySerialized = Omit<ActivityEntry, "timestamp"> & {
  timestamp: string;
};

interface ActivityListProps {
  activities: ActivityEntrySerialized[];
}

export function ActivityList({ activities }: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No activities found.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <Link
          key={activity.id}
          href={`/dashboard/activity/${activity.id}`}
          className="block p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              {activity.type === "allowed" ? (
                <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="size-5 text-red-600 dark:text-red-400" />
              )}
            </div>

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
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-gray-600 dark:text-gray-400">
                    Agent:
                  </span>{" "}
                  <span className="font-medium">{activity.agent}</span>
                </div>

                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-gray-600 dark:text-gray-400">
                    Tool:
                  </span>{" "}
                  <code className="ml-1 px-2 py-1 rounded text-xs font-mono bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    {activity.tool}
                  </code>
                </div>

                {activity.policy && (
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-600 dark:text-gray-400">
                      Policy:
                    </span>{" "}
                    <span className="ml-1 inline-flex items-center gap-1">
                      <Shield className="size-3 text-gray-600 dark:text-gray-400" />
                      <span className="font-medium">{activity.policy}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
