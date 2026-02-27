import type { Executable, WorkflowContext, LogLevel } from "./types.js";

export interface ContextOptions {
  /** Custom logger function (for testing or custom logging) */
  logger?: (message: string, level: LogLevel) => void;
}

const defaultLogger = (message: string, level: LogLevel) => {
  console[level === "debug" ? "log" : level](
    `[crayon:${level}] ${message}`
  );
};

/**
 * Create a WorkflowContext for executing workflows
 *
 * Note: In Phase 2, this does not integrate with DBOS.
 * DBOS step wrapping will be added when we integrate with the factory.
 */
export function createWorkflowContext(options: ContextOptions = {}): WorkflowContext {
  const logger = options.logger ?? defaultLogger;

  const ctx: WorkflowContext = {
    workflowName: "*",

    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      // Execute (DBOS wrapping will be added in factory integration)
      return executable.execute(ctx, validated);
    },

    getConnection: async () => {
      throw new Error(
        "getConnection is not available in this context. Use createCrayon() for connection management.",
      );
    },

    log: (message: string, level: LogLevel = "info") => {
      logger(message, level);
    },
  };

  return ctx;
}
