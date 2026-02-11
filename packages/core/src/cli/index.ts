#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import Table from "cli-table3";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { create0pflow } from "../index.js";
import { discoverWorkflows, discoverNodes } from "./discovery.js";
import { resolveEnv } from "./env.js";
import { listRuns, getRun } from "./runs.js";
import { getTrace, printTrace } from "./trace.js";
import { getAppName } from "./app.js";
import { startMcpServer } from "./mcp/server.js";
import { runInstall, runUninstall } from "./install.js";

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgJsonPath = resolve(__dirname, "../../package.json");
export let version = "0.0.0";
try {
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  version = pkgJson.version || version;
} catch {
  // Fallback if we can't read package.json
}

/**
 * Get the npm version for MCP command (exact version to keep skills and MCP server in sync)
 */
export function getNpmVersionForMcp(): string {
  return version;
}

function formatStatus(status: string): string {
  switch (status) {
    case "SUCCESS":
      return pc.green(status);
    case "ERROR":
      return pc.red(status);
    case "PENDING":
      return pc.yellow(status);
    default:
      return status;
  }
}

function formatDate(timestamp: Date | string | number): string {
  // DBOS stores timestamps as bigint strings in milliseconds
  const ms = typeof timestamp === "string" ? parseInt(timestamp, 10) :
             typeof timestamp === "number" ? timestamp :
             timestamp.getTime();
  return new Date(ms).toLocaleString();
}

