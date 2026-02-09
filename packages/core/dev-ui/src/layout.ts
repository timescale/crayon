// Adapted from Pencil's layoutUtils.ts — zero dependencies
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 50;
const RANK_SEP = 80;
const NODE_SEP = 40;

export const GROUP_PADDING_X = 20;
export const GROUP_PADDING_Y = 16;
export const GROUP_LABEL_HEIGHT = 28;

export interface GroupLayout {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  /** Map of child node ID → position relative to the group's top-left */
  childPositions: Map<string, { x: number; y: number }>;
}

interface LayoutEdge {
  source: string;
  target: string;
}

/**
 * Compute a left-to-right hierarchical layout for a DAG.
 * Uses topological sorting via longest-path for rank assignment,
 * barycenter heuristic for within-rank ordering.
 */
export function computeLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
): Map<string, { x: number; y: number }> {
  if (nodeIds.length === 0) return new Map();

  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const nodeSet = new Set(nodeIds);

  for (const id of nodeIds) {
    children.set(id, []);
    parents.set(id, []);
  }

  for (const edge of edges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      children.get(edge.source)!.push(edge.target);
      parents.get(edge.target)!.push(edge.source);
    }
  }

  const ranks = assignRanks(nodeIds, children, parents);

  const rankGroups = new Map<number, string[]>();
  for (const [id, rank] of ranks) {
    if (!rankGroups.has(rank)) rankGroups.set(rank, []);
    rankGroups.get(rank)!.push(id);
  }

  orderWithinRanks(rankGroups, ranks, children);

  const maxRank = Math.max(...rankGroups.keys());
  const positions = new Map<string, { x: number; y: number }>();

  for (let rank = 0; rank <= maxRank; rank++) {
    const group = rankGroups.get(rank) || [];
    const totalHeight =
      group.length * NODE_HEIGHT + (group.length - 1) * NODE_SEP;
    const startY = -totalHeight / 2;

    for (let i = 0; i < group.length; i++) {
      positions.set(group[i], {
        x: Math.round(rank * (NODE_WIDTH + RANK_SEP)),
        y: Math.round(startY + i * (NODE_HEIGHT + NODE_SEP)),
      });
    }
  }

  return positions;
}

function assignRanks(
  nodeIds: string[],
  children: Map<string, string[]>,
  parents: Map<string, string[]>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const roots = nodeIds.filter((id) => parents.get(id)!.length === 0);
  const startNodes = roots.length > 0 ? roots : [nodeIds[0]];

  const queue: string[] = [...startNodes];
  for (const root of startNodes) {
    ranks.set(root, 0);
  }

  for (const id of nodeIds) {
    if (!ranks.has(id)) {
      ranks.set(id, 0);
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentRank = ranks.get(current)!;

    for (const child of children.get(current) || []) {
      const existingRank = ranks.get(child);
      const newRank = currentRank + 1;

      if (existingRank === undefined || newRank > existingRank) {
        ranks.set(child, newRank);
        queue.push(child);
      }
    }
  }

  return ranks;
}

function orderWithinRanks(
  rankGroups: Map<number, string[]>,
  ranks: Map<string, number>,
  children: Map<string, string[]>,
): void {
  const maxRank = Math.max(...rankGroups.keys());

  const parentOf = new Map<string, string[]>();
  for (const [parent, kids] of children) {
    for (const child of kids) {
      if (!parentOf.has(child)) parentOf.set(child, []);
      parentOf.get(child)!.push(parent);
    }
  }

  for (let rank = 1; rank <= maxRank; rank++) {
    const group = rankGroups.get(rank);
    if (!group || group.length <= 1) continue;

    const prevGroup = rankGroups.get(rank - 1) || [];
    const prevIndex = new Map<string, number>();
    prevGroup.forEach((id, i) => prevIndex.set(id, i));

    group.sort((a, b) => {
      const aParents = (parentOf.get(a) || []).filter(
        (p) => ranks.get(p) === rank - 1,
      );
      const bParents = (parentOf.get(b) || []).filter(
        (p) => ranks.get(p) === rank - 1,
      );

      const aCenter =
        aParents.length > 0
          ? aParents.reduce((sum, p) => sum + (prevIndex.get(p) || 0), 0) /
            aParents.length
          : 0;
      const bCenter =
        bParents.length > 0
          ? bParents.reduce((sum, p) => sum + (prevIndex.get(p) || 0), 0) /
            bParents.length
          : 0;

      return aCenter - bCenter;
    });

    rankGroups.set(rank, group);
  }
}

/**
 * Given absolute node positions and loop groups, compute group container
 * positions/sizes and convert child positions to be relative to their group.
 */
export function computeGroupLayouts(
  positions: Map<string, { x: number; y: number }>,
  groups: Array<{ id: string; nodeIds: string[] }>,
): GroupLayout[] {
  const layouts: GroupLayout[] = [];

  for (const group of groups) {
    const childPositions = new Map<string, { x: number; y: number }>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const nodeId of group.nodeIds) {
      const pos = positions.get(nodeId);
      if (!pos) continue;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + NODE_WIDTH);
      maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
    }

    if (minX === Infinity) continue;

    const groupX = minX - GROUP_PADDING_X;
    const groupY = minY - GROUP_LABEL_HEIGHT - GROUP_PADDING_Y;
    const groupWidth = maxX - minX + 2 * GROUP_PADDING_X;
    const groupHeight = maxY - minY + GROUP_LABEL_HEIGHT + 2 * GROUP_PADDING_Y;

    for (const nodeId of group.nodeIds) {
      const pos = positions.get(nodeId);
      if (!pos) continue;
      childPositions.set(nodeId, {
        x: pos.x - groupX,
        y: pos.y - groupY,
      });
    }

    layouts.push({
      id: group.id,
      position: { x: groupX, y: groupY },
      width: groupWidth,
      height: groupHeight,
      childPositions,
    });
  }

  return layouts;
}
