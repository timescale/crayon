// packages/core/src/workflow.ts
import { z } from "zod";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Executable, WorkflowContext, LogLevel, ConnectionCredentials } from "./types.js";
import { resolveConnectionId } from "./connections/index.js";
import type { IntegrationProvider } from "./connections/integration-provider.js";
import type pg from "pg";

/**
 * Definition for creating a workflow
 */
export interface WorkflowDefinition<TInput, TOutput> {
  name: string;
  description: string;
  version: number;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  run: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Extended executable interface for workflows (includes version)
 */
export interface WorkflowExecutable<TInput = unknown, TOutput = unknown>
  extends Executable<TInput, TOutput> {
  readonly version: number;
}

/**
 * Runtime config for workflow context (set by factory)
 */
interface WorkflowRuntimeConfig {
  sql: pg.Pool | null;
  integrationProvider: IntegrationProvider | null;
  workflowName: string;
  appSchema: string;
}

/**
 * Create a WorkflowContext that wraps calls in DBOS steps for durability
 */
function createDurableContext(config?: WorkflowRuntimeConfig): WorkflowContext {
  let _currentNodeName = "*";
  let _currentIntegrations: string[] | undefined;

  const ctx: WorkflowContext = {
    workflowName: config?.workflowName ?? "*",

    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      // Track current node for connection resolution
      _currentNodeName = executable.name;
      _currentIntegrations = executable.integrations;

      if (executable.type === "workflow" || executable.type === "agent") {
        // For workflows and agents, call execute directly (they handle their own DBOS registration)
        // This allows proper child workflow tracking
        return executable.execute(ctx, validated);
      }

      // For nodes, wrap execution in DBOS step for durability
      return DBOS.runStep(
        async () => executable.execute(ctx, validated),
        { name: executable.name }
      );
    },

    getConnection: async (integrationId: string): Promise<ConnectionCredentials> => {
      if (!config?.sql || !config?.integrationProvider) {
        throw new Error(
          "Connection management not configured. Set NANGO_SECRET_KEY and DATABASE_URL.",
        );
      }

      // Validate that the integration was declared on the current node
      if (_currentIntegrations && !_currentIntegrations.includes(integrationId)) {
        const declared = _currentIntegrations.map(i => `"${i}"`).join(", ");
        throw new Error(
          `Integration "${integrationId}" is not declared on node "${_currentNodeName}". ` +
          `Declared integrations: [${declared}]. ` +
          `Add "${integrationId}" to the node's integrations array.`,
        );
      }

      const connectionId = await resolveConnectionId(
        config.sql,
        config.workflowName,
        _currentNodeName,
        integrationId,
        config.appSchema,
      );

      if (!connectionId) {
        throw new Error(
          `No connection configured for integration "${integrationId}" ` +
          `(workflow="${config.workflowName}", node="${_currentNodeName}"). ` +
          `Configure it in the Dev UI or set a global default.`,
        );
      }

      return config.integrationProvider.fetchCredentials(integrationId, connectionId);
    },

    log: (message: string, level: LogLevel = "info") => {
      DBOS.logger[level](message);
    },
  };

  return ctx;
}

/**
 * Runtime config stored on globalThis so it's shared across module instances.
 * This is necessary because jiti-loaded workflow files may import a different
 * copy of this module than the compiled MCP server code that calls
 * configureWorkflowRuntime().
 * @internal
 */
const POOL_KEY = Symbol.for("ocrayon.getWorkflowPool()");
const PROVIDER_KEY = Symbol.for("ocrayon.getWorkflowIntegrationProvider()");
const SCHEMA_KEY = Symbol.for("ocrayon.getWorkflowAppSchema()");

function getWorkflowPool(): pg.Pool | null {
  return (globalThis as Record<symbol, pg.Pool | null>)[POOL_KEY] ?? null;
}

function getWorkflowIntegrationProvider(): IntegrationProvider | null {
  return (globalThis as Record<symbol, IntegrationProvider | null>)[PROVIDER_KEY] ?? null;
}

function getWorkflowAppSchema(): string {
  return (globalThis as Record<symbol, string>)[SCHEMA_KEY] ?? "public";
}

/**
 * Configure the workflow runtime (called by factory)
 * @internal
 */
