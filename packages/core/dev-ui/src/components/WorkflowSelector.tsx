import type { WorkflowDAG } from "../types";

interface WorkflowSelectorProps {
  workflows: WorkflowDAG[];
  parseErrors: Array<{ filePath: string; error: string }>;
  selected: string | null;
  onSelect: (workflowName: string) => void;
}

export function WorkflowSelector({
  workflows,
  parseErrors,
  selected,
  onSelect,
}: WorkflowSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Workflows
      </h2>

      {workflows.length === 0 && parseErrors.length === 0 && (
        <p className="text-xs text-[#a8a099] italic">No workflows yet — create one with Claude Code</p>
      )}

      {workflows.map((w) => (
        <button
          key={`${w.filePath}:${w.workflowName}`}
          onClick={() => onSelect(w.workflowName)}
          className={`
            text-left px-2.5 py-1.5 rounded-md text-sm transition-colors
            ${
              selected === w.workflowName
                ? "bg-[#e8e0d4] text-foreground font-medium shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                : "text-muted-foreground hover:bg-accent/60"
            }
          `}
        >
          <div className="font-medium truncate">{w.workflowName}</div>
          <div className="text-[10px] text-[#a8a099] truncate">{w.filePath}</div>
        </button>
      ))}

      {parseErrors.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mt-3 mb-1">
            Parse Errors
          </h2>
          {parseErrors.map((err) => (
            <div
              key={err.filePath}
              className="px-2.5 py-1.5 rounded-md text-xs bg-amber-50 text-amber-700 border border-amber-200"
            >
              <div className="font-medium truncate">{err.filePath}</div>
              <div className="truncate mt-0.5 text-amber-600">{err.error}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
