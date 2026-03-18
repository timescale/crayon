// packages/core/src/dbos.ts
import { DBOS } from "@dbos-inc/dbos-sdk";
import { getDbosSchema } from "./cli/app.js";
import { withTimeout } from "./util.js";

const DBOS_LAUNCH_TIMEOUT_MS = 30_000; // 30s for DB connection + schema setup

export interface DBOSConfig {
  databaseUrl: string;
  appName: string;
}

/**
 * Initialize DBOS with the given configuration.
 * Times out if DBOS.launch() takes too long (e.g. DB unreachable).
 */
export async function initializeDBOS(config: DBOSConfig): Promise<void> {
  DBOS.setConfig({
    name: config.appName,
    systemDatabaseUrl: config.databaseUrl,
    systemDatabaseSchemaName: getDbosSchema(),
    logLevel: process.env.LOG_LEVEL ?? "info",
  });
  await withTimeout(DBOS.launch(), DBOS_LAUNCH_TIMEOUT_MS, "DBOS initialization timed out (database may be unreachable)");
}

/**
 * Shutdown DBOS gracefully
 */
export async function shutdownDBOS(): Promise<void> {
  await DBOS.shutdown();
}
