import { useState, useCallback, useEffect } from "react";
import type { WorkflowDAG } from "../types";

interface TriggerSectionProps {
  dag: WorkflowDAG;
  onSuccess: () => void;
}

const EXPIRY_OPTIONS = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "365d" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10px] text-[#a8a099] hover:text-[#1a1a1a] transition-colors shrink-0 cursor-pointer"
      title="Copy"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function TriggerSection({ dag, onSuccess }: TriggerSectionProps) {
  const inputNode = dag.nodes.find((n) => n.type === "input");
  const fields = inputNode?.fields ?? [];

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, ""])),
  );
  const [rawJson, setRawJson] = useState("{}");
  const [useRawJson, setUseRawJson] = useState(fields.length === 0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Webhook token state
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [webhookExpiresAt, setWebhookExpiresAt] = useState<string | null>(null);
  const [webhookExpiry, setWebhookExpiry] = useState("30d");
  const [generatingToken, setGeneratingToken] = useState(false);

  // Fetch cloud info from the backend
  const [cloudInfo, setCloudInfo] = useState<{ isCloud: boolean; appUrl: string } | null>(null);
  useEffect(() => {
    fetch("/dev/api/claude-command")
      .then((r) => r.json())
      .then((data) => setCloudInfo({ isCloud: data.isCloud, appUrl: data.appUrl ?? "" }))
      .catch(() => {});
  }, []);

  const isCloud = cloudInfo?.isCloud ?? false;
  const appUrl = cloudInfo?.appUrl ?? "";

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

  const handleGenerateToken = useCallback(async () => {
    setGeneratingToken(true);
    try {
      const res = await fetch("/dev/api/webhook-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: webhookExpiry }),
      });
      const result = await res.json();
      if (result.data?.token) {
        setWebhookToken(result.data.token);
        setWebhookExpiresAt(result.data.expiresAt);
      } else {
        setError(result.error ?? "Failed to generate token");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate token");
    } finally {
      setGeneratingToken(false);
    }
  }, [webhookExpiry]);

  const webhookUrl = `${appUrl}/api/workflows/${encodeURIComponent(dag.workflowName)}/start`;
  const tokenForCurl = webhookToken ?? "$TOKEN";

  let inputJson: string;
  try {
    inputJson = JSON.stringify(buildInput());
  } catch {
    inputJson = "{}";
  }

  const curlExample = `curl -X POST \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tokenForCurl}" \\
  -d '{"input":${inputJson}}' \\
  ${webhookUrl}`;

  return (
    <div className="space-y-5">
      {/* ── Run Manually ──────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-3">
          Run Manually
        </h3>

        <div className="space-y-3">
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

          {error && (
            <pre className="text-[10px] font-mono text-red-600 bg-red-50 rounded-lg p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto">
              {error}
            </pre>
          )}

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
                Run Workflow
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Webhook ───────────────────────────────────────── */}
      {isCloud && (
        <div>
          <div className="border-t border-[#e8e4df] mb-5" />
          <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-1">
            Webhook
          </h3>
          <p className="text-[11px] text-[#a8a099] mb-3">
            Trigger via HTTP POST. Returns 202 with {"{"} runId {"}"}.
          </p>

          <div className="space-y-3">
            {/* URL */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#1a1a1a]">URL</span>
                <CopyButton text={webhookUrl} />
              </div>
              <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-2">
                <code className="text-[11px] font-mono text-[#1a1a1a] break-all">
                  {webhookUrl}
                </code>
              </div>
            </div>

            {/* Curl example */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#1a1a1a]">Example</span>
                <CopyButton text={curlExample} />
              </div>
              <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-2">
                <pre className="text-[11px] font-mono text-[#1a1a1a] whitespace-pre-wrap break-all">
                  {curlExample}
                </pre>
              </div>
            </div>

            {/* Token generation */}
            <div>
              <span className="text-[11px] font-medium text-[#1a1a1a]">Token</span>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={webhookExpiry}
                  onChange={(e) => setWebhookExpiry(e.target.value)}
                  className="text-[12px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-2 py-1.5 outline-none"
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleGenerateToken}
                  disabled={generatingToken}
                  className="text-[12px] bg-[#1a1a1a] text-white hover:bg-[#2a2a2a] px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                >
                  {generatingToken ? "Generating..." : "Generate"}
                </button>
              </div>

              {webhookToken && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[#a8a099]">
                      Expires {webhookExpiresAt ? new Date(webhookExpiresAt).toLocaleDateString() : ""}
                    </span>
                    <CopyButton text={webhookToken} />
                  </div>
                  <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-2">
                    <code className="text-[10px] font-mono text-[#1a1a1a] break-all line-clamp-3">
                      {webhookToken}
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
