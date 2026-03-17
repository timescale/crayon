/**
 * Shared Zod schemas for the cron API.
 *
 * Used by both:
 *   - MCP tools (packages/core) — to validate apiCall() responses
 *   - Auth-server API routes (packages/auth-server) — to validate request bodies
 */
import { z } from "zod";

// ── Request schemas (validated by auth-server) ───────────────────────

export const CreateCronJobRequest = z.object({
  flyAppName: z.string().min(1),
  workflowName: z.string().min(1),
  cronExpression: z.string().min(1),
  timezone: z.string().default("UTC"),
  input: z.record(z.string(), z.unknown()).default({}),
});

export const UpdateCronJobRequest = z.object({
  cronExpression: z.string().min(1).optional(),
  timezone: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

// ── Response schemas (validated by MCP tools) ────────────────────────

// pg returns BIGINT as strings; coerce to number for convenience
export const CronJobResponse = z.object({
  id: z.coerce.number(),
  machine_id: z.coerce.number(),
  workflow_name: z.string(),
  cron_expression: z.string(),
  timezone: z.string(),
  input: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  consecutive_failures: z.coerce.number(),
  created_by: z.string(),
  next_run_at: z.string(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Joined fields
  fly_app_name: z.string().optional(),
  app_name: z.string().optional(),
});

export const CronRunResponse = z.object({
  id: z.coerce.number(),
  job_id: z.coerce.number(),
  status: z.string(),
  run_id: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  http_status: z.coerce.number().nullable(),
  error: z.string().nullable(),
  duration_ms: z.coerce.number().nullable(),
});

export type CronJobResponse = z.infer<typeof CronJobResponse>;
export type CronRunResponse = z.infer<typeof CronRunResponse>;
