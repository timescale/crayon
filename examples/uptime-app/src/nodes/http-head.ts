import type { NodeDefinition } from "0pflow";

interface HttpHeadInput {
  url: string;
  timeout_ms?: number;
}

interface HttpHeadOutput {
  status_code: number | null;
  response_time_ms: number;
  error: string | null;
  checked_at: string;
}

export const httpHead: NodeDefinition<HttpHeadInput, HttpHeadOutput> = {
  name: "http-head",
  async execute(input) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeout_ms ?? 5000,
    );

    try {
      const response = await fetch(input.url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return {
        status_code: response.status,
        response_time_ms: Date.now() - start,
        error: null,
        checked_at: new Date().toISOString(),
      };
    } catch (e) {
      clearTimeout(timeout);
      return {
        status_code: null,
        response_time_ms: Date.now() - start,
        error: e instanceof Error ? e.message : "Unknown error",
        checked_at: new Date().toISOString(),
      };
    }
  },
};
