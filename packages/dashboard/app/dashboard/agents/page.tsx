"use client"

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { DashboardActiveClientInfo, DashboardConnectionInfo, fetchConnectionInfo } from "@/lib/guardio-api";
import { Card } from "@/components/ui/card";

export default function AgentsPage() {
  const [info, setInfo] = useState<DashboardConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchConnectionInfo()
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clients = info?.clients ?? [];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Agents</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <Card className="h-[7rem] p-6 flex flex-col justify-center bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900 border border-violet-200/50 dark:border-violet-800/50">
              <div className="text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                Connected SSE Clients
              </div>
              <div className="text-2xl font-bold text-violet-900 dark:text-violet-50">{clients.length}</div>
            </Card>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
            <h2 className="text-lg font-semibold mb-4">Agents</h2>
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-gray-500">No connected clients.</p>
            ) : (
              <ul className="space-y-3">
                {clients.map((c: DashboardActiveClientInfo) => (
                  <li key={c.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}{c.nameGenerated ? " (auto)" : ""}</div>
                        <div className="text-xs font-mono text-gray-500">{c.id}</div>
                      </div>
                      <div className="text-xs text-gray-500">{c.serverName ?? "-"}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
