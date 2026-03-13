import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { getProvider, getAddConnectionUrl } from "../../../connections/manager.js";

const inputSchema = {
  integration_id: z
    .string()
    .describe(
      "The integration ID to list connections for (e.g., 'salesforce', 'slack').",
    ),
} as const;

const outputSchema = {
  connections: z.array(
    z.object({
      connection_id: z.string().describe("Unique connection identifier"),
      display_name: z.string().describe("Human-readable name for the connection"),
    }),
  ).describe("Available connections for this integration"),
  add_connection_url: z.string().optional().describe("URL where the user can add a new connection via the Dev UI"),
  error: z.string().optional().describe("Error message if listing failed"),
} as const;

type OutputSchema = {
  connections: Array<{ connection_id: string; display_name: string }>;
  add_connection_url?: string;
  error?: string;
};

export const listConnectionsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "list_connections",
    config: {
      title: "List Connections",
      description:
        "List available connections for an integration. Shows all OAuth/API connections " +
        "configured in the credential provider, regardless of node assignment. " +
        "Use this to see what connections exist before assigning one to a node with assign_connection.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ integration_id }): Promise<OutputSchema> => {
      try {
        const connections = await getProvider().listConnections(integration_id);
        return {
          connections: connections.map((c) => ({
            connection_id: c.connection_id,
            display_name: c.display_name,
          })),
          add_connection_url: getAddConnectionUrl(integration_id),
        };
      } catch (err) {
        return {
          connections: [],
          error: `Failed to list connections: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
