import { useState, useCallback, useEffect } from "react";
import { useNangoConnections } from "../hooks/useConnections";
import type { useConnections } from "../hooks/useConnections";
import { hasCustomForm, CUSTOM_FORM_INTEGRATIONS } from "../lib/custom-connection-forms";
import { CustomConnectionForm } from "./CustomConnectionForm";
import { IntegrationIcon } from "../lib/integration-icons";

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
  const { nangoConnections, loading: nangoLoading, refetch } = useNangoConnections(integrationId);
  const [connecting, setConnecting] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [optimisticValue, setOptimisticValue] = useState<string | null>(null);

  const current = connectionsApi.getForNode(workflowName, nodeName, integrationId);

  const handleSelect = useCallback(
    async (connectionId: string) => {
      setOptimisticValue(connectionId);
      try {
        await connectionsApi.upsert({
          workflow_name: workflowName,
          node_name: nodeName,
          integration_id: integrationId,
          connection_id: connectionId,
        });
      } finally {
        setOptimisticValue(null);
      }
    },
    [connectionsApi, workflowName, nodeName, integrationId],
  );

  // Auto-assign when there's exactly one connection and none is mapped
  useEffect(() => {
    if (!nangoLoading && nangoConnections.length === 1 && !current) {
      handleSelect(nangoConnections[0].connection_id);
    }
  }, [nangoLoading, nangoConnections, current, handleSelect]);

  const handleConnect = useCallback(async () => {
    // For integrations with custom forms, show the form instead of Nango Connect
    if (hasCustomForm(integrationId)) {
      setShowCustomForm(true);
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch("/dev/api/nango/connect-session", {
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

  const handleCustomFormSuccess = useCallback(
    async (connectionId: string) => {
      setShowCustomForm(false);
      refetch();
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
    },
    [refetch, handleSelect, workflowName, connectionsApi, integrationId],
  );

  const handleDelete = useCallback(
    async (connectionId: string, displayName: string) => {
      if (!window.confirm(`Delete connection "${displayName}"? This will remove the credentials permanently.`)) return;
      setDeleting(connectionId);
      try {
        const res = await fetch("/dev/api/nango/delete-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integration_id: integrationId,
            connection_id: connectionId,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("Failed to delete connection:", (data as { error?: string }).error);
        }
        refetch();
        connectionsApi.refetch();
      } finally {
        setDeleting(null);
      }
    },
    [integrationId, refetch, connectionsApi],
  );

  const activeId = optimisticValue ?? current?.connection_id;

  // Compact chip for integrations with no connections
  if (!showCustomForm && nangoConnections.length === 0 && !nangoLoading) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-full border border-[#e8e4df] text-[#787068] hover:bg-[#f5f2ee] transition-colors cursor-pointer disabled:opacity-50 capitalize"
      >
        <IntegrationIcon integrationId={integrationId} />
        {connecting ? "..." : integrationId}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-popover-foreground capitalize">
          <IntegrationIcon integrationId={integrationId} />
          {integrationId}
        </span>
        <button
          onClick={handleConnect}
          disabled={connecting || showCustomForm}
          className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#e8e4df] text-[#787068] hover:bg-[#d4cfc8] transition-colors cursor-pointer disabled:opacity-50"
        >
          {connecting ? "..." : "Add Connection"}
        </button>
      </div>

      {showCustomForm && hasCustomForm(integrationId) ? (
        <CustomConnectionForm
          integrationId={integrationId}
          config={CUSTOM_FORM_INTEGRATIONS[integrationId]}
          onSuccess={handleCustomFormSuccess}
          onCancel={() => setShowCustomForm(false)}
        />
      ) : nangoLoading ? (
        <p className="text-[11px] text-[#a8a099] italic">Loading...</p>
      ) : (
        <div className="rounded-md bg-[#faf8f6] border border-[#ece8e3]">
          {nangoConnections.map((nc, i) => {
            const isActive = nc.connection_id === activeId;
            const isDeleting = nc.connection_id === deleting;
            return (
              <div
                key={nc.connection_id}
                className={`group flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] text-[#787068] ${
                  i > 0 ? "border-t border-[#ece8e3]" : ""
                }`}
              >
                <span className="truncate min-w-0 flex-1">{nc.display_name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {isActive ? (
                    <span className="text-[10px] text-green-600">default</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelect(nc.connection_id)}
                      className="text-[10px] text-[#a8a099] hover:text-[#787068] cursor-pointer"
                    >
                      set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(nc.connection_id, nc.display_name)}
                    disabled={isDeleting}
                    className="text-[#c4bfb8] hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    title="Delete connection"
                  >
                    {isDeleting ? "…" : "✕"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
