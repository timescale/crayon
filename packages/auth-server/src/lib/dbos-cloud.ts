/**
 * Internal DBOS Cloud API client for the platform account.
 *
 * The auth-server holds a single platform DBOS Cloud account.
 * All user apps are namespaced under this account.
 * The DBOS Cloud token NEVER leaves the server.
 */

const DBOS_CLOUD_HOST = "cloud.dbos.dev";
const AUTH0_DOMAIN = "login.dbos.dev";
const DBOS_CLIENT_ID = "6p7Sjxf13cyLMkdwn14MxlH7JdhILled";

let cachedToken: string | null = null;
let cachedTokenExp: number = 0;

/**
 * Decode JWT payload without verification (we just need the exp claim).
 */
function decodeJwtExp(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return typeof payload.exp === "number" ? payload.exp : 0;
  } catch {
    return 0;
  }
}

/**
 * Get a valid DBOS Cloud JWT, refreshing if expired.
 * Internal only — never returned to clients.
 */
export async function getDbosToken(): Promise<string> {
  // Check cached token (with 60s buffer before expiry)
  if (cachedToken && Date.now() / 1000 < cachedTokenExp - 60) {
    return cachedToken;
  }

  const refreshToken = process.env.DBOS_CLOUD_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "DBOS_CLOUD_REFRESH_TOKEN not configured. See DEPLOYMENT.md for setup instructions.",
    );
  }

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: DBOS_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh DBOS Cloud token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  cachedToken = data.access_token;
  cachedTokenExp = decodeJwtExp(cachedToken);
  return cachedToken;
}

export function getDbosOrg(): string {
  const org = process.env.DBOS_CLOUD_ORGANIZATION;
  if (!org) {
    throw new Error(
      "DBOS_CLOUD_ORGANIZATION not configured. See DEPLOYMENT.md for setup instructions.",
    );
  }
  return org;
}

/**
 * Make an authenticated API call to DBOS Cloud.
 * Path should NOT include the org prefix — it's added automatically.
 */
export async function dbosApiCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const token = await getDbosToken();
  const org = getDbosOrg();
  const url = `https://${DBOS_CLOUD_HOST}/v1alpha1/${org}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `DBOS Cloud ${method} ${path} failed (${response.status}): ${errorBody}`,
    );
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Namespacing ─────────────────────────────────────────────────

/**
 * Compute DBOS Cloud names from the deployment's auto-increment ID.
 * Guaranteed unique — no collision handling needed.
 */
export function dbosNamesFromId(deploymentId: number | string): {
  appName: string;
  dbName: string;
} {
  return {
    appName: `tiger-${deploymentId}`,
    dbName: `tiger-${deploymentId}`,
  };
}

// ── DBOS Cloud operations (idempotent) ───────────────────────────

/**
 * Ensure a database is linked via BYOD. No-op if already linked.
 */
export async function ensureDbLinked(
  dbInstanceName: string,
  hostname: string,
  port: number,
  password: string,
): Promise<void> {
  // Check if already linked
  const dbs = (await dbosApiCall("GET", "/databases")) as Array<{
    PostgresInstanceName: string;
  }>;
  if (dbs.some((db) => db.PostgresInstanceName === dbInstanceName)) {
    return;
  }

  await dbosApiCall("POST", "/databases/byod", {
    Name: dbInstanceName,
    HostName: hostname,
    Port: port,
    Password: password,
    captureProvenance: false,
  });
}

/**
 * Ensure an app is registered in DBOS Cloud. No-op if already registered.
 */
export async function ensureAppRegistered(
  dbosAppName: string,
  dbInstanceName: string,
): Promise<void> {
  try {
    await dbosApiCall("GET", `/applications/${dbosAppName}`);
    return; // Already registered
  } catch {
    // Not found — register it
  }

  await dbosApiCall("PUT", "/applications", {
    name: dbosAppName,
    database: dbInstanceName,
    language: "node",
    provenancedb: "",
  });
}

/**
 * Set multiple env vars as DBOS Cloud secrets (in parallel).
 */
export async function setAppSecrets(
  dbosAppName: string,
  envVars: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(envVars);
  if (entries.length === 0) return;

  await Promise.all(
    entries.map(([key, value]) =>
      dbosApiCall("POST", "/applications/secrets", {
        ApplicationName: dbosAppName,
        SecretName: key,
        ClearSecretValue: value,
      }),
    ),
  );
}
