import { useState, useCallback, useEffect } from "react";

export type DeployStatus = "idle" | "deploying" | "success" | "error";

export interface DeployState {
  status: DeployStatus;
  step?: string;
  message?: string;
  url?: string;
  error?: string;
}

export function useDeploy() {
  const [state, setState] = useState<DeployState>({ status: "idle" });
  // Persists across deploy cycles so the URL stays visible in the sidebar
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);

  // Fetch existing deploy URL on mount
  useEffect(() => {
    fetch("/api/deploy")
      .then((r) => r.json() as Promise<{ deployed: boolean; url?: string }>)
      .then((data) => {
        if (data.deployed && data.url) setDeployedUrl(data.url);
      })
      .catch(() => {});
  }, []);

  const startDeploy = useCallback(async () => {
    setState({ status: "deploying", message: "Starting deploy..." });

    try {
      const res = await fetch("/api/deploy", { method: "POST" });

      if (!res.ok) {
        setState({ status: "error", error: `Deploy request failed (HTTP ${res.status})` });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setState({ status: "error", error: "No response body" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as {
                type: string;
                step?: string;
                message?: string;
                url?: string;
              };
              if (data.type === "progress") {
                setState({
                  status: "deploying",
                  step: data.step,
                  message: data.message,
                });
              } else if (data.type === "done") {
                if (data.url) setDeployedUrl(data.url);
                setState({ status: "success", url: data.url });
              } else if (data.type === "error") {
                setState({ status: "error", error: data.message });
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { ...state, deployedUrl, startDeploy, reset };
}
