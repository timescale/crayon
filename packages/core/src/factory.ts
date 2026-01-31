// packages/core/src/factory.ts
import type { Pflow, PflowConfig, WorkflowContext } from "./types.js";
import { Registry } from "./registry.js";
import { initializeDBOS, shutdownDBOS } from "./dbos.js";
import { NodeRegistry } from "./nodes/registry.js";
import { configureAgentRuntime } from "./agent.js";

/**
 * Create a 0pflow instance
 */
export async function create0pflow(config: PflowConfig): Promise<Pflow> {
  // Initialize DBOS for durability
  await initializeDBOS({ databaseUrl: config.databaseUrl, appName: config.appName });

  // Build node registry (includes built-in nodes + user nodes)
  // Nodes can be used both via ctx.run() and as agent tools
  const nodeRegistry = new NodeRegistry({
    userNodes: config.nodes,
  });

  // Configure agent runtime with node registry and model config
  configureAgentRuntime({
    nodeRegistry,
    modelConfig: config.modelConfig,
  });

  // Build registry from provided executables
  const registry = new Registry({
    workflows: config.workflows,
    agents: config.agents,
    nodes: config.nodes,
  });

  return {
    listWorkflows: () => registry.listWorkflows(),

    getWorkflow: (name: string) => registry.getWorkflow(name),

    triggerWorkflow: async <T = unknown>(
      name: string,
      inputs: unknown
    ): Promise<T> => {
      const workflow = registry.getWorkflow(name);
      if (!workflow) {
        throw new Error(`Workflow "${name}" not found`);
      }

      // Validate inputs and execute (workflow handles DBOS context internally)
      const validated = workflow.inputSchema.parse(inputs);
      return workflow.execute(null as unknown as WorkflowContext, validated) as Promise<T>;
    },

    shutdown: async () => {
      await shutdownDBOS();
    },
  };
}
