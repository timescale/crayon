// packages/core/src/__tests__/dbos.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Node } from "../node.js";
import { z } from "zod";

// Mock DBOS SDK
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    setConfig: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    runStep: vi.fn().mockImplementation(async (fn) => fn()),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

describe("DBOS integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initializeDBOS()", () => {
    it("configures and launches DBOS with database URL", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");
      const { initializeDBOS } = await import("../dbos.js");

      await initializeDBOS({ databaseUrl: "postgres://localhost/test" });

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

  describe("createDurableContext()", () => {
    it("wraps executable calls in DBOS.runStep", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");
      const { createDurableContext } = await import("../dbos.js");

      const node = Node.create({
        name: "test-node",
        inputSchema: z.object({ x: z.number() }),
        execute: async (_ctx, inputs) => inputs.x * 2,
      });

      const ctx = createDurableContext();
      await ctx.run(node, { x: 5 });

      expect(DBOS.runStep).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ name: "test-node" })
      );
    });

    it("ctx.log uses DBOS.logger", async () => {
      const { DBOS } = await import("@dbos-inc/dbos-sdk");
      const { createDurableContext } = await import("../dbos.js");

      const ctx = createDurableContext();
      ctx.log("test message", "info");
      ctx.log("warning", "warn");

      expect(DBOS.logger.info).toHaveBeenCalledWith("test message");
      expect(DBOS.logger.warn).toHaveBeenCalledWith("warning");
    });
  });
});
