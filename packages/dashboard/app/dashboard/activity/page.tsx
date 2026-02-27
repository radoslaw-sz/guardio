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
import { ActivityList } from "@/components/activity-list";
import { fetchEvents } from "@/lib/guardio-api";
import type { ActivityEntrySerialized } from "@/components/activity-list";

function mapEventToActivity(e: {
  eventId: string;
  timestamp: string;
  eventType: string;
  actionType?: string | null;
  agentId?: string | null;
  decision?: string | null;
  policyEvaluation?: { policyName?: string } | null;
}): ActivityEntrySerialized {
  return {
    id: e.eventId,
    timestamp: e.timestamp,
    type: e.decision === "BLOCKED" ? "denied" : "allowed",
    agent: e.agentId ?? "Unknown",
    tool: e.actionType ?? e.eventType ?? "—",
    policy: e.policyEvaluation?.policyName,
  };
}

export default async function ActivityPage() {
  const eventsInfo = await fetchEvents();
  const activitiesSerialized: ActivityEntrySerialized[] = eventsInfo?.events?.length
    ? eventsInfo.events.map(mapEventToActivity)
    : [];
  const allowedCount = activitiesSerialized.filter((a) => a.type === "allowed").length;
  const deniedCount = activitiesSerialized.length - allowedCount;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Activity</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Total Activities
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {activitiesSerialized.length}
              </div>
            </div>
            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
              <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
                Allowed
              </div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {allowedCount}
              </div>
            </div>
            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">
                Denied
              </div>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                {deniedCount}
              </div>
            </div>
          </div>

          {/* Activities list */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                All Activities
              </h2>
            </div>
            <div className="p-6">
              <ActivityList activities={activitiesSerialized} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