function formatOutput(output: unknown): string {
  // DBOS stores output as serialized JSON with superjson wrapper
  // e.g. '{"json":{...},"__dbos_serializer":"superjson"}'
  try {
    const parsed = typeof output === "string" ? JSON.parse(output) : output;
    if (parsed && typeof parsed === "object" && "__dbos_serializer" in parsed && "json" in parsed) {
      return JSON.stringify(parsed.json, null, 2);
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(output);
  }
}

/**
 * Redirect stdout to stderr so dependency noise (DBOS logger, dotenv, etc.)
 * doesn't pollute JSON output. Returns a function that writes directly to
 * the real stdout for the final JSON result.
 */
function captureStdout(): (data: string) => void {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  return (data: string) => { originalWrite(data + "\n"); };
}

const program = new Command();

program
  .name("0pflow")
  .description("CLI for 0pflow workflow engine")
  .version(version);

// ============ Workflow commands ============
const workflow = program.command("workflow").description("Workflow commands");

workflow
  .command("list")
  .description("List all available workflows")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const { workflows, warnings } = await discoverWorkflows(process.cwd());

      // Always show warnings on stderr (doesn't pollute stdout for JSON parsing)
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      if (workflows.length === 0) {
        if (options.json) {
          console.log("[]");
        } else {
          console.log(pc.yellow("No workflows found in generated/workflows/"));
        }
        return;
      }

      if (options.json) {
        const output = workflows.map(w => ({
          name: w.name,
          version: w.version,
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(pc.bold("\nAvailable workflows:\n"));
        for (const w of workflows) {
          const version = w.version ? ` (v${w.version})` : "";
          console.log(`  ${pc.cyan(w.name)}${pc.dim(version)}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

workflow
  .command("run <name>")
  .description("Run a workflow")
  .option("-i, --input <json>", "JSON input for the workflow", "{}")
  .option("--json", "Output result as JSON")
  .action(async (workflowName: string, options: { input: string; json?: boolean }) => {
    const writeJson = options.json ? captureStdout() : null;
    try {
      // Load environment (all .env vars into process.env)
      resolveEnv();

      // Discover workflows
      const { workflows, warnings } = await discoverWorkflows(process.cwd());

      // Always show warnings on stderr
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      const wf = workflows.find(w => w.name === workflowName);

      if (!wf) {
        console.error(pc.red(`Workflow "${workflowName}" not found`));
        console.log(pc.dim(`Available: ${workflows.map(w => w.name).join(", ")}`));
        process.exit(1);
      }

      // Parse input JSON
      let rawInput: unknown;
      try {
        rawInput = JSON.parse(options.input);
      } catch {
        console.error(pc.red("Invalid JSON input"));
        process.exit(1);
      }

      // Validate input against workflow schema
      const validation = wf.inputSchema.safeParse(rawInput);
      if (!validation.success) {
        console.error(pc.red("Invalid workflow input:"));
        for (const issue of validation.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          console.error(pc.red(`  ${path}: ${issue.message}`));
        }
        process.exit(1);
      }
      const inputs = validation.data;

      // Discover user-defined nodes
      const { nodes, warnings: nodeWarnings } = await discoverNodes(process.cwd());

      // Show node warnings on stderr
      for (const warning of nodeWarnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      // Build workflow registry from all discovered workflows
      const workflowRegistry = Object.fromEntries(
        workflows.map(w => [w.name, w])
      );

      // Create 0pflow instance and run
      if (!options.json) {
        console.log(pc.dim(`Running ${workflowName}...`));
      }

      const pflow = await create0pflow({
        databaseUrl: process.env.DATABASE_URL!,
        appName: getAppName(),
        workflows: workflowRegistry,
        nodes,
      });

      try {
        const runId = randomUUID();
        const result = await DBOS.withNextWorkflowID(runId, () =>
          pflow.triggerWorkflow(wf.name, inputs),
        );

        if (writeJson) {
          writeJson(JSON.stringify({ run_id: runId, status: "SUCCESS", result }));
        } else {
          console.log(pc.dim(`Run ID: ${runId}`));
          console.log(pc.green("\nResult:"));
          console.log(JSON.stringify(result, null, 2));
        }
      } finally {
        await pflow.shutdown();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (writeJson) {
        writeJson(JSON.stringify({ status: "ERROR", error: msg }));
      } else {
        console.error(pc.red(`Error: ${msg}`));
      }
      process.exit(1);
    }
  });

// ============ Node commands ============
const node = program.command("node").description("Node commands");

node
  .command("list")
  .description("List all available nodes")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const { nodes, warnings } = await discoverNodes(process.cwd());

      // Always show warnings on stderr
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      const nodeNames = Object.keys(nodes);

      if (nodeNames.length === 0) {
        if (options.json) {
          console.log("[]");
        } else {
          console.log(pc.yellow("No nodes found in src/nodes/"));
        }
        return;
      }

      if (options.json) {
        const output = nodeNames.map(name => ({
          name,
          description: nodes[name].description,
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(pc.bold("\nAvailable nodes:\n"));
        for (const name of nodeNames) {
          const desc = nodes[name].description;
          console.log(`  ${pc.cyan(name)}${desc ? pc.dim(` - ${desc}`) : ""}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

node
  .command("run <name>")
  .description("Run a node (wrapped in workflow for durability)")
  .option("-i, --input <json>", "JSON input for the node", "{}")
  .option("--json", "Output result as JSON")
  .action(async (nodeName: string, options: { input: string; json?: boolean }) => {
    const writeJson = options.json ? captureStdout() : null;
    try {
      // Load environment
      resolveEnv();

      // Discover nodes
      const { nodes, warnings } = await discoverNodes(process.cwd());

      // Always show warnings on stderr
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      const nodeExecutable = nodes[nodeName];

      if (!nodeExecutable) {
        console.error(pc.red(`Node "${nodeName}" not found`));
        const availableNodes = Object.keys(nodes);
        if (availableNodes.length > 0) {
          console.log(pc.dim(`Available: ${availableNodes.join(", ")}`));
        }
        process.exit(1);
      }

      // Parse input JSON
      let rawInput: unknown;
      try {
        rawInput = JSON.parse(options.input);
      } catch {
        console.error(pc.red("Invalid JSON input"));
        process.exit(1);
      }

      // Validate input against node schema
      const validation = nodeExecutable.inputSchema.safeParse(rawInput);
      if (!validation.success) {
        console.error(pc.red("Invalid node input:"));
        for (const issue of validation.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          console.error(pc.red(`  ${path}: ${issue.message}`));
        }
        process.exit(1);
      }
      const inputs = validation.data;

      // Create 0pflow instance
      if (!options.json) {
        console.log(pc.dim(`Running node ${nodeName}...`));
      }

      const pflow = await create0pflow({
        databaseUrl: process.env.DATABASE_URL!,
        appName: getAppName(),
        nodes,
      });

      try {
        const runId = randomUUID();
        const result = await DBOS.withNextWorkflowID(runId, () =>
          pflow.triggerNode(nodeName, inputs),
        );

        if (writeJson) {
          writeJson(JSON.stringify({ run_id: runId, status: "SUCCESS", result }));
        } else {
          console.log(pc.dim(`Run ID: ${runId}`));
          console.log(pc.green("\nResult:"));
          console.log(JSON.stringify(result, null, 2));
        }
      } finally {
        await pflow.shutdown();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (writeJson) {
        writeJson(JSON.stringify({ status: "ERROR", error: msg }));
      } else {
        console.error(pc.red(`Error: ${msg}`));
      }
      process.exit(1);
    }
  });

// ============ History command (unchanged) ============
program
  .command("history [run-id]")
  .description("List past workflow executions or get details of a specific run")
  .option("-n, --limit <number>", "Number of runs to show", "20")
  .option("-w, --workflow <name>", "Filter by workflow name")
  .option("--json", "Output as JSON")
  .action(async (runId: string | undefined, options: { limit: string; workflow?: string; json?: boolean }) => {
    try {
      resolveEnv();
      const databaseUrl = process.env.DATABASE_URL!;

      if (runId) {
        // Get specific run (supports full ID or prefix like git short hashes)
        const { run, ambiguous } = await getRun(databaseUrl, runId);

        if (ambiguous) {
          console.error(pc.red(`Ambiguous run ID prefix "${runId}" - matches multiple runs`));
          console.error(pc.dim("Use a longer prefix or the full ID"));
          process.exit(1);
        }

        if (!run) {
          console.error(pc.red(`Run "${runId}" not found`));
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(run, null, 2));
        } else {
          const table = new Table();
          table.push(
            { [pc.dim("ID")]: run.workflow_uuid },
            { [pc.dim("Workflow")]: pc.cyan(run.name) },
            { [pc.dim("Status")]: formatStatus(run.status) },
            { [pc.dim("Created")]: formatDate(run.created_at) },
            { [pc.dim("Updated")]: formatDate(run.updated_at) },
          );
          if (run.output) {
            table.push({ [pc.dim("Output")]: formatOutput(run.output) });
          }
          if (run.error) {
            table.push({ [pc.dim("Error")]: pc.red(run.error) });
          }
          console.log();
          console.log(table.toString());
          console.log();
        }
      } else {
        // List runs
        const runs = await listRuns(databaseUrl, {
          limit: parseInt(options.limit, 10),
          workflowName: options.workflow,
        });

        if (runs.length === 0) {
          if (options.json) {
            console.log("[]");
          } else {
            console.log(pc.yellow("No workflow runs found"));
          }
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(runs, null, 2));
        } else {
          const table = new Table({
            head: [pc.dim("ID"), pc.dim("Workflow"), pc.dim("Status"), pc.dim("Created")],
          });
          for (const run of runs) {
            table.push([
              run.workflow_uuid.slice(0, 8),
              pc.cyan(run.name),
              formatStatus(run.status),
              formatDate(run.created_at),
            ]);
          }
          console.log();
          console.log(table.toString());
          console.log();
        }
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

// ============ Trace command (unchanged) ============
program
  .command("trace <run-id>")
  .description("Show execution trace for a workflow run")
  .option("--json", "Output as JSON")
  .action(async (runId: string, options: { json?: boolean }) => {
    try {
      resolveEnv();
      const databaseUrl = process.env.DATABASE_URL!;

      const trace = await getTrace(databaseUrl, runId);

      if (trace.ambiguous) {
        console.error(pc.red(`Ambiguous run ID prefix "${runId}" - matches multiple runs`));
        console.error(pc.dim("Use a longer prefix or the full ID"));
        process.exit(1);
      }

      if (!trace.workflow) {
        console.error(pc.red(`Run "${runId}" not found`));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(trace, null, 2));
      } else {
        printTrace(trace);
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

// ============ Dev UI command ============
program
  .command("dev")
  .description("Start the Dev UI (visual workflow DAG viewer)")
  .option("-p, --port <number>", "Port to serve on", "4173")
  .option("--host", "Expose to network")
  .action(async (options: { port: string; host?: boolean }) => {
    // Load .env for DATABASE_URL and NANGO_SECRET_KEY
    try {
      resolveEnv();
    } catch {
      // Dev UI can work without env (connections API just won't be available)
    }

    const { startDevServer } = await import("../dev-ui/index.js");
    await startDevServer({
      projectRoot: process.cwd(),
      port: parseInt(options.port, 10),
      host: options.host,
      databaseUrl: process.env.DATABASE_URL,
      nangoSecretKey: process.env.NANGO_SECRET_KEY,
    });
  });

// ============ MCP commands ============
const mcp = program.command("mcp").description("MCP server commands");

mcp
  .command("start")
  .description("Start the MCP server for Claude Code")
  .action(async () => {
    await startMcpServer();
  });

// ============ Install/Uninstall commands ============
program
  .command("install")
  .description("Install 0pflow plugin to Claude Code")
  .option("-f, --force", "Force reinstall even if already installed")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options: { force?: boolean; verbose?: boolean }) => {
    await runInstall({ force: options.force, verbose: options.verbose });
  });

program
  .command("uninstall")
  .description("Uninstall 0pflow plugin from Claude Code")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options: { verbose?: boolean }) => {
    await runUninstall({ verbose: options.verbose });
  });

program.parse();
