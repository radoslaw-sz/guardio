"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
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
import { EditPolicyForm } from "@/components/edit-policy-form";
import {
  PolicyAssignmentSelector,
  type PolicyAssignment,
} from "@/components/policy-assignment-selector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPolicyInstance, type DashboardPolicyInstance } from "@/lib/guardio-api";

function assignmentFromInstance(instance: DashboardPolicyInstance | null): PolicyAssignment {
  const first = instance?.assignments?.[0];
  return {
    agentId: first?.agentId ?? null,
    toolName: first?.toolName ?? null,
  };
}

export default function EditPolicyPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [instance, setInstance] = useState<DashboardPolicyInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [assignment, setAssignment] = useState<PolicyAssignment>(assignmentFromInstance(null));

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchPolicyInstance(id)
      .then((data) => {
        if (cancelled) return;
        if (data == null) {
          setNotFound(true);
          setInstance(null);
        } else {
          setInstance(data);
          setAssignment(assignmentFromInstance(data));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSaved = () => {
    router.push("/dashboard/policies");
  };

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PageHeader breadcrumb={<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbPage>Policies</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>} />
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (notFound || !instance) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PageHeader breadcrumb={<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbPage>Policies</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>} />
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <p className="text-sm text-muted-foreground">Policy instance not found.</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/policies">Back to policies</Link>
            </Button>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const displayName = instance.name || instance.pluginId || instance.id.slice(0, 8);

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
                    <Link href="/dashboard/policies">Policies</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Edit: {displayName}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <h2 className="text-lg font-semibold mb-1">Edit policy instance</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Update assignment, name, and config. Changes apply when you save.
            </p>
            <div className="mb-4">
              <Link
                href="/dashboard/policies"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to policies
              </Link>
            </div>

            <Card className="rounded-xl border bg-card p-4 mb-6">
              <h3 className="font-semibold text-sm mb-2">Assignment</h3>
              <PolicyAssignmentSelector
                value={assignment}
                onChange={setAssignment}
                showDescription={true}
              />
            </Card>

            <EditPolicyForm
              instance={instance}
              assignment={assignment}
              onSaved={handleSaved}
            />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
