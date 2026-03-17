import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { apiCall } from "../../../connections/cloud-client.js";
import { CronJobResponse } from "../lib/cron-schemas.js";

const inputSchema = {
  fly_app_name: z
    .string()
    .describe("The Fly app name of the machine to schedule the job on."),
  workflow_name: z
    .string()
    .describe("The workflow to run on schedule."),
  cron_expression: z
    .string()
    .describe(
      "Standard 5-field cron expression (minute hour day-of-month month day-of-week). " +
      "Examples: '*/5 * * * *' (every 5 min), '0 9 * * 1-5' (9am weekdays), '0 0 * * *' (daily midnight).",
    ),
  timezone: z
    .string()
    .default("UTC")
    .describe("IANA timezone for the schedule (e.g., 'America/New_York'). Defaults to UTC."),
  input: z
    .string()
    .default("{}")
    .describe("JSON string of workflow input parameters."),
} as const;

const outputSchema = {
  job: CronJobResponse.optional(),
  error: z.string().optional(),
} as const;

type OutputSchema = {
  job?: z.infer<typeof CronJobResponse>;
  error?: string;
};

export const createCronJobFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "create_cron_job",
    config: {
      title: "Create Cron Job",
      description:
        "Schedule a recurring workflow execution on a cloud machine. " +
        "The machine will be auto-started by Fly.io when the cron triggers. " +
        "Jobs that fail 10 consecutive times are automatically disabled.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ fly_app_name, workflow_name, cron_expression, timezone, input }): Promise<OutputSchema> => {
      try {
        let parsedInput: Record<string, unknown>;
        try {
          parsedInput = JSON.parse(input);
        } catch {
          return { error: "Invalid JSON in input parameter" };
        }

        const data = await apiCall("POST", "/api/cron/jobs", {
          flyAppName: fly_app_name,
          workflowName: workflow_name,
          cronExpression: cron_expression,
          timezone,
          input: parsedInput,
        });
        const job = CronJobResponse.parse(data);
        return { job };
      } catch (err) {
        return {
          error: `Failed to create cron job: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