export function configureWorkflowRuntime(
  sql: pg.Pool | null,
  integrationProvider: IntegrationProvider | null,
  appSchema: string,
): void {
  (globalThis as Record<symbol, pg.Pool | null>)[POOL_KEY] = sql;
  (globalThis as Record<symbol, IntegrationProvider | null>)[PROVIDER_KEY] = integrationProvider;
  (globalThis as Record<symbol, string>)[SCHEMA_KEY] = appSchema;
}

/**
 * Return type for createNodeWrapper — the executable plus a setter
 * to override the workflow name used for connection resolution.
 */
export interface NodeWrapper<TInput = unknown, TOutput = unknown> {
  executable: WorkflowExecutable<TInput, TOutput>;
  setParentWorkflowName: (name: string | undefined) => void;
}

// Global cache for workflow executables to prevent duplicate DBOS registration
// when bundlers (Turbopack) re-evaluate the same module in multiple chunks.
const WORKFLOW_CACHE_KEY = Symbol.for("ocrayon.workflowCache");
function getWorkflowCache(): Map<string, WorkflowExecutable> {
  const g = globalThis as Record<symbol, Map<string, WorkflowExecutable>>;
  if (!g[WORKFLOW_CACHE_KEY]) g[WORKFLOW_CACHE_KEY] = new Map();
  return g[WORKFLOW_CACHE_KEY];
}

/**
 * Factory for creating workflow executables
 */
export const Workflow = {
  create<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>
  ): WorkflowExecutable<TInput, TOutput> {
    // Return cached executable if already registered (bundler re-evaluation)
    const cached = getWorkflowCache().get(definition.name);
    if (cached) return cached as WorkflowExecutable<TInput, TOutput>;

    // Create the DBOS-registered workflow function
    async function workflowImpl(inputs: TInput): Promise<TOutput> {
      const ctx = createDurableContext({
        sql: getWorkflowPool(),
        integrationProvider: getWorkflowIntegrationProvider(),
        workflowName: definition.name,
        appSchema: getWorkflowAppSchema(),
      });
      return definition.run(ctx, inputs);
    }

    // Register with DBOS (returns callable function)
    const durableWorkflow = DBOS.registerWorkflow(workflowImpl, {
      name: definition.name,
    });

    const executable: WorkflowExecutable<TInput, TOutput> = {
      name: definition.name,
      type: "workflow",
      description: definition.description,
      version: definition.version,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      // execute ignores the ctx param and uses DBOS context instead
      execute: (_ctx: WorkflowContext, inputs: TInput) => durableWorkflow(inputs),
    };

    getWorkflowCache().set(definition.name, executable as WorkflowExecutable);
    return executable;
  },

  /**
   * Create a wrapper workflow for running a node standalone.
   * Uses the same _parentWorkflowName pattern as Agent.create() so
   * connection resolution uses the real workflow name instead of the
   * synthetic `_node_<name>` wrapper name.
   */
  createNodeWrapper<TInput, TOutput>(
    nodeName: string,
    node: Executable<TInput, TOutput>,
  ): NodeWrapper<TInput, TOutput> {
    const wrapperName = `_node_${nodeName}`;

    // Parent workflow name for connection resolution (same pattern as Agent)
    let _parentWorkflowName: string | undefined;

    async function wrapperImpl(inputs: TInput): Promise<TOutput> {
      const ctx = createDurableContext({
        sql: getWorkflowPool(),
        integrationProvider: getWorkflowIntegrationProvider(),
        workflowName: _parentWorkflowName ?? wrapperName,
        appSchema: getWorkflowAppSchema(),
      });
      _parentWorkflowName = undefined;
      return ctx.run(node, inputs);
    }

    const durableWrapper = DBOS.registerWorkflow(wrapperImpl, {
      name: wrapperName,
    });

    return {
      executable: {
        name: wrapperName,
        type: "workflow",
        description: `Wrapper workflow for node ${nodeName}`,
        version: 1,
        inputSchema: node.inputSchema,
        outputSchema: node.outputSchema,
        execute: (_ctx: WorkflowContext, inputs: TInput) => durableWrapper(inputs),
      },
      setParentWorkflowName: (name) => { _parentWorkflowName = name; },
    };
  },
};
