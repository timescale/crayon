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
 * Credentials returned from a Nango connection.
 * Both `token` and `access_token` return the same value.
 */
export class ConnectionCredentials {
  token: string;
  connectionConfig: Record<string, unknown>;
  raw: Record<string, unknown>;

  constructor(opts: {
    token: string;
    connectionConfig?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  }) {
    this.token = opts.token;
    this.connectionConfig = opts.connectionConfig ?? {};
    this.raw = opts.raw ?? {};
  }

  /** Alias for `token` — matches the common OAuth field name */
  get access_token(): string {
    return this.token;
  }
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
 * Configuration for createCrayon()
 */
export interface CrayonConfig {
  /** Database connection URL for DBOS durability */
  databaseUrl: string;
  /** Application name (used for DB schema naming and connection table) */
  appName: string;
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
 * The crayon instance returned by createCrayon()
 */
export interface Crayon {
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
  /** Shutdown the crayon instance and DBOS */
  shutdown: () => Promise<void>;
}
