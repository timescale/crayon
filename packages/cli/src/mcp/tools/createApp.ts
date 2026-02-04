import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import { monorepoRoot } from "../config.js";
import { writeAppTemplates, create0pflowDirectories } from "../lib/templates.js";
import type { ServerContext } from "../types.js";

// Check if running in development mode (monorepo with packages/core exists)
function isDevMode(): boolean {
  const corePath = join(monorepoRoot, "packages", "core");
  return existsSync(corePath);
}

const execAsync = (cmd: string, cwd?: string) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr }));
      else resolve({ stdout, stderr });
    });
  });

const inputSchema = {
  app_name: z.string().describe("Application name (lowercase with hyphens, e.g., 'lead-scoring-app')"),
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
      title: "Create 0pflow App",
      description:
        "Create a new 0pflow application with T3 Stack template (Next.js + tRPC + Drizzle) and 0pflow workflow directories. Use this to scaffold new projects.",
      inputSchema,
      outputSchema,
    },
    fn: async ({
      app_name,
      install_deps,
    }): Promise<OutputSchema> => {
      const appName = app_name;
      const appPath = process.cwd();

      try {
        // Copy app template with Handlebars substitution
        await writeAppTemplates(appPath, {
          app_name: appName,
        });

        // Create 0pflow-specific directories
        await create0pflowDirectories(appPath);

        // In dev mode, link local 0pflow packages (before npm install)
        if (isDevMode()) {
          const corePath = join(monorepoRoot, "packages", "core");
          const cliPath = join(monorepoRoot, "packages", "cli");
          // Register packages globally first
          await execAsync("npm link", corePath);
          await execAsync("npm link", cliPath);
          // Then link them in the app
          await execAsync("npm link 0pflow @0pflow/cli", appPath);
        }

        // Install dependencies if requested
        if (install_deps) {
          await execAsync("npm install", appPath);
        }

        return {
          success: true,
          message: `Created 0pflow app '${appName}' in ${appPath}`,
          path: appPath,
        };
      } catch (err) {
        const error = err as Error & { stderr?: string };
        return {
          success: false,
          message: `Failed to create app: ${error.message}\n${error.stderr || ""}`,
        };
      }
    },
  };
};
