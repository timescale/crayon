// packages/core/src/index.ts
// 0pflow - AI-native workflow engine
export const VERSION = "0.1.0";

// Factory
export { create0pflow } from "./factory.js";
export { getSchemaName } from "./dbos.js";

// Discovery
export { discover } from "./discover.js";
export type { DiscoverResult } from "./discover.js";

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
export { webRead, builtinNodes } from "./nodes/builtin/index.js";

// Agent internals (for advanced use cases)
export { parseAgentSpec, parseAgentSpecContent } from "./nodes/agent/parser.js";
export type { AgentSpec } from "./nodes/agent/parser.js";
export {
  getDefaultModelConfig,
  createModelAndProvider,
  parseModelString,
} from "./nodes/agent/model-config.js";
export type {
  ModelConfig,
  ModelProvider,
  ModelAndProvider,
  Provider,
} from "./nodes/agent/model-config.js";
export { executeAgent } from "./nodes/agent/executor.js";
export type {
  AgentExecutionResult,
  ExecuteAgentOptions,
  AgentTool,
  AgentTools,
} from "./nodes/agent/executor.js";

// Connection management
export {
  ensureConnectionsTable,
  resolveConnectionId,
  upsertConnection,
  listConnections,
  deleteConnection,
  initNango,
  getNango,
  fetchCredentials,
  createIntegrationProvider,
} from "./connections/index.js";
export type { ConnectionMapping, IntegrationProvider } from "./connections/index.js";

// Types
export type {
  Executable,
  WorkflowContext,
  ConnectionCredentials,
  LogLevel,
  PflowConfig,
  Pflow,
} from "./types.js";
