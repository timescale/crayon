import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DAGNode } from "../types";

type NodeType = DAGNode["type"];

const typeStyles: Record<NodeType, { bg: string; border: string; badge?: string; badgeText?: string }> = {
  node: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-500", badgeText: "text-white" },
  agent: { bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-500", badgeText: "text-white" },
  workflow: { bg: "bg-green-50", border: "border-green-200", badge: "bg-green-500", badgeText: "text-white" },
  input: { bg: "bg-slate-50", border: "border-slate-200" },
  output: { bg: "bg-slate-50", border: "border-slate-200" },
  condition: { bg: "bg-amber-50", border: "border-amber-300" },
};

const typeIcons: Record<NodeType, string> = {
  node: "fn",
  agent: "AI",
  workflow: "wf",
  input: "IN",
  output: "OUT",
  condition: "?",
};

export function WorkflowNode({ data }: NodeProps) {
  const nodeType = (data.type ?? "node") as NodeType;
  const label = (data.label ?? "") as string;
  const fields = (data.fields ?? undefined) as string[] | undefined;
  const style = typeStyles[nodeType] ?? typeStyles.node;
  const icon = typeIcons[nodeType] ?? "fn";
  const isIO = nodeType === "input" || nodeType === "output";
  const isCondition = nodeType === "condition";

  return (
    <div
      className={`
        border rounded-lg shadow-sm relative
        ${style.bg} ${style.border}
        ${isCondition ? "border-dashed border-2" : ""}
      `}
      style={{ minWidth: isIO ? 120 : 160, maxWidth: 260 }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {style.badge ? (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${style.badge} ${style.badgeText}`}>
            {icon}
          </span>
        ) : (
          <span className="text-[10px] font-bold text-slate-400 shrink-0">
            {icon}
          </span>
        )}

        <span className={`font-medium ${isIO ? "text-xs text-slate-500" : "text-sm text-slate-800"}`}>
          {label}
        </span>
      </div>

      {isIO && fields && fields.length > 0 && (
        <div className="border-t border-slate-200 px-3 py-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {fields.map((field) => (
            <span key={field} className="text-[10px] text-slate-400 font-mono">
              {field}
            </span>
          ))}
        </div>
      )}

      {nodeType !== "input" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-slate-400 !w-2 !h-2 !border-0"
        />
      )}
      {nodeType !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-slate-400 !w-2 !h-2 !border-0"
        />
      )}
    </div>
  );
}
