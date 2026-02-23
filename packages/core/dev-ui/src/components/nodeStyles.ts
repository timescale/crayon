export type NodeType =
  | "node"
  | "agent"
  | "workflow"
  | "input"
  | "output"
  | "condition";

export const TYPE_ICONS: Record<NodeType, string> = {
  node: "<>",
  agent: "AI",
  workflow: "wf",
  input: "IN",
  output: "OUT",
  condition: "?",
};

export const TYPE_LABELS: Record<NodeType, string> = {
  node: "CUSTOM CODE",
  agent: "AI AGENT",
  workflow: "WORKFLOW",
  input: "INPUT",
  output: "OUTPUT",
  condition: "CONDITION",
};

export const TYPE_BORDER_COLORS: Record<NodeType, string> = {
  node: "#d1fae5",
  agent: "#ede9fe",
  workflow: "#d1fae5",
  input: "#e5e7eb",
  output: "#e5e7eb",
  condition: "#fef3c7",
};

export const TYPE_ICON_BG: Record<NodeType, string> = {
  node: "#ecfdf5",
  agent: "#f5f3ff",
  workflow: "#ecfdf5",
  input: "#f3f4f6",
  output: "#f3f4f6",
  condition: "#fffbeb",
};

export const TYPE_ICON_COLOR: Record<NodeType, string> = {
  node: "#10b981",
  agent: "#8b5cf6",
  workflow: "#10b981",
  input: "#9ca3af",
  output: "#9ca3af",
  condition: "#f59e0b",
};

export const TYPE_LABEL_COLOR: Record<NodeType, string> = {
  node: "#10b981",
  agent: "#8b5cf6",
  workflow: "#10b981",
  input: "#9ca3af",
  output: "#9ca3af",
  condition: "#f59e0b",
};
