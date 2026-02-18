import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getReadyPool } from "@/lib/db";
import {
  dbosNamesFromId,
  ensureDbLinked,
  ensureAppRegistered,
  setAppSecrets,
} from "@/lib/dbos-cloud";

/**
 * POST /api/deploy/prepare
 *
 * Prepares a deployment: links database, registers app, sets secrets.
 * All DBOS Cloud interactions happen server-side — no token returned.
 *
 * Body: { appName, databaseHostname, databasePort, databasePassword, envVars }
 * Returns: { data: { dbosAppName } }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as {
      appName?: string;
      databaseHostname?: string;
      databasePort?: number;
      databasePassword?: string;
      envVars?: Record<string, string>;
    };

    if (!body.appName || !body.databaseHostname || !body.databasePort || !body.databasePassword) {
      return NextResponse.json(
        { error: "Missing required fields: appName, databaseHostname, databasePort, databasePassword" },
        { status: 400 },
      );
    }

    const db = await getReadyPool();

    // Try to find existing deployment (re-deploy case)
    const existing = await db.query(
      `UPDATE deployments SET updated_at = NOW()
       WHERE user_id = $1 AND app_name = $2
       RETURNING dbos_app_name, dbos_db_name`,
      [auth.userId, body.appName],
    );

    let dbosAppName: string;
    let dbosDbName: string;

    if (existing.rowCount && existing.rowCount > 0) {
      dbosAppName = existing.rows[0].dbos_app_name as string;
      dbosDbName = existing.rows[0].dbos_db_name as string;
    } else {
      // New deployment — reserve ID from sequence and compute names upfront
      const seqResult = await db.query(
        `SELECT nextval('deployments_id_seq') AS id`,
      );
      const id = seqResult.rows[0].id as string;
      const names = dbosNamesFromId(id);
      dbosAppName = names.appName;
      dbosDbName = names.dbName;

      await db.query(
        `INSERT INTO deployments (id, user_id, app_name, dbos_app_name, dbos_db_name)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5)`,
        [id, auth.userId, body.appName, dbosAppName, dbosDbName],
      );
    }

    // Link database (BYOD) — idempotent
    await ensureDbLinked(
      dbosDbName,
      body.databaseHostname,
      body.databasePort,
      body.databasePassword,
    );

    // Register app — idempotent
    await ensureAppRegistered(dbosAppName, dbosDbName);

    // Set secrets in parallel
    if (body.envVars && Object.keys(body.envVars).length > 0) {
      await setAppSecrets(dbosAppName, body.envVars);
    }

    return NextResponse.json({ data: { dbosAppName } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Prepare failed" },
      { status: 500 },
    );
  }
}
