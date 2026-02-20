import { useState, useEffect, useCallback } from "react";

export interface ConnectionMapping {
  workflow_name: string;
  node_name: string;
  integration_id: string;
  connection_id: string;
  updated_at?: string;
}

export interface NangoConnection {
  id: number;
  connection_id: string;
  provider_config_key: string;
  created_at: string;
  display_name: string;
}

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutationVersion, setMutationVersion] = useState(0);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        setConnections(await res.json());
      }
    } catch {
      // API may not be available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const upsert = useCallback(
    async (mapping: Omit<ConnectionMapping, "updated_at">) => {
      await fetch("/api/connections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapping),
      });
      await fetchConnections();
      setMutationVersion((v) => v + 1);
    },
    [fetchConnections],
  );

  const remove = useCallback(
    async (workflowName: string, nodeName: string, integrationId: string) => {
      await fetch("/api/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_name: workflowName,
          node_name: nodeName,
          integration_id: integrationId,
        }),
      });
      await fetchConnections();
      setMutationVersion((v) => v + 1);
    },
    [fetchConnections],
  );

  const getForNode = useCallback(
    (workflowName: string, nodeName: string, integrationId: string) => {
      // Exact match first, then global default
      return (
        connections.find(
          (c) =>
            c.workflow_name === workflowName &&
            c.node_name === nodeName &&
            c.integration_id === integrationId,
        ) ??
        connections.find(
          (c) =>
            c.workflow_name === "*" &&
            c.node_name === "*" &&
            c.integration_id === integrationId,
        ) ??
        null
      );
    },
    [connections],
  );

  return { connections, loading, upsert, remove, getForNode, refetch: fetchConnections, mutationVersion };
}

export interface NangoIntegration {
  id: string;
  provider: string;
}

export function useNangoIntegrations() {
  const [integrations, setIntegrations] = useState<NangoIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/nango/integrations");
        if (res.ok) {
          setIntegrations(await res.json());
        }
      } catch {
        // API may not be available
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { integrations, loading };
}

export function useNangoConnections(integrationId: string | null, mutationVersion = 0) {
  const [nangoConnections, setNangoConnections] = useState<NangoConnection[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNangoConnections = useCallback(async (): Promise<NangoConnection[]> => {
    if (!integrationId) return [];
    setLoading(true);
    try {
      const res = await fetch(`/api/nango/connections/${encodeURIComponent(integrationId)}`);
      if (res.ok) {
        const data: NangoConnection[] = await res.json();
        setNangoConnections(data);
        return data;
      }
    } catch {
      // API may not be available
    } finally {
      setLoading(false);
    }
    return [];
  }, [integrationId]);

  useEffect(() => {
    fetchNangoConnections();
  }, [fetchNangoConnections, mutationVersion]);

  return { nangoConnections, loading, refetch: fetchNangoConnections };
}
