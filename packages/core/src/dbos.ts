// packages/core/src/dbos.ts
import { DBOS } from "@dbos-inc/dbos-sdk";
import { getDbosSchema } from "./cli/app.js";

export interface DBOSConfig {
  databaseUrl: string;
  appName: string;
}

/**
 * Initialize DBOS with the given configuration
 */
export async function initializeDBOS(config: DBOSConfig): Promise<void> {
  DBOS.setConfig({
    name: config.appName,
    systemDatabaseUrl: config.databaseUrl,
    systemDatabaseSchemaName: getDbosSchema(),
    logLevel: process.env.LOG_LEVEL ?? "info",
  });
  await DBOS.launch();
}

/**
 * Shutdown DBOS gracefully
 */
export async function shutdownDBOS(): Promise<void> {
  await DBOS.shutdown();
}
