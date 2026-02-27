import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import * as dotenv from "dotenv";
import pg from "pg";
import type { ServerContext } from "../types.js";
import { createIntegrationProvider } from "../../../connections/integration-provider.js";
import { resolveConnectionId } from "../../../connections/resolver.js";
import { getAppSchema } from "../../app.js";

const inputSchema = {
  integration_id: z
    .string()
    .describe(
      "The integration ID to look up (e.g., 'salesforce', 'slack'). " +
      "Must match an integration_id in the ocrayon_connections table.",
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

/**
 * Create an IntegrationProvider based on available env vars.
 * NANGO_SECRET_KEY → local, otherwise → cloud (auto-auth).
 */
async function createProvider(env: Record<string, string>) {
  const nangoSecretKey = env.NANGO_SECRET_KEY ?? undefined;
  return createIntegrationProvider(nangoSecretKey);
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
        "Resolves the connection ID from the ocrayon_connections table, " +
        "then fetches connection details via IntegrationProvider (local Nango or cloud).",
      inputSchema,
      outputSchema,
    },
    fn: async ({ integration_id, workflow_name, node_name }): Promise<OutputSchema> => {
      const env = loadEnv();
      const databaseUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;

      if (!databaseUrl) {
        return {
          error:
            "DATABASE_URL not found in .env file. " +
            "Run setup_app_schema to configure the database.",
        };
      }

      // Look up connection_id using the same resolution as runtime:
      // exact (workflow_name, node_name) match first, then global (* / *) fallback
      const appSchema = getAppSchema();
      let connectionId: string | null = null;
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      try {
        connectionId = await resolveConnectionId(
          pool, workflow_name, node_name, integration_id, appSchema,
        );
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

      try {
        const provider = await createProvider(env);
        const credentials = await provider.fetchCredentials(integration_id, connectionId);

        return {
          connection_id: connectionId,
          provider: integration_id,
          connection_config: credentials.connectionConfig ?? {},
          access_token: credentials.token,
        };
      } catch (err) {
        return {
          error: `Failed to fetch connection: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
