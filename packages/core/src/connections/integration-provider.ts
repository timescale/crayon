import type { ConnectionCredentials } from "../types.js";

/**
 * Abstraction over integration/credential operations.
 *
 * LocalIntegrationProvider calls Nango directly (self-hosted mode).
 * CloudIntegrationProvider calls the 0pflow cloud server (hosted mode).
 *
 * Connection *mapping* (workflow/node → connection_id) is NOT part of this
 * interface — that stays in the user's local app DB via resolver.ts.
 */
export interface IntegrationProvider {
  /** Fetch actual credentials for a connection */
  fetchCredentials(
    integrationId: string,
    connectionId: string,
  ): Promise<ConnectionCredentials>;

  /** List available integrations */
  listIntegrations(): Promise<
    Array<{ id: string; provider: string }>
  >;

  /** List connections for an integration */
  listConnections(
    integrationId: string,
  ): Promise<Array<{ connection_id: string; provider_config_key: string; display_name: string }>>;

  /** Create a Connect session for OAuth setup */
  createConnectSession(
    integrationId: string,
    endUserId?: string,
  ): Promise<{ token: string }>;
}

/**
 * Auto-detect and create the appropriate IntegrationProvider.
 *
 * - NANGO_SECRET_KEY set → LocalIntegrationProvider (direct Nango)
 * - Otherwise → CloudIntegrationProvider (proxies through 0pflow cloud)
 *
 * Optionally pass a nangoSecretKey to override env detection.
 */
export async function createIntegrationProvider(
  nangoSecretKey?: string,
): Promise<IntegrationProvider> {
  const key = nangoSecretKey ?? process.env.NANGO_SECRET_KEY;

  if (key) {
    const { createLocalIntegrationProvider } = await import("./local-integration-provider.js");
    return createLocalIntegrationProvider(key);
  } else {
    const { CloudIntegrationProvider } = await import("./cloud-integration-provider.js");
    return new CloudIntegrationProvider();
  }
}
