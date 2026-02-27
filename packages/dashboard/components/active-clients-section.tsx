"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DashboardConnectionInfo } from "@/lib/guardio-api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ActiveClientsProps {
  info: DashboardConnectionInfo;
}

export function ActiveClientsSection({ info }: ActiveClientsProps) {
  const [open, setOpen] = useState(false);
  const clients = info.clients ?? [];

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden"
    >
      <CollapsibleTrigger className="group flex w-full items-start justify-between gap-2 p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
        <div>
          <h3 className="text-base font-semibold mb-1">Active clients</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            SSE clients connected to Guardio — name and id below.
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0 mt-0.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-6 pb-6 pt-0">
          {clients.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No active SSE clients.
            </p>
          ) : (
            <ul className="space-y-3">
              {clients.map((c) => (
                <li
                  key={c.id}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[75%]"
                      title={c.name}
                    >
                      {c.name}
                      {c.nameGenerated && (
                        <span className="italic"> (auto)</span>
                      )}
                    </span>
                  </div>
                  <div
                    className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate"
                    title={c.id}
                  >
                    {c.id}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
