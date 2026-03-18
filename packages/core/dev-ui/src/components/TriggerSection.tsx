import { useState, useCallback, useEffect, type ReactNode } from "react";
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

function WebhookModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="bg-white rounded-xl border border-[#e8e4df] shadow-lg w-[480px] max-h-[80vh] overflow-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[#a8a099] hover:text-[#1a1a1a] text-lg cursor-pointer"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TriggerSection({ dag, onSuccess }: TriggerSectionProps) {
  const inputNode = dag.nodes.find((n) => n.type === "input");
  const fields = inputNode?.fields ?? [];

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, ""])),
  );
  const [rawJson, setRawJson] = useState("{}");
  const [useRawJson, setUseRawJson] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Webhook token state
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [webhookExpiresAt, setWebhookExpiresAt] = useState<string | null>(null);
  const [webhookExpiry, setWebhookExpiry] = useState("30d");
  const [generatingToken, setGeneratingToken] = useState(false);
  const [webhookModal, setWebhookModal] = useState<"async" | "sync" | null>(null);
  const [webhookTestMode, setWebhookTestMode] = useState(false);

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
        body: JSON.stringify({ input, test_mode: testMode, source: "dev-ui-manual-run" }),
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
  }, [dag.workflowName, buildInput, onSuccess, testMode]);

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

  const asyncUrl = `${appUrl}/api/workflows/${encodeURIComponent(dag.workflowName)}/start`;
  const syncUrl = `${appUrl}/api/workflows/${encodeURIComponent(dag.workflowName)}/run`;
  const tokenForCurl = webhookToken ?? "$TOKEN";

  let inputJson: string;
  try {
    inputJson = JSON.stringify(buildInput());
  } catch {
    inputJson = "{}";
  }

  const testModeParam = webhookTestMode ? "true" : "false";
  const asyncCurlExample = `curl -X POST \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tokenForCurl}" \\
  -d '{"input":${inputJson},"test_mode":${testModeParam}}' \\
  ${asyncUrl}`;

  const pollCurlExample = `curl -H "Authorization: Bearer ${tokenForCurl}" \\
  ${appUrl}/api/runs/<runId>`;

  const syncCurlExample = `curl -X POST \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tokenForCurl}" \\
  -d '{"input":${inputJson},"test_mode":${testModeParam}}' \\
  ${syncUrl}`;

  return (
    <div className="space-y-5">
      {/* ── Run Manually ──────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-[#a8a099] font-medium mb-3">
          Run Manually
        </h3>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[11px] text-[#a8a099] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useRawJson}
              onChange={(e) => setUseRawJson(e.target.checked)}
              className="accent-[#1a1a1a]"
            />
            Raw JSON
          </label>

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
          ) : null}

          {error && (
            <pre className="text-[10px] font-mono text-red-600 bg-red-50 rounded-lg p-2 whitespace-pre-wrap break-all max-h-24 overflow-auto">
              {error}
            </pre>
          )}

          <label className="flex items-center gap-2 text-[11px] text-[#a8a099] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="accent-[#1a1a1a]"
            />
            Test mode <span className="text-[10px]">(skip side effects)</span>
          </label>

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
            Trigger this workflow via HTTP POST.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setWebhookModal("async")}
              className="flex-1 text-[12px] px-3 py-2 rounded-lg border border-[#e8e4df] hover:bg-[#f0ece7] transition-colors cursor-pointer text-[#1a1a1a]"
            >
              Async
              <span className="block text-[10px] text-[#a8a099] mt-0.5">Fire &amp; forget</span>
            </button>
            <button
              onClick={() => setWebhookModal("sync")}
              className="flex-1 text-[12px] px-3 py-2 rounded-lg border border-[#e8e4df] hover:bg-[#f0ece7] transition-colors cursor-pointer text-[#1a1a1a]"
            >
              Sync
              <span className="block text-[10px] text-[#a8a099] mt-0.5">Wait for result</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Webhook Modals ──────────────────────────────── */}
      {webhookModal === "async" && (
        <WebhookModal title="Async Webhook" onClose={() => setWebhookModal(null)}>
          <div className="space-y-4">
            <p className="text-[12px] text-[#a8a099]">
              Starts the workflow in the background and returns immediately with a run ID.
            </p>

            <label className="flex items-center gap-2 text-[11px] text-[#a8a099] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webhookTestMode}
                onChange={(e) => setWebhookTestMode(e.target.checked)}
                className="accent-[#1a1a1a]"
              />
              Test mode <span className="text-[10px]">(skip side effects)</span>
            </label>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#1a1a1a]">Trigger</span>
                <CopyButton text={asyncCurlExample} />
              </div>
              <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-3">
                <pre className="text-[11px] font-mono text-[#1a1a1a] whitespace-pre-wrap break-all">
                  {asyncCurlExample}
                </pre>
              </div>
              <p className="text-[10px] text-[#a8a099] mt-1">
                Returns <code className="text-[10px]">202</code> with <code className="text-[10px]">{`{ "runId": "..." }`}</code>
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#1a1a1a]">Check status</span>
                <CopyButton text={pollCurlExample} />
              </div>
              <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-3">
                <pre className="text-[11px] font-mono text-[#1a1a1a] whitespace-pre-wrap break-all">
                  {pollCurlExample}
                </pre>
              </div>
              <p className="text-[10px] text-[#a8a099] mt-1">
                Returns <code className="text-[10px]">status</code>: <code className="text-[10px]">SUCCESS</code>, <code className="text-[10px]">ERROR</code>, or <code className="text-[10px]">PENDING</code>
              </p>
            </div>

            {/* Token */}
            <div className="border-t border-[#e8e4df] pt-3">
              <span className="text-[11px] font-medium text-[#1a1a1a]">Token</span>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={webhookExpiry}
                  onChange={(e) => setWebhookExpiry(e.target.value)}
                  className="text-[12px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-2 py-1.5 outline-none"
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
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
        </WebhookModal>
      )}

      {webhookModal === "sync" && (
        <WebhookModal title="Sync Webhook" onClose={() => setWebhookModal(null)}>
          <div className="space-y-4">
            <p className="text-[12px] text-[#a8a099]">
              Blocks until the workflow completes and returns the result directly.
            </p>

            <label className="flex items-center gap-2 text-[11px] text-[#a8a099] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webhookTestMode}
                onChange={(e) => setWebhookTestMode(e.target.checked)}
                className="accent-[#1a1a1a]"
              />
              Test mode <span className="text-[10px]">(skip side effects)</span>
            </label>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#1a1a1a]">Request</span>
                <CopyButton text={syncCurlExample} />
              </div>
              <div className="rounded-lg border border-[#e8e4df] bg-[#faf9f7] p-3">
                <pre className="text-[11px] font-mono text-[#1a1a1a] whitespace-pre-wrap break-all">
                  {syncCurlExample}
                </pre>
              </div>
              <p className="text-[10px] text-[#a8a099] mt-1">
                Returns <code className="text-[10px]">200</code> with the workflow result, or <code className="text-[10px]">500</code> on error.
                Connection stays open for the duration of the workflow.
              </p>
            </div>

            {/* Token */}
            <div className="border-t border-[#e8e4df] pt-3">
              <span className="text-[11px] font-medium text-[#1a1a1a]">Token</span>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={webhookExpiry}
                  onChange={(e) => setWebhookExpiry(e.target.value)}
                  className="text-[12px] bg-[#faf9f7] border border-[#e8e4df] rounded-lg px-2 py-1.5 outline-none"
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
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
        </WebhookModal>
      )}
    </div>
  );
}
