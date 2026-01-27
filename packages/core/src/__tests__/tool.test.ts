// packages/core/src/__tests__/tool.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Tool } from "../tools/tool.js";
import { createWorkflowContext } from "../context.js";

describe("Tool.create()", () => {
  it("creates a tool with correct properties", () => {
    const inputSchema = z.object({ url: z.string() });
    const outputSchema = z.object({ status: z.number() });

    const tool = Tool.create({
      name: "test.fetch",
      description: "Fetch something",
      inputSchema,
      outputSchema,
      execute: async () => ({ status: 200 }),
    });

    expect(tool.name).toBe("test.fetch");
    expect(tool.type).toBe("tool");
    expect(tool.description).toBe("Fetch something");
    expect(tool.inputSchema).toBe(inputSchema);
    expect(tool.outputSchema).toBe(outputSchema);
  });

  it("validates inputs before execution", async () => {
    const tool = Tool.create({
      name: "test.number",
      description: "Returns a number",
      inputSchema: z.object({ value: z.number() }),
      execute: async ({ value }) => ({ doubled: value * 2 }),
    });

    const ctx = createWorkflowContext();

    // Valid input
    const result = await tool.execute(ctx, { value: 5 });
    expect(result).toEqual({ doubled: 10 });

    // Invalid input
    await expect(tool.execute(ctx, { value: "not a number" } as never)).rejects.toThrow();
  });

  it("works without outputSchema", async () => {
    const tool = Tool.create({
      name: "test.simple",
      description: "Simple tool",
      inputSchema: z.object({ msg: z.string() }),
      execute: async ({ msg }) => `Hello, ${msg}`,
    });

    const ctx = createWorkflowContext();
    expect(tool.outputSchema).toBeUndefined();
    const result = await tool.execute(ctx, { msg: "world" });
    expect(result).toBe("Hello, world");
  });
});
