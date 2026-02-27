"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { AddPolicyForm } from "@/components/add-policy-form";
import {
  PolicyAssignmentSelector,
  type PolicyAssignment,
} from "@/components/policy-assignment-selector";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const defaultAssignment: PolicyAssignment = {
  agentId: null,
  toolName: null,
};

export default function CreatePolicyPage() {
  const router = useRouter();
  const [assignment, setAssignment] = useState<PolicyAssignment>(defaultAssignment);

  const handleCreated = () => {
    router.push("/dashboard/policies");
  };

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
                  <BreadcrumbPage>Create</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <h2 className="text-lg font-semibold mb-1">Create policy instance</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Choose assignment (optional), then policy type and config. Leave agent and tool as &quot;All&quot; to apply globally.
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

            <AddPolicyForm assignment={assignment} onCreated={handleCreated} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
