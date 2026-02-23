import { useState, useCallback, useEffect, useRef } from "react";
import type { WorkflowDAG } from "../types";

interface RunWorkflowModalProps {
  dag: WorkflowDAG;
  onClose: () => void;
  onSuccess: () => void;
}

export function RunWorkflowModal({ dag, onClose, onSuccess }: RunWorkflowModalProps) {
  const inputNode = dag.nodes.find((n) => n.type === "input");
  const fields = inputNode?.fields ?? [];

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, ""])),
  );
  const [rawJson, setRawJson] = useState("{}");
  const [useRawJson, setUseRawJson] = useState(fields.length === 0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, running]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current && !running) onClose();
    },
    [onClose, running],
  );

  const buildInput = useCallback((): Record<string, unknown> => {
    if (useRawJson) {
      return JSON.parse(rawJson);
    }
    const input: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value === "") continue;
      // Try to parse as JSON value (number, boolean, object, array)
      try {
        input[key] = JSON.parse(value);
      } catch {
        input[key] = value; // treat as string
      }
    }
    return input;
  }, [useRawJson, rawJson, fieldValues]);

  const handleRun = useCallback(async () => {
    setError(null);
    let input: Record<string, unknown>;
    try {
      input = buildInput();
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    setRunning(true);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(dag.workflowName)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (data.status === "ERROR") {
        setError(data.error ?? "Workflow failed");
        setRunning(false);
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setRunning(false);
    }
  }, [dag.workflowName, buildInput, onSuccess]);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
    >
      <div className="bg-card rounded-xl shadow-xl border border-border w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Run workflow</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{dag.workflowName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-muted-foreground hover:text-foreground text-lg px-1 cursor-pointer disabled:opacity-50"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-auto">
          {/* Toggle between form and raw JSON */}
          {fields.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useRawJson}
                onChange={(e) => setUseRawJson(e.target.checked)}
                className="accent-foreground"
              />
              Raw JSON
            </label>
          )}

          {useRawJson ? (
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="w-full h-40 font-mono text-xs bg-background border border-border rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-foreground/20"
              placeholder="{}"
            />
          ) : fields.length > 0 ? (
            fields.map((field) => (
              <div key={field}>
                <label className="block text-xs font-medium text-foreground mb-1">{field}</label>
                <input
                  type="text"
                  value={fieldValues[field] ?? ""}
                  onChange={(e) =>
                    setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !running) handleRun();
                  }}
                  className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder={`Enter ${field}`}
                />
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">
              This workflow has no input fields.
            </p>
          )}

          {/* Error */}
          {error && (
            <pre className="text-xs font-mono text-red-600 bg-red-50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-32 overflow-auto">
              {error}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-1.5 text-xs bg-foreground text-background rounded-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 flex items-center gap-2"
          >
            {running ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </>
            ) : (
              "Run"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
