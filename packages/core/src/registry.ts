// packages/core/src/registry.ts
import type { Executable } from "./types.js";
import type { WorkflowExecutable } from "./workflow.js";

export interface RegistryConfig {
  workflows?: Record<string, Executable>;
  agents?: Record<string, Executable>;
  nodes?: Record<string, Executable>;
}

/**
 * Registry for managing executables (workflows, agents, nodes)
 */
export class Registry {
  private workflows: Map<string, Executable>;
  private agents: Map<string, Executable>;
  private nodes: Map<string, Executable>;

  constructor(config: RegistryConfig) {
    this.workflows = new Map(Object.entries(config.workflows ?? {}));
    this.agents = new Map(Object.entries(config.agents ?? {}));
    this.nodes = new Map(Object.entries(config.nodes ?? {}));
  }

  /** Get a workflow by name */
  getWorkflow(name: string): WorkflowExecutable | undefined {
    return this.workflows.get(name) as WorkflowExecutable | undefined;
  }

  /** List all workflow names */
  listWorkflows(): string[] {
    return Array.from(this.workflows.keys());
  }

  /** Get any executable by name (searches all registries) */
  getExecutable(name: string): Executable | undefined {
    return (
      this.workflows.get(name) ??
      this.agents.get(name) ??
      this.nodes.get(name)
    );
  }

  /** List all registered executable names */
  listAll(): string[] {
    return [
      ...this.workflows.keys(),
      ...this.agents.keys(),
      ...this.nodes.keys(),
    ];
  }
}
