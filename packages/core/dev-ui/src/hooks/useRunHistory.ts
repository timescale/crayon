import { useState, useEffect, useCallback, useRef } from "react";
import type { WorkflowRun, TraceResult } from "../types";

const POLL_INTERVAL_MS = 5000;

export function useRunHistory(workflowFilter: string | null) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchRuns = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (workflowFilter) params.set("workflow", workflowFilter);
      params.set("limit", "50");
      const res = await fetch(`/dev/api/runs?${params}`);
      if (res.ok) {
        setRuns(await res.json());
        setAvailable(true);
      } else {
        setAvailable(false);
      }
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [workflowFilter]);

  // Initial fetch + polling
  useEffect(() => {
    setLoading(true);
    fetchRuns();
    pollRef.current = setInterval(fetchRuns, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchRuns]);

  // Fetch trace when a run is selected
  const selectRun = useCallback(async (runId: string | null) => {
    setSelectedRunId(runId);
    if (!runId) {
      setTrace(null);
      return;
    }
    setTraceLoading(true);
    try {
      const res = await fetch(`/dev/api/runs/${runId}/trace`);
      if (res.ok) {
        setTrace(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setTraceLoading(false);
    }
  }, []);

  return {
    runs,
    loading,
    available,
    selectedRunId,
    trace,
    traceLoading,
    selectRun,
    refresh: fetchRuns,
  };
}
