import { Handle, Position, type NodeProps } from "@xyflow/react";

export function LoopGroupNode({ data }: NodeProps) {
  const label = (data.label ?? "") as string;
  const w = data.width as number;
  const h = data.height as number;

  return (
    <div
      className="relative rounded-xl"
      style={{
        width: w,
        height: h,
        border: "1.5px dashed #d1d5db",
        background: "rgba(249, 250, 251, 0.5)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-gray-200">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-gray-400"
        >
          <path
            d="M3 4C2 4 1 5 1 6.5C1 8 2 9 3 9H11C12 9 13 8 13 6.5C13 5 12 4 11 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M9.5 3L11 4L9.5 5" fill="currentColor" />
        </svg>
        <span className="text-[12px] font-semibold text-gray-500 truncate">
          {label}
        </span>
      </div>

      {/* Invisible handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !w-0 !h-0 !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !w-0 !h-0 !border-0"
      />
    </div>
  );
}
