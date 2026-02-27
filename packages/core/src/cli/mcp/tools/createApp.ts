import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import { scaffoldApp } from "../lib/scaffolding.js";
import type { ServerContext } from "../types.js";

const inputSchema = {
  app_name: z.string().describe("Application name (lowercase with hyphens, e.g., 'lead-scoring-app')"),
  directory: z
    .string()
    .optional()
    .default(".")
    .describe("Directory to create the app in, relative to cwd (default: current directory). Created if it doesn't exist."),
  install_deps: z
    .boolean()
    .default(true)
    .describe("Run npm install after creating the app"),
} as const;

const outputSchema = {
  success: z.boolean().describe("Whether the app was created successfully"),
  message: z.string().describe("Status message"),
  path: z.string().optional().describe("Absolute path to created app"),
} as const;

type OutputSchema = {
  success: boolean;
  message: string;
  path?: string;
};

export const createAppFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "create_app",
    config: {
      title: "Create crayon App",
      description:
        "Create a new crayon application with T3 Stack template (Next.js + tRPC + Drizzle) and crayon workflow directories. Use this to scaffold new projects.",
      inputSchema,
      outputSchema,
    },
    fn: async ({
      app_name,
      directory,
      install_deps,
    }): Promise<OutputSchema> => {
      return scaffoldApp({
        appName: app_name,
        directory,
        installDeps: install_deps,
      });
    },
  };
};
