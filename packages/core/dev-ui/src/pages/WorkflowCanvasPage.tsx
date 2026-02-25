import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowGraph } from "../components/WorkflowGraph";
import { RunHistoryTab } from "../components/RunHistoryTab";
import { RunWorkflowModal } from "../components/RunWorkflowModal";
import { useRunHistory } from "../hooks/useRunHistory";
import { useResizeX } from "../hooks/useResizeX";
import type { useConnections } from "../hooks/useConnections";
import type { WorkflowDAG } from "../types";

interface WorkflowCanvasPageProps {
  workflowName: string;
  workflows: WorkflowDAG[];
  connectionsApi: ReturnType<typeof useConnections>;
  navigate: (to: string) => void;
  bottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
}

export function WorkflowCanvasPage({
  workflowName,
  workflows,
  connectionsApi,
  navigate,
  bottomPanelOpen,
  onToggleBottomPanel,
}: WorkflowCanvasPageProps) {
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const rightResize = useResizeX({ defaultWidth: 288, minWidth: 200, maxWidth: 500, side: "left" });
  const runHistory = useRunHistory(workflowName);

  const activeDag = workflows.find((w) => w.workflowName === workflowName);

  if (!activeDag) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center">
          <p>Workflow "{workflowName}" not found.</p>
          <button
            onClick={() => navigate("/")}
            className="mt-2 text-xs underline hover:text-foreground cursor-pointer"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Main canvas */}
      <div className="flex-1 relative min-h-0 min-w-0">
        <ReactFlowProvider key={activeDag.workflowName}>
          <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.03)]">
            <WorkflowGraph dag={activeDag} connectionsApi={connectionsApi} />
          </div>
          {/* Workflow name overlay + controls */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="bg-card/80 backdrop-blur-sm px-2 py-1.5 rounded-md shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Back to dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 3L4.5 7L8.5 11" />
              </svg>
            </button>
            <div className="bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-border">
              <span className="text-[15px] font-semibold text-foreground">
                {activeDag.workflowName}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                v{activeDag.version}
              </span>
            </div>
            <button
              onClick={() => setShowRunModal(true)}
              className="bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
              title="Run workflow"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 1.5L10 6L2.5 10.5V1.5Z" />
              </svg>
              Run
            </button>
          </div>
        </ReactFlowProvider>

        {/* Toggle buttons */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {runHistory.available && (
            <button
              onClick={() => setHistorySidebarOpen(!historySidebarOpen)}
              className={`bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-border text-[12px] cursor-pointer transition-colors ${
                historySidebarOpen
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              History
            </button>
          )}
          <button
            onClick={onToggleBottomPanel}
            className={`bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-border text-[12px] cursor-pointer transition-colors ${
              bottomPanelOpen
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Terminal
          </button>
        </div>
      </div>

      {/* Run workflow modal */}
      {showRunModal && (
        <RunWorkflowModal
          dag={activeDag}
          onClose={() => setShowRunModal(false)}
          onSuccess={() => {
            setShowRunModal(false);
            setHistorySidebarOpen(true);
            runHistory.refresh();
          }}
        />
      )}

      {/* Right sidebar — run history */}
      {historySidebarOpen && runHistory.available && (
        <div
          className="flex flex-col bg-[#f3ede5] shrink-0 relative border-l border-border"
          style={{ width: rightResize.width }}
        >
          {/* Left-edge drag handle */}
          <div
            onMouseDown={rightResize.onDragStart}
            className="absolute top-0 left-0 w-1 h-full cursor-ew-resize hover:bg-accent z-20"
          />
          <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[12px] font-medium text-foreground tracking-wide">History</span>
            <button
              onClick={() => setHistorySidebarOpen(false)}
              className="text-muted-foreground hover:text-foreground text-sm px-1 cursor-pointer"
              title="Close"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <RunHistoryTab
              runs={runHistory.runs}
              loading={runHistory.loading}
              selectedRunId={runHistory.selectedRunId}
              trace={runHistory.trace}
              traceLoading={runHistory.traceLoading}
              selectRun={runHistory.selectRun}
              refresh={runHistory.refresh}
            />
          </div>
        </div>
      )}
    </div>
  );
}
