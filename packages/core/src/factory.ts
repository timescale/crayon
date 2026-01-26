// packages/core/src/factory.ts
import type { Pflow, PflowConfig } from "./types.js";
import { Registry } from "./registry.js";
import { initializeDBOS, createDurableContext } from "./dbos.js";

/**
 * Create a 0pflow instance
 */
export async function create0pflow(config: PflowConfig): Promise<Pflow> {
  // Initialize DBOS for durability
  await initializeDBOS({ databaseUrl: config.databaseUrl });

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

      // Create durable context for this execution
      const ctx = createDurableContext();

      // Validate inputs and execute
      const validated = workflow.inputSchema.parse(inputs);
      return workflow.execute(ctx, validated) as Promise<T>;
    },
  };
}
