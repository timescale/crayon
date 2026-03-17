import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { apiCall } from "../../../connections/cloud-client.js";

const inputSchema = {
  job_id: z.number().describe("The cron job ID to delete."),
} as const;

const outputSchema = {
  deleted: z.boolean(),
  error: z.string().optional(),
} as const;

type OutputSchema = {
  deleted: boolean;
  error?: string;
};

export const deleteCronJobFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "delete_cron_job",
    config: {
      title: "Delete Cron Job",
      description: "Permanently delete a scheduled cron job. This also deletes all run history for the job.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ job_id }): Promise<OutputSchema> => {
      try {
        await apiCall("DELETE", `/api/cron/jobs/${job_id}`);
        return { deleted: true };
      } catch (err) {
        return {
          deleted: false,
          error: `Failed to delete cron job: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
