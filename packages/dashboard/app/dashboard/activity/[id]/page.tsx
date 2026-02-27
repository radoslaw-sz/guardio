import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchEvent } from "@/lib/guardio-api";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Shield,
  Calendar,
  Fingerprint,
  Bot,
  Wrench,
  FileText,
} from "lucide-react";

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) notFound();

  const decision = event.decision ?? "—";
  const isDenied = event.decision === "BLOCKED";
  const policy = event.policyEvaluation;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard/activity">Activity</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Event {event.eventId.slice(0, 8)}…</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/activity" className="gap-1">
                <ArrowLeft className="size-4" />
                Back to Activity
              </Link>
            </Button>
          </div>

          <Card className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {isDenied ? (
                  <XCircle className="size-8 text-red-600 dark:text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="size-8 text-green-600 dark:text-green-400 shrink-0" />
                )}
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {isDenied ? "Denied" : "Allowed"}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatTimestamp(event.timestamp)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <section>
                <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <Fingerprint className="size-4" />
                  Event details
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Event ID</dt>
                    <dd className="mt-0.5 font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
                      {event.eventId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Timestamp</dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      {formatTimestamp(event.timestamp)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Event type</dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                      {event.eventType || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Decision</dt>
                    <dd className="mt-0.5 text-sm">
                      <span
                        className={
                          isDenied
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : "text-green-600 dark:text-green-400 font-medium"
                        }
                      >
                        {decision}
                      </span>
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                  <Bot className="size-4" />
                  Agent &amp; tool
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Agent ID</dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {event.agentId ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Action / Tool</dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1">
                      <Wrench className="size-3.5" />
                      <code className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs">
                        {event.actionType ?? event.eventType ?? "—"}
                      </code>
                    </dd>
                  </div>
                </dl>
              </section>

              {policy && (
                <section>
                  <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                    <Shield className="size-4" />
                    Policy evaluation
                  </h2>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {policy.policyName != null && (
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">Policy name</dt>
                        <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 font-medium">
                          {policy.policyName}
                        </dd>
                      </div>
                    )}
                    {policy.code != null && (
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">Code</dt>
                        <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 font-mono">
                          {policy.code}
                        </dd>
                      </div>
                    )}
                    {policy.reason != null && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <FileText className="size-3.5" />
                          Reason
                        </dt>
                        <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                          {policy.reason}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}
            </div>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
