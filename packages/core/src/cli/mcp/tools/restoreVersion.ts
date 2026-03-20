import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { restoreVersion } from "../lib/git-commit.js";

const inputSchema = {
  commit_hash: z
    .string()
    .describe(
      "Commit hash (full or short) to restore src/crayon/ files from",
    ),
} as const;

const outputSchema = {
  success: z.boolean().describe("Whether the restore succeeded"),
  files_restored: z
    .array(z.string())
    .optional()
    .describe("List of files that were restored"),
  commit_hash: z
    .string()
    .optional()
    .describe("Short hash of the new commit created for the restore"),
  error: z
    .string()
    .optional()
    .describe("Error message if restore failed"),
} as const;

type OutputSchema = {
  success: boolean;
  files_restored?: string[];
  commit_hash?: string;
  error?: string;
};

export const restoreVersionFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "restore_version",
    config: {
      title: "Restore Version",
      description:
        "Restore src/crayon/ files (workflows, nodes, agents) to a previous version. " +
        "Creates a new commit with the restored files. " +
        "Does NOT restore .env, config, or files outside src/crayon/. " +
        "Use list_versions to find the commit hash to restore to.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ commit_hash }): Promise<OutputSchema> => {
      try {
        const result = await restoreVersion(commit_hash);

        return {
          success: result.success,
          files_restored: result.filesRestored.length
            ? result.filesRestored
            : undefined,
          commit_hash: result.commitHash,
          error: result.error,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
