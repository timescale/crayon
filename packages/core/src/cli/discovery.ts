// packages/cli/src/discovery.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { Executable } from "../index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExecutable = Executable<any, any>;

// Alias '@crayon/core' to the same dist/index.js that the running CLI loaded.
// Without this, jiti resolves 'import { Workflow } from "@crayon/core"' from the
// project's local node_modules, creating a separate module instance with its
// own DBOS singleton that is never launched — causing
// "DBOS.launch() must be called before running workflows" errors.
//
// This file lives at dist/cli/discovery.js in the installed package;
// the package main entry is dist/index.js (one level up from dist/cli/).
const _thisDir = path.dirname(fileURLToPath(import.meta.url));
const _crayonMain = path.resolve(_thisDir, "..", "index.js");

const jiti = createJiti(import.meta.url, {
  alias: { "@crayon/core": _crayonMain },
});

export interface DiscoveryResult {
  workflows: AnyExecutable[];
  warnings: string[];
}

export interface NodeDiscoveryResult {
  nodes: Record<string, AnyExecutable>;
  warnings: string[];
}

export interface AgentDiscoveryResult {
  agents: Record<string, AnyExecutable>;
  warnings: string[];
}

/**
 * Check if a value is a workflow executable
 */
function isWorkflow(value: unknown): value is AnyExecutable {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value as { type: string }).type === "workflow"
  );
}

/**
 * Discover and load workflow executables from generated/workflows/ directory
 * Uses jiti to load TypeScript files directly without compilation
 * Returns workflows and any warnings (caller decides whether to display warnings)
 */
export async function discoverWorkflows(
  projectDir: string
): Promise<DiscoveryResult> {
  const workflowDir = path.join(projectDir, "generated", "workflows");

  if (!fs.existsSync(workflowDir)) {
    return { workflows: [], warnings: [] };
  }

  const files = fs.readdirSync(workflowDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
  const workflows: AnyExecutable[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const filePath = path.join(workflowDir, file);

    try {
      const module = await jiti.import(filePath);

      // Find the workflow export in the module
      for (const value of Object.values(module as Record<string, unknown>)) {
        if (isWorkflow(value)) {
          workflows.push(value);
          break; // One workflow per file
        }
      }
    } catch (err) {
      warnings.push(`Failed to load workflow ${file}: ${err}`);
    }
  }

  return { workflows, warnings };
}

/**
 * Check if a value is a node executable
 */
function isNode(value: unknown): value is AnyExecutable {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value as { type: string }).type === "node"
  );
}

/**
 * Discover and load node executables from src/nodes/ directory
 * Uses jiti to load TypeScript files directly without compilation
 * Returns nodes indexed by name and any warnings
 */
export async function discoverNodes(
  projectDir: string
): Promise<NodeDiscoveryResult> {
  const nodesDir = path.join(projectDir, "src", "nodes");
  const nodes: Record<string, AnyExecutable> = {};
  const warnings: string[] = [];

  if (!fs.existsSync(nodesDir)) {
    return { nodes, warnings };
  }

  const files = fs.readdirSync(nodesDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    // Skip index files
    if (file === "index.ts" || file === "index.js") continue;

    const filePath = path.join(nodesDir, file);

    try {
      const module = await jiti.import(filePath);

      // Find node exports in the module
      for (const value of Object.values(module as Record<string, unknown>)) {
        if (isNode(value)) {
          nodes[value.name] = value;
        }
      }
    } catch (err) {
      warnings.push(`Failed to load node ${file}: ${err}`);
    }
  }

  return { nodes, warnings };
}

/**
 * Check if a value is an agent executable
 */
function isAgent(value: unknown): value is AnyExecutable {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    (value as { type: string }).type === "agent"
  );
}

/**
 * Discover and load agent executables from agents/ directory
 * Uses jiti to load TypeScript files directly without compilation
 * Returns agents indexed by name and any warnings
 */
export async function discoverAgents(
  projectDir: string
): Promise<AgentDiscoveryResult> {
  const agentsDir = path.join(projectDir, "agents");
  const agents: Record<string, AnyExecutable> = {};
  const warnings: string[] = [];

  if (!fs.existsSync(agentsDir)) {
    return { agents, warnings };
  }

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    // Skip index files
    if (file === "index.ts" || file === "index.js") continue;

    const filePath = path.join(agentsDir, file);

    try {
      const module = await jiti.import(filePath);

      // Find agent exports in the module
      for (const value of Object.values(module as Record<string, unknown>)) {
        if (isAgent(value)) {
          agents[value.name] = value;
        }
      }
    } catch (err) {
      warnings.push(`Failed to load agent ${file}: ${err}`);
    }
  }

  return { agents, warnings };
}
