import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import * as dotenv from "dotenv";
import type { ServerContext } from "../types.js";
import { createIntegrationProvider } from "../../../connections/integration-provider.js";

const inputSchema = {} as const;

const outputSchema = {
  integrations: z.array(
    z.object({
      id: z.string().describe("Integration unique key (use this in node integrations arrays)"),
      provider: z.string().describe("Provider name (e.g., salesforce, slack)"),
    }),
  ).describe("Available integrations"),
  error: z.string().optional().describe("Error message if listing failed"),
} as const;

type OutputSchema = {
  integrations: Array<{ id: string; provider: string }>;
  error?: string;
};

/**
 * Create an IntegrationProvider based on available env vars.
 * NANGO_SECRET_KEY → local, otherwise → cloud (auto-auth).
 */
async function createProvider() {
  // Check .env file for NANGO_SECRET_KEY
  const envPath = join(process.cwd(), ".env");
  let nangoSecretKey: string | undefined;
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const env = dotenv.parse(content);
    nangoSecretKey = env.NANGO_SECRET_KEY;
  }
  return createIntegrationProvider(nangoSecretKey);
}

export const listIntegrationsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_integrations",
    config: {
      title: "List Integrations",
      description:
        "List available integrations. Uses NANGO_SECRET_KEY for local mode, or 0pflow cloud (auto-authenticates via browser if needed).",
      inputSchema,
      outputSchema,
    },
    fn: async (): Promise<OutputSchema> => {
      try {
        const provider = await createProvider();
        const integrations = await provider.listIntegrations();
        return { integrations };
      } catch (err) {
        return {
          integrations: [],
          error: `Failed to list integrations: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
