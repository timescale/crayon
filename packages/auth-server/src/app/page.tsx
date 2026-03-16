"use client";

import { useEffect, useState } from "react";

interface Workspace {
  app_name: string;
  fly_app_name: string;
  app_url: string;
  role: string;
  fly_state: string;
}

interface UserInfo {
  login: string;
  approved: boolean;
}

type PageState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "waitlisted"; user: UserInfo }
  | { kind: "dashboard"; user: UserInfo; workspaces: Workspace[] };

function statusColor(state: string): string {
  switch (state.toLowerCase()) {
    case "started":
    case "running":
      return "#10b981";
    case "starting":
    case "created":
      return "#f59e0b";
    case "stopped":
    case "suspended":
      return "#a8a099";
    default:
      return "#a8a099";
  }
}

function statusLabel(state: string): string {
  switch (state.toLowerCase()) {
    case "started":
    case "running":
      return "Running";
    case "starting":
    case "created":
      return "Starting";
    case "stopped":
      return "Stopped";
    case "suspended":
      return "Suspended";
    default:
      return state;
  }
}

export default function HomePage() {
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/workspaces")
      .then(async (res) => {
        if (res.status === 401) {
          setState({ kind: "unauthenticated" });
          return;
        }
        const data = await res.json();
        const user = data.user as UserInfo;
        if (!user.approved) {
          setState({ kind: "waitlisted", user });
        } else {
          setState({
            kind: "dashboard",
            user,
            workspaces: data.data as Workspace[],
          });
        }
      })
      .catch(() => {
        setState({ kind: "unauthenticated" });
      });
  }, []);

  if (state.kind === "loading") {
    return <LoadingView />;
  }

  if (state.kind === "unauthenticated") {
    return <UnauthenticatedView />;
  }

  if (state.kind === "waitlisted") {
    return <WaitlistView user={state.user} />;
  }

  return <DashboardView user={state.user} workspaces={state.workspaces} />;
}

function LoadingView() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-[#e8e4df] border-t-[#1a1a1a] rounded-full" />
    </div>
  );
}

