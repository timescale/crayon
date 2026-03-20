import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { autoCommit } from "../lib/git-commit.js";

const inputSchema = {
  message: z
    .string()
    .describe(
      "Commit message. First line is the summary (keep under 72 chars). " +
        "Add a blank line then details for multi-line messages.",
    ),
} as const;

const outputSchema = {
  success: z.boolean().describe("Whether the version was created"),
  commit_hash: z
    .string()
    .optional()
    .describe("Short hash of the new commit"),
  message: z
    .string()
    .optional()
    .describe("Human-readable status message"),
  error: z
    .string()
    .optional()
    .describe("Error message if failed"),
} as const;

type OutputSchema = {
  success: boolean;
  commit_hash?: string;
  message?: string;
  error?: string;
};

export const createVersionFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "create_version",
    config: {
      title: "Create Version",
      description:
        "Save the current state of the project as a new version (git commit). " +
        "Use this after making changes to workflows, nodes, or agents. " +
        "The message should describe what was changed and why.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ message }): Promise<OutputSchema> => {
      try {
        const result = await autoCommit({ message });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        if (result.commitHash) {
          return {
            success: true,
            commit_hash: result.commitHash,
            message: "Version created",
          };
        }

        return { success: true, message: "No changes to commit" };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
