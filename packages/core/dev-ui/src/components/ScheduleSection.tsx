import { useState } from "react";
import { useCronJobs } from "../hooks/useCronJobs";
import type { CronRun } from "../hooks/useCronJobs";

interface ScheduleSectionProps {
  workflowName: string;
}

type IntervalUnit = "minutes" | "hours" | "days";

function buildCronExpression(
  interval: number,
  unit: IntervalUnit,
  atHour: number,
  atMinute: number,
): string {
  switch (unit) {
    case "minutes":
      return `*/${interval} * * * *`;
    case "hours":
      return `${atMinute} */${interval} * * *`;
    case "days":
      return `${atMinute} ${atHour} */${interval} * *`;
  }
}

/** Parse a cron expression into human-readable text. */
function describeCron(expr: string): string {
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom] = parts;

  // */N * * * * → every N minutes
  if (min.startsWith("*/") && hour === "*" && dom === "*") {
    const n = parseInt(min.slice(2));
    return n === 1 ? "Every minute" : `Every ${n} minutes`;
  }
  // M */N * * * → every N hours at :MM
  if (hour.startsWith("*/") && dom === "*") {
    const n = parseInt(hour.slice(2));
    const m = min.padStart(2, "0");
    return n === 1 ? `Every hour at :${m}` : `Every ${n} hours at :${m}`;
  }
  // M H */N * * → every N days at H:MM
  if (dom.startsWith("*/")) {
    const n = parseInt(dom.slice(2));
    const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    return n === 1 ? `Daily at ${time}` : `Every ${n} days at ${time}`;
  }
  // M H * * * → daily at H:MM
  if (dom === "*" && hour !== "*" && !hour.includes("/")) {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  return expr;
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

function getCurrentTime() {
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

export function ScheduleSection({ workflowName }: ScheduleSectionProps) {
  const cron = useCronJobs(workflowName);
  const job = cron.jobs[0] ?? null;

  const [interval, setInterval_] = useState(5);
  const [unit, setUnit] = useState<IntervalUnit>("minutes");
  const [atHour, setAtHour] = useState(() => getCurrentTime().hour);
  const [atMinute, setAtMinute] = useState(() => getCurrentTime().minute);
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customCron, setCustomCron] = useState("");
  const [creating, setCreating] = useState(false);

  const showTimePicker = unit === "hours" || unit === "days";

  const handleCreate = async () => {
    setCreating(true);
    const cronExpr = showAdvanced && customCron.trim()
      ? customCron.trim()
      : buildCronExpression(interval, unit, atHour, atMinute);
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
              <span className="text-[13px] font-medium text-[#1a1a1a]">
                {describeCron(job.cron_expression)}
              </span>
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
            {!showAdvanced ? (
              <>
                {/* Interval: every N [unit] */}
                <div>
                  <label className="block text-[11px] font-medium text-[#1a1a1a] mb-1">
                    Run every
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={unit === "minutes" ? 59 : unit === "hours" ? 23 : 31}
                      value={interval}
                      onChange={(e) => setInterval_(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 text-[13px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20"
                    />
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as IntervalUnit)}
                      className="text-[13px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 outline-none"
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                </div>

                {/* Time picker (for hours/days) */}
                {showTimePicker && (
                  <div>
                    <label className="block text-[11px] font-medium text-[#1a1a1a] mb-1">
                      {unit === "hours" ? "At minute" : "At time"}
                    </label>
                    {unit === "days" ? (
                      <input
                        type="time"
                        value={`${String(atHour).padStart(2, "0")}:${String(atMinute).padStart(2, "0")}`}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(":").map(Number);
                          setAtHour(h);
                          setAtMinute(m);
                        }}
                        className="text-[13px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20"
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] text-[#a8a099]">:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={atMinute}
                          onChange={(e) => setAtMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="w-16 text-[13px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20"
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Advanced: raw cron input */
              <div>
                <label className="block text-[11px] font-medium text-[#1a1a1a] mb-1">
                  Cron expression
                </label>
                <input
                  type="text"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  className="w-full text-[13px] font-mono bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20 placeholder:text-[#d4cfc8]"
                  placeholder="*/5 * * * *"
                />
                <p className="text-[10px] text-[#a8a099] mt-1">
                  min hour day month weekday
                </p>
              </div>
            )}

            {/* Timezone (only for days / advanced) */}
            {(unit === "days" || showAdvanced) && (
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
            )}

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => {
                if (!showAdvanced) {
                  setCustomCron(buildCronExpression(interval, unit, atHour, atMinute));
                }
                setShowAdvanced(!showAdvanced);
              }}
              className="text-[11px] text-[#a8a099] hover:text-[#1a1a1a] transition-colors cursor-pointer"
            >
              {showAdvanced ? "Simple mode" : "Advanced (cron expression)"}
            </button>

            <button
              onClick={handleCreate}
              disabled={creating}
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
