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
  workspaces,
}: {
  user: UserInfo;
  workspaces: Workspace[];
}) {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
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

        {workspaces.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-8 text-center shadow-sm">
            <p className="text-muted-foreground text-[14px] mb-2">
              No workspaces yet.
            </p>
            <p className="text-muted-foreground text-[13px]">
              Create one from the CLI with{" "}
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[12px]">
                crayon
              </code>
            </p>
          </div>
        ) : (
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
                    href={`/api/workspaces/open?app=${encodeURIComponent(ws.fly_app_name)}`}
                    className="inline-flex items-center px-4 py-1.5 bg-muted text-foreground text-[13px] rounded-lg hover:bg-[#e8e4df] transition-colors"
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <p className="text-[13px] text-muted-foreground">
            Create a new workspace:
          </p>
          <CopyableCommand label="1. Install the CLI" command="curl -fsSL https://raw.githubusercontent.com/timescale/crayon/main/scripts/install.sh | bash" />
          <CopyableCommand label="2. Launch a workspace" command="crayon" />
        </div>
      </main>
    </div>
  );
}

function CopyableCommand({ label, command }: { label?: string; command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      {label && (
        <p className="text-[12px] text-muted-foreground mb-1.5">{label}</p>
      )}
      <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-4 py-2.5 font-mono text-[12px] text-white/90">
        <code className="flex-1 overflow-x-auto whitespace-nowrap">{command}</code>
        <button
          onClick={handleCopy}
          className="shrink-0 text-white/50 hover:text-white transition-colors cursor-pointer"
          title="Copy to clipboard"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
