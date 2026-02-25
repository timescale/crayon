import type { IntegrationProvider } from "./integration-provider.js";
import type { ConnectionCredentials } from "../types.js";
import { apiCall } from "./cloud-client.js";
import { getConnectionDisplayName } from "./connection-labels.js";

/**
 * IntegrationProvider backed by the 0pflow cloud server (hosted mode).
 * All Nango operations are proxied through the server — no NANGO_SECRET_KEY needed locally.
 */
export class CloudIntegrationProvider implements IntegrationProvider {
  async fetchCredentials(
    integrationId: string,
    connectionId: string,
  ): Promise<ConnectionCredentials> {
    const data = (await apiCall(
      "GET",
      `/api/connections/credentials?integration_id=${encodeURIComponent(integrationId)}&connection_id=${encodeURIComponent(connectionId)}`,
    )) as ConnectionCredentials;

    return data;
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
    workspaceId?: string,
  ): Promise<Array<{ connection_id: string; provider_config_key: string; display_name: string }>> {
    if (!workspaceId) {
      return [];
    }

    const allConnections = (await apiCall(
      "GET",
      `/api/workspaces/${encodeURIComponent(workspaceId)}/connections`,
    )) as Array<{ connection_id: string; provider_config_key: string }>;

    const data = allConnections.filter(
      (c) => c.provider_config_key === integrationId,
    );

    return Promise.all(
      data.map(async (c) => {
        let displayName = c.connection_id;
        try {
          const creds = await this.fetchCredentials(integrationId, c.connection_id);
          displayName = await getConnectionDisplayName(integrationId, c.connection_id, creds.raw);
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
    workspaceId?: string,
  ): Promise<{ token: string }> {
    if (!workspaceId) {
      throw new Error("workspace_id is required for cloud mode");
    }
    const data = (await apiCall(
      "POST",
      `/api/workspaces/${encodeURIComponent(workspaceId)}/connections`,
      { integration_id: integrationId },
    )) as { token: string };
    return data;
  }
}
