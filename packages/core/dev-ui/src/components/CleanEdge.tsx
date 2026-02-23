import { getBezierPath, type EdgeProps } from "@xyflow/react";

export function CleanEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
    label,
    style,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <g>
      {/* Invisible fat path for interaction */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
      {/* Clean edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={style?.stroke ?? "#d1d5db"}
        strokeWidth={style?.strokeWidth ?? 1.5}
        markerEnd={markerEnd}
      />
      {/* Edge label */}
      {label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="central"
          className="react-flow__edge-text"
        >
          {label}
        </text>
      )}
    </g>
  );
}
