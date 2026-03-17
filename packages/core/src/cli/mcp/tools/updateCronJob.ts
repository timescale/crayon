import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { apiCall } from "../../../connections/cloud-client.js";
import { CronJobResponse } from "../lib/cron-schemas.js";

const inputSchema = {
  job_id: z.number().describe("The cron job ID to update."),
  cron_expression: z
    .string()
    .optional()
    .describe("New cron expression (5-field). Leave empty to keep current."),
  timezone: z
    .string()
    .optional()
    .describe("New IANA timezone. Leave empty to keep current."),
  input: z
    .string()
    .optional()
    .describe("New workflow input as JSON string. Leave empty to keep current."),
  enabled: z
    .boolean()
    .optional()
    .describe("Enable or disable the job. Use this to re-enable a job disabled by consecutive failures."),
} as const;

const outputSchema = {
  job: CronJobResponse.optional(),
  error: z.string().optional(),
} as const;

type OutputSchema = {
  job?: z.infer<typeof CronJobResponse>;
  error?: string;
};

export const updateCronJobFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "update_cron_job",
    config: {
      title: "Update Cron Job",
      description:
        "Update a cron job's schedule, input, timezone, or enabled status. " +
        "Use this to re-enable a job that was auto-disabled after consecutive failures.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ job_id, cron_expression, timezone, input, enabled }): Promise<OutputSchema> => {
      try {
        const body: Record<string, unknown> = {};
        if (cron_expression !== undefined) body.cronExpression = cron_expression;
        if (timezone !== undefined) body.timezone = timezone;
        if (enabled !== undefined) body.enabled = enabled;
        if (input !== undefined) {
          try {
            body.input = JSON.parse(input);
          } catch {
            return { error: "Invalid JSON in input parameter" };
          }
        }

        const data = await apiCall("PATCH", `/api/cron/jobs/${job_id}`, body);
        const job = CronJobResponse.parse(data);
        return { job };
      } catch (err) {
        return {
          error: `Failed to update cron job: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
