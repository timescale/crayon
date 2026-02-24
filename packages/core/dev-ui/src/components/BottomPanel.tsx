import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { SplitScreenHint } from "./SplitScreenHint";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

interface BottomPanelProps {
  tabs: TabDef[];
  defaultTab?: string;
  onClose: () => void;
}

const MIN_HEIGHT = 150;
const DEFAULT_HEIGHT = 400;

export function BottomPanel({ tabs, defaultTab, onClose }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [claudeCommand, setClaudeCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;
    },
    [height],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const maxHeight = window.innerHeight * 0.6;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeight.current + delta)));
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Fetch claude command hint
  useEffect(() => {
    fetch("/api/claude-command")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.isCloud) {
          setClaudeCommand("0pflow cloud claude --continue");
        } else if (data?.projectRoot) {
          setClaudeCommand(`cd ${data.projectRoot} && claude --continue`);
        }
      })
      .catch(() => {});
  }, []);

  const copyCommand = useCallback(() => {
    if (!claudeCommand) return;
    navigator.clipboard.writeText(claudeCommand).then(() => {
      setCopied(true);
      setShowHint(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [claudeCommand]);

  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div className="border-t border-border flex flex-col bg-background" style={{ height }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="h-1 cursor-ns-resize hover:bg-accent shrink-0"
      />

      {/* Tab bar */}
      <div className="shrink-0 px-3 flex items-center gap-0 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative text-[12px] tracking-wide px-3 py-2 cursor-pointer transition-colors ${
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-3 right-3 h-[1.5px] bg-[#b8ad9e] rounded-full" />
            )}
          </button>
        ))}

        <div className="flex-1" />

        {claudeCommand && (
          <button
            onClick={copyCommand}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer mr-2 max-w-[50%] group"
            title="Copy to open in your terminal"
          >
            <span className="shrink-0">Prefer your own terminal?</span>
            <span className="truncate font-mono">{claudeCommand}</span>
            {copied ? (
              <span className="text-[10px] text-emerald-600 shrink-0">Copied!</span>
            ) : (
              <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5" />
              </svg>
            )}
          </button>
        )}

        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm px-1.5 py-0.5 cursor-pointer"
          title="Close panel"
        >
          &times;
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeContent}
      </div>

      {showHint && <SplitScreenHint onClose={() => setShowHint(false)} />}
    </div>
  );
}
