// packages/core/src/nodes/agent/model-config.ts
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { OpenAIProvider } from "@ai-sdk/openai";
import type { AnthropicProvider } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Union type for provider instances
 */
export type Provider = OpenAIProvider | AnthropicProvider;

/**
 * Result of createModelAndProvider
 */
export interface ModelAndProvider {
  model: LanguageModel;
  provider: Provider;
  providerType: ModelProvider;
}

/**
 * Supported model providers
 */
export type ModelProvider = "openai" | "anthropic";

/**
 * Model configuration for agent execution
 */
export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  apiKey?: string;
}

/**
 * Default model configuration
 * Uses CRAYON_MODEL_PROVIDER and CRAYON_MODEL_ID env vars
 * Falls back to OpenAI GPT-4o
 */
export function getDefaultModelConfig(): ModelConfig {
  const provider = (process.env.CRAYON_MODEL_PROVIDER ?? "openai") as ModelProvider;
  const modelId = process.env.CRAYON_MODEL_ID ?? "gpt-4o";

  return { provider, modelId };
}

/**
 * Create a Vercel AI SDK model and provider instance from config
 */
export function createModelAndProvider(config: ModelConfig): ModelAndProvider {
  switch (config.provider) {
    case "openai": {
      const provider = createOpenAI({
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
      });
      return {
        model: provider(config.modelId),
        provider,
        providerType: "openai",
      };
    }
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
      });
      return {
        model: provider(config.modelId),
        provider,
        providerType: "anthropic",
      };
    }
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}

/**
 * Parse a model string in format "provider/model-id" or just "model-id"
 */
export function parseModelString(modelString: string): Partial<ModelConfig> {
  const slashIndex = modelString.indexOf("/");
  if (slashIndex !== -1) {
    const provider = modelString.slice(0, slashIndex);
    const modelId = modelString.slice(slashIndex + 1);
    return {
      provider: provider as ModelProvider,
      modelId,
    };
  }
  return { modelId: modelString };
}
