import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DAGNode } from "../types";
import {
  TYPE_ICONS,
  TYPE_LABELS,
  TYPE_BORDER_COLORS,
  TYPE_ICON_BG,
  TYPE_ICON_COLOR,
  TYPE_LABEL_COLOR,
  type NodeType,
} from "./nodeStyles";

export function WorkflowNode({ data }: NodeProps) {
  const nodeType = (data.type ?? "node") as NodeType;
  const label = (data.label ?? "") as string;
  const fields = (data.fields ?? undefined) as string[] | undefined;
  const icon = TYPE_ICONS[nodeType] ?? "<>";
  const isIO = nodeType === "input" || nodeType === "output";

  return (
    <div
      className="bg-white rounded-lg border"
      style={{
        borderColor: TYPE_BORDER_COLORS[nodeType],
        minWidth: isIO ? 120 : 160,
        maxWidth: 260,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Content */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: TYPE_ICON_BG[nodeType] }}
        >
          <span
            className="text-[11px] font-bold"
            style={{ color: TYPE_ICON_COLOR[nodeType] }}
          >
            {icon}
          </span>
        </div>

        <div className="min-w-0">
          <div
            className={`font-medium truncate ${
              isIO
                ? "text-[13px] text-gray-500"
                : "text-sm text-gray-800"
            }`}
          >
            {label}
          </div>
          <div
            className="text-[10px] font-semibold tracking-wider"
            style={{ color: TYPE_LABEL_COLOR[nodeType] }}
          >
            {TYPE_LABELS[nodeType]}
          </div>
        </div>
      </div>

      {isIO && fields && fields.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {fields.map((field) => (
            <span key={field} className="text-[11px] text-gray-400">
              {field}
            </span>
          ))}
        </div>
      )}

      {/* Handles */}
      {nodeType !== "input" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-[6px] !h-[6px] !bg-gray-300 !border !border-gray-200 !opacity-60"
        />
      )}
      {nodeType !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-[6px] !h-[6px] !bg-gray-300 !border !border-gray-200 !opacity-60"
        />
      )}
    </div>
  );
}
