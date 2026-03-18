"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchSimulationSettings } from "@/lib/guardio-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function SimulationBanner() {
  const [loading, setLoading] = useState(true);
  const [hasGlobalSimulation, setHasGlobalSimulation] = useState(false);
  const [simulatedToolsCount, setSimulatedToolsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await fetchSimulationSettings();
        if (cancelled || !settings) {
          setLoading(false);
          return;
        }

        const globalEnabled = settings.globalSimulated ?? false;
        const tools = settings.tools ?? [];
        const simulatedCount = tools.filter((t) => t.simulated).length;

        setHasGlobalSimulation(globalEnabled || simulatedCount > 0);
        setSimulatedToolsCount(simulatedCount);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !hasGlobalSimulation) {
    return null;
  }

  const message =
    simulatedToolsCount === 0
      ? "All tools are currently simulated."
      : simulatedToolsCount === 1
        ? "1 tool is currently simulated."
        : `${simulatedToolsCount} tools are currently simulated.`;

  return (
    <Card className="mb-2 flex items-center justify-between gap-3 border border-sky-200/70 bg-sky-50 px-4 py-2.5 text-xs dark:border-sky-900/70 dark:bg-sky-950/40">
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-100">
          Simulation mode enabled
        </p>
        <p className="text-[11px] text-sky-800 dark:text-sky-200">{message}</p>
      </div>
      <Button asChild size="xs" variant="outline" className="shrink-0">
        <Link href="/dashboard/simulation">Open simulation settings</Link>
      </Button>
    </Card>
  );
}

