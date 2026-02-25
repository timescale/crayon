interface NavSidebarProps {
  currentPath: string;
  navigate: (to: string) => void;
  connected: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  appName?: string;
}

const navItems = [
  {
    path: "/",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
        <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
        <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    path: "/credentials",
    label: "Credentials",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 5.5a3.5 3.5 0 1 0-3 3.46V11H5.5v2H7v1.5h2V8.96A3.5 3.5 0 0 0 10 5.5Z" />
        <circle cx="6.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    path: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="2" />
        <path d="M13.5 8a5.5 5.5 0 0 0-.1-.8l1.3-1-.7-1.2-1.5.5a5.5 5.5 0 0 0-1.2-.7L11 3.3H9.6l-.4 1.5a5.5 5.5 0 0 0-1.2.7L6.5 5l-.7 1.2 1.3 1a5.5 5.5 0 0 0 0 1.6l-1.3 1 .7 1.2 1.5-.5a5.5 5.5 0 0 0 1.2.7l.4 1.5h1.4l.4-1.5a5.5 5.5 0 0 0 1.2-.7l1.5.5.7-1.2-1.3-1a5.5 5.5 0 0 0 .1-.8Z" />
      </svg>
    ),
  },
];

function isActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/") {
    return currentPath === "/" || currentPath.startsWith("/workflows/");
  }
  return currentPath.startsWith(itemPath);
}

export function NavSidebar({
  currentPath,
  navigate,
  connected,
  collapsed,
  onToggleCollapse,
  appName,
}: NavSidebarProps) {
  return (
    <div
      className="flex flex-col bg-[#f3ede5] shrink-0 border-r border-border transition-[width] duration-200"
      style={{ width: collapsed ? 56 : 224 }}
    >
      {/* Logo */}
      <div className={`py-4 flex items-center gap-2 ${collapsed ? "px-3 justify-center" : "px-4"}`}>
        <div className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0">
          M
        </div>
        {!collapsed && (
          <>
            <span className="text-sm font-bold text-foreground font-serif tracking-wide">
              {appName || "Mache"}
            </span>
            <span
              className={`w-2 h-2 rounded-full ml-auto ${connected ? "bg-green-400" : "bg-red-400"}`}
              title={connected ? "Connected" : "Disconnected"}
            />
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-2 flex flex-col gap-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {navItems.map((item) => {
          const active = isActive(currentPath, item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center rounded-lg text-sm transition-colors cursor-pointer text-left
                ${collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"}
                ${
                  active
                    ? "bg-[#e8e0d4] text-foreground font-medium shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                    : "text-muted-foreground hover:bg-[#ece5db] hover:text-foreground"
                }
              `}
            >
              <span className="shrink-0 opacity-80">{item.icon}</span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={`py-3 border-t border-border ${collapsed ? "px-2" : "px-3"}`}>
        <button
          onClick={onToggleCollapse}
          className={`flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-lg hover:bg-[#ece5db] text-xs
            ${collapsed ? "justify-center w-full py-2 px-0" : "gap-2 px-3 py-2 w-full"}
          `}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          >
            <path d="M9 3L5 7L9 11" />
          </svg>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}
