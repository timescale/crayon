// packages/core/src/__tests__/workflow.test.ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Mock DBOS SDK
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    registerWorkflow: vi.fn().mockImplementation((fn) => fn),
    runStep: vi.fn().mockImplementation(async (fn) => fn()),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

import { Workflow } from "../workflow.js";

describe("Workflow.create()", () => {
  it("creates an executable with correct properties", () => {
    const inputSchema = z.object({ url: z.string() });
    const outputSchema = z.object({ status: z.string() });

    const workflow = Workflow.create({
      name: "fetch-status",
      description: "Fetches status",
      version: 1,
      inputSchema,
      outputSchema,
      run: async (_ctx, _inputs) => ({ status: "ok" }),
    });

    expect(workflow.name).toBe("fetch-status");
    expect(workflow.type).toBe("workflow");
    expect(workflow.version).toBe(1);
    expect(workflow.description).toBe("Fetches status");
    expect(workflow.inputSchema).toBe(inputSchema);
  });

  it("execute calls run with context and inputs", async () => {
    const workflow = Workflow.create({
      name: "echo",
      description: "Echoes input",
      version: 1,
      inputSchema: z.object({ message: z.string() }),
      run: async (_ctx, inputs) => inputs.message,
    });

    const mockCtx = { run: async () => {}, log: () => {} } as any;
    const result = await workflow.execute(mockCtx, { message: "hello" });
    expect(result).toBe("hello");
  });
});
