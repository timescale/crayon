// packages/core/src/index.ts
// 0pflow - AI-native workflow engine
export const VERSION = "0.1.0";

// Factory
export { create0pflow } from "./factory.js";

// Executable factories
export { Node } from "./node.js";
export type { NodeDefinition } from "./node.js";

export { Workflow } from "./workflow.js";
export type { WorkflowDefinition, WorkflowExecutable } from "./workflow.js";

export { Agent } from "./agent.js";
export type { AgentDefinition, AgentExecutable } from "./agent.js";

// Types
export type {
  Executable,
  WorkflowContext,
  LogLevel,
  PflowConfig,
  Pflow,
} from "./types.js";
