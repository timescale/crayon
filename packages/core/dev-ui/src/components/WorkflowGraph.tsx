import { useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WorkflowNode } from "./WorkflowNode";
import { LoopGroupNode } from "./LoopGroupNode";
import type { WorkflowDAG } from "../types";
import { computeLayout, computeGroupLayouts, NODE_WIDTH, NODE_HEIGHT } from "../layout";

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
  loopGroup: LoopGroupNode,
};

interface WorkflowGraphProps {
  dag: WorkflowDAG;
}

export function WorkflowGraph({ dag }: WorkflowGraphProps) {
  const { fitView } = useReactFlow();

  const { flowNodes, flowEdges } = useMemo(() => {
    const positions = computeLayout(
      dag.nodes.map((n) => n.id),
      dag.edges.map((e) => ({ source: e.source, target: e.target })),
    );

    // Compute group layouts if there are loop groups
    const groups = dag.loopGroups ?? [];
    const groupLayouts = computeGroupLayouts(positions, groups);

    // Build a lookup: nodeId → group layout (for child nodes)
    const nodeToGroup = new Map<string, typeof groupLayouts[number]>();
    for (const gl of groupLayouts) {
      const group = groups.find((g) => g.id === gl.id);
      if (!group) continue;
      for (const nodeId of group.nodeIds) {
        nodeToGroup.set(nodeId, gl);
      }
    }

    const flowNodes: Node[] = [];

    // Add group container nodes first (must come before children)
    for (const gl of groupLayouts) {
      const group = groups.find((g) => g.id === gl.id);
      flowNodes.push({
        id: gl.id,
        type: "loopGroup",
        position: gl.position,
        data: { label: group?.label ?? "", width: gl.width, height: gl.height },
        draggable: false,
        style: { width: gl.width, height: gl.height },
      });
    }

    // Add regular nodes
    for (const node of dag.nodes) {
      const gl = nodeToGroup.get(node.id);
      if (gl) {
        // Child of a group — use relative position
        const relPos = gl.childPositions.get(node.id) ?? { x: 0, y: 0 };
        flowNodes.push({
          id: node.id,
          type: "workflowNode",
          position: relPos,
          parentId: gl.id,
          extent: "parent" as const,
          data: { ...node },
          draggable: false,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        });
      } else {
        const pos = positions.get(node.id) ?? { x: 0, y: 0 };
        flowNodes.push({
          id: node.id,
          type: "workflowNode",
          position: pos,
          data: { ...node },
          draggable: false,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        });
      }
    }

    const flowEdges: Edge[] = dag.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: "smoothstep",
      animated: false,
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fill: "#64748b" },
    }));

    return { flowNodes, flowEdges };
  }, [dag]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync React Flow state when the DAG updates (e.g. file change via WebSocket)
  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [flowNodes, flowEdges, setNodes, setEdges, fitView]);

  const onInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 50);
  }, [fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onInit={onInit}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e2e8f0" gap={16} />
      <Controls showInteractive={false} />
      <MiniMap
        nodeStrokeWidth={3}
        pannable
        zoomable
        style={{ width: 120, height: 80 }}
      />
    </ReactFlow>
  );
}
