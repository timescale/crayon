import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { getRun } from "../../runs.js";
import { requireDatabaseUrl, parseOutput } from "./utils.js";

const inputSchema = {
  run_id: z
    .string()
    .describe("Workflow run UUID or short prefix (like git short hashes)"),
} as const;

const outputSchema = {
  run: z
    .object({
      workflow_uuid: z.string(),
      name: z.string(),
      status: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      output: z.unknown().optional(),
      error: z.string().nullable().optional(),
    })
    .nullable()
    .describe("Workflow run details, or null if not found"),
  ambiguous: z
    .boolean()
    .optional()
    .describe("True if the run ID prefix matched multiple runs"),
  error: z.string().optional().describe("Error message if query failed"),
} as const;

type RunOutput = {
  workflow_uuid: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  output?: unknown;
  error?: string | null;
} | null;

type OutputSchema = {
  run: RunOutput;
  ambiguous?: boolean;
  error?: string;
};

export const getRunFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "get_run",
    config: {
      title: "Get Run",
      description:
        "Get details of a specific workflow run by ID or short prefix. " +
        "Supports git-style short hashes (e.g., first 8 characters). " +
        "Use get_trace for full execution trace with operations.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ run_id }): Promise<OutputSchema> => {
      let databaseUrl: string;
      try {
        databaseUrl = requireDatabaseUrl();
      } catch (err) {
        return { run: null, error: err instanceof Error ? err.message : String(err) };
      }

      try {
        const { run, ambiguous } = await getRun(databaseUrl, run_id);

        if (ambiguous) {
          return {
            run: null,
            ambiguous: true,
            error: `Ambiguous prefix "${run_id}" — matches multiple runs. Use a longer prefix.`,
          };
        }

        if (!run) {
          return { run: null };
        }

        return {
          run: {
            workflow_uuid: run.workflow_uuid,
            name: run.name,
            status: run.status,
            created_at: String(run.created_at),
            updated_at: String(run.updated_at),
            output: run.output ? parseOutput(run.output) : undefined,
            error: run.error,
          },
        };
      } catch (err) {
        return {
          run: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
