export interface CronJob {
  id: number;
  machine_id: number;
  workflow_name: string;
  cron_expression: string;
  timezone: string;
  input: Record<string, unknown>;
  enabled: boolean;
  created_by: string;
  next_run_at: Date;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields (present in some queries)
  fly_app_name?: string;
  app_name?: string;
}

export interface CronRun {
  id: number;
  job_id: number;
  status: "triggered" | "success" | "error" | "timeout";
  run_id: string | null;
  started_at: Date;
  finished_at: Date | null;
  http_status: number | null;
  error: string | null;
  duration_ms: number | null;
}
