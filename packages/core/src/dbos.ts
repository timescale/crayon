// packages/core/src/dbos.ts
import { DBOS } from "@dbos-inc/dbos-sdk";
import type { Executable, WorkflowContext, LogLevel } from "./types.js";

export interface DBOSConfig {
  databaseUrl: string;
  appName?: string;
}

/**
 * Initialize DBOS with the given configuration
 */
export async function initializeDBOS(config: DBOSConfig): Promise<void> {
  DBOS.setConfig({
    name: config.appName ?? "0pflow",
    systemDatabaseUrl: config.databaseUrl,
  });
  await DBOS.launch();
}

/**
 * Shutdown DBOS gracefully
 */
export async function shutdownDBOS(): Promise<void> {
  await DBOS.shutdown();
}

/**
 * Create a WorkflowContext that wraps calls in DBOS steps for durability
 */
export function createDurableContext(): WorkflowContext {
  const ctx: WorkflowContext = {
    run: async <TInput, TOutput>(
      executable: Executable<TInput, TOutput>,
      inputs: TInput
    ): Promise<TOutput> => {
      // Validate inputs against schema
      const validated = executable.inputSchema.parse(inputs);

      // Wrap execution in DBOS step for durability
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
