// packages/core/src/agent.ts
import { z } from "zod";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Executable, WorkflowContext, LogLevel, ConnectionCredentials } from "./types.js";
import { parseAgentSpec } from "./nodes/agent/parser.js";
import { executeAgent } from "./nodes/agent/executor.js";
import type { AgentTools } from "./nodes/agent/executor.js";
import type { ModelConfig } from "./nodes/agent/model-config.js";
import type { NodeRegistry } from "./nodes/registry.js";
import { resolveConnectionId } from "./connections/index.js";
import type { IntegrationProvider } from "./connections/integration-provider.js";
import type pg from "pg";

export type { AgentTool, AgentTools } from "./nodes/agent/executor.js";

/**
 * Definition for creating an agent
 */
export interface AgentDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  /** Tools available to this agent, keyed by name */
  tools?: AgentTools;
  /** Path to agent spec markdown file (for system prompt) */
  specPath: string;
  /** Integrations this agent needs (e.g. ["openai"] to fetch API key from Nango) */
  integrations?: string[];
}

/**
 * Extended executable interface for agents
 */
export interface AgentExecutable<TInput = unknown, TOutput = unknown>
  extends Executable<TInput, TOutput> {
  readonly specPath: string;
  readonly tools: AgentTools;
}

/**
 * Runtime configuration for agent execution
 * Set by createCrayon() factory
 */
interface AgentRuntimeConfig {
  nodeRegistry: NodeRegistry;
  modelConfig?: ModelConfig;
  pool: pg.Pool | null;
  integrationProvider: IntegrationProvider | null;
  appSchema: string;
}

const AGENT_CONFIG_KEY = Symbol.for("crayon.getAgentRuntimeConfig()");

function getAgentRuntimeConfig(): AgentRuntimeConfig | null {
  return (globalThis as Record<symbol, AgentRuntimeConfig | null>)[AGENT_CONFIG_KEY] ?? null;
}

/**
 * Configure the agent runtime (called by factory)
 * @internal
 */
export function configureAgentRuntime(config: AgentRuntimeConfig): void {
  (globalThis as Record<symbol, AgentRuntimeConfig | null>)[AGENT_CONFIG_KEY] = config;
}

/**
 * Create a WorkflowContext for agent execution that wraps tool calls in DBOS steps
 *
 * @param agentName - The agent's own name (used as workflowName for DBOS child workflow)
 * @param parentWorkflowName - The parent workflow name (for connection resolution)
 * @param parentNodeName - The agent's node name within the parent workflow (for connection resolution)
 */
function createAgentContext(
  agentName: string,
  parentWorkflowName?: string,
  parentNodeName?: string,
): WorkflowContext {
  let _currentNodeName = "*";
  let _currentIntegrations: string[] | undefined;

  const ctx: WorkflowContext = {
    workflowName: agentName,

    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      // Track current node for connection resolution
      _currentNodeName = executable.name;
      _currentIntegrations = executable.integrations;

      // Wrap execution in DBOS step for durability
      return DBOS.runStep(
        async () => executable.execute(ctx, validated),
        { name: executable.name }
      );
    },

    getConnection: async (integrationId: string): Promise<ConnectionCredentials> => {
      const runtimeConfig = getAgentRuntimeConfig();
      if (!runtimeConfig?.pool || !runtimeConfig?.integrationProvider) {
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

      // If the agent was called from a parent workflow, use the parent's
      // workflow name and the agent's node name within that workflow for
      // connection resolution. This matches how connections are configured
      // in the DB (workflow_name + node_name).
      const resolveWorkflow = parentWorkflowName ?? agentName;
      const resolveNode = parentNodeName ?? _currentNodeName;

      const connectionId = await resolveConnectionId(
        runtimeConfig.pool,
        resolveWorkflow,
        resolveNode,
        integrationId,
        runtimeConfig.appSchema,
      );

      if (!connectionId) {
        throw new Error(
          `No connection configured for integration "${integrationId}" ` +
          `(workflow="${resolveWorkflow}", node="${resolveNode}"). ` +
          `Configure it in the Dev UI or set a global default.`,
        );
      }

      return runtimeConfig.integrationProvider.fetchCredentials(integrationId, connectionId);
    },

    log: (message: string, level: LogLevel = "info") => {
      DBOS.logger[level](message);
    },
  };

  return ctx;
}

// Global cache for agent executables to prevent duplicate DBOS registration
// when bundlers (Turbopack) re-evaluate the same module in multiple chunks.
const AGENT_CACHE_KEY = Symbol.for("crayon.agentCache");
function getAgentCache(): Map<string, AgentExecutable> {
  const g = globalThis as Record<symbol, Map<string, AgentExecutable>>;
  if (!g[AGENT_CACHE_KEY]) g[AGENT_CACHE_KEY] = new Map();
  return g[AGENT_CACHE_KEY];
}

/**
 * Factory for creating agent executables
 */
export const Agent = {
  create<TInput, TOutput = unknown>(
    definition: AgentDefinition<TInput, TOutput>
  ): AgentExecutable<TInput, TOutput> {
    // Return cached executable if already registered (bundler re-evaluation)
    const cached = getAgentCache().get(definition.name);
    if (cached) return cached as AgentExecutable<TInput, TOutput>;

    const tools = definition.tools ?? {};

    // Parent workflow context info, captured before DBOS child workflow starts
    let _parentWorkflowName: string | undefined;
    let _parentNodeName: string | undefined;

    // Create the DBOS-registered workflow function for this agent
    async function agentWorkflowImpl(inputs: TInput): Promise<TOutput> {
      const runtimeConfig = getAgentRuntimeConfig();
      if (!runtimeConfig) {
        throw new Error(
          "Agent runtime not configured. Make sure to use createCrayon() before executing agents."
        );
      }

      const ctx = createAgentContext(
        definition.name,
        _parentWorkflowName,
        _parentNodeName,
      );

      // Parse the agent spec (for system prompt and model override)
      const spec = await parseAgentSpec(definition.specPath);

      // Convert inputs to a user message string
      // If inputs is a string, use directly; otherwise JSON stringify
      const userMessage =
        typeof inputs === "string" ? inputs : JSON.stringify(inputs, null, 2);

      // Execute the agent with tools from definition
      const result = await executeAgent({
        ctx,
        spec,
        userMessage,
        tools,
        nodeRegistry: runtimeConfig.nodeRegistry,
        modelConfig: runtimeConfig.modelConfig,
        outputSchema: definition.outputSchema,
        integrations: definition.integrations,
      });

      return result.output as TOutput;
    }

    // Register as a DBOS workflow (agent runs as child workflow, tool calls are steps)
    const durableAgentWorkflow = DBOS.registerWorkflow(agentWorkflowImpl, {
      name: definition.name,
    });

    const executable: AgentExecutable<TInput, TOutput> = {
      name: definition.name,
      type: "agent",
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      specPath: definition.specPath,
      tools,
      integrations: definition.integrations,
      // Capture parent workflow context for connection resolution, then run as DBOS child workflow
      execute: (parentCtx: WorkflowContext, inputs: TInput) => {
        _parentWorkflowName = parentCtx.workflowName;
        _parentNodeName = definition.name;
        return durableAgentWorkflow(inputs);
      },
    };

    getAgentCache().set(definition.name, executable as AgentExecutable);
    return executable;
  },
};
