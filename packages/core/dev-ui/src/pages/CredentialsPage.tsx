import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  useNangoIntegrations,
  useNangoConnections,
  type NangoConnection,
} from "../hooks/useConnections";
import type { useConnections } from "../hooks/useConnections";
import type { WorkflowDAG } from "../types";

interface CredentialsPageProps {
  connectionsApi: ReturnType<typeof useConnections>;
  workflows: WorkflowDAG[];
}

interface CredentialRow {
  integrationId: string;
  connection: NangoConnection;
  isActive: boolean;
}

function IntegrationIcon({ integrationId }: { integrationId: string }) {
  const abbr = integrationId.slice(0, 2).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-[#f0ebe3] flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
      {abbr}
    </div>
  );
}

function ConnectionRows({
  integrationId,
  connectionsApi,
  mutationVersion,
  onRows,
}: {
  integrationId: string;
  connectionsApi: ReturnType<typeof useConnections>;
  mutationVersion: number;
  onRows: (rows: CredentialRow[]) => void;
}) {
  const { nangoConnections } = useNangoConnections(integrationId, mutationVersion);

  // Report rows to parent via callback (on render)
  const rows = useMemo(() => {
    return nangoConnections.map((conn) => {
      const mapping = connectionsApi.connections.find(
        (c) => c.integration_id === integrationId && c.connection_id === conn.connection_id,
      );
      return {
        integrationId,
        connection: conn,
        isActive: !!mapping,
      };
    });
  }, [nangoConnections, connectionsApi.connections, integrationId]);

  useEffect(() => {
    onRows(rows);
  }, [rows, onRows]);

  return null;
}

export function CredentialsPage({ connectionsApi, workflows }: CredentialsPageProps) {
  const { integrations, loading: integrationsLoading } = useNangoIntegrations();
  const [connecting, setConnecting] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [rowsByIntegration, setRowsByIntegration] = useState<Map<string, CredentialRow[]>>(new Map());

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!showAddMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showAddMenu]);

  // Collect all integration IDs (from Nango + DAG nodes)
  const allIntegrationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of integrations) ids.add(i.id);
    for (const wf of workflows) {
      for (const node of wf.nodes) {
        if (node.integrations) {
          for (const id of node.integrations) ids.add(id);
        }
      }
    }
    return Array.from(ids).sort();
  }, [integrations, workflows]);

  const handleRowsUpdate = useCallback((integrationId: string, rows: CredentialRow[]) => {
    setRowsByIntegration((prev) => {
      const next = new Map(prev);
      next.set(integrationId, rows);
      return next;
    });
  }, []);

  const allRows = useMemo(() => {
    const rows: CredentialRow[] = [];
    for (const integrationId of allIntegrationIds) {
      const integrationRows = rowsByIntegration.get(integrationId) ?? [];
      rows.push(...integrationRows);
    }
    return rows;
  }, [allIntegrationIds, rowsByIntegration]);

  const handleAddCredential = useCallback(async (integrationId?: string) => {
    const targetId = integrationId || allIntegrationIds[0];
    if (!targetId) return;

    setConnecting(true);
    try {
      const res = await fetch("/dev/api/nango/connect-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration_id: targetId }),
      });
      if (!res.ok) return;
      const { token } = await res.json();

      const mod = await import("@nangohq/frontend");
      const Nango = mod.default;
      const nango = new Nango();
      nango.openConnectUI({
        sessionToken: token,
        onEvent: async (event) => {
          if (event.type === "connect") {
            const connectionId = event.payload.connectionId;
            if (connectionId) {
              await connectionsApi.upsert({
                workflow_name: "*",
                node_name: "*",
                integration_id: targetId,
                connection_id: connectionId,
              });
            }
            connectionsApi.refetch();
          } else if (event.type === "close") {
            connectionsApi.refetch();
          }
        },
      });
    } catch {
      // Failed to connect
    } finally {
      setConnecting(false);
    }
  }, [allIntegrationIds, connectionsApi]);

  if (integrationsLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Render ConnectionRows components to fetch data per integration */}
        {allIntegrationIds.map((id) => (
          <ConnectionRows
            key={id}
            integrationId={id}
            connectionsApi={connectionsApi}
            mutationVersion={connectionsApi.mutationVersion}
            onRows={(rows) => handleRowsUpdate(id, rows)}
          />
        ))}

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-serif">
              Credentials
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage OAuth connections and API keys for your integrations
            </p>
          </div>
          {allIntegrationIds.length > 0 && (
            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                disabled={connecting}
                className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 2v10M2 7h10" />
                </svg>
                Add Credential
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-card rounded-xl border border-border shadow-lg z-30 py-1 overflow-hidden">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2">
                    Select integration
                  </p>
                  {allIntegrationIds.map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        setShowAddMenu(false);
                        handleAddCredential(id);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-background/60 transition-colors cursor-pointer"
                    >
                      <IntegrationIcon integrationId={id} />
                      <span className="text-sm text-foreground capitalize">{id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        {allRows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No credentials configured.</p>
            <p className="text-xs mt-1">Connect an integration to get started.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-5 py-3">
                    Name
                  </th>
                  <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-5 py-3">
                    Type
                  </th>
                  <th className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-5 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => (
                  <tr
                    key={`${row.integrationId}:${row.connection.connection_id}`}
                    className="border-b border-border last:border-b-0 hover:bg-background/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <IntegrationIcon integrationId={row.integrationId} />
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {row.connection.display_name || row.connection.connection_id}
                          </div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {row.integrationId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-[#f0ebe3] text-muted-foreground">
                        OAuth
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-accent text-green-700">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
