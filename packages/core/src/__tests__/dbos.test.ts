// packages/core/src/__tests__/dbos.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DBOS SDK
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    setConfig: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("DBOS integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_SCHEMA = "test";
  });

  describe("initializeDBOS()", () => {
    it("configures and launches DBOS with database URL", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");
      const { initializeDBOS } = await import("../dbos.js");

      await initializeDBOS({ databaseUrl: "postgres://localhost/test", appName: "test" });

      expect(DBOS.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          systemDatabaseUrl: "postgres://localhost/test",
        })
      );
      expect(DBOS.launch).toHaveBeenCalled();
    });
  });

  describe("shutdownDBOS()", () => {
    it("shuts down DBOS", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");
      const { shutdownDBOS } = await import("../dbos.js");

      await shutdownDBOS();

      expect(DBOS.shutdown).toHaveBeenCalled();
    });
  });
});
