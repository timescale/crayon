import { z } from "zod";
import type { Executable, WorkflowContext } from "./types.js";

/**
 * Definition for creating a function node
 */
export interface NodeDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Factory for creating function node executables
 */
export const Node = {
  create<TInput, TOutput>(
    definition: NodeDefinition<TInput, TOutput>
  ): Executable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "node",
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: definition.execute,
    };
  },
};
