import { useState, useEffect, useCallback, useRef } from "react";

export interface CronJob {
  id: number;
  workflow_name: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  consecutive_failures: number;
  next_run_at: string;
  last_run_at: string | null;
}

export interface CronRun {
  id: number;
  job_id: number;
  status: string;
  run_id: string | null;
  started_at: string;
  finished_at: string | null;
  http_status: number | null;
  error: string | null;
  duration_ms: number | null;
}

const POLL_INTERVAL_MS = 15_000;

export function useCronJobs(workflowName: string | null) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!workflowName) return;
    try {
      const qs = new URLSearchParams({ workflow: workflowName });
      const res = await fetch(`/dev/api/cron/jobs?${qs}`);
      const result = await res.json();
      if (result.data) {
        setJobs(result.data);
        // Fetch runs for the first job
        if (result.data.length > 0) {
          const runsRes = await fetch(`/dev/api/cron/jobs/${result.data[0].id}/runs?limit=10`);
          const runsResult = await runsRes.json();
          if (runsResult.data) setRuns(runsResult.data);
        } else {
          setRuns([]);
        }
      }
    } catch {
      // Silently fail on poll errors
    }
  }, [workflowName]);

  useEffect(() => {
    setJobs([]);
    setRuns([]);
    setError(null);
    if (!workflowName) return;

    setLoading(true);
    fetchJobs().finally(() => setLoading(false));

    intervalRef.current = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workflowName, fetchJobs]);

  const createJob = useCallback(
    async (cronExpression: string, timezone: string, input: Record<string, unknown> = {}) => {
      setError(null);
      try {
        const res = await fetch("/dev/api/cron/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowName, cronExpression, timezone, input }),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error ?? "Failed to create schedule");
          return false;
        }
        await fetchJobs();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create schedule");
        return false;
      }
    },
    [workflowName, fetchJobs],
  );

  const updateJob = useCallback(
    async (jobId: number, updates: { enabled?: boolean; cronExpression?: string; timezone?: string }) => {
      setError(null);
      try {
        const res = await fetch(`/dev/api/cron/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error ?? "Failed to update schedule");
          return false;
        }
        await fetchJobs();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update schedule");
        return false;
      }
    },
    [fetchJobs],
  );

  const deleteJob = useCallback(
    async (jobId: number) => {
      setError(null);
      try {
        const res = await fetch(`/dev/api/cron/jobs/${jobId}`, { method: "DELETE" });
        if (!res.ok) {
          const result = await res.json();
          setError(result.error ?? "Failed to delete schedule");
          return false;
        }
        await fetchJobs();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete schedule");
        return false;
      }
    },
    [fetchJobs],
  );

  return { jobs, runs, loading, error, createJob, updateJob, deleteJob };
}
