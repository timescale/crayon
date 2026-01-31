// packages/core/src/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { create0pflow, Workflow, Node } from "../index.js";

// Mock DBOS
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    setConfig: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    runStep: vi.fn().mockImplementation(async (fn) => fn()),
    registerWorkflow: vi.fn().mockImplementation((fn) => fn),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

describe("0pflow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("complete workflow with multiple nodes", async () => {
    // Define nodes
    const fetchData = Node.create({
      name: "fetch-data",
      description: "Fetches data from a URL",
      inputSchema: z.object({ url: z.string() }),
      outputSchema: z.object({ title: z.string(), body: z.string() }),
      execute: async (_ctx, inputs) => ({
        title: `Page: ${inputs.url}`,
        body: "Content here",
      }),
    });

    const summarize = Node.create({
      name: "summarize",
      description: "Summarizes text",
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ summary: z.string() }),
      execute: async (_ctx, inputs) => ({
        summary: `Summary of: ${inputs.text.slice(0, 20)}...`,
      }),
    });

    // Define workflow
    const researchWorkflow = Workflow.create({
      name: "research",
      description: "Researches a URL",
      version: 1,
      inputSchema: z.object({ url: z.string() }),
      outputSchema: z.object({ title: z.string(), summary: z.string() }),
      run: async (ctx, inputs) => {
        ctx.log("Starting research workflow");

        const data = await ctx.run(fetchData, { url: inputs.url });
        ctx.log(`Fetched: ${data.title}`);

        const result = await ctx.run(summarize, { text: data.body });
        ctx.log("Summarization complete");

        return { title: data.title, summary: result.summary };
      },
    });

    // Create instance
    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { research: researchWorkflow },
      nodes: { "fetch-data": fetchData, summarize },
    });

    // Execute
    const result = await pflow.triggerWorkflow("research", {
      url: "https://example.com",
    });

    expect(result).toEqual({
      title: "Page: https://example.com",
      summary: "Summary of: Content here...",
    });
  });

  it("nested workflow calls", async () => {
    const innerWorkflow = Workflow.create({
      name: "inner",
      description: "Inner workflow that doubles",
      version: 1,
      inputSchema: z.object({ value: z.number() }),
      run: async (_ctx, inputs) => inputs.value * 2,
    });

    const outerWorkflow = Workflow.create({
      name: "outer",
      description: "Outer workflow that calls inner",
      version: 1,
      inputSchema: z.object({ value: z.number() }),
      run: async (ctx, inputs) => {
        const doubled = await ctx.run(innerWorkflow, { value: inputs.value });
        return doubled + 1;
      },
    });

    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { outer: outerWorkflow, inner: innerWorkflow },
    });

    const result = await pflow.triggerWorkflow("outer", { value: 5 });
    expect(result).toBe(11); // (5 * 2) + 1
  });
});
