// packages/core/src/index.ts
// 0pflow - AI-native workflow engine
export const VERSION = "0.1.0";

// Factory
export { create0pflow } from "./factory.js";
export { getSchemaName } from "./dbos.js";

// Executable factories
export { Node } from "./node.js";
export type { NodeDefinition } from "./node.js";

export { Workflow } from "./workflow.js";
export type { WorkflowDefinition, WorkflowExecutable } from "./workflow.js";

export { Agent } from "./agent.js";
export type { AgentDefinition, AgentExecutable } from "./agent.js";

// Node registry (for agent tool resolution)
export { NodeRegistry } from "./nodes/registry.js";
export type { NodeRegistryConfig } from "./nodes/registry.js";
export { httpGet, builtinNodes } from "./nodes/builtin/index.js";

// Agent internals (for advanced use cases)
export { parseAgentSpec, parseAgentSpecContent } from "./nodes/agent/parser.js";
export type { AgentSpec } from "./nodes/agent/parser.js";
export {
  getDefaultModelConfig,
  createModel,
  parseModelString,
} from "./nodes/agent/model-config.js";
export type { ModelConfig, ModelProvider } from "./nodes/agent/model-config.js";
export { executeAgent } from "./nodes/agent/executor.js";
export type {
  AgentExecutionResult,
  ExecuteAgentOptions,
} from "./nodes/agent/executor.js";

// Types
export type {
  Executable,
  WorkflowContext,
  LogLevel,
  PflowConfig,
  Pflow,
} from "./types.js";
