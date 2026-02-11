import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { discoverWorkflows } from "../../discovery.js";

const inputSchema = {} as const;

const outputSchema = {
  workflows: z
    .array(
      z.object({
        name: z.string(),
        version: z.number().optional(),
        description: z.string().optional(),
      }),
    )
    .describe("List of available workflows"),
  error: z.string().optional().describe("Error message if discovery failed"),
} as const;

type OutputSchema = {
  workflows: { name: string; version?: number; description?: string }[];
  error?: string;
};

export const listWorkflowsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_workflows",
    config: {
      title: "List Workflows",
      description:
        "List all available compiled workflows in the project. " +
        "Returns workflow names, versions, and descriptions.",
      inputSchema,
      outputSchema,
    },
    fn: async (): Promise<OutputSchema> => {
      try {
        const { workflows, warnings } = await discoverWorkflows(process.cwd());

        return {
          workflows: workflows.map((w) => ({
            name: w.name,
            version: "version" in w ? (w as { version?: number }).version : undefined,
            description: w.description || undefined,
          })),
          ...(warnings.length > 0 ? { error: warnings.join("; ") } : {}),
        };
      } catch (err) {
        return {
          workflows: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
