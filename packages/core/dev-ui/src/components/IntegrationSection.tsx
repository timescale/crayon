import { useState, useCallback } from "react";
import { useNangoConnections } from "../hooks/useConnections";
import type { useConnections } from "../hooks/useConnections";

interface IntegrationSectionProps {
  integrationId: string;
  workflowName: string;
  nodeName: string;
  connectionsApi: ReturnType<typeof useConnections>;
}

export function IntegrationSection({
  integrationId,
  workflowName,
  nodeName,
  connectionsApi,
}: IntegrationSectionProps) {
  const { nangoConnections, loading: nangoLoading, refetch } = useNangoConnections(integrationId, connectionsApi.mutationVersion);
  const [connecting, setConnecting] = useState(false);

  const current = connectionsApi.getForNode(workflowName, nodeName, integrationId);

  const handleSelect = useCallback(
    async (connectionId: string) => {
      await connectionsApi.upsert({
        workflow_name: workflowName,
        node_name: nodeName,
        integration_id: integrationId,
        connection_id: connectionId,
      });
    },
    [connectionsApi, workflowName, nodeName, integrationId],
  );

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/nango/connect-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration_id: integrationId }),
      });
      if (!res.ok) return;
      const { token } = await res.json();

      // Dynamically import Nango frontend (default export)
      const mod = await import("@nangohq/frontend");
      const Nango = mod.default;
      const nango = new Nango();
      nango.openConnectUI({
        sessionToken: token,
        onEvent: async (event) => {
          if (event.type === "connect") {
            refetch();
            // Auto-assign the newly created connection to this node
            const connectionId = event.payload.connectionId;
            if (connectionId) {
              await handleSelect(connectionId);
              // Also set global default when connecting from a node-specific context
              if (workflowName !== "*") {
                await connectionsApi.upsert({
                  workflow_name: "*",
                  node_name: "*",
                  integration_id: integrationId,
                  connection_id: connectionId,
                });
              }
            }
          } else if (event.type === "close") {
            refetch();
          }
        },
      });
    } catch {
      // Failed to connect
    } finally {
      setConnecting(false);
    }
  }, [integrationId, refetch, handleSelect, workflowName, connectionsApi]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-popover-foreground capitalize">
          {integrationId}
        </span>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="text-[10px] px-2 py-0.5 rounded-md bg-accent text-popover-foreground hover:bg-accent/80 transition-colors cursor-pointer disabled:opacity-50"
        >
          {connecting ? "..." : "Connect"}
        </button>
      </div>

      {nangoLoading ? (
        <p className="text-[11px] text-[#a8a099] italic">Loading connections...</p>
      ) : nangoConnections.length === 0 ? (
        <p className="text-[11px] text-[#a8a099] italic">
          No connections. Click Connect to add one.
        </p>
      ) : (
        <select
          value={current?.connection_id ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          className="text-[12px] px-2 py-1 rounded-md border border-border bg-background text-foreground"
        >
          <option value="">Select a connection...</option>
          {nangoConnections.map((nc) => (
            <option key={nc.connection_id} value={nc.connection_id}>
              {nc.connection_id}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
