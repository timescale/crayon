import { useMemo } from "react";
import { IntegrationSection } from "./IntegrationSection";
import type { useConnections } from "../hooks/useConnections";
import { useNangoIntegrations } from "../hooks/useConnections";
import type { WorkflowDAG } from "../types";

interface CredentialsPageProps {
  workflows: WorkflowDAG[];
  connectionsApi: ReturnType<typeof useConnections>;
  onBack: () => void;
}

export function CredentialsPage({ workflows, connectionsApi, onBack }: CredentialsPageProps) {
  const { integrations: nangoIntegrations, loading } = useNangoIntegrations();

  const usedIntegrationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const wf of workflows) {
      for (const node of wf.nodes) {
        if (node.integrations) {
          for (const id of node.integrations) {
            ids.add(id);
          }
        }
      }
    }
    return ids;
  }, [workflows]);

  const availableIntegrations = useMemo(() => {
    const allIds = new Set(usedIntegrationIds);
    for (const i of nangoIntegrations) {
      allIds.add(i.id);
    }
    return Array.from(allIds).sort((a, b) => {
      const aUsed = usedIntegrationIds.has(a) ? 0 : 1;
      const bUsed = usedIntegrationIds.has(b) ? 0 : 1;
      return aUsed - bUsed || a.localeCompare(b);
    });
  }, [nangoIntegrations, usedIntegrationIds]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 max-w-[700px]">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-[#787068] hover:text-[#1a1a1a] transition-colors cursor-pointer mb-6"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Page header */}
        <h1 className="text-2xl font-light tracking-tight text-[#1a1a1a]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          Credentials
        </h1>
        <p className="text-sm text-[#787068] mt-1 tracking-wide">
          Manage OAuth connections and credentials for your workflows.
        </p>

        {/* Divider */}
        <div className="h-px bg-[#e8e4df] my-6" />

        {/* Connections section */}
        <div>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-medium text-[#1a1a1a]">Connections</h2>
              <p className="text-[11px] text-[#a8a099] mt-0.5">
                Configure global OAuth connections shared across all workflows.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-[#e8e4df] bg-white p-4">
              <div className="flex flex-col gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-[#f0ece7] animate-pulse" />
                    <div className="flex-1">
                      <div className="h-3.5 w-24 bg-[#f0ece7] rounded animate-pulse" />
                      <div className="h-3 w-40 bg-[#f0ece7] rounded animate-pulse mt-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : availableIntegrations.length === 0 ? (
            <div className="rounded-lg border border-[#e8e4df] bg-white p-8 flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-lg bg-[#f0ece7] flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a8a099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <p className="text-[13px] text-[#1a1a1a] font-medium">No connections available</p>
              <p className="text-[11px] text-[#a8a099] mt-1">
                Add integrations to your workflow nodes to configure connections here.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#e8e4df] bg-white divide-y divide-[#e8e4df]">
              {availableIntegrations.map((integrationId) => (
                <div key={integrationId} className="px-4 py-3.5">
                  <IntegrationSection
                    integrationId={integrationId}
                    workflowName="*"
                    nodeName="*"
                    connectionsApi={connectionsApi}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
