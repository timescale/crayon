import type { IntegrationProvider } from "./integration-provider.js";
import { ConnectionCredentials } from "../types.js";
import { apiCall } from "./cloud-client.js";
import { getConnectionDisplayName } from "./connection-labels.js";

/**
 * IntegrationProvider backed by the crayon cloud server (hosted mode).
 * All Nango operations are proxied through the server — no NANGO_SECRET_KEY needed locally.
 */
export class CloudIntegrationProvider implements IntegrationProvider {
  async fetchCredentials(
    integrationId: string,
    connectionId: string,
  ): Promise<ConnectionCredentials> {
    try {
      const data = (await apiCall(
        "GET",
        `/api/credentials/${encodeURIComponent(integrationId)}?connection_id=${encodeURIComponent(connectionId)}`,
      )) as { token: string; connectionConfig?: Record<string, unknown>; raw?: Record<string, unknown> };

      return new ConnectionCredentials(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to fetch credentials for integration "${integrationId}" (connection "${connectionId}"): ${msg}`,
      );
    }
  }

  async listIntegrations(): Promise<Array<{ id: string; provider: string }>> {
    const data = (await apiCall("GET", "/api/integrations")) as Array<{
      id: string;
      provider: string;
    }>;
    return data;
  }

  async listConnections(
    integrationId: string,
  ): Promise<Array<{ connection_id: string; provider_config_key: string; display_name: string; created_at?: string }>> {
    const data = (await apiCall(
      "GET",
      `/api/integrations/${encodeURIComponent(integrationId)}/connections`,
    )) as Array<{ connection_id: string; provider_config_key: string; created_at?: string; created?: string }>;
    return Promise.all(
      data.map(async (c) => {
        let displayName = c.connection_id;
        const createdAt = c.created_at ?? c.created;
        try {
          const creds = await this.fetchCredentials(integrationId, c.connection_id);
          displayName = await getConnectionDisplayName(integrationId, c.connection_id, creds.raw, creds.connectionConfig, createdAt);
        } catch {
          // Fall back to connection_id if fetch fails
        }
        return {
          connection_id: c.connection_id,
          provider_config_key: c.provider_config_key,
          display_name: displayName,
          created_at: createdAt,
        };
      }),
    );
  }

  async createConnectSession(
    integrationId: string,
  ): Promise<{ token: string }> {
    const data = (await apiCall("POST", "/api/nango/connect-session", {
      integration_id: integrationId,
    })) as { token: string };
    return data;
  }

  async createConnection(params: {
    integrationId: string;
    connectionId: string;
    credentials: Record<string, string>;
    connectionConfig?: Record<string, string>;
  }): Promise<{ connection_id: string }> {
    const data = (await apiCall("POST", "/api/connections/create", {
      integration_id: params.integrationId,
      connection_id: params.connectionId,
      credentials: params.credentials,
      connection_config: params.connectionConfig,
    })) as { connection_id: string };
    return data;
  }

  async deleteConnection(
    integrationId: string,
    connectionId: string,
  ): Promise<void> {
    await apiCall("POST", "/api/connections/delete", {
      integration_id: integrationId,
      connection_id: connectionId,
    });
  }
}
