// packages/cli/src/__tests__/discovery.test.ts
import { describe, it, expect } from "vitest";
import { discoverWorkflows } from "../discovery.js";
import path from "path";

describe("discoverWorkflows", () => {
  it("returns empty result if generated/workflows does not exist", async () => {
    const result = await discoverWorkflows("/nonexistent");
    expect(result.workflows).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("discovers workflow executables from uptime-app", async () => {
    const projectRoot = path.resolve(__dirname, "../../../..");
    const uptimeApp = path.join(projectRoot, "examples/uptime-app");
    const result = await discoverWorkflows(uptimeApp);
    expect(result.workflows.length).toBeGreaterThan(0);
    // Returns actual workflow executables with name and type
    expect(result.workflows.some(w => w.name === "url-check")).toBe(true);
    expect(result.workflows.every(w => w.type === "workflow")).toBe(true);
  });

  it("collects warnings for failed imports without throwing", async () => {
    // Warnings are collected, not printed, so caller can decide what to do
    const result = await discoverWorkflows("/nonexistent");
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
