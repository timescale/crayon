// packages/core/src/__tests__/factory.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { create0pflow } from "../factory.js";
import { Workflow } from "../workflow.js";
import { Node } from "../node.js";

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

describe("create0pflow()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes DBOS and returns pflow instance", async () => {
    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
    });

    expect(pflow).toBeDefined();
    expect(typeof pflow.listWorkflows).toBe("function");
    expect(typeof pflow.getWorkflow).toBe("function");
    expect(typeof pflow.triggerWorkflow).toBe("function");
  });

  it("listWorkflows returns registered workflow names", async () => {
    const workflow = Workflow.create({
      name: "test-workflow",
      description: "A test workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => "done",
    });

    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { "test-workflow": workflow },
    });

    expect(pflow.listWorkflows()).toEqual(["test-workflow"]);
  });

  it("getWorkflow returns workflow by name", async () => {
    const workflow = Workflow.create({
      name: "my-workflow",
      description: "My workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => "done",
    });

    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { "my-workflow": workflow },
    });

    expect(pflow.getWorkflow("my-workflow")).toBe(workflow);
    expect(pflow.getWorkflow("unknown")).toBeUndefined();
  });

  it("triggerWorkflow executes workflow by name", async () => {
    const workflow = Workflow.create({
      name: "echo",
      description: "Echoes input",
      version: 1,
      inputSchema: z.object({ message: z.string() }),
      run: async (_ctx, inputs) => ({ echoed: inputs.message }),
    });

    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { echo: workflow },
    });

    const result = await pflow.triggerWorkflow("echo", { message: "hello" });
    expect(result).toEqual({ echoed: "hello" });
  });

  it("triggerWorkflow throws for unknown workflow", async () => {
    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
    });

    await expect(pflow.triggerWorkflow("unknown", {})).rejects.toThrow(
      'Workflow "unknown" not found'
    );
  });

  it("triggerWorkflow validates inputs", async () => {
    const workflow = Workflow.create({
      name: "strict",
      description: "Strict workflow",
      version: 1,
      inputSchema: z.object({ required: z.string() }),
      run: async () => "done",
    });

    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { strict: workflow },
    });

    await expect(pflow.triggerWorkflow("strict", {})).rejects.toThrow();
  });

  it("workflows can use ctx.run to call nodes", async () => {
    const doubleNode = Node.create({
      name: "double",
      description: "Doubles a number",
      inputSchema: z.object({ value: z.number() }),
      execute: async (_ctx, inputs) => inputs.value * 2,
    });

    const workflow = Workflow.create({
      name: "double-workflow",
      description: "Workflow that doubles a number",
      version: 1,
      inputSchema: z.object({ value: z.number() }),
      run: async (ctx, inputs) => {
        const doubled = await ctx.run(doubleNode, { value: inputs.value });
        return { result: doubled };
      },
    });

    const pflow = await create0pflow({
      databaseUrl: "postgres://localhost/test",
      workflows: { "double-workflow": workflow },
      nodes: { double: doubleNode },
    });

    const result = await pflow.triggerWorkflow("double-workflow", { value: 5 });
    expect(result).toEqual({ result: 10 });
  });
});
