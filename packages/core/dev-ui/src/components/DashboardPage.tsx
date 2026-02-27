import type { WorkflowDAG } from "../types";

interface DashboardPageProps {
  workflows: WorkflowDAG[];
  parseErrors: Array<{ filePath: string; error: string }>;
  onSelectWorkflow: (workflowName: string) => void;
}

export function DashboardPage({ workflows, parseErrors, onSelectWorkflow }: DashboardPageProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 max-w-[1200px]">
        {/* Page header */}
        <h1 className="text-2xl font-light tracking-tight text-[#1a1a1a]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          Workflows
        </h1>
        <p className="text-sm text-[#787068] mt-1 tracking-wide">
          Manage and monitor your automation workflows.
        </p>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl border border-[#e8e4df] px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#a8a099] mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <span className="text-[11px] uppercase tracking-wider font-medium">Total</span>
            </div>
            <span className="text-2xl font-light tracking-tight text-[#1a1a1a]">{workflows.length}</span>
          </div>
          <div className="bg-white rounded-xl border border-[#e8e4df] px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#a8a099] mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-[11px] uppercase tracking-wider font-medium">Nodes</span>
            </div>
            <span className="text-2xl font-light tracking-tight text-[#1a1a1a]">
              {workflows.reduce((sum, w) => sum + w.nodes.filter(n => n.type !== "input" && n.type !== "output").length, 0)}
            </span>
          </div>
          <div className="bg-white rounded-xl border border-[#e8e4df] px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#a8a099] mb-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-[11px] uppercase tracking-wider font-medium">Files</span>
            </div>
            <span className="text-2xl font-light tracking-tight text-[#1a1a1a]">
              {new Set(workflows.map(w => w.filePath)).size}
            </span>
          </div>
        </div>

        {/* Workflow grid */}
        {workflows.length === 0 && parseErrors.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[#e8e4df] bg-white p-12 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-[#f0ece7] flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a8a099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <p className="text-[15px] text-[#1a1a1a] font-medium">No workflows yet</p>
            <p className="text-[13px] text-[#a8a099] mt-1.5 max-w-sm">
              Go to the <a href="#/canvas" className="underline text-[#1a1a1a] hover:text-[#000]">Canvas</a> tab to create workflows.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
            {workflows.map((w) => (
              <button
                key={`${w.filePath}:${w.workflowName}`}
                onClick={() => onSelectWorkflow(w.workflowName)}
                className="text-left bg-white rounded-xl border border-[#e8e4df] p-5 shadow-sm hover:shadow-md hover:border-[#d4cfc8] transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-medium text-[#1a1a1a] tracking-tight truncate">
                    {w.workflowName}
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
                    v{w.version}
                  </span>
                </div>

                <p className="text-sm text-[#787068] mt-2 leading-relaxed line-clamp-2">
                  {w.nodes.filter(n => n.type !== "input" && n.type !== "output").length} nodes
                  {w.nodes.some(n => n.type === "agent") && " including AI agents"}
                </p>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#f0ece7]">
                  <span className="text-xs text-[#a8a099] truncate">{w.filePath}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div className="mt-6">
            <h2 className="text-[15px] font-medium text-amber-700 mb-3">Parse Errors</h2>
            <div className="flex flex-col gap-2">
              {parseErrors.map((err) => (
                <div
                  key={err.filePath}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3"
                >
                  <p className="text-[13px] font-medium text-amber-800 truncate">{err.filePath}</p>
                  <p className="text-[12px] text-amber-600 mt-0.5 truncate">{err.error}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
