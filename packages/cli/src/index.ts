#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import Table from "cli-table3";
import { create0pflow } from "0pflow";
import { discoverWorkflows } from "./discovery.js";
import { resolveEnv } from "./env.js";
import { listRuns, getRun } from "./runs.js";

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

const program = new Command();

program
  .name("0pflow")
  .description("CLI for 0pflow workflow engine")
  .version("0.1.0");

program
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

program
  .command("run <workflow>")
  .description("Run a workflow")
  .option("-i, --input <json>", "JSON input for the workflow", "{}")
  .option("--json", "Output result as JSON")
  .action(async (workflowName: string, options: { input: string; json?: boolean }) => {
    try {
      // Load environment (all .env vars into process.env)
      resolveEnv();

      // Discover workflows
      const { workflows, warnings } = await discoverWorkflows(process.cwd());

      // Always show warnings on stderr
      for (const warning of warnings) {
        console.error(pc.yellow(`Warning: ${warning}`));
      }

      const workflow = workflows.find(w => w.name === workflowName);

      if (!workflow) {
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
      const validation = workflow.inputSchema.safeParse(rawInput);
      if (!validation.success) {
        console.error(pc.red("Invalid workflow input:"));
        for (const issue of validation.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          console.error(pc.red(`  ${path}: ${issue.message}`));
        }
        process.exit(1);
      }
      const inputs = validation.data;

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
        workflows: workflowRegistry,
      });

      try {
        const result = await pflow.triggerWorkflow(workflow.name, inputs);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(pc.green("\nResult:"));
          console.log(JSON.stringify(result, null, 2));
        }
      } finally {
        await pflow.shutdown();
      }
    } catch (err) {
      console.error(pc.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

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
            table.push({ [pc.dim("Output")]: JSON.stringify(run.output, null, 2) });
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

program.parse();
