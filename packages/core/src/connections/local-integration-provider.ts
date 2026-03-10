import type { IntegrationProvider } from "./integration-provider.js";
import { ConnectionCredentials } from "../types.js";
import { getConnectionDisplayName } from "./connection-labels.js";

/**
 * IntegrationProvider backed by a direct Nango connection (self-hosted mode).
 * Requires NANGO_SECRET_KEY.
 */
export class LocalIntegrationProvider implements IntegrationProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nango: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(nangoInstance: any) {
    this.nango = nangoInstance;
  }

  async fetchCredentials(
    integrationId: string,
    connectionId: string,
  ): Promise<ConnectionCredentials> {
    const connection = await this.nango.getConnection(integrationId, connectionId);

    const creds = connection.credentials ?? {};
    const token =
      creds.access_token ??
      creds.api_key ??
      creds.apiKey ??
      creds.token ??
      "";

    return new ConnectionCredentials({
      token,
      connectionConfig: connection.connection_config ?? {},
      raw: creds,
    });
  }

  async listIntegrations(): Promise<Array<{ id: string; provider: string }>> {
    const result = await this.nango.listIntegrations();
    return (result.configs ?? []).map(
      (c: { unique_key: string; provider: string }) => ({
        id: c.unique_key,
        provider: c.provider,
      }),
    );
  }

  async listConnections(
    integrationId: string,
  ): Promise<Array<{ connection_id: string; provider_config_key: string; display_name: string }>> {
    const result = await this.nango.listConnections();
    const filtered = (result.connections ?? []).filter(
      (c: { provider_config_key: string }) =>
        c.provider_config_key === integrationId,
    );
    return Promise.all(
      filtered.map(async (c: { connection_id: string; provider_config_key: string }) => {
        let displayName = c.connection_id;
        try {
          const conn = await this.nango.getConnection(integrationId, c.connection_id);
          displayName = await getConnectionDisplayName(integrationId, c.connection_id, conn.credentials, conn.connection_config);
        } catch {
          // Fall back to connection_id if fetch fails
        }
        return {
          connection_id: c.connection_id,
          provider_config_key: c.provider_config_key,
          display_name: displayName,
        };
      }),
    );
  }

  async createConnectSession(
    integrationId: string,
    endUserId?: string,
  ): Promise<{ token: string }> {
    const session = await this.nango.createConnectSession({
      end_user: { id: endUserId ?? "dev-ui-user" },
      allowed_integrations: [integrationId],
    });
    return { token: session.data.token };
  }

  async createConnection(params: {
    integrationId: string;
    connectionId: string;
    credentials: Record<string, string>;
    connectionConfig?: Record<string, string>;
  }): Promise<{ connection_id: string }> {
    const serverUrl = this.nango.serverUrl as string;
    const secretKey = this.nango.secretKey as string;

    const response = await fetch(`${serverUrl}/connections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider_config_key: params.integrationId,
        connection_id: params.connectionId,
        credentials: {
          type: "BASIC",
          username: params.credentials.username,
          password: params.credentials.password,
        },
        connection_config: params.connectionConfig,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = (error as { error?: { message?: string } }).error?.message;
      throw new Error(msg || `Failed to create connection: ${response.status}`);
    }

    return { connection_id: params.connectionId };
  }
}

/**
 * Create a LocalIntegrationProvider from a Nango secret key.
 * Uses dynamic import to avoid hard dependency on @nangohq/node.
 */
export async function createLocalIntegrationProvider(
  secretKey: string,
): Promise<LocalIntegrationProvider> {
  const { Nango } = await import("@nangohq/node");
  const nango = new Nango({ secretKey });
  return new LocalIntegrationProvider(nango);
}
