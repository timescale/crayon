// packages/core/src/__tests__/model-config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDefaultModelConfig,
  parseModelString,
} from "../nodes/agent/model-config.js";

describe("model-config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getDefaultModelConfig()", () => {
    it("returns openai/gpt-4o by default", () => {
      delete process.env.CRAYON_MODEL_PROVIDER;
      delete process.env.CRAYON_MODEL_ID;

      const config = getDefaultModelConfig();

      expect(config.provider).toBe("openai");
      expect(config.modelId).toBe("gpt-4o");
    });

    it("reads from environment variables", () => {
      process.env.CRAYON_MODEL_PROVIDER = "anthropic";
      process.env.CRAYON_MODEL_ID = "claude-3-opus";

      const config = getDefaultModelConfig();

      expect(config.provider).toBe("anthropic");
      expect(config.modelId).toBe("claude-3-opus");
    });
  });

  describe("parseModelString()", () => {
    it("parses provider/model format", () => {
      const result = parseModelString("anthropic/claude-3-opus");

      expect(result.provider).toBe("anthropic");
      expect(result.modelId).toBe("claude-3-opus");
    });

    it("parses model-only format", () => {
      const result = parseModelString("gpt-4-turbo");

      expect(result.provider).toBeUndefined();
      expect(result.modelId).toBe("gpt-4-turbo");
    });

    it("handles models with slashes in name", () => {
      // Only splits on first slash
      const result = parseModelString("openai/gpt-4/vision");

      expect(result.provider).toBe("openai");
      expect(result.modelId).toBe("gpt-4/vision");
    });
  });
});
