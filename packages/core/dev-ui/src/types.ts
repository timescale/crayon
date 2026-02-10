export interface DAGNode {
  id: string;
  label: string;
  type: "node" | "agent" | "workflow" | "input" | "output" | "condition";
  executableName?: string;
  importPath?: string;
  lineNumber?: number;
  /** Schema field names for input/output nodes */
  fields?: string[];
  description?: string;
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
  | { type: "parse-error"; data: { filePath: string; error: string } };
