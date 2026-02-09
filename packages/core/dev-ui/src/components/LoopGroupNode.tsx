import { Handle, Position, type NodeProps } from "@xyflow/react";

export function LoopGroupNode({ data }: NodeProps) {
  const label = (data.label ?? "") as string;

  return (
    <div
      className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-100/50 relative"
      style={{
        width: data.width as number,
        height: data.height as number,
      }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-dashed border-slate-200">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-slate-400"
        >
          <path
            d="M3 4C2 4 1 5 1 6.5C1 8 2 9 3 9H11C12 9 13 8 13 6.5C13 5 12 4 11 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M9.5 3L11 4L9.5 5" fill="currentColor" />
        </svg>
        <span className="text-[11px] font-medium text-slate-500 truncate">
          {label}
        </span>
      </div>

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
