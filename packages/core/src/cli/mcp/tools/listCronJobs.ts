import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { apiCall } from "../../../connections/cloud-client.js";
import { CronJobResponse } from "../lib/cron-schemas.js";

const inputSchema = {
  fly_app_name: z
    .string()
    .optional()
    .describe("Filter by machine (Fly app name). Omit to list all."),
} as const;

const outputSchema = {
  jobs: z.array(CronJobResponse),
  error: z.string().optional(),
} as const;

type OutputSchema = {
  jobs: z.infer<typeof CronJobResponse>[];
  error?: string;
};

export const listCronJobsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_cron_jobs",
    config: {
      title: "List Cron Jobs",
      description:
        "List scheduled cron jobs. Optionally filter by machine (Fly app name). " +
        "Shows schedule, enabled status, next run time, and failure count.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ fly_app_name }): Promise<OutputSchema> => {
      try {
        const query = fly_app_name ? `?flyAppName=${encodeURIComponent(fly_app_name)}` : "";
        const data = await apiCall("GET", `/api/cron/jobs${query}`);
        const jobs = z.array(CronJobResponse).parse(data);
        return { jobs };
      } catch (err) {
        return {
          jobs: [],
          error: `Failed to list cron jobs: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
