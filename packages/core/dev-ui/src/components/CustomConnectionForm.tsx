import { useState, useCallback } from "react";
import type { CustomFormConfig } from "../lib/custom-connection-forms";

interface CustomConnectionFormProps {
  integrationId: string;
  config: CustomFormConfig;
  onSuccess: (connectionId: string) => void;
  onCancel: () => void;
}

export function CustomConnectionForm({
  integrationId,
  config,
  onSuccess,
  onCancel,
}: CustomConnectionFormProps) {
  const [mode, setMode] = useState<"fields" | "url">("fields");
  const [connectionString, setConnectionString] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const field of config.fields) {
      if (field.defaultValue) defaults[field.name] = field.defaultValue;
    }
    return defaults;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);

    // If in URL mode, parse first
    let finalValues = { ...values };
    if (mode === "url" && connectionString.trim()) {
      if (!config.parseConnectionString) return;
      try {
        const parsed = config.parseConnectionString(connectionString.trim());
        finalValues = { ...finalValues, ...parsed };
      } catch {
        setError("Invalid connection string format");
        return;
      }
    }

    // Validate required fields (skip nickname which is optional)
    for (const field of config.fields) {
      if (field.required && !finalValues[field.name]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    // Split into credentials + connection_config
    const credentials: Record<string, string> = {};
    const connectionConfig: Record<string, string> = {};
    for (const field of config.fields) {
      const val = finalValues[field.name];
      if (!val) continue;
      if (field.isCredential) {
        credentials[field.name] = val;
      } else {
        connectionConfig[field.name] = val;
      }
    }

    const connectionId = config.connectionIdTemplate(finalValues);

    setSubmitting(true);
    try {
      const res = await fetch("/dev/api/nango/create-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration_id: integrationId,
          connection_id: connectionId,
          credentials,
          connection_config: connectionConfig,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Failed: ${res.status}`);
      }

      onSuccess(connectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setSubmitting(false);
    }
  }, [values, mode, connectionString, config, integrationId, onSuccess]);

  const inputClass =
    "w-full text-[12px] px-2.5 py-1.5 rounded-md border border-[#e8e4df] bg-white text-[#1a1a1a] placeholder:text-[#c4bfb8] focus:outline-none focus:border-[#a8a099] transition-colors";

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("fields")}
          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
            mode === "fields"
              ? "bg-[#1a1a1a] text-white"
              : "bg-[#f0ece7] text-[#787068] hover:bg-[#e8e4df]"
          }`}
        >
          Fields
        </button>
        {config.parseConnectionString && (
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
              mode === "url"
                ? "bg-[#1a1a1a] text-white"
                : "bg-[#f0ece7] text-[#787068] hover:bg-[#e8e4df]"
            }`}
          >
            Connection String
          </button>
        )}
      </div>

      {mode === "url" ? (
        /* Connection string mode */
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-[10px] text-[#a8a099] block mb-0.5">Connection String<span className="text-red-400 ml-0.5">*</span></label>
            <input
              type="password"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              placeholder="postgresql://user:pass@host:5432/db?sslmode=require"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[10px] text-[#a8a099] block mb-0.5">Nickname</label>
            <input
              type="text"
              value={values.nickname ?? ""}
              onChange={(e) => setValue("nickname", e.target.value)}
              placeholder="e.g. Production DB"
              className={inputClass}
            />
          </div>
        </div>
      ) : (
        /* Individual fields mode */
        <div className="flex flex-col gap-2">
          {config.fields.map((field) => (
            <div key={field.name}>
              <label className="text-[10px] text-[#a8a099] block mb-0.5">
                {field.label}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {field.type === "select" ? (
                <select
                  value={values[field.name] ?? field.defaultValue ?? ""}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  className={inputClass}
                >
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={values[field.name] ?? ""}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="text-[10px] px-3 py-1 rounded-full bg-[#1a1a1a] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-[10px] px-3 py-1 rounded-full bg-[#f0ece7] text-[#787068] hover:bg-[#e8e4df] transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
