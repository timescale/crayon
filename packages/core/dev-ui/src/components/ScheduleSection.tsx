import { useState } from "react";
import { useCronJobs } from "../hooks/useCronJobs";
import type { CronRun } from "../hooks/useCronJobs";

interface ScheduleSectionProps {
  workflowName: string;
}

function StatusDot({ enabled, failures }: { enabled: boolean; failures: number }) {
  if (!enabled) return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" title="Disabled" />;
  if (failures > 0) return <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title={`${failures} consecutive failure${failures !== 1 ? "s" : ""}`} />;
  return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Healthy" />;
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "success") return <span className="text-green-600" title="Success">&check;</span>;
  if (status === "error") return <span className="text-red-600" title="Error">&times;</span>;
  if (status === "timeout") return <span className="text-amber-600" title="Timeout">&#8856;</span>;
  return <span className="text-blue-500" title="Triggered">&#8987;</span>;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function RunRow({ run }: { run: CronRun }) {
  return (
    <div className="flex items-center gap-2 text-[12px] py-1">
      <RunStatusIcon status={run.status} />
      <span className="text-[#a8a099] tabular-nums">{formatTime(run.started_at)}</span>
      <span className="text-[#1a1a1a]">{run.status}</span>
      {run.duration_ms !== null && (
        <span className="text-[#a8a099]">{formatDuration(run.duration_ms)}</span>
      )}
      {run.error && (
        <span className="text-red-600 truncate text-[11px]" title={run.error}>
          {run.error}
        </span>
      )}
    </div>
  );
}

export function ScheduleSection({ workflowName }: ScheduleSectionProps) {
  const cron = useCronJobs(workflowName);
  const job = cron.jobs[0] ?? null; // one schedule per workflow

  const [cronExpr, setCronExpr] = useState("0 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await cron.createJob(cronExpr, timezone);
    setCreating(false);
  };

  const handleToggle = async () => {
    if (!job) return;
    await cron.updateJob(job.id, { enabled: !job.enabled });
  };

  const handleDelete = async () => {
    if (!job) return;
    await cron.deleteJob(job.id);
  };

  if (cron.loading) {
    return (
      <div className="text-[12px] text-[#a8a099] py-8 text-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Current Schedule or Create Form ─────────────── */}
      {job ? (
        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-3">
            Current Schedule
          </h3>
          <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <code className="text-[13px] font-mono text-[#1a1a1a]">
                {job.cron_expression}
              </code>
              <StatusDot enabled={job.enabled} failures={job.consecutive_failures} />
            </div>
            <div className="text-[11px] text-[#a8a099] space-y-0.5">
              <div>Timezone: {job.timezone}</div>
              <div>Next run: {new Date(job.next_run_at).toLocaleString()}</div>
              {job.last_run_at && (
                <div>Last run: {new Date(job.last_run_at).toLocaleString()}</div>
              )}
              {job.consecutive_failures > 0 && (
                <div className="text-amber-600">
                  {job.consecutive_failures} consecutive failure{job.consecutive_failures !== 1 ? "s" : ""}
                  {!job.enabled && " (auto-disabled)"}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleToggle}
                className="text-[11px] px-2.5 py-1 rounded border border-[#e8e4df] hover:bg-[#f0ece7] transition-colors cursor-pointer"
              >
                {job.enabled ? "Disable" : "Enable"}
              </button>
              <button
                onClick={handleDelete}
                className="text-[11px] px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-3">
            Add Schedule
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a] mb-1">
                Cron expression
              </label>
              <input
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                className="w-full text-[13px] font-mono bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20 placeholder:text-[#d4cfc8]"
                placeholder="*/5 * * * *"
              />
              <p className="text-[10px] text-[#a8a099] mt-1">
                min hour day month weekday
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#1a1a1a] mb-1">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full text-[13px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20 placeholder:text-[#d4cfc8]"
                placeholder="UTC"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !cronExpr.trim()}
              className="w-full bg-[#1a1a1a] text-white hover:bg-[#2a2a2a] text-[13px] h-9 rounded-lg transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {creating ? "Creating..." : "+ Create Schedule"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {cron.error && (
        <pre className="text-[10px] font-mono text-red-600 bg-red-50 rounded-lg p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto">
          {cron.error}
        </pre>
      )}

      {/* ── Recent Cron Runs ─────────────────────────────── */}
      {cron.runs.length > 0 && (
        <div>
          <div className="border-t border-[#e8e4df] mb-5" />
          <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-2">
            Recent Cron Runs
          </h3>
          <div className="space-y-0">
            {cron.runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
