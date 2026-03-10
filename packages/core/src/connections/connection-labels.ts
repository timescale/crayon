/**
 * Per-integration display name resolvers.
 *
 * Each resolver extracts a human-readable label from the raw OAuth
 * credentials returned by nango.getConnection(). The `raw` object
 * structure varies per provider.
 *
 * Google integrations don't include email in the OAuth token response,
 * so we call the userinfo API with the access token to resolve it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawCredentials = Record<string, any>;

type LabelResolver = (raw: RawCredentials, connectionConfig?: RawCredentials) => string | undefined | Promise<string | undefined>;

async function resolveGoogleEmail(raw: RawCredentials): Promise<string | undefined> {
  const accessToken = raw?.access_token;
  if (!accessToken) return undefined;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { email?: string };
    return data.email;
  } catch {
    return undefined;
  }
}

const resolvers: Record<string, LabelResolver> = {
  slack: (r) => r?.raw?.team?.name,
  github: (r) => r?.raw?.login ?? r?.raw?.name,
  "google-calendar": resolveGoogleEmail,
  "google-drive": resolveGoogleEmail,
  "google-mail": resolveGoogleEmail,
  "google-sheet": resolveGoogleEmail,
  salesforce: (r) =>
    r?.raw?.instance_url?.replace(/^https?:\/\//, ""),
  postgres: (_r, connectionConfig) => {
    if (connectionConfig?.nickname) return connectionConfig.nickname as string;
    const host = connectionConfig?.host as string | undefined;
    const port = connectionConfig?.port as string | undefined;
    const database = connectionConfig?.database as string | undefined;
    if (host) {
      const portSuffix = port && port !== "5432" ? `:${port}` : "";
      return database ? `${host}${portSuffix}/${database}` : `${host}${portSuffix}`;
    }
    return undefined;
  },
};

export async function getConnectionDisplayName(
  integrationId: string,
  connectionId: string,
  rawCredentials: RawCredentials | undefined,
  connectionConfig?: RawCredentials,
): Promise<string> {
  const resolver = resolvers[integrationId];
  if (resolver) {
    const name = await resolver(rawCredentials ?? {}, connectionConfig);
    if (name) return name;
  }
  return connectionId;
}
