import { useMemo } from "react";
import { StatCard } from "../components/StatCard";
import type { WorkflowDAG, WorkflowRun } from "../types";

interface DashboardPageProps {
  workflows: WorkflowDAG[];
  runs: WorkflowRun[];
  runsAvailable: boolean;
  navigate: (to: string) => void;
}

function getWorkflowStatus(
  workflowName: string,
  runs: WorkflowRun[],
): { label: string; className: string } {
  const wfRuns = runs.filter((r) => r.name === workflowName);
  if (wfRuns.length === 0) return { label: "Draft", className: "bg-[#f0ebe3] text-muted-foreground" };
  const lastRun = wfRuns[0]; // runs are sorted by created_at DESC
  if (lastRun.status === "SUCCESS") return { label: "Active", className: "bg-accent text-green-700" };
  if (lastRun.status === "ERROR") return { label: "Error", className: "bg-red-50 text-red-700" };
  return { label: "Running", className: "bg-blue-50 text-blue-700" };
}

function getWorkflowDescription(dag: WorkflowDAG): string {
  const nodeCount = dag.nodes.filter(
    (n) => n.type !== "input" && n.type !== "output",
  ).length;
  // Check if any node has a description
  const firstDesc = dag.nodes.find((n) => n.description)?.description;
  if (firstDesc) return firstDesc.slice(0, 120);
  return `${nodeCount} node${nodeCount !== 1 ? "s" : ""}`;
}

export function DashboardPage({
  workflows,
  runs,
  runsAvailable,
  navigate,
}: DashboardPageProps) {
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const runsToday = runs.filter(
      (r) => new Date(r.created_at) >= today,
    ).length;
    const completed = runs.filter(
      (r) => r.status === "SUCCESS" || r.status === "ERROR",
    );
    const successRate =
      completed.length > 0
        ? Math.round(
            (completed.filter((r) => r.status === "SUCCESS").length /
              completed.length) *
              100,
          )
        : null;
    return { runsToday, successRate };
  }, [runs]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Header */}
        <h1 className="text-3xl font-bold text-foreground font-serif">
          Workflows
        </h1>
        <p className="text-muted-foreground mt-1 mb-6">
          Manage and monitor your automation workflows
        </p>

        {/* Stats */}
        {runsAvailable && (
          <div className="flex gap-4 mb-6">
            <StatCard
              icon={
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 4h10M2 7h10M2 10h10" />
                </svg>
              }
              label="Total"
              value={workflows.length}
            />
            <StatCard
              icon={
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 1v6l3 3" />
                  <circle cx="7" cy="7" r="6" />
                </svg>
              }
              label="Runs Today"
              value={stats.runsToday}
            />
            <StatCard
              icon={
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 7.5l3 3 5-5" />
                  <circle cx="7" cy="7" r="6" />
                </svg>
              }
              label="Success Rate"
              value={
                stats.successRate !== null ? `${stats.successRate}%` : "\u2014"
              }
            />
          </div>
        )}

        {/* Workflow cards */}
        {workflows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No workflow files found.</p>
            <p className="text-xs mt-1">Create a workflow to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((w) => {
              const status = getWorkflowStatus(w.workflowName, runs);
              return (
                <button
                  key={`${w.filePath}:${w.workflowName}`}
                  onClick={() =>
                    navigate(
                      `/workflows/${encodeURIComponent(w.workflowName)}`,
                    )
                  }
                  className="bg-card rounded-xl border border-border p-5 text-left hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow cursor-pointer group"
                >
                  {/* Name + badge */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-foreground/90">
                      {w.workflowName}
                    </h3>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {getWorkflowDescription(w)}
                  </p>

                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
