"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchPolicyInstances,
  deletePolicyInstance,
  type DashboardPolicyInstance,
  type DashboardPolicyAssignmentScope,
} from "@/lib/guardio-api";
import { Shield, Trash2 } from "lucide-react";

function summarizeAgents(assignments: DashboardPolicyAssignmentScope[] | undefined): string {
  if (!assignments?.length) return "All agents";
  const agentIds = new Set(
    assignments.map((a) => a.agentId).filter((id): id is string => id != null && id !== ""),
  );
  if (agentIds.size === 0) return "All agents";
  return agentIds.size === 1 ? "1 agent" : `${agentIds.size} agents`;
}

function summarizeTools(assignments: DashboardPolicyAssignmentScope[] | undefined): string {
  if (!assignments?.length) return "All tools";
  const toolNames = new Set(
    assignments.map((a) => a.toolName).filter((t): t is string => t != null && t !== ""),
  );
  if (toolNames.size === 0) return "All tools";
  return toolNames.size === 1 ? "1 tool" : `${toolNames.size} tools`;
}

export function PoliciesPageContent() {
  const router = useRouter();
  const [instances, setInstances] = useState<DashboardPolicyInstance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<DashboardPolicyInstance | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refetch = () => {
    setLoading(true);
    return fetchPolicyInstances()
      .then((data) => {
        setInstances(data?.instances ?? null);
        setError(data === null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  const handleConfirmDelete = async () => {
    if (!instanceToDelete) return;
    setDeletingId(instanceToDelete.id);
    try {
      await deletePolicyInstance(instanceToDelete.id);
      setInstanceToDelete(null);
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete policy");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Card className="h-20 p-0 animate-pulse bg-muted" />
        <Card className="h-20 p-0 animate-pulse bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <p className="font-medium text-sm text-amber-800 dark:text-amber-200">
          Unable to load policy instances
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
          Ensure Guardio is running and storage is configured.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refetch}>
          Retry
        </Button>
      </Card>
    );
  }

  const list = instances ?? [];
  const isEmpty = list.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      {isEmpty ? (
        <Empty className="border border-dashed rounded-xl border-muted-foreground/25 bg-muted/30 min-h-[280px]">
          <EmptyContent>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Shield className="size-4" />
              </EmptyMedia>
              <EmptyTitle>No policy instances</EmptyTitle>
              <EmptyDescription>
                Create a policy instance to control which tools agents can use. You can assign it
                globally or to specific agents and tools.
              </EmptyDescription>
            </EmptyHeader>
            <Button asChild>
              <Link href="/dashboard/policies/create">Create policy instance</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Policy instances</h3>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/policies/create">Add policy instance</Link>
            </Button>
          </div>
          <Card className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium py-3 px-4">Name</th>
                    <th className="text-left font-medium py-3 px-4">ID</th>
                    <th className="text-left font-medium py-3 px-4">Type</th>
                    <th className="text-left font-medium py-3 px-4">Agents</th>
                    <th className="text-left font-medium py-3 px-4">Tools</th>
                    <th className="w-10 py-3 px-4" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((inst) => (
                    <tr
                      key={inst.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/dashboard/policies/${inst.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/dashboard/policies/${inst.id}`);
                        }
                      }}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium text-foreground">
                          {inst.name || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <code
                          className="text-xs bg-muted px-1.5 py-0.5 rounded"
                          title={inst.id}
                        >
                          {inst.id.slice(0, 8)}…
                        </code>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{inst.pluginId}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {summarizeAgents(inst.assignments)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {summarizeTools(inst.assignments)}
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setInstanceToDelete(inst)}
                          disabled={deletingId !== null}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:pointer-events-none"
                          title="Delete policy"
                          aria-label={`Delete policy ${inst.name || inst.pluginId}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <AlertDialog
            open={instanceToDelete !== null}
            onOpenChange={(open) => {
              if (!open) setInstanceToDelete(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete policy</AlertDialogTitle>
                <AlertDialogDescription>
                  {instanceToDelete ? (
                    <>
                      Delete &quot;{instanceToDelete.name || instanceToDelete.pluginId || instanceToDelete.id.slice(0, 8)}&quot;?
                      This cannot be undone.
                    </>
                  ) : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmDelete();
                  }}
                >
                  {deletingId === instanceToDelete?.id ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
