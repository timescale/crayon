import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { apiCall } from "../../../connections/cloud-client.js";
import { CronRunResponse } from "../lib/cron-schemas.js";

const inputSchema = {
  job_id: z.number().describe("The cron job ID to list runs for."),
  limit: z.number().optional().default(20).describe("Max runs to return (default 20, max 100)."),
} as const;

const outputSchema = {
  runs: z.array(CronRunResponse),
  error: z.string().optional(),
} as const;

type OutputSchema = {
  runs: z.infer<typeof CronRunResponse>[];
  error?: string;
};

export const listCronRunsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_cron_runs",
    config: {
      title: "List Cron Runs",
      description:
        "List recent execution history for a cron job. Shows trigger status, " +
        "DBOS run ID, duration, and any errors.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ job_id, limit }): Promise<OutputSchema> => {
      try {
        const data = await apiCall("GET", `/api/cron/jobs/${job_id}/runs?limit=${limit}`);
        const runs = z.array(CronRunResponse).parse(data);
        return { runs };
      } catch (err) {
        return {
          runs: [],
          error: `Failed to list cron runs: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
