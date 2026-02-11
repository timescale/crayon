import { z } from "zod";
import type { ModelConfig } from "./nodes/agent/model-config.js";

/**
 * Base interface for all executable types (Node, Agent, Workflow)
 */
export interface Executable<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly type: "node" | "agent" | "workflow";
  readonly description: string;
  readonly version?: number;
  readonly integrations?: string[];
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Credentials returned from a Nango connection
 */
export interface ConnectionCredentials {
  token: string;
  /** Provider-specific config (e.g., instance_url for Salesforce) */
  connectionConfig?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

/**
 * Context passed to workflow/node run functions
 */
export interface WorkflowContext {
  /** The name of the workflow this context belongs to */
  readonly workflowName: string;

  /** Run any executable (node, agent, workflow) as a durable step */
  run: <TInput, TOutput>(
    executable: Executable<TInput, TOutput>,
    inputs: TInput
  ) => Promise<TOutput>;

  /** Get credentials for a configured integration connection */
  getConnection: (integrationId: string) => Promise<ConnectionCredentials>;

  /** Structured logging */
  log: (message: string, level?: LogLevel) => void;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExecutable = Executable<any, any>;

/**
 * Configuration for create0pflow()
 */
export interface PflowConfig {
  /** Database connection URL for DBOS durability */
  databaseUrl: string;
  /** Application name (used for DBOS schema naming) */
  appName?: string;
  /** Registered workflows */
  workflows?: Record<string, AnyExecutable>;
  /** Registered agents */
  agents?: Record<string, AnyExecutable>;
  /** Registered function nodes (also available to agents as tools) */
  nodes?: Record<string, AnyExecutable>;
  /** Default model configuration for agents */
  modelConfig?: ModelConfig;
  /** Nango secret key for connection management */
  nangoSecretKey?: string;
}

/**
 * The 0pflow instance returned by create0pflow()
 */
export interface Pflow {
  /** List all registered workflow names */
  listWorkflows: () => string[];
  /** Get a workflow by name */
  getWorkflow: (name: string) => AnyExecutable | undefined;
  /** Trigger a workflow by name (for webhooks/UI) */
  triggerWorkflow: <T = unknown>(name: string, inputs: unknown) => Promise<T>;
  /** List all registered node names */
  listNodes: () => string[];
  /** Get a node by name */
  getNode: (name: string) => AnyExecutable | undefined;
  /** Trigger a node by name (wrapped in workflow for durability) */
  triggerNode: <T = unknown>(name: string, inputs: unknown, options?: { workflowName?: string }) => Promise<T>;
  /** Shutdown the 0pflow instance and DBOS */
  shutdown: () => Promise<void>;
}
