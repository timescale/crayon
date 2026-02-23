import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { DAGNode } from "../types";
import { IntegrationSection } from "./IntegrationSection";
import type { useConnections } from "../hooks/useConnections";

type NodeType = DAGNode["type"];

const typeIcons: Record<NodeType, string> = {
  node: "fn",
  agent: "AI",
  workflow: "wf",
  input: "IN",
  output: "OUT",
  condition: "?",
};

const typeStyles: Record<NodeType, { iconBg: string }> = {
  node: { iconBg: "bg-emerald-50 text-emerald-600" },
  agent: { iconBg: "bg-purple-50 text-purple-600" },
  workflow: { iconBg: "bg-emerald-50 text-emerald-600" },
  input: { iconBg: "bg-[#f5f3f0] text-[#a8a099]" },
  output: { iconBg: "bg-[#f5f3f0] text-[#a8a099]" },
  condition: { iconBg: "bg-amber-50 text-amber-600" },
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
  workflowName?: string;
  connectionsApi?: ReturnType<typeof useConnections>;
}

export function NodeDetailPopover({ node, position, onClose, workflowName, connectionsApi }: NodeDetailPopoverProps) {
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

  const hasIntegrations = node.integrations && node.integrations.length > 0 && node.nodeName && workflowName && connectionsApi;

  return (
    <div
      ref={popoverRef}
      style={{ left: clampedPos.left, top: clampedPos.top }}
      className="absolute z-50 w-[300px] bg-popover rounded-xl border border-border shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-accent">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${style.iconBg}`}>
            <span className="text-[10px] font-bold">{icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-popover-foreground truncate">
              {node.label}
            </p>
            <p className="text-[10px] text-[#a8a099] uppercase tracking-wide">
              {typeLabel}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close node details"
          className="p-1 rounded-md text-[#a8a099] hover:text-popover-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Description */}
      <div className="px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-[#a8a099] mb-1.5">
          Description
        </p>
        {node.description ? (
          <div className="text-[13px] text-muted-foreground leading-relaxed prose-sm">
            <Markdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-popover-foreground">{children}</strong>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-border pl-2.5 my-2 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                code: ({ children }) => (
                  <code className="text-[12px] bg-muted px-1 py-0.5 rounded">{children}</code>
                ),
              }}
            >
              {node.description}
            </Markdown>
          </div>
        ) : (
          <p className="text-[13px] text-[#a8a099] italic">
            No description available
          </p>
        )}
      </div>

      {/* Integrations */}
      {hasIntegrations && (
        <div className="px-4 py-3 border-t border-accent">
          <p className="text-[11px] uppercase tracking-wider text-[#a8a099] mb-2">
            Integrations
          </p>
          <div className="flex flex-col gap-3">
            {node.integrations!.map((integrationId) => (
              <IntegrationSection
                key={integrationId}
                integrationId={integrationId}
                workflowName={workflowName!}
                nodeName={node.nodeName!}
                connectionsApi={connectionsApi!}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
