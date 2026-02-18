import { useState, useEffect, useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useDAGSocket } from "./hooks/useDAGSocket";
import { useConnections } from "./hooks/useConnections";
import { useRunHistory } from "./hooks/useRunHistory";
import { useTerminal } from "./hooks/useTerminal";
import { useDeploy } from "./hooks/useDeploy";
import { WorkflowGraph } from "./components/WorkflowGraph";
import { WorkflowSelector } from "./components/WorkflowSelector";
import { ConnectionsPanel } from "./components/ConnectionsPanel";
import { BottomPanel } from "./components/BottomPanel";
import { RunHistoryTab } from "./components/RunHistoryTab";
import { ClaudeTerminal } from "./components/ClaudeTerminal";

export function App() {
  const { state, connected, sendMessage, ptyEvents } = useDAGSocket();
  const terminal = useTerminal({ sendMessage, ptyEvents });
  const connectionsApi = useConnections();
  const deployApi = useDeploy();
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);

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
      ...(runHistory.available
        ? [
            {
              id: "history",
              label: "History",
              content: (
                <RunHistoryTab
                  runs={runHistory.runs}
                  loading={runHistory.loading}
                  selectedRunId={runHistory.selectedRunId}
                  trace={runHistory.trace}
                  traceLoading={runHistory.traceLoading}
                  selectRun={runHistory.selectRun}
                  refresh={runHistory.refresh}
                />
              ),
            },
          ]
        : []),
    ],
    [terminal, runHistory],
  );

  return (
    <div className="h-screen w-screen flex bg-background">
      <div className="w-56 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h1 className="text-sm font-bold text-foreground font-serif">0pflow</h1>
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

          {/* Deploy button */}
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={deployApi.startDeploy}
              disabled={deployApi.deploying}
              className="w-full px-3 py-2 bg-foreground text-background text-sm rounded-md hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deployApi.deploying ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  {deployApi.stepLabel}
                </>
              ) : (
                "Deploy"
              )}
            </button>

            {deployApi.deployedUrl && (
              <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-md text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-green-400">Deployed</span>
                  <button
                    onClick={deployApi.dismissUrl}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    x
                  </button>
                </div>
                <a
                  href={deployApi.deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 underline break-all"
                >
                  {deployApi.deployedUrl}
                </a>
              </div>
            )}

            {deployApi.error && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-red-400">Deploy failed</span>
                  <button
                    onClick={deployApi.dismissError}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    x
                  </button>
                </div>
                <p className="text-red-400 mt-1">{deployApi.error}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Graph area */}
        <div className="flex-1 relative min-h-0">
          {activeDag ? (
            <ReactFlowProvider key={activeDag.workflowName}>
              <div className="absolute inset-0">
                <WorkflowGraph dag={activeDag} connectionsApi={connectionsApi} />
              </div>
              <div className="absolute top-3 left-3 bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-border">
                <span className="text-sm font-medium text-foreground">
                  {activeDag.workflowName}
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  v{activeDag.version}
                </span>
              </div>
            </ReactFlowProvider>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {state.workflows.length === 0
                ? "No workflow files found. Create a workflow to get started."
                : "Select a workflow from the sidebar."}
            </div>
          )}

          {/* Panel toggle — always visible */}
          <button
            onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
            className={`absolute top-3 right-3 bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-border text-[12px] cursor-pointer transition-colors ${
              bottomPanelOpen
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Terminal
          </button>
        </div>

        {/* Bottom panel */}
        {bottomPanelOpen && (
          <BottomPanel
            tabs={bottomTabs}
            defaultTab="terminal"
            onClose={() => setBottomPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
