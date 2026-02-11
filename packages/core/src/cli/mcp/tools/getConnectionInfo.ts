import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import * as dotenv from "dotenv";
import pg from "pg";
import type { ServerContext } from "../types.js";

const inputSchema = {
  integration_id: z
    .string()
    .describe(
      "The integration ID to look up (e.g., 'salesforce', 'slack'). " +
      "Must match an integration_id in the opflow_connections table.",
    ),
  workflow_name: z
    .string()
    .describe("Workflow name for connection lookup. Used to resolve workflow/node-scoped connections, with fallback to global default."),
  node_name: z
    .string()
    .describe("Node name for connection lookup. Used to resolve workflow/node-scoped connections, with fallback to global default."),
} as const;

const outputSchema = {
  connection_id: z.string().optional().describe("The Nango connection ID"),
  provider: z.string().optional().describe("Provider name (e.g., salesforce)"),
  connection_config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Provider-specific config (e.g., instance_url for Salesforce)"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Custom metadata stored on the connection"),
  access_token: z
    .string()
    .optional()
    .describe("OAuth access token for the connection (for dev-time operations like schema fetching)"),
  error: z.string().optional().describe("Error message if lookup failed"),
} as const;

type OutputSchema = {
  connection_id?: string;
  provider?: string;
  connection_config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  access_token?: string;
  error?: string;
};

/**
 * Load env vars from the project's .env file
 */
function loadEnv(): Record<string, string> {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf-8");
  return dotenv.parse(content);
}

export const getConnectionInfoFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "get_connection_info",
    config: {
      title: "Get Connection Info",
      description:
        "Get metadata for a configured integration connection. " +
        "Resolves the connection ID from the opflow_connections table, " +
        "then fetches connection details from Nango (instance_url, provider config, etc.).",
      inputSchema,
      outputSchema,
    },
    fn: async ({ integration_id, workflow_name, node_name }): Promise<OutputSchema> => {
      const env = loadEnv();
      const secretKey = env.NANGO_SECRET_KEY;
      const databaseUrl = env.DATABASE_URL;

      if (!secretKey) {
        return {
          error:
            "NANGO_SECRET_KEY not found in .env file. " +
            "Set up Nango and add NANGO_SECRET_KEY to your .env to use integrations.",
        };
      }

      if (!databaseUrl) {
        return {
          error:
            "DATABASE_URL not found in .env file. " +
            "Run setup_app_schema to configure the database.",
        };
      }

      // Look up connection_id using the same resolution as runtime:
      // exact (workflow_name, node_name) match first, then global (* / *) fallback
      const wf = workflow_name;
      const nd = node_name;
      let connectionId: string | null = null;
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const result = await pool.query(
          `SELECT connection_id FROM opflow_connections
          WHERE integration_id = $1
            AND (
              (workflow_name = $2 AND node_name = $3)
              OR (workflow_name = '*' AND node_name = '*')
            )
          ORDER BY
            CASE WHEN workflow_name = '*' AND node_name = '*' THEN 1 ELSE 0 END
          LIMIT 1`,
          [integration_id, wf, nd],
        );
        connectionId = result.rows.length > 0 ? result.rows[0].connection_id : null;
      } finally {
        await pool.end();
      }

      if (!connectionId) {
        return {
          error:
            `No connection configured for integration "${integration_id}". ` +
            `Use the Dev UI to connect an account first.`,
        };
      }

      // Fetch full connection details from Nango
      try {
        const { Nango } = await import("@nangohq/node");
        const nango = new Nango({ secretKey });
        const connection = await nango.getConnection(integration_id, connectionId);

        // Extract access token from credentials (union type, so use indexing)
        const creds = (connection.credentials ?? {}) as Record<string, unknown>;
        const accessToken =
          (creds.access_token ?? creds.api_key ?? creds.token ?? undefined) as string | undefined;

        return {
          connection_id: connectionId,
          provider: connection.provider_config_key ?? integration_id,
          connection_config: connection.connection_config ?? {},
          metadata: connection.metadata ?? {},
          access_token: accessToken,
        };
      } catch (err) {
        return {
          error: `Failed to fetch connection from Nango: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
