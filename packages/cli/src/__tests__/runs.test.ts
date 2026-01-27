// packages/cli/src/__tests__/runs.test.ts
import { describe, it, expect } from "vitest";
import { listRuns, getRun } from "../runs.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("runs", () => {
  it("lists recent workflow runs", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 10 });
    expect(Array.isArray(runs)).toBe(true);
    // Each run should have expected fields
    if (runs.length > 0) {
      expect(runs[0]).toHaveProperty("workflow_uuid");
      expect(runs[0]).toHaveProperty("name");
      expect(runs[0]).toHaveProperty("status");
    }
  });

  it("gets a specific run by full id", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1 });
    if (runs.length > 0) {
      const result = await getRun(DATABASE_URL!, runs[0].workflow_uuid);
      expect(result.run).not.toBeNull();
      expect(result.run!.workflow_uuid).toBe(runs[0].workflow_uuid);
      expect(result.ambiguous).toBeUndefined();
    }
  });

  it("gets a specific run by id prefix", async () => {
    const runs = await listRuns(DATABASE_URL!, { limit: 1 });
    if (runs.length > 0) {
      // Use first 8 characters as prefix (like displayed in history)
      const prefix = runs[0].workflow_uuid.slice(0, 8);
      const result = await getRun(DATABASE_URL!, prefix);
      // Should find the run (may be ambiguous if multiple runs share prefix)
      if (!result.ambiguous) {
        expect(result.run).not.toBeNull();
        expect(result.run!.workflow_uuid.startsWith(prefix)).toBe(true);
      }
    }
  });

  it("returns null for non-existent run", async () => {
    const result = await getRun(DATABASE_URL!, "non-existent-id");
    expect(result.run).toBeNull();
    expect(result.ambiguous).toBeUndefined();
  });
});
