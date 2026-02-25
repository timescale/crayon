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
  input: "#e8e4df",
  output: "#e8e4df",
  condition: "#fef3c7",
};

export const TYPE_ICON_BG: Record<NodeType, string> = {
  node: "#ecfdf5",
  agent: "#f5f3ff",
  workflow: "#ecfdf5",
  input: "#f0ece7",
  output: "#f0ece7",
  condition: "#fffbeb",
};

export const TYPE_ICON_COLOR: Record<NodeType, string> = {
  node: "#10b981",
  agent: "#8b5cf6",
  workflow: "#10b981",
  input: "#a8a099",
  output: "#a8a099",
  condition: "#f59e0b",
};

export const TYPE_LABEL_COLOR: Record<NodeType, string> = {
  node: "#10b981",
  agent: "#8b5cf6",
  workflow: "#10b981",
  input: "#a8a099",
  output: "#a8a099",
  condition: "#f59e0b",
};
