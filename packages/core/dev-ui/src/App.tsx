import { useState, useMemo } from "react";
import { useDAGSocket } from "./hooks/useDAGSocket";
import { useConnections } from "./hooks/useConnections";
import { useRunHistory } from "./hooks/useRunHistory";
import { useTerminal } from "./hooks/useTerminal";
import { useRouter, matchRoute } from "./hooks/useRouter";
import { NavSidebar } from "./components/NavSidebar";
import { BottomPanel } from "./components/BottomPanel";
import { ClaudeTerminal } from "./components/ClaudeTerminal";
import { DashboardPage } from "./pages/DashboardPage";
import { WorkflowCanvasPage } from "./pages/WorkflowCanvasPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const { state, connected, sendMessage, ptyEvents } = useDAGSocket();
  const terminal = useTerminal({ sendMessage, ptyEvents });
  const connectionsApi = useConnections();
  const { path, navigate } = useRouter();
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Global run history (no workflow filter) for dashboard stats
  const globalRunHistory = useRunHistory(null);

  const workflowMatch = matchRoute(path, "/workflows/:name");

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

  const renderPage = () => {
    if (workflowMatch) {
      return (
        <WorkflowCanvasPage
          workflowName={workflowMatch.name}
          workflows={state.workflows}
          connectionsApi={connectionsApi}
          navigate={navigate}
          bottomPanelOpen={bottomPanelOpen}
          onToggleBottomPanel={() => setBottomPanelOpen(!bottomPanelOpen)}
        />
      );
    }
    if (path === "/credentials") {
      return (
        <CredentialsPage
          connectionsApi={connectionsApi}
          workflows={state.workflows}
        />
      );
    }
    if (path === "/settings") {
      return <SettingsPage />;
    }
    return (
      <DashboardPage
        workflows={state.workflows}
        runs={globalRunHistory.runs}
        runsAvailable={globalRunHistory.available}
        navigate={navigate}
      />
    );
  };

  return (
    <div className="h-screen w-screen flex bg-background">
      {/* Navigation sidebar */}
      <NavSidebar
        currentPath={path}
        navigate={navigate}
        connected={connected}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Page content */}
        <div className="flex-1 min-h-0">{renderPage()}</div>

        {/* Bottom panel (terminal) — global, persists across pages */}
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
