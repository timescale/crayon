import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";

const execFileAsync = promisify(execFile);

// We shell out to the CLI instead of running workflows in-process because
// DBOS doesn't allow re-registering workflows after launch. A subprocess
// loads fresh code every time, so users can edit workflow code and re-run
// through MCP without restarting the server.
// process.argv gives us the same runtime+script the MCP server was started
// with (e.g. tsx + .ts in dev, node + .js in prod). process.execArgv
// forwards loader flags (--import tsx/esm) so .ts files resolve correctly.

const inputSchema = {
  workflow_name: z.string().describe("Name of the workflow to run"),
  input: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .describe("JSON input for the workflow (default: {})"),
  test_mode: z
    .boolean()
    .optional()
    .default(true)
    .describe("Run in test mode — side-effect nodes describe what they would do without performing actions (default: true)"),
} as const;

const outputSchema = {
  run_id: z.string().optional().describe("Workflow run UUID (use with get_trace to inspect execution)"),
  status: z.string().describe("Execution status: SUCCESS or ERROR"),
  result: z.unknown().optional().describe("Workflow return value"),
  error: z.string().optional().describe("Error message if execution failed"),
  test_mode: z.boolean().optional().describe("Whether the workflow ran in test mode (side effects were skipped)"),
} as const;

type OutputSchema = {
  run_id?: string;
  status: string;
  result?: unknown;
  error?: string;
  test_mode?: boolean;
};

export const runWorkflowFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "run_workflow",
    config: {
      title: "Run Workflow",
      description:
        "Execute a compiled workflow by name with JSON input. " +
        "By default runs in test mode (side-effect nodes skip actions). Pass test_mode: false to run live. " +
        "Returns the result and a run_id that can be used with get_trace to inspect execution details. " +
        "Use list_workflows first to see available workflows.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ workflow_name, input, test_mode }): Promise<OutputSchema> => {
      const [runtime, script] = process.argv;

      try {
        const args = [
          ...process.execArgv,
          script,
          "workflow", "run", workflow_name,
          "--json",
          "-i", JSON.stringify(input),
        ];
        if (!test_mode) {
          args.push("--live");
        }
        args.push("--source", "mcp");
        const { stdout } = await execFileAsync(runtime, args, { cwd: process.cwd() });

        const parsed = JSON.parse(stdout) as OutputSchema;
        return { ...parsed, test_mode };
      } catch (err: unknown) {
        // execFile rejects on non-zero exit — try to parse JSON from stdout
        const execErr = err as { stdout?: string; stderr?: string; message?: string };
        if (execErr.stdout) {
          try {
            const parsed = JSON.parse(execErr.stdout) as OutputSchema;
            return { ...parsed, test_mode };
          } catch { /* fall through */ }
        }
        return {
          status: "ERROR",
          error: execErr.stderr?.trim() || execErr.message || String(err),
          test_mode,
        };
      }
    },
  };
};
