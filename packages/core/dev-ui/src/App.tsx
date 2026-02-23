import { useState, useEffect, useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useDAGSocket } from "./hooks/useDAGSocket";
import { useConnections } from "./hooks/useConnections";
import { useRunHistory } from "./hooks/useRunHistory";
import { useTerminal } from "./hooks/useTerminal";
import { useResizeX } from "./hooks/useResizeX";
import { WorkflowGraph } from "./components/WorkflowGraph";
import { WorkflowSelector } from "./components/WorkflowSelector";
import { ConnectionsPanel } from "./components/ConnectionsPanel";
import { DeployPanel } from "./components/DeployPanel";
import { BottomPanel } from "./components/BottomPanel";
import { RunHistoryTab } from "./components/RunHistoryTab";
import { RunWorkflowModal } from "./components/RunWorkflowModal";
import { ClaudeTerminal } from "./components/ClaudeTerminal";

export function App() {
  const { state, connected, sendMessage, ptyEvents } = useDAGSocket();
  const terminal = useTerminal({ sendMessage, ptyEvents });
  const connectionsApi = useConnections();
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);

  const leftResize = useResizeX({ defaultWidth: 224, minWidth: 160, maxWidth: 400, side: "right" });
  const rightResize = useResizeX({ defaultWidth: 288, minWidth: 200, maxWidth: 500, side: "left" });

  const runHistory = useRunHistory(selectedWorkflow);

  useEffect(() => {
    if (!selectedWorkflow && state.workflows.length > 0) {
      setSelectedWorkflow(state.workflows[0].workflowName);
    }
  }, [state.workflows, selectedWorkflow]);

  const activeDag = state.workflows.find(
    (w) => w.workflowName === selectedWorkflow,
  );

  const bottomTabs = useMemo(
    () => [
      {
        id: "terminal",
        label: "Terminal",
        content: (
          <ClaudeTerminal
            attachTo={terminal.attachTo}
            fit={terminal.fit}
            ptyAlive={terminal.ptyAlive}
            hasData={terminal.hasData}
            restart={terminal.restart}
          />
        ),
      },
    ],
    [terminal],
  );

  return (
    <div className="h-screen w-screen flex bg-background">
      {/* Left sidebar */}
      <div
        className="flex flex-col bg-[#f3ede5] shrink-0 relative"
        style={{ width: leftResize.width }}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h1 className="text-sm font-bold text-foreground font-serif tracking-wide">0pflow</h1>
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <WorkflowSelector
            workflows={state.workflows}
            parseErrors={state.parseErrors}
            selected={selectedWorkflow}
            onSelect={setSelectedWorkflow}
          />
          <ConnectionsPanel
            workflows={state.workflows}
            connectionsApi={connectionsApi}
          />
          <DeployPanel />
        </div>
        {/* Right-edge drag handle */}
        <div
          onMouseDown={leftResize.onDragStart}
          className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-accent z-20"
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 border-x border-border">
        {/* Graph area */}
        <div className="flex-1 relative min-h-0">
          {activeDag ? (
            <ReactFlowProvider key={activeDag.workflowName}>
              <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.03)]">
                <WorkflowGraph dag={activeDag} connectionsApi={connectionsApi} />
              </div>
              <div className="absolute top-3 left-3 flex items-center gap-2">
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
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {state.workflows.length === 0
                ? "No workflow files found. Create a workflow to get started."
                : "Select a workflow from the sidebar."}
            </div>
          )}

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
              onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
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

        {/* Bottom panel (terminal only) */}
        {bottomPanelOpen && (
          <BottomPanel
            tabs={bottomTabs}
            defaultTab="terminal"
            onClose={() => setBottomPanelOpen(false)}
          />
        )}
      </div>

      {/* Run workflow modal */}
      {showRunModal && activeDag && (
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
          className="flex flex-col bg-[#f3ede5] shrink-0 relative"
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
