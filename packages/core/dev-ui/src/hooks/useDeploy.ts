import { useState, useCallback } from "react";

export type DeployStep =
  | "preflight"
  | "authenticating"
  | "preparing"
  | "packaging"
  | "uploading"
  | "polling"
  | "done"
  | "error";

interface DeployProgress {
  step: DeployStep;
  message?: string;
  url?: string;
}

const STEP_LABELS: Partial<Record<DeployStep, string>> = {
  preflight: "Checking...",
  authenticating: "Authenticating...",
  preparing: "Preparing...",
  packaging: "Packaging...",
  uploading: "Uploading...",
  polling: "Starting app...",
};

export function useDeploy() {
  const [deploying, setDeploying] = useState(false);
  const [stepLabel, setStepLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);

  const startDeploy = useCallback(async () => {
    setDeploying(true);
    setError(null);
    setDeployedUrl(null);
    setStepLabel("Starting...");

    try {
      const response = await fetch("/api/deploy", { method: "POST" });

      if (!response.ok || !response.body) {
        setError(`Deploy request failed: ${response.statusText}`);
        setDeploying(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as DeployProgress;

            if (event.step === "done") {
              setDeployedUrl(event.url ?? null);
              setStepLabel("");
              setDeploying(false);
              return;
            }

            if (event.step === "error") {
              setError(event.message ?? "Deploy failed");
              setStepLabel("");
              setDeploying(false);
              return;
            }

            setStepLabel(STEP_LABELS[event.step] ?? event.message ?? "Deploying...");
          } catch {
            // Skip malformed events
          }
        }
      }

      // Stream ended without done/error event
      if (deploying) {
        setDeploying(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      setDeploying(false);
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);
  const dismissUrl = useCallback(() => setDeployedUrl(null), []);

  return { deploying, stepLabel, error, deployedUrl, startDeploy, dismissError, dismissUrl };
}
