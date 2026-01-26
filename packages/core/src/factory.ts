import type { Pflow, PflowConfig } from "./types.js";

/**
 * Create a 0pflow instance
 */
export async function create0pflow(_config: PflowConfig): Promise<Pflow> {
  // Placeholder implementation - will be completed in Task 8
  return {
    listWorkflows: () => [],
    getWorkflow: () => undefined,
    triggerWorkflow: async () => {
      throw new Error("Not implemented");
    },
  };
}
