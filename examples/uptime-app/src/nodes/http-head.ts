// src/nodes/http-head.ts
// Function node for HTTP HEAD requests
import { z } from "zod";
import { Node } from "0pflow";

export const httpHead = Node.create({
  name: "http-head",
  inputSchema: z.object({
    url: z.string(),
    timeout_ms: z.number().optional().default(5000),
  }),
  outputSchema: z.object({
    status_code: z.number().nullable(),
    response_time_ms: z.number(),
    error: z.string().nullable(),
    checked_at: z.string(),
  }),
  execute: async (_ctx, inputs) => {
    const start = Date.now();
    const checked_at = new Date().toISOString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), inputs.timeout_ms);

    try {
      const response = await fetch(inputs.url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return {
        status_code: response.status,
        response_time_ms: Date.now() - start,
        error: null,
        checked_at,
      };
    } catch (e) {
      clearTimeout(timeout);
      return {
        status_code: null,
        response_time_ms: Date.now() - start,
        error: e instanceof Error ? e.message : "Unknown error",
        checked_at,
      };
    }
  },
});
