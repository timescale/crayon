// packages/core/src/__tests__/discover.integration.test.ts
// Integration tests for the discover() auto-discovery API
// Uses real project directories to test discovery behavior

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discover } from "../discover.js";
import { discoverAgents } from "../cli/discovery.js";

// Absolute path to the core package root (packages/core)
const CORE_PKG = resolve(__dirname, "..", "..");

let tempDir: string;
let emptyDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "crayon-discover-test-"));
  emptyDir = await mkdtemp(join(tmpdir(), "crayon-discover-empty-"));

  // Create directory structure matching a crayon app
  await mkdir(join(tempDir, "generated", "workflows"), { recursive: true });
  await mkdir(join(tempDir, "src", "nodes"), { recursive: true });
  await mkdir(join(tempDir, "agents"), { recursive: true });

  // Symlink node_modules/runcrayon → core package root (equivalent to npm link)
  // This lets jiti resolve `import from "runcrayon"` in the temp dir
  await mkdir(join(tempDir, "node_modules"), { recursive: true });
  await symlink(CORE_PKG, join(tempDir, "node_modules", "runcrayon"), "dir");

  // Also symlink zod so test fixtures can import it
  const zodPkg = resolve(CORE_PKG, "node_modules", "zod");
  await symlink(zodPkg, join(tempDir, "node_modules", "zod"), "dir");

  // Write a test workflow using the crayon package import
  await writeFile(
    join(tempDir, "generated", "workflows", "test-workflow.ts"),
    `
import { z } from "zod";
import { Workflow } from "runcrayon";

export const testWorkflow = Workflow.create({
  name: "test-workflow",
  description: "A test workflow for discovery",
  version: 1,
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  run: async (ctx, inputs) => {
    return { result: "processed: " + inputs.message };
  },
});
`,
  );

  // Write a test node using the crayon package import
  await writeFile(
    join(tempDir, "src", "nodes", "test-node.ts"),
    `
import { z } from "zod";
import { Node } from "runcrayon";

export const testNode = Node.create({
  name: "test-node",
  description: "A test node for discovery",
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ transformed: z.string() }),
  execute: async (_ctx, inputs) => {
    return { transformed: inputs.value.toUpperCase() };
  },
});
`,
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(emptyDir, { recursive: true, force: true });
});

describe("discover()", () => {
  it("discovers workflows from generated/workflows/", async () => {
    const result = await discover(tempDir);

    expect(result.workflows).toHaveProperty("test-workflow");
    expect(result.workflows["test-workflow"]!.type).toBe("workflow");
    expect(result.workflows["test-workflow"]!.name).toBe("test-workflow");
  });

  it("discovers nodes from src/nodes/", async () => {
    const result = await discover(tempDir);

    expect(result.nodes).toHaveProperty("test-node");
    expect(result.nodes["test-node"]!.type).toBe("node");
    expect(result.nodes["test-node"]!.name).toBe("test-node");
  });

  it("returns empty results for agents/ when no agents exist", async () => {
    const result = await discover(tempDir);

    expect(result.agents).toEqual({});
  });

  it("collects no warnings for valid files", async () => {
    const result = await discover(tempDir);

    expect(result.warnings).toEqual([]);
  });

  it("returns empty results for empty project directory", async () => {
    const result = await discover(emptyDir);

    expect(result.workflows).toEqual({});
    expect(result.agents).toEqual({});
    expect(result.nodes).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it("returns result shape compatible with createCrayon", async () => {
    const result = await discover(tempDir);

    // Verify the shape has the keys createCrayon expects
    expect(result).toHaveProperty("workflows");
    expect(result).toHaveProperty("agents");
    expect(result).toHaveProperty("nodes");
    expect(typeof result.workflows).toBe("object");
    expect(typeof result.agents).toBe("object");
    expect(typeof result.nodes).toBe("object");
  });

  it("skips index files in nodes directory", async () => {
    await writeFile(
      join(tempDir, "src", "nodes", "index.ts"),
      `export { testNode } from "./test-node.js";`,
    );

    const result = await discover(tempDir);

    const nodeNames = Object.keys(result.nodes);
    expect(nodeNames).toEqual(["test-node"]);

    await rm(join(tempDir, "src", "nodes", "index.ts"));
  });

  it("reports warnings for files that fail to load", async () => {
    await writeFile(
      join(tempDir, "generated", "workflows", "bad-workflow.ts"),
      `throw new Error("intentional load failure");`,
    );

    const result = await discover(tempDir);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("bad-workflow"))).toBe(true);

    // Valid workflow should still be discovered
    expect(result.workflows).toHaveProperty("test-workflow");

    await rm(join(tempDir, "generated", "workflows", "bad-workflow.ts"));
  });
});

describe("discoverAgents()", () => {
  it("returns empty when agents directory does not exist", async () => {
    const result = await discoverAgents(emptyDir);
    expect(result.agents).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it("returns empty when agents directory is empty", async () => {
    const result = await discoverAgents(tempDir);
    expect(result.agents).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it("skips index files in agents directory", async () => {
    await writeFile(
      join(tempDir, "agents", "index.ts"),
      `export {};`,
    );

    const result = await discoverAgents(tempDir);
    expect(result.agents).toEqual({});

    await rm(join(tempDir, "agents", "index.ts"));
  });
});
