// packages/core/src/factory.ts
import type { Pflow, PflowConfig, WorkflowContext } from "./types.js";
import { Registry } from "./registry.js";
import { initializeDBOS, shutdownDBOS } from "./dbos.js";
import { NodeRegistry } from "./nodes/registry.js";
import { configureAgentRuntime } from "./agent.js";
import { Workflow, configureWorkflowRuntime, type NodeWrapper } from "./workflow.js";
import { ensureConnectionsTable } from "./connections/index.js";
import { createIntegrationProvider } from "./connections/integration-provider.js";
import pg from "pg";

/**
 * Create a 0pflow instance
 */
export async function create0pflow(config: PflowConfig): Promise<Pflow> {
  // Build registry from provided executables (before DBOS init)
  const registry = new Registry({
    workflows: config.workflows,
    agents: config.agents,
    nodes: config.nodes,
  });

  // Pre-create wrapper workflows for all nodes BEFORE DBOS.launch()
  // This is required because DBOS doesn't allow registering workflows after launch
  const nodeWrapperCache = new Map<string, NodeWrapper>();
  for (const nodeName of registry.listNodes()) {
    const node = registry.getNode(nodeName);
    if (node) {
      nodeWrapperCache.set(nodeName, Workflow.createNodeWrapper(nodeName, node));
    }
  }

  // Initialize DBOS for durability (after all workflows are registered)
  await initializeDBOS({ databaseUrl: config.databaseUrl, appName: config.appName });

  // Initialize integration provider:
  // NANGO_SECRET_KEY set → local/self-hosted (direct Nango)
  // Otherwise → cloud mode (proxies through auth server)
  const integrationProvider = await createIntegrationProvider(
    config.nangoSecretKey,
  );

  // Create shared pg pool for connection management (needed for local connection mapping)
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  await ensureConnectionsTable(config.databaseUrl);

  // Configure workflow runtime with pool + integration provider
  configureWorkflowRuntime(pool, integrationProvider);

  // Build node registry (includes built-in nodes + user nodes)
  // Nodes can be used both via ctx.run() and as agent tools
  const nodeRegistry = new NodeRegistry({
    userNodes: config.nodes,
  });

  // Configure agent runtime with node registry and model config
  configureAgentRuntime({
    nodeRegistry,
    modelConfig: config.modelConfig,
    pool,
    integrationProvider,
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

    listNodes: () => registry.listNodes(),

    getNode: (name: string) => registry.getNode(name),

    triggerNode: async <T = unknown>(
      name: string,
      inputs: unknown,
      options?: { workflowName?: string },
    ): Promise<T> => {
      const node = registry.getNode(name);
      if (!node) {
        throw new Error(`Node "${name}" not found`);
      }

      // Get pre-created wrapper workflow for this node
      const wrapper = nodeWrapperCache.get(name);
      if (!wrapper) {
        throw new Error(`No wrapper workflow found for node "${name}"`);
      }

      // Set parent workflow name for connection resolution (same pattern as Agent)
      if (options?.workflowName) {
        wrapper.setParentWorkflowName(options.workflowName);
      }

      // Validate inputs and execute via wrapper workflow
      const validated = node.inputSchema.parse(inputs);
      return wrapper.executable.execute(null as unknown as WorkflowContext, validated) as Promise<T>;
    },

    shutdown: async () => {
      if (pool) {
        await pool.end();
      }
      await shutdownDBOS();
    },
  };
}
