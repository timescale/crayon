// packages/core/src/tools/tool.ts
import { z } from "zod";
import type { WorkflowContext } from "../types.js";

/**
 * Definition for creating a tool
 */
export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (inputs: TInput) => Promise<TOutput>;
}

/**
 * Executable interface for tools
 */
export interface ToolExecutable<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly type: "tool";
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Factory for creating tool executables
 */
export const Tool = {
  create<TInput, TOutput>(
    definition: ToolDefinition<TInput, TOutput>
  ): ToolExecutable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "tool",
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: async (_ctx: WorkflowContext, inputs: TInput): Promise<TOutput> => {
        // Validate inputs
        const validated = definition.inputSchema.parse(inputs);
        return definition.execute(validated);
      },
    };
  },
};
