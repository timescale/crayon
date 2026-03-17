import type { ApiFactory } from "@tigerdata/mcp-boilerplate";
import { z } from "zod";
import type { ServerContext } from "../types.js";
import { apiCall } from "../../../connections/cloud-client.js";

const inputSchema = {
  expires_in: z
    .enum(["7d", "30d", "90d", "365d"])
    .default("30d")
    .describe("Token expiry duration. Defaults to 30 days."),
} as const;

const outputSchema = {
  token: z.string().optional(),
  expires_at: z.string().optional(),
  error: z.string().optional(),
} as const;

type OutputSchema = {
  token?: string;
  expires_at?: string;
  error?: string;
};

export const generateWebhookTokenFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = () => {
  return {
    name: "generate_webhook_token",
    config: {
      title: "Generate Webhook Token",
      description:
        "Generate a long-lived Bearer token for triggering workflows via HTTP webhook. " +
        "The token is an Ed25519 JWT valid for the specified duration.",
      inputSchema,
      outputSchema,
    },
    fn: async ({ expires_in }): Promise<OutputSchema> => {
      try {
        const data = await apiCall("POST", "/api/cloud-dev/webhook-token", {
          appName: process.env.APP_NAME,
          expiresIn: expires_in,
        }) as { token: string; expiresAt: string };
        return { token: data.token, expires_at: data.expiresAt };
      } catch (err) {
        return {
          error: `Failed to generate token: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
};
