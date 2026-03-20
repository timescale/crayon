import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { listVersions } from "../lib/git-commit.js";

const inputSchema = {
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of versions to return (default: 20)"),
} as const;

const outputSchema = {
  versions: z
    .array(
      z.object({
        hash: z.string().describe("Full commit hash"),
        hash_short: z.string().describe("Short commit hash"),
        date: z.string().describe("Commit date in ISO 8601 format"),
        message: z.string().describe("Commit summary (first line)"),
        details: z
          .string()
          .optional()
          .describe("Additional commit details (body)"),
      }),
    )
    .describe("List of versions, most recent first"),
  error: z.string().optional().describe("Error message if query failed"),
} as const;

type VersionOutput = {
  hash: string;
  hash_short: string;
  date: string;
  message: string;
  details?: string;
};

type OutputSchema = {
  versions: VersionOutput[];
  error?: string;
};

export const listVersionsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_versions",
    config: {
      title: "List Versions",
      description:
        "List recent versions (git commits) of the project. " +
        "Shows commit hash, date, and message. " +
        "Use restore_version with a commit hash to roll back.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ limit }): Promise<OutputSchema> => {
      try {
        const entries = await listVersions(limit);

        return {
          versions: entries.map((e) => ({
            hash: e.hash,
            hash_short: e.hashShort,
            date: e.date,
            message: e.message,
            details: e.body || undefined,
          })),
        };
      } catch (err) {
        return {
          versions: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
