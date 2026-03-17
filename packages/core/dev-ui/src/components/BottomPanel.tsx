import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";

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

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10px] text-[#a8a099] hover:text-[#1a1a1a] transition-colors shrink-0 cursor-pointer"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const INSTALL_CMD = "curl -fsSL https://raw.githubusercontent.com/timescale/crayon/main/scripts/install.sh | bash";
const RUN_CMD = "crayon";

function HelpTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] text-[#a8a099] hover:text-[#1a1a1a] w-5 h-5 rounded-full border border-[#e8e4df] flex items-center justify-center cursor-pointer transition-colors"
        title="How to connect"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-8 right-0 z-50 w-64 bg-white border border-[#e8e4df] rounded-lg shadow-lg p-3">
            <p className="text-[12px] font-medium text-[#1a1a1a] mb-2">
              Connect with your Claude Code
            </p>
            <div className="rounded-md bg-[#faf9f7] border border-[#e8e4df] px-2.5 py-1.5 mb-3 flex items-center justify-between gap-2">
              <code className="text-[11px] font-mono text-[#1a1a1a]">{RUN_CMD}</code>
              <CopyBtn text={RUN_CMD} />
            </div>
            <p className="text-[10px] text-[#a8a099] mb-1">Don't have crayon? Install it:</p>
            <div className="rounded-md bg-[#faf9f7] border border-[#e8e4df] px-2.5 py-1.5 flex items-start justify-between gap-2">
              <code className="text-[10px] font-mono text-[#1a1a1a] break-all">{INSTALL_CMD}</code>
              <CopyBtn text={INSTALL_CMD} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function BottomPanel({ tabs, defaultTab, onClose }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
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
              <span className="absolute bottom-0 left-3 right-3 h-[1.5px] bg-[#a8a099] rounded-full" />
            )}
          </button>
        ))}

        <div className="flex-1" />
        <span className="text-[11px] text-[#a8a099] mr-1.5">Want to run Claude locally? Use the crayon CLI</span>
        <HelpTooltip />
        <span className="w-1" />

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

    </div>
  );
}
