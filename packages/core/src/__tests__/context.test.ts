import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createWorkflowContext } from "../context.js";
import type { Executable, WorkflowContext } from "../types.js";
import { Tool } from "../tools/tool.js";

// Helper to create a minimal executable for testing
// (Node.create() is implemented in a parallel task)
function createTestExecutable<TInput, TOutput>(config: {
  name: string;
  inputSchema: z.ZodType<TInput>;
  execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}): Executable<TInput, TOutput> {
  return {
    name: config.name,
    type: "node",
    inputSchema: config.inputSchema,
    execute: config.execute,
  };
}

describe("createWorkflowContext()", () => {
  it("ctx.run() validates inputs and calls execute", async () => {
    const executable = createTestExecutable({
      name: "double",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, inputs) => inputs.value * 2,
    });

    const ctx = createWorkflowContext();
    const result = await ctx.run(executable, { value: 5 });

    expect(result).toBe(10);
  });

  it("ctx.run() throws on invalid inputs", async () => {
    const executable = createTestExecutable({
      name: "double",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, inputs) => inputs.value * 2,
    });

    const ctx = createWorkflowContext();

    await expect(
      ctx.run(executable, { value: "not a number" } as any)
    ).rejects.toThrow();
  });

  it("ctx.log() calls the logger", () => {
    const logSpy = vi.fn();
    const ctx = createWorkflowContext({ logger: logSpy });

    ctx.log("test message", "info");
    ctx.log("warning", "warn");

    expect(logSpy).toHaveBeenCalledWith("test message", "info");
    expect(logSpy).toHaveBeenCalledWith("warning", "warn");
  });

  it("ctx.log() defaults to info level", () => {
    const logSpy = vi.fn();
    const ctx = createWorkflowContext({ logger: logSpy });

    ctx.log("test message");

    expect(logSpy).toHaveBeenCalledWith("test message", "info");
  });

  it("ctx.run() works with tools", async () => {
    const addTool = Tool.create({
      name: "add",
      description: "Adds two numbers",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => a + b,
    });

    const ctx = createWorkflowContext();
    const result = await ctx.run(addTool, { a: 2, b: 3 });
    expect(result).toBe(5);
  });
});
