import type { ConnectionCredentials } from "../types.js";

// Use dynamic import to avoid hard dependency when Nango isn't configured.
// Stored on globalThis so it's shared across module instances (jiti vs compiled).
const NANGO_KEY = Symbol.for("opflow.nangoInstance");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNangoInstance(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as Record<symbol, any>)[NANGO_KEY] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setNangoInstance(instance: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as Record<symbol, any>)[NANGO_KEY] = instance;
}

/**
 * Initialize the Nango client singleton.
 */
export async function initNango(secretKey: string): Promise<void> {
  const { Nango } = await import("@nangohq/node");
  setNangoInstance(new Nango({ secretKey }));
}

/**
 * Get the Nango client instance, or null if not initialized.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNango(): any | null {
  return getNangoInstance();
}

/**
 * Fetch credentials for an integration connection from Nango.
 */
export async function fetchCredentials(
  integrationId: string,
  connectionId: string,
): Promise<ConnectionCredentials> {
  const nango = getNangoInstance();
  if (!nango) {
    throw new Error(
      "Nango not initialized. Set NANGO_SECRET_KEY environment variable or nangoSecretKey in config.",
    );
  }

  const connection = await nango.getConnection(integrationId, connectionId);

  // Extract token from credentials based on auth type
  const creds = connection.credentials ?? {};
  const token =
    creds.access_token ??
    creds.api_key ??
    creds.apiKey ??
    creds.token ??
    "";

  return {
    token,
    connectionConfig: connection.connection_config ?? {},
    raw: creds,
  };
}
