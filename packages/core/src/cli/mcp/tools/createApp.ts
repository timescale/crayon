import { exec } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import { packageRoot, version } from "../config.js";
import { writeAppTemplates, create0pflowDirectories } from "../lib/templates.js";
import type { ServerContext } from "../types.js";

// Monorepo root (only valid in dev mode when running from packages/core)
const monorepoRoot = join(packageRoot, "..", "..");

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
      title: "Create 0pflow App",
      description:
        "Create a new 0pflow application with T3 Stack template (Next.js + tRPC + Drizzle) and 0pflow workflow directories. Use this to scaffold new projects.",
      inputSchema,
      outputSchema,
    },
    fn: async ({
      app_name,
      directory,
      install_deps,
    }): Promise<OutputSchema> => {
      const appName = app_name;
      const appPath = resolve(process.cwd(), directory);

      // Ensure target directory exists
      if (!existsSync(appPath)) {
        mkdirSync(appPath, { recursive: true });
      }

      try {
        // Copy app template with Handlebars substitution
        await writeAppTemplates(appPath, {
          app_name: appName,
          opflow_version: version,
        });

        // Create 0pflow-specific directories
        await create0pflowDirectories(appPath);

        // In dev mode, link local 0pflow packages (before npm install)
        if (isDevMode()) {
          const corePath = join(monorepoRoot, "packages", "core");
          // Register package globally first
          await execAsync("npm link", corePath);
          // Then link it in the app
          await execAsync("npm link 0pflow", appPath);
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
