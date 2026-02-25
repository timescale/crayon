import { useState, useCallback } from "react";
import type { WorkflowRun, TraceResult, OperationTrace } from "../types";

interface RunHistoryTabProps {
  runs: WorkflowRun[];
  loading: boolean;
  selectedRunId: string | null;
  trace: TraceResult | null;
  traceLoading: boolean;
  selectRun: (runId: string | null) => void;
  refresh: () => void;
}

const runStatusConfig: Record<
  string,
  { bg: string; text: string; label: string; pulse?: boolean }
> = {
  SUCCESS: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Success" },
  ERROR: { bg: "bg-red-50", text: "text-red-700", label: "Failed" },
  PENDING: { bg: "bg-blue-50", text: "text-blue-700", label: "Running", pulse: true },
  RETRIES_EXCEEDED: { bg: "bg-red-50", text: "text-red-700", label: "Retries Exceeded" },
};

/* ---- SVG Icon Components ---- */

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function CircleDashedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.1 2.18a9.93 9.93 0 0 1 3.8 0" />
      <path d="M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7" />
      <path d="M21.82 10.1a9.93 9.93 0 0 1 0 3.8" />
      <path d="M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69" />
      <path d="M13.9 21.82a9.94 9.94 0 0 1-3.8 0" />
      <path d="M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7" />
      <path d="M2.18 13.9a9.93 9.93 0 0 1 0-3.8" />
      <path d="M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69" />
    </svg>
  );
}

const statusIcons: Record<string, { Icon: typeof CheckCircleIcon; className: string }> = {
  SUCCESS: { Icon: CheckCircleIcon, className: "text-emerald-500" },
  ERROR: { Icon: XCircleIcon, className: "text-red-500" },
  PENDING: { Icon: SpinnerIcon, className: "text-blue-500 animate-spin" },
  RETRIES_EXCEEDED: { Icon: XCircleIcon, className: "text-red-500" },
};

