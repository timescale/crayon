import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DAGNode } from "../types";

type NodeType = DAGNode["type"];

const typeIcons: Record<NodeType, string> = {
  node: "fn",
  agent: "AI",
  workflow: "wf",
  input: "IN",
  output: "OUT",
  condition: "?",
};

const typeStyles: Record<NodeType, { badge?: string; badgeText?: string }> = {
  node: { badge: "bg-blue-500", badgeText: "text-white" },
  agent: { badge: "bg-purple-500", badgeText: "text-white" },
  workflow: { badge: "bg-green-500", badgeText: "text-white" },
  input: {},
  output: {},
  condition: {},
};

const typeLabels: Record<NodeType, string> = {
  node: "Node",
  agent: "Agent",
  workflow: "Workflow",
  input: "Input",
  output: "Output",
  condition: "Condition",
};

interface NodeDetailPopoverProps {
  node: DAGNode;
  position: { x: number; y: number };
  onClose: () => void;
}

export function NodeDetailPopover({ node, position, onClose }: NodeDetailPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const icon = typeIcons[node.type] ?? "fn";
  const style = typeStyles[node.type] ?? typeStyles.node;
  const typeLabel = typeLabels[node.type] ?? node.type;

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately from the same click that opens
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Clamp position so popover stays within its relative container
  const popoverWidth = 300;
  const popoverMaxHeight = 400;
  const padding = 12;

  const [clampedPos, setClampedPos] = useState({ left: position.x + 12, top: position.y - 20 });

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const parent = el.offsetParent as HTMLElement | null;
    const containerWidth = parent?.clientWidth ?? window.innerWidth;
    const containerHeight = parent?.clientHeight ?? window.innerHeight;

    setClampedPos({
      left: Math.max(padding, Math.min(position.x + 12, containerWidth - popoverWidth - padding)),
      top: Math.max(padding, Math.min(position.y - 20, containerHeight - popoverMaxHeight - padding)),
    });
  }, [position.x, position.y]);

  return (
    <div
      ref={popoverRef}
      style={{ left: clampedPos.left, top: clampedPos.top }}
      className="absolute z-50 w-[300px] bg-white rounded-xl border border-slate-200 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          {style.badge ? (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${style.badge} ${style.badgeText}`}>
              {icon}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 shrink-0">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-slate-800 truncate">
              {node.label}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              {typeLabel}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close node details"
          className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Description */}
      <div className="px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
          Description
        </p>
        {node.description ? (
          <p className="text-[13px] text-slate-600 whitespace-pre-line leading-relaxed">
            {node.description}
          </p>
        ) : (
          <p className="text-[13px] text-slate-400 italic">
            No description available
          </p>
        )}
      </div>
    </div>
  );
}
