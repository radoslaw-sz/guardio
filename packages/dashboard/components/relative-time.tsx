"use client";

import { useSyncExternalStore } from "react";

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

let clientMounted = false;
const listeners = new Set<() => void>();

function subscribeToMounted(callback: () => void) {
  if (!clientMounted) {
    queueMicrotask(() => {
      clientMounted = true;
      listeners.forEach((l) => l());
    });
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getClientMounted() {
  return clientMounted;
}

function getServerMounted() {
  return false;
}

interface RelativeTimeProps {
  date: Date | string;
  /** Shown during SSR and initial client render to avoid hydration mismatch. Default: "—" */
  fallback?: string;
}

/**
 * Renders relative time (e.g. "5m ago") only after mount to avoid hydration errors:
 * server and first client render show the same fallback, then we update to relative time.
 */
export function RelativeTime({ date, fallback = "—" }: RelativeTimeProps) {
  const mounted = useSyncExternalStore(
    subscribeToMounted,
    getClientMounted,
    getServerMounted
  );

  if (!mounted) {
    return <>{fallback}</>;
  }

  const d = typeof date === "string" ? new Date(date) : date;
  return <>{formatRelativeTime(d)}</>;
}
