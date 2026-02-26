export interface DAGNode {
  id: string;
  label: string;
  type: "node" | "agent" | "workflow" | "input" | "output" | "condition";
  executableName?: string;
  /** The name from .create() config (kebab-case), used for runtime resolution */
  nodeName?: string;
  importPath?: string;
  lineNumber?: number;
  /** Schema field names for input/output nodes */
  fields?: string[];
  description?: string;
  integrations?: string[];
  /** Set by WorkflowGraph when node integrations lack connection mappings */
  hasMissingConnections?: boolean;
}

export interface LoopGroup {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface DAGEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDAG {
  workflowName: string;
  version: number;
  filePath: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  loopGroups?: LoopGroup[];
}

export interface ProjectDAGs {
  workflows: WorkflowDAG[];
  parseErrors: Array<{ filePath: string; error: string }>;
}

export type WSMessage =
  | { type: "full-sync"; data: ProjectDAGs }
  | { type: "workflow-updated"; data: WorkflowDAG }
  | { type: "workflow-removed"; data: { filePath: string } }
  | { type: "parse-error"; data: { filePath: string; error: string } }
  // PTY messages (server → client)
  | { type: "pty-data"; data: string }
  | { type: "pty-exit"; data: { code: number } }
  | { type: "pty-spawned"; data: { pid: number } };

// ---- Run History types ----

export interface WorkflowRun {
  workflow_uuid: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  output: unknown;
  error: string | null;
}

export interface OperationTrace {
  workflow_uuid: string;
  depth: number;
  function_id: number;
  function_name: string;
  child_workflow_id: string | null;
  started_at_epoch_ms: number;
  completed_at_epoch_ms: number | null;
  duration_ms: number | null;
  output_preview: string | null;
  error: string | null;
}

export interface TraceResult {
  workflow: WorkflowRun & { duration_ms: number | null };
  operations: OperationTrace[];
}
