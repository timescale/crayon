// packages/core/src/workflow.ts
import { z } from "zod";
import type { Executable, WorkflowContext } from "./types.js";

/**
 * Definition for creating a workflow
 */
export interface WorkflowDefinition<TInput, TOutput> {
  name: string;
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
 * Factory for creating workflow executables
 */
export const Workflow = {
  create<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>
  ): WorkflowExecutable<TInput, TOutput> {
    return {
      name: definition.name,
      type: "workflow",
      version: definition.version,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: definition.run,
    };
  },
};
