// packages/core/src/dbos.ts
import { DBOS } from "@dbos-inc/dbos-sdk";

export interface DBOSConfig {
  databaseUrl: string;
  appName?: string;
}

/** Get the schema name for a given app */
export function getSchemaName(appName?: string): string {
  const name = appName ?? "ocrayon";
  // Convert to valid schema name: lowercase, replace non-alphanumeric with underscore
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_dbos`;
}

/**
 * Initialize DBOS with the given configuration
 */
export async function initializeDBOS(config: DBOSConfig): Promise<void> {
  DBOS.setConfig({
    name: config.appName ?? "ocrayon",
    systemDatabaseUrl: config.databaseUrl,
    systemDatabaseSchemaName: getSchemaName(config.appName),
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