function UnauthenticatedView() {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&state=web&scope=read:user,user:email`;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-[Georgia,'Times_New_Roman',serif] text-5xl font-light tracking-tight mb-3">
          crayon
        </h1>
        <p className="text-muted-foreground text-[15px] mb-10">
          AI-native workflow engine
        </p>
        <a
          href={githubUrl}
          className="inline-flex items-center gap-2.5 px-8 py-3 bg-[#1a1a1a] text-white rounded-lg text-[15px] hover:bg-[#2a2a2a] transition-colors"
        >
          <GitHubIcon />
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}

function WaitlistView({ user }: { user: UserInfo }) {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="font-[Georgia,'Times_New_Roman',serif] text-5xl font-light tracking-tight mb-3">
          crayon
        </h1>
        <p className="text-muted-foreground text-[15px] mb-8">
          You&apos;re on the waitlist
        </p>
        <div className="bg-white border border-border rounded-xl p-6 shadow-sm mb-6">
          <p className="text-[14px] text-muted-foreground mb-3">
            Thanks for signing up! We&apos;ll let you know when your account is
            ready.
          </p>
          <p className="text-[13px] text-muted-foreground">
            Please email{" "}
            <a href="mailto:crayon@tigerdata.com" className="text-foreground underline">
              crayon@tigerdata.com
            </a>{" "}
            for any questions.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 text-[13px] text-muted-foreground">
          <span>
            Signed in as <span className="font-medium text-foreground">{user.login}</span>
          </span>
          <span className="text-border">|</span>
          <button
            onClick={handleLogout}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardView({
  user,
  workspaces: initialWorkspaces,
}: {
  user: UserInfo;
  workspaces: Workspace[];
}) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  const handleCreated = (ws: Workspace) => {
    setWorkspaces((prev) => [ws, ...prev]);
    setShowCreateModal(false);
  };

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="font-[Georgia,'Times_New_Roman',serif] text-xl font-light">
            crayon
          </h1>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span>{user.login}</span>
            <button
              onClick={handleLogout}
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-5">
          <span className="text-[10px] uppercase tracking-wider text-[#a8a099] font-medium">
            Workspaces
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {workspaces.map((ws) => (
            <div
              key={ws.fly_app_name}
              className="bg-white border border-border rounded-xl px-5 py-4 shadow-sm flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[15px] truncate">
                  {ws.app_name}
                </div>
                <div className="text-[12px] text-muted-foreground truncate">
                  {ws.fly_app_name}
                </div>
              </div>

              <div className="flex items-center gap-5 shrink-0 ml-4">
                {/* Status */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: statusColor(ws.fly_state) }}
                  />
                  <span className="text-[12px] text-muted-foreground">
                    {statusLabel(ws.fly_state)}
                  </span>
                </div>

                {/* Open button */}
                <a
                  href={`/api/workspaces/open?app=${encodeURIComponent(ws.fly_app_name)}&claude-code-panel=open`}
                  className="inline-flex items-center px-4 py-1.5 bg-muted text-foreground text-[13px] rounded-lg hover:bg-[#e8e4df] transition-colors"
                >
                  Open
                </a>
              </div>
            </div>
          ))}

          {/* Create new workspace card */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="border-2 border-dashed border-[#d4cfc8] rounded-xl px-5 py-4 flex items-center justify-between hover:border-[#a8a099] transition-colors cursor-pointer bg-transparent text-left"
          >
            <span className="text-[15px] font-semibold text-foreground">
              Create a new workspace
            </span>
            <span className="inline-flex items-center px-4 py-1.5 bg-muted text-foreground text-[13px] rounded-lg">
              New +
            </span>
          </button>
        </div>
      </main>

      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

type ModalPhase =
  | { step: "input" }
  | { step: "creating" }
  | { step: "starting"; appName: string; flyAppName: string; appUrl: string }
  | { step: "ready"; appName: string; flyAppName: string; appUrl: string }
  | { step: "error"; message: string };

function CreateWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ws: Workspace) => void;
}) {
  const [appName, setAppName] = useState("");
  const [phase, setPhase] = useState<ModalPhase>({ step: "input" });

  const busy = phase.step === "creating" || phase.step === "starting";

  const handleCreate = async () => {
    const trimmed = appName.trim();
    if (!trimmed) return;

    setPhase({ step: "creating" });

    try {
      const res = await fetch("/api/cloud-dev/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPhase({ step: "error", message: data.error || "Failed to create workspace" });
        return;
      }

      const flyAppName = data.data.flyAppName ?? "";
      const appUrl = data.data.appUrl ?? "";

      setPhase({ step: "starting", appName: trimmed, flyAppName, appUrl });

      // Poll status until running
      const pollUntilRunning = async () => {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const statusRes = await fetch(
              `/api/cloud-dev/status?appName=${encodeURIComponent(trimmed)}`,
            );
            const statusData = await statusRes.json();
            const status = statusData.data?.status;
            if (status === "running") {
              setPhase({ step: "ready", appName: trimmed, flyAppName, appUrl });
              return;
            }
            if (status === "error") {
              setPhase({
                step: "error",
                message: statusData.data?.error || "Workspace failed to start",
              });
              return;
            }
          } catch {
            // Keep polling on fetch errors
          }
        }
        // Timed out — still show as ready so user can try opening
        setPhase({ step: "ready", appName: trimmed, flyAppName, appUrl });
      };

      pollUntilRunning();
    } catch (err) {
      setPhase({
        step: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  };

  const handleOpen = () => {
    if (phase.step === "ready") {
      onCreated({
        app_name: phase.appName,
        fly_app_name: phase.flyAppName,
        app_url: phase.appUrl,
        role: "owner",
        fly_state: "started",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-lg border border-border w-full max-w-md mx-4 p-6">
        <h2 className="text-[16px] font-semibold mb-1">New Workspace</h2>

        {phase.step === "input" && (
          <>
            <p className="text-[13px] text-muted-foreground mb-5">
              Give your workspace a name. This may take a minute.
            </p>

            <label className="block text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-1.5">
              Workspace Name
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="my-project"
              autoFocus
              className="w-full px-3 py-2 border border-[#e8e4df] rounded-lg text-[14px] bg-[#faf9f7] placeholder:text-[#c4bfb8] focus:outline-none focus:border-[#a8a099]"
            />

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!appName.trim()}
                className="px-5 py-2 bg-[#1a1a1a] text-white text-[13px] rounded-lg hover:bg-[#2a2a2a] transition-colors cursor-pointer disabled:opacity-60"
              >
                Create
              </button>
            </div>
          </>
        )}

        {(phase.step === "creating" || phase.step === "starting") && (
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="animate-spin w-6 h-6 border-2 border-[#e8e4df] border-t-[#1a1a1a] rounded-full" />
            <p className="text-[14px] text-muted-foreground">
              {phase.step === "creating"
                ? "Provisioning workspace..."
                : "Starting workspace..."}
            </p>
            <p className="text-[12px] text-[#a8a099] text-center max-w-xs">
              Each workspace runs in its own secure sandbox. First-time setup
              takes a minute or two — after that, it starts instantly.
            </p>
          </div>
        )}

        {phase.step === "ready" && (
          <div className="py-4 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[15px] font-medium">Workspace is ready!</p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpen}
                className="px-5 py-2 bg-[#1a1a1a] text-white text-[13px] rounded-lg hover:bg-[#2a2a2a] transition-colors cursor-pointer"
              >
                Open Workspace
              </button>
            </div>
          </div>
        )}

        {phase.step === "error" && (
          <>
            <p className="mt-3 text-[13px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {phase.message}
            </p>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => setPhase({ step: "input" })}
                className="px-5 py-2 bg-[#1a1a1a] text-white text-[13px] rounded-lg hover:bg-[#2a2a2a] transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
