"use client";

import { useEffect, useState } from "react";
import type { DashboardConnectionInfo } from "@/lib/guardio-api";
import {
  fetchConnectionInfo,
} from "@/lib/guardio-api";
import { ActiveClientsSection } from "@/components/active-clients-section";
import { RemoteMcpsSection } from "@/components/remote-mcps-section";

export function ConnectionDetails() {
  const [info, setInfo] = useState<DashboardConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionInfo()
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

  if (loading || error || !info) {
    return null;
  }

  return (
    <>
      <ActiveClientsSection info={info} />
      <RemoteMcpsSection info={info} />
    </>
  );
}
