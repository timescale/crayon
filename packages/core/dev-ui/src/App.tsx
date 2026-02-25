import { useState, useEffect, useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useDAGSocket } from "./hooks/useDAGSocket";
import { useConnections } from "./hooks/useConnections";
import { useRunHistory } from "./hooks/useRunHistory";
import { useTerminal } from "./hooks/useTerminal";
import { useResizeX } from "./hooks/useResizeX";
import { useHashRouter } from "./hooks/useHashRouter";
import { useSidebarState } from "./hooks/useSidebarState";
import type { Page } from "./hooks/useHashRouter";
import { WorkflowGraph } from "./components/WorkflowGraph";
import { BottomPanel } from "./components/BottomPanel";
import { RunHistoryTab } from "./components/RunHistoryTab";
import { TestSection } from "./components/TestSection";
import { ClaudeTerminal } from "./components/ClaudeTerminal";
import { CredentialsPage } from "./components/CredentialsPage";
import { DashboardPage } from "./components/DashboardPage";

export function App() {
  const { state, connected, sendMessage, ptyEvents } = useDAGSocket();
  const terminal = useTerminal({ sendMessage, ptyEvents });
  const connectionsApi = useConnections();
  const router = useHashRouter();
  const sidebar = useSidebarState();
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"test" | "runs">("test");

  const rightResize = useResizeX({ defaultWidth: 288, minWidth: 200, maxWidth: 500, side: "left" });

  // Auto-select most recently changed workflow when on canvas with none selected
  useEffect(() => {
    if (router.page === "canvas" && !router.selectedWorkflow && state.workflows.length > 0) {
      router.selectWorkflow(state.workflows[state.workflows.length - 1].workflowName);
    }
  }, [router.page, router.selectedWorkflow, state.workflows, router.selectWorkflow]);

  const runHistory = useRunHistory(router.selectedWorkflow);

  const activeDag = state.workflows.find(
    (w) => w.workflowName === router.selectedWorkflow,
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

  const navItems: Array<{ id: Page; label: string; icon: React.ReactNode }> = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: "canvas",
      label: router.selectedWorkflow ?? "Canvas",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      ),
    },
    {
      id: "credentials",
      label: "Credentials",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="h-screen w-screen flex bg-background">
      {/* Left sidebar */}
      <aside
        className={`${sidebar.collapsed ? "w-16" : "w-[240px]"} shrink-0 flex flex-col border-r border-border bg-[#f5f3f0] transition-[width] duration-200 overflow-hidden`}
      >
        {/* Brand */}
        {sidebar.collapsed ? (
          <div className="pt-3 pb-1 flex flex-col items-center gap-1.5">
            <button
              onClick={() => router.navigate("dashboard")}
              className="text-sm font-bold text-foreground font-serif tracking-wide cursor-pointer hover:opacity-70 transition-opacity"
            >
              0p
            </button>
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
              title={connected ? "Connected" : "Disconnected"}
            />
          </div>
        ) : (
          <div className="px-5 pt-5 pb-4 flex items-center justify-between">
            <button
              onClick={() => router.navigate("dashboard")}
              className="text-sm font-bold text-foreground font-serif tracking-wide cursor-pointer hover:opacity-70 transition-opacity"
            >
              0pflow
            </button>
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`}
              title={connected ? "Connected" : "Disconnected"}
            />
          </div>
        )}

        {/* Separator + collapse toggle */}
        <div className={`${sidebar.collapsed ? "mx-3 mt-1" : "mx-5"} flex items-center gap-0`}>
          <div className="flex-1 h-px bg-[#e8e4df]" />
          <button
            onClick={sidebar.toggle}
            className="p-1 rounded-md text-[#a8a099] hover:text-[#1a1a1a] hover:bg-[#f0ece7] transition-colors shrink-0 cursor-pointer"
            title={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebar.collapsed ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => router.navigate(item.id)}
                title={sidebar.collapsed ? item.label : undefined}
                className={`flex items-center ${sidebar.collapsed ? "justify-center" : "gap-2.5"} w-full px-3 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer ${
                  router.page === item.id
                    ? "bg-[#f0ece7] text-[#1a1a1a] font-medium"
                    : "text-[#787068] hover:bg-[#f0ece7]/60 hover:text-[#1a1a1a]"
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {!sidebar.collapsed && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {router.page === "dashboard" ? (
          <DashboardPage
            workflows={state.workflows}
            parseErrors={state.parseErrors}
            onSelectWorkflow={router.selectWorkflow}
          />
        ) : router.page === "credentials" ? (
          <CredentialsPage
            workflows={state.workflows}
            connectionsApi={connectionsApi}
            onBack={() => router.navigate("dashboard")}
          />
        ) : (
          <>
            {/* Graph area */}
            <div className="flex-1 relative min-h-0">
              {activeDag ? (
                <ReactFlowProvider key={activeDag.workflowName}>
                  <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.03)]">
                    <WorkflowGraph dag={activeDag} connectionsApi={connectionsApi} />
                  </div>
                  <div className="absolute top-3 left-3">
                    <div className="bg-card/80 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-border">
                      <span className="text-[15px] font-semibold text-foreground">
                        {activeDag.workflowName}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        v{activeDag.version}
                      </span>
                    </div>
                  </div>
                </ReactFlowProvider>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Waiting for workflow files...
                </div>
              )}

              {/* Right sidebar open toggle (visible when sidebar is closed) */}
              {activeDag && !rightSidebarOpen && (
                <button
                  onClick={() => setRightSidebarOpen(true)}
                  className="absolute top-1/2 -translate-y-1/2 right-0 w-6 h-12 flex items-center justify-center bg-white border border-[#e8e4df] border-r-0 rounded-l-md shadow-sm cursor-pointer text-[#a8a099] hover:text-[#1a1a1a] transition-colors"
                  title="Open test panel"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}

              {/* Terminal open toggle (visible when bottom panel is closed) */}
              {!bottomPanelOpen && (
                <button
                  onClick={() => setBottomPanelOpen(true)}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-6 w-12 flex items-center justify-center bg-white border border-[#e8e4df] border-b-0 rounded-t-md shadow-sm cursor-pointer text-[#a8a099] hover:text-[#1a1a1a] transition-colors"
                  title="Open terminal"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              )}
            </div>

            {/* Bottom panel (terminal only) */}
            {bottomPanelOpen && (
              <BottomPanel
                tabs={bottomTabs}
                defaultTab="terminal"
                onClose={() => setBottomPanelOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {/* Right sidebar — tabbed: Test / Runs */}
      {rightSidebarOpen && activeDag && (
        <div
          className="flex flex-col bg-white shrink-0 relative border-l border-[#e8e4df]"
          style={{ width: rightResize.width }}
        >
          {/* Left-edge drag handle */}
          <div
            onMouseDown={rightResize.onDragStart}
            className="absolute top-0 left-0 w-1 h-full cursor-ew-resize hover:bg-accent z-20"
          />

          {/* Tab bar */}
          <div className="shrink-0 px-4 pt-3 pb-0 border-b border-[#e8e4df] flex items-center justify-between">
            <div className="flex gap-0">
              {(["test", "runs"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`relative text-[12px] tracking-wide px-3 pb-2.5 cursor-pointer transition-colors ${
                    rightTab === tab
                      ? "text-[#1a1a1a]"
                      : "text-[#a8a099] hover:text-[#787068]"
                  }`}
                >
                  {tab === "test" ? "Test" : "Runs"}
                  {rightTab === tab && (
                    <span className="absolute bottom-0 left-3 right-3 h-[1.5px] bg-[#1a1a1a]" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRightSidebarOpen(false)}
              className="text-[#a8a099] hover:text-[#1a1a1a] text-sm px-1 pb-2 cursor-pointer transition-colors"
              title="Close"
            >
              &times;
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-auto">
            {rightTab === "test" ? (
              <div className="p-4">
                <TestSection
                  dag={activeDag}
                  onSuccess={() => {
                    runHistory.refresh();
                    setRightTab("runs");
                  }}
                />
              </div>
            ) : (
              <RunHistoryTab
                runs={runHistory.runs}
                loading={runHistory.loading}
                selectedRunId={runHistory.selectedRunId}
                trace={runHistory.trace}
                traceLoading={runHistory.traceLoading}
                selectRun={runHistory.selectRun}
                refresh={runHistory.refresh}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
