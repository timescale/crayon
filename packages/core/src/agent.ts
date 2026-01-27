// packages/core/src/agent.ts
import { z } from "zod";
import type { Executable, WorkflowContext } from "./types.js";
import { parseAgentSpec } from "./nodes/agent/parser.js";
import { executeAgent } from "./nodes/agent/executor.js";
import type { ModelConfig } from "./nodes/agent/model-config.js";
import type { ToolRegistry } from "./tools/registry.js";

/**
 * Definition for creating an agent
 */
export interface AgentDefinition<TInput, TOutput> {
  name: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  /** Path to agent spec markdown file */
  specPath: string;
}

/**
 * Extended executable interface for agents
 */
export interface AgentExecutable<TInput = unknown, TOutput = unknown>
  extends Executable<TInput, TOutput> {
  readonly specPath: string;
}

/**
 * Runtime configuration for agent execution
 * Set by create0pflow() factory
 */
interface AgentRuntimeConfig {
  toolRegistry: ToolRegistry;
  modelConfig?: ModelConfig;
}

let agentRuntimeConfig: AgentRuntimeConfig | null = null;

/**
 * Configure the agent runtime (called by factory)
 * @internal
 */
export function configureAgentRuntime(config: AgentRuntimeConfig): void {
  agentRuntimeConfig = config;
}

/**
 * Factory for creating agent executables
 */
export const Agent = {
  create<TInput, TOutput = unknown>(
    definition: AgentDefinition<TInput, TOutput>
  ): AgentExecutable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "agent",
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      specPath: definition.specPath,
      execute: async (ctx: WorkflowContext, inputs: TInput): Promise<TOutput> => {
        if (!agentRuntimeConfig) {
          throw new Error(
            "Agent runtime not configured. Make sure to use create0pflow() before executing agents."
          );
        }

        // Parse the agent spec
        const spec = await parseAgentSpec(definition.specPath);

        // Convert inputs to a user message string
        // If inputs is a string, use directly; otherwise JSON stringify
        const userMessage =
          typeof inputs === "string" ? inputs : JSON.stringify(inputs, null, 2);

        // Execute the agent
        const result = await executeAgent({
          ctx,
          spec,
          userMessage,
          toolRegistry: agentRuntimeConfig.toolRegistry,
          modelConfig: agentRuntimeConfig.modelConfig,
          outputSchema: definition.outputSchema,
        });

        return result.output as TOutput;
      },
    };
  },
};
