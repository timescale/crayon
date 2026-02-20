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

type LabelResolver = (raw: RawCredentials) => string | undefined | Promise<string | undefined>;

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
};

export async function getConnectionDisplayName(
  integrationId: string,
  connectionId: string,
  rawCredentials: RawCredentials | undefined,
): Promise<string> {
  if (rawCredentials) {
    const resolver = resolvers[integrationId];
    const name = await resolver?.(rawCredentials);
    if (name) return name;
  }
  return connectionId;
}
