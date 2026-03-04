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
