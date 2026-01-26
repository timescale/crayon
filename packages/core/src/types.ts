import { z } from "zod";

/**
 * Base interface for all executable types (Node, Agent, Workflow)
 */
export interface Executable<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly type: "node" | "agent" | "workflow";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly execute: (ctx: WorkflowContext, inputs: TInput) => Promise<TOutput>;
}

/**
 * Context passed to workflow/node run functions
 */
export interface WorkflowContext {
  /** Run any executable (node, agent, workflow) as a durable step */
  run: <TInput, TOutput>(
    executable: Executable<TInput, TOutput>,
    inputs: TInput
  ) => Promise<TOutput>;

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
  /** Registered workflows */
  workflows?: Record<string, AnyExecutable>;
  /** Registered agents */
  agents?: Record<string, AnyExecutable>;
  /** Registered function nodes */
  nodes?: Record<string, AnyExecutable>;
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
}
