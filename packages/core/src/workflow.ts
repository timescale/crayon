// packages/core/src/workflow.ts
import { z } from "zod";
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Executable, WorkflowContext, LogLevel } from "./types.js";

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
 * Create a WorkflowContext that wraps calls in DBOS steps for durability
 */
function createDurableContext(): WorkflowContext {
  const ctx: WorkflowContext = {
    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      if (executable.type === "workflow") {
        // For workflows, call execute directly (it handles its own DBOS registration)
        // This allows proper child workflow tracking
        return executable.execute(ctx, validated);
      }

      // For nodes/agents, wrap execution in DBOS step for durability
      return DBOS.runStep(
        async () => executable.execute(ctx, validated),
        { name: executable.name }
      );
    },

    log: (message: string, level: LogLevel = "info") => {
      DBOS.logger[level](message);
    },
  };

  return ctx;
}

/**
 * Factory for creating workflow executables
 */
export const Workflow = {
  create<TInput, TOutput>(
    definition: WorkflowDefinition<TInput, TOutput>
  ): WorkflowExecutable<TInput, TOutput> {
    // Create the DBOS-registered workflow function
    async function workflowImpl(inputs: TInput): Promise<TOutput> {
      const ctx = createDurableContext();
      return definition.run(ctx, inputs);
    }

    // Register with DBOS (returns callable function)
    const durableWorkflow = DBOS.registerWorkflow(workflowImpl, {
      name: definition.name,
    });

    return {
      name: definition.name,
      type: "workflow",
      description: definition.description,
      version: definition.version,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      // execute ignores the ctx param and uses DBOS context instead
      execute: (_ctx: WorkflowContext, inputs: TInput) => durableWorkflow(inputs),
    };
  },
};