export function RunHistoryTab({
  runs,
  loading,
  selectedRunId,
  trace,
  traceLoading,
  selectRun,
  refresh,
}: RunHistoryTabProps) {
  if (loading && runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#a8a099] text-sm">
        Loading runs...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center text-center px-6">
          <div className="w-10 h-10 rounded-lg bg-[#f0ece7] flex items-center justify-center mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a8a099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="text-[13px] text-[#1a1a1a] font-medium">No runs yet</p>
          <p className="text-[11px] text-[#a8a099] mt-1 leading-relaxed max-w-[220px]">
            Run your workflow to see execution history with status and trace details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium">
            {runs.length} run{runs.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={refresh}
            className="text-[11px] text-[#a8a099] hover:text-[#1a1a1a] cursor-pointer transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Run list */}
        <div className="space-y-1.5">
          {runs.map((run) => (
            <RunCard
              key={run.workflow_uuid}
              run={run}
              isExpanded={selectedRunId === run.workflow_uuid}
              trace={selectedRunId === run.workflow_uuid ? trace : null}
              traceLoading={selectedRunId === run.workflow_uuid && traceLoading}
              onToggle={() =>
                selectRun(selectedRunId === run.workflow_uuid ? null : run.workflow_uuid)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- RunCard ----

function RunCard({
  run,
  isExpanded,
  trace,
  traceLoading,
  onToggle,
}: {
  run: WorkflowRun;
  isExpanded: boolean;
  trace: TraceResult | null;
  traceLoading: boolean;
  onToggle: () => void;
}) {
  const statusCfg = runStatusConfig[run.status] ?? {
    bg: "bg-[#f0ece7]",
    text: "text-[#787068]",
    label: run.status,
  };
  const duration = trace?.workflow?.duration_ms;
  const createdAt = parseTimestamp(run.created_at);

  return (
    <div
      className={`rounded-lg border transition-colors bg-white ${
        run.status === "PENDING" ? "border-blue-200" : "border-[#e8e4df]"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[#a8a099] shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#a8a099] shrink-0" />
        )}

        {/* Status badge */}
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusCfg.bg} ${statusCfg.text} ${
            statusCfg.pulse ? "animate-pulse" : ""
          }`}
        >
          {statusCfg.label}
        </span>

        <div className="flex-1" />

        {/* Duration */}
        {duration != null && (
          <span className="text-[11px] font-mono text-[#a8a099] shrink-0">
            {formatDuration(duration)}
          </span>
        )}

        {/* Relative time */}
        <span className="text-[11px] text-[#a8a099] shrink-0">
          {formatRelativeTime(createdAt)}
        </span>
      </button>

      {/* Expanded trace */}
      {isExpanded && (
        <div className="border-t border-[#e8e4df] px-3 py-2.5">
          {traceLoading ? (
            <p className="text-[11px] text-[#a8a099] text-center py-3">
              Loading trace...
            </p>
          ) : trace && trace.operations.length > 0 ? (
            <TraceTree operations={trace.operations} rootWorkflowId={run.workflow_uuid} />
          ) : (
            <p className="text-[11px] text-[#a8a099] text-center py-3 italic">
              No operations recorded.
            </p>
          )}

          {/* Error */}
          {run.error && (
            <div className="mt-2 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-red-500 font-medium">Error</span>
              <pre className="text-[10px] font-mono text-red-600 bg-red-50 rounded p-1.5 whitespace-pre-wrap break-all">
                {run.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- TraceTree ----

function TraceTree({
  operations,
  rootWorkflowId,
}: {
  operations: OperationTrace[];
  rootWorkflowId: string;
}) {
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set());

  const toggleOp = useCallback((key: string) => {
    setExpandedOps((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Group operations by parent workflow
  const byWorkflow = new Map<string, OperationTrace[]>();
  for (const op of operations) {
    const list = byWorkflow.get(op.workflow_uuid) ?? [];
    list.push(op);
    byWorkflow.set(op.workflow_uuid, list);
  }

  const mainOps = byWorkflow.get(rootWorkflowId) ?? [];

  // Find child workflows with DBOS.getResult to avoid showing duplicate start ops
  const childWorkflowsWithGetResult = new Set<string>();
  for (const op of mainOps) {
    if (op.function_name === "DBOS.getResult" && op.child_workflow_id) {
      childWorkflowsWithGetResult.add(op.child_workflow_id);
    }
  }

  const filteredOps = mainOps.filter((op) => {
    if (!op.child_workflow_id) return true;
    if (op.function_name === "DBOS.getResult") return true;
    if (childWorkflowsWithGetResult.has(op.child_workflow_id)) return false;
    return true;
  });

  return (
    <div className="space-y-1">
      {filteredOps.map((op) => {
        // For DBOS.getResult with child workflow, show the child workflow name instead
        let displayName = op.function_name;
        if (op.function_name === "DBOS.getResult" && op.child_workflow_id) {
          const startOp = mainOps.find(
            (o) =>
              o.child_workflow_id === op.child_workflow_id &&
              o.function_name !== "DBOS.getResult",
          );
          if (startOp) displayName = startOp.function_name;
        }

        const hasDetail = !!(op.output_preview || op.error || op.child_workflow_id);
        const opKey = `${op.workflow_uuid}-${op.function_id}`;
        const isExpanded = expandedOps.has(opKey);
        const childOps = op.child_workflow_id
          ? byWorkflow.get(op.child_workflow_id) ?? []
          : [];

        // Determine status for icon
        const opStatus = op.error ? "ERROR" : op.duration_ms != null ? "SUCCESS" : "PENDING";
        const iconCfg = statusIcons[opStatus] ?? statusIcons.PENDING;

        return (
          <div
            key={opKey}
            className={`rounded-md border transition-colors ${
              op.error
                ? "border-red-200 bg-red-50/30"
                : "border-[#e8e4df] bg-[#faf9f7]"
            }`}
          >
            <button
              onClick={() => hasDetail && toggleOp(opKey)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors ${
                hasDetail ? "cursor-pointer" : "cursor-default"
              }`}
            >
              {hasDetail ? (
                isExpanded ? (
                  <ChevronDown className="w-2.5 h-2.5 text-[#a8a099] shrink-0" />
                ) : (
                  <ChevronRight className="w-2.5 h-2.5 text-[#a8a099] shrink-0" />
                )
              ) : (
                <span className="w-2.5 shrink-0" />
              )}

              {/* Status icon */}
              <iconCfg.Icon className={`w-3.5 h-3.5 shrink-0 ${iconCfg.className}`} />

              <span
                className={`text-[12px] font-medium truncate flex-1 ${
                  op.error ? "text-red-700" : "text-[#1a1a1a]"
                }`}
              >
                {displayName}
              </span>

              {op.duration_ms != null && (
                <span className="text-[10px] font-mono text-[#a8a099] shrink-0">
                  {formatDuration(op.duration_ms)}
                </span>
              )}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-2.5 pb-2.5 pt-0 border-t border-[#e8e4df] mx-2.5 space-y-2">
                {op.error && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-red-500 font-medium">Error</span>
                    <pre className="text-[10px] font-mono text-red-600 bg-red-50 rounded p-1.5 whitespace-pre-wrap break-all">
                      {op.error}
                    </pre>
                  </div>
                )}

                {/* Child workflow operations */}
                {childOps.length > 0 && (
                  <div className="mt-2 space-y-1 border-l-2 border-[#e8e4df] pl-2">
                    {childOps.map((childOp) => (
                      <OperationRow
                        key={`${childOp.workflow_uuid}-${childOp.function_id}`}
                        op={childOp}
                      />
                    ))}
                  </div>
                )}

                {op.output_preview && !op.error && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[#a8a099] font-medium">Output</span>
                    <pre className="text-[10px] font-mono text-[#787068] bg-white rounded p-1.5 whitespace-pre-wrap break-all max-h-[150px] overflow-auto">
                      {formatOutputPreview(op.output_preview)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Simple operation row for child workflows ----

function OperationRow({ op }: { op: OperationTrace }) {
  const opStatus = op.error ? "ERROR" : op.duration_ms != null ? "SUCCESS" : "PENDING";
  const iconCfg = statusIcons[opStatus] ?? statusIcons.PENDING;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] ${
        op.error ? "bg-red-50/30" : ""
      }`}
    >
      <iconCfg.Icon className={`w-3 h-3 shrink-0 ${iconCfg.className}`} />
      <span className={`truncate flex-1 ${op.error ? "text-red-700" : "text-[#787068]"}`}>
        {op.function_name}
      </span>
      {op.duration_ms != null && (
        <span className="text-[10px] font-mono text-[#a8a099] shrink-0">
          {formatDuration(op.duration_ms)}
        </span>
      )}
    </div>
  );
}

// ---- Utilities ----

/** Parse a timestamp that may be an epoch-ms number, numeric string, or ISO date string */
function parseTimestamp(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Numeric string (epoch ms from pg bigint)
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    // ISO date string
    const ms = new Date(value).getTime();
    if (!isNaN(ms)) return ms;
  }
  return Date.now();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatOutputPreview(output: string | null): string {
  if (!output) return "";
  try {
    const parsed = JSON.parse(output);
    const str = JSON.stringify(parsed, null, 2);
    return str.length > 200 ? str.slice(0, 197) + "..." : str;
  } catch {
    return output.length > 200 ? output.slice(0, 197) + "..." : output;
  }
}
