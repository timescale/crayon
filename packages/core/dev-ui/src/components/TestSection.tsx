import { useState, useCallback } from "react";
import type { WorkflowDAG } from "../types";

interface TestSectionProps {
  dag: WorkflowDAG;
  onSuccess: () => void;
}

export function TestSection({ dag, onSuccess }: TestSectionProps) {
  const inputNode = dag.nodes.find((n) => n.type === "input");
  const fields = inputNode?.fields ?? [];

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, ""])),
  );
  const [rawJson, setRawJson] = useState("{}");
  const [useRawJson, setUseRawJson] = useState(fields.length === 0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildInput = useCallback((): Record<string, unknown> => {
    if (useRawJson) {
      return JSON.parse(rawJson);
    }
    const input: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value === "") continue;
      try {
        input[key] = JSON.parse(value);
      } catch {
        input[key] = value;
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
      const res = await fetch(`/dev/api/workflows/${encodeURIComponent(dag.workflowName)}/run`, {
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
      setRunning(false);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setRunning(false);
    }
  }, [dag.workflowName, buildInput, onSuccess]);

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-3">
        Test Input
      </h3>

      <div className="space-y-3">
        {/* Toggle between form and raw JSON */}
        {fields.length > 0 && (
          <label className="flex items-center gap-2 text-[11px] text-[#a8a099] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useRawJson}
              onChange={(e) => setUseRawJson(e.target.checked)}
              className="accent-[#1a1a1a]"
            />
            Raw JSON
          </label>
        )}

        {useRawJson ? (
          <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] overflow-hidden">
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="w-full p-3 text-[13px] font-mono text-[#1a1a1a] bg-transparent resize-none outline-none placeholder:text-[#d4cfc8]"
              rows={4}
              placeholder='{"key": "value"}'
            />
          </div>
        ) : fields.length > 0 ? (
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field}>
                <label className="block text-[11px] font-medium text-[#1a1a1a] mb-1">{field}</label>
                <input
                  type="text"
                  value={fieldValues[field] ?? ""}
                  onChange={(e) =>
                    setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !running) handleRun();
                  }}
                  className="w-full text-[13px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]/20 placeholder:text-[#d4cfc8]"
                  placeholder={`Enter ${field}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] overflow-hidden">
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="w-full p-3 text-[13px] font-mono text-[#1a1a1a] bg-transparent resize-none outline-none placeholder:text-[#d4cfc8]"
              rows={3}
              placeholder='{"key": "value"}'
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <pre className="text-[10px] font-mono text-red-600 bg-red-50 rounded-lg p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto">
            {error}
          </pre>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running}
          className="w-full bg-[#1a1a1a] text-white hover:bg-[#2a2a2a] text-[13px] h-9 rounded-lg transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {running ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4l15 8-15 8V4z" />
              </svg>
              Run Test
            </>
          )}
        </button>
      </div>
    </div>
  );
}
