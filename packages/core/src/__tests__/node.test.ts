// packages/core/src/__tests__/node.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Node } from "../node.js";
import { createWorkflowContext } from "../context.js";

describe("Node.create()", () => {
  it("creates a node with correct properties", () => {
    const inputSchema = z.object({ url: z.string() });
    const outputSchema = z.object({ status: z.number() });

    const node = Node.create({
      name: "test.fetch",
      description: "Fetch something",
      inputSchema,
      outputSchema,
      execute: async () => ({ status: 200 }),
    });

    expect(node.name).toBe("test.fetch");
    expect(node.type).toBe("node");
    expect(node.description).toBe("Fetch something");
    expect(node.inputSchema).toBe(inputSchema);
    expect(node.outputSchema).toBe(outputSchema);
  });

  it("executes with context and inputs", async () => {
    const node = Node.create({
      name: "test.number",
      description: "Returns a number",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, { value }) => ({ doubled: value * 2 }),
    });

    const ctx = createWorkflowContext();

    // Valid input
    const result = await node.execute(ctx, { value: 5 });
    expect(result).toEqual({ doubled: 10 });
  });

  it("works without outputSchema", async () => {
    const node = Node.create({
      name: "test.simple",
      description: "Simple node",
      inputSchema: z.object({ msg: z.string() }),
      execute: async (_ctx, { msg }) => `Hello, ${msg}`,
    });

    const ctx = createWorkflowContext();
    expect(node.outputSchema).toBeUndefined();
    const result = await node.execute(ctx, { msg: "world" });
    expect(result).toBe("Hello, world");
  });
});
