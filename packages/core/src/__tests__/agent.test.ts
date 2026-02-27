// packages/core/src/__tests__/agent.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Agent } from "../agent.js";

describe("Agent.create()", () => {
  it("creates an executable with correct properties", () => {
    const inputSchema = z.object({ query: z.string() });

    const agent = Agent.create({
      name: "researcher",
      description: "Researches topics",
      inputSchema,
      specPath: "src/crayon/agents/researcher.md",
    });

    expect(agent.name).toBe("researcher");
    expect(agent.type).toBe("agent");
    expect(agent.description).toBe("Researches topics");
    expect(agent.inputSchema).toBe(inputSchema);
  });

  it("execute throws error without runtime configured", async () => {
    const agent = Agent.create({
      name: "researcher-no-runtime",
      description: "Researches topics",
      inputSchema: z.object({ query: z.string() }),
      specPath: "src/crayon/agents/researcher.md",
    });

    const mockCtx = { run: async () => {}, log: () => {} } as never;
    await expect(agent.execute(mockCtx, { query: "test" })).rejects.toThrow(
      "DBOS.launch()"
    );
  });
});
