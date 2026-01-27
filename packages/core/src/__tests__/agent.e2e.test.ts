// packages/core/src/__tests__/agent.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { parseAgentSpecContent } from "../nodes/agent/parser.js";
import { executeAgent } from "../nodes/agent/executor.js";
import { ToolRegistry } from "../tools/registry.js";
import { createWorkflowContext } from "../context.js";

// Skip if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasApiKey)("Agent e2e", () => {
  let toolRegistry: ToolRegistry;

  beforeAll(() => {
    toolRegistry = new ToolRegistry();
  });

  it("summarizes a website using http_get and OpenAI", async () => {
    const spec = parseAgentSpecContent(`---
name: summarizer
tools:
  - http_get
maxSteps: 3
---
You are a helpful assistant that summarizes web pages.

When given a URL, use the http_get tool to fetch the page content, then provide a brief summary of what the page is about.

Keep your summary to 2-3 sentences.
`);

    const ctx = createWorkflowContext();
    const result = await executeAgent({
      ctx,
      spec,
      userMessage: "Please summarize the website at https://www.example.com",
      toolRegistry,
      modelConfig: {
        provider: "openai",
        modelId: "gpt-4o-mini",
      },
    });

    // Should have made at least one tool call to http_get
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.toolCalls[0].toolName).toBe("http_get");

    // Should have generated a text response
    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(50);

    // The summary should mention something about example.com
    // (example.com is a simple page that says it's for examples/documentation)
    const textLower = result.text.toLowerCase();
    expect(
      textLower.includes("example") ||
      textLower.includes("domain") ||
      textLower.includes("illustrative")
    ).toBe(true);

    console.log("Agent response:", result.text);
    console.log("Tool calls:", result.toolCalls.length);
    console.log("Steps:", result.steps);
  }, 30000); // 30s timeout for API call

  it("supports structured output", async () => {
    const spec = parseAgentSpecContent(`---
name: structured-summarizer
tools:
  - http_get
maxSteps: 3
---
You are a helpful assistant that analyzes web pages and returns structured data.

When given a URL, fetch the page and analyze it. Return your findings in the requested format.
`);

    const outputSchema = z.object({
      title: z.string().describe("The title or main heading of the page"),
      summary: z.string().describe("A one-sentence summary"),
      wordCount: z.number().describe("Estimated word count of the page content"),
    });

    const ctx = createWorkflowContext();
    const result = await executeAgent({
      ctx,
      spec,
      userMessage: "Analyze https://www.example.com",
      toolRegistry,
      modelConfig: {
        provider: "openai",
        modelId: "gpt-4o-mini",
      },
      outputSchema,
    });

    // Should have structured output
    expect(result.output).toBeDefined();
    expect(typeof result.output.title).toBe("string");
    expect(typeof result.output.summary).toBe("string");
    expect(typeof result.output.wordCount).toBe("number");

    console.log("Structured output:", result.output);
  }, 30000);
});
