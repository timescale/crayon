// packages/core/src/discover.ts
import type { Executable } from "./types.js";
import {
  discoverWorkflows,
  discoverNodes,
  discoverAgents,
} from "./cli/discovery.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExecutable = Executable<any, any>;

export interface DiscoverResult {
  workflows: Record<string, AnyExecutable>;
  agents: Record<string, AnyExecutable>;
  nodes: Record<string, AnyExecutable>;
  warnings: string[];
}

/**
 * Discover all workflows, agents, and nodes in a project directory.
 * Returns the exact shape that createCrayon() expects.
 */
export async function discover(projectDir: string): Promise<DiscoverResult> {
  // Discover agents and nodes first so they're in jiti's module cache.
  // Workflows import agents/nodes, and if loaded in parallel, the same
  // agent file gets evaluated twice causing duplicate DBOS registration.
  const [nodeResult, agentResult] = await Promise.all([
    discoverNodes(projectDir),
    discoverAgents(projectDir),
  ]);

  const wfResult = await discoverWorkflows(projectDir);

  // Convert workflows array to Record keyed by name
  const workflows: Record<string, AnyExecutable> = {};
  for (const wf of wfResult.workflows) {
    workflows[wf.name] = wf;
  }

  const warnings = [
    ...wfResult.warnings,
    ...nodeResult.warnings,
    ...agentResult.warnings,
  ];

  return {
    workflows,
    agents: agentResult.agents,
    nodes: nodeResult.nodes,
    warnings,
  };
}
