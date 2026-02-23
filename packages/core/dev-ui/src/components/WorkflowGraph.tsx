import { useMemo, useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WorkflowNode } from "./WorkflowNode";
import { LoopGroupNode } from "./LoopGroupNode";
import { CleanEdge } from "./CleanEdge";
import { NodeDetailPopover } from "./NodeDetailPopover";
import type { WorkflowDAG, DAGNode } from "../types";
import { computeLayout, computeGroupLayouts, NODE_WIDTH, NODE_HEIGHT } from "../layout";

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
  loopGroup: LoopGroupNode,
};

const edgeTypes: EdgeTypes = {
  clean: CleanEdge,
};

interface WorkflowGraphProps {
  dag: WorkflowDAG;
  connectionsApi?: ReturnType<typeof import("../hooks/useConnections").useConnections>;
}

export function WorkflowGraph({ dag, connectionsApi }: WorkflowGraphProps) {
  const { fitView } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<DAGNode | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);

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
        draggable: true,
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
          draggable: true,
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
          draggable: true,
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
      type: "clean",
      animated: false,
      style: { stroke: "#c4b5a0", strokeWidth: 1.5 },
      labelStyle: { fontSize: 12, fill: "#6b7280" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: "#c4b5a0",
      },
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

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    const nodeData = node.data as DAGNode;
    // Skip input/output/condition nodes — they have no descriptions
    if (nodeData.type === "input" || nodeData.type === "output" || nodeData.type === "condition") return;

    // Use the click position relative to the graph container
    const target = event.currentTarget as HTMLElement;
    const container = target.closest(".react-flow") as HTMLElement | null;
    const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };
    setSelectedNode(nodeData);
    setPopoverPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, []);

  const closePopover = useCallback(() => {
    setSelectedNode(null);
    setPopoverPosition(null);
  }, []);

  const onInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 50);
  }, [fitView]);

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Cross} color="#d5cdc0" gap={24} size={1.5} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{ width: 120, height: 80 }}
          maskColor="rgba(240, 235, 227, 0.7)"
        />
      </ReactFlow>
      {selectedNode && popoverPosition && (
        <NodeDetailPopover
          node={selectedNode}
          position={popoverPosition}
          onClose={closePopover}
          workflowName={dag.workflowName}
          connectionsApi={connectionsApi}
        />
      )}
    </div>
  );
}
