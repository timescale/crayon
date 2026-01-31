// packages/core/src/__tests__/registry.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Registry } from "../registry.js";
import { Node } from "../node.js";
import { Workflow } from "../workflow.js";

describe("Registry", () => {
  it("registers and retrieves workflows", () => {
    const workflow = Workflow.create({
      name: "test-workflow",
      description: "A test workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => "done",
    });

    const registry = new Registry({
      workflows: { "test-workflow": workflow },
    });

    expect(registry.getWorkflow("test-workflow")).toBe(workflow);
    expect(registry.listWorkflows()).toEqual(["test-workflow"]);
  });

  it("registers and retrieves nodes", () => {
    const node = Node.create({
      name: "test-node",
      description: "A test node",
      inputSchema: z.object({}),
      execute: async () => "done",
    });

    const registry = new Registry({
      nodes: { "test-node": node },
    });

    expect(registry.getExecutable("test-node")).toBe(node);
  });

  it("returns undefined for unknown executables", () => {
    const registry = new Registry({});

    expect(registry.getWorkflow("unknown")).toBeUndefined();
    expect(registry.getExecutable("unknown")).toBeUndefined();
  });

  it("lists all registered executables", () => {
    const node = Node.create({
      name: "my-node",
      description: "My node",
      inputSchema: z.object({}),
      execute: async () => {},
    });
    const workflow = Workflow.create({
      name: "my-workflow",
      description: "My workflow",
      version: 1,
      inputSchema: z.object({}),
      run: async () => {},
    });

    const registry = new Registry({
      nodes: { "my-node": node },
      workflows: { "my-workflow": workflow },
    });

    const all = registry.listAll();
    expect(all).toContain("my-node");
    expect(all).toContain("my-workflow");
  });
});
