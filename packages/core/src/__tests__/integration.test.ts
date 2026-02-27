// packages/core/src/__tests__/integration.test.ts
// Integration tests that require a real Postgres database
// Run with: DATABASE_URL=postgres://... pnpm test integration.test

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import pg from "pg";
import { createCrayon, Workflow, Node, type Crayon } from "../index.js";

const DATABASE_URL = process.env.DATABASE_URL;

// Schema used by tests (must match appName + "_dbos")
const TEST_SCHEMA = "integration_test_dbos";

async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Drop DBOS schema to start fresh - DBOS will recreate it on launch
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS integration_test CASCADE`);
  } finally {
    await client.end();
  }
}

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

// Define workflows
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

describe.skipIf(!DATABASE_URL)("crayon integration", () => {
  let crayon: Crayon;

  beforeAll(async () => {
    await resetDatabase();

    crayon = await createCrayon({
      databaseUrl: DATABASE_URL!,
      appName: "integration_test",
      workflows: {
        research: researchWorkflow,
        outer: outerWorkflow,
        inner: innerWorkflow,
      },
      nodes: { "fetch-data": fetchData, summarize },
    });
  }, 30000);

  afterAll(async () => {
    await crayon?.shutdown();
  });

  it("complete workflow with multiple nodes", async () => {
    const result = await crayon.triggerWorkflow("research", {
      url: "https://example.com",
    });

    expect(result).toEqual({
      title: "Page: https://example.com",
      summary: "Summary of: Content here...",
    });
  });

  it("nested workflow calls", async () => {
    const result = await crayon.triggerWorkflow("outer", { value: 5 });
    expect(result).toBe(11); // (5 * 2) + 1
  });
});
