import { Nango } from "@nangohq/node";

let nangoInstance: Nango | null = null;

export function getNango(): Nango {
  if (!nangoInstance) {
    const secretKey = process.env.NANGO_SECRET_KEY;
    if (!secretKey) {
      throw new Error("NANGO_SECRET_KEY environment variable is required");
    }
    nangoInstance = new Nango({ secretKey });
  }
  return nangoInstance;
}

/**
 * List connections from Nango filtered by tags.
 *
 * The SDK's listConnections() doesn't support tag filtering,
 * so we call the Nango REST API directly: GET /connection?tags[key]=value
 */
export async function listConnectionsByTags(
  tags: Record<string, string>,
  integrationId?: string,
): Promise<
  Array<{
    id: number;
    connection_id: string;
    provider_config_key: string;
    provider: string;
    created: string;
    end_user: { id: string; display_name: string | null; email: string | null } | null;
    tags: Record<string, string>;
    metadata: Record<string, unknown> | null;
  }>
> {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error("NANGO_SECRET_KEY environment variable is required");
  }

  const nangoHost = process.env.NANGO_HOST || "https://api.nango.dev";
  const url = new URL(`${nangoHost}/connection`);

  for (const [key, value] of Object.entries(tags)) {
    url.searchParams.append(`tags[${key}]`, value);
  }

  if (integrationId) {
    url.searchParams.append("integrationId", integrationId);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Nango API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    connections: Array<{
      id: number;
      connection_id: string;
      provider_config_key: string;
      provider: string;
      created: string;
      end_user: { id: string; display_name: string | null; email: string | null } | null;
      tags: Record<string, string>;
      metadata: Record<string, unknown> | null;
    }>;
  };
  return data.connections ?? [];
}
