import type { XYPosition } from "@xyflow/react";
import type { AllNodeType, GroupContainerNodeType } from "@/types/flow";

export const GROUP_PADDING = 16;
export const GROUP_HEADER_HEIGHT = 32;

export function isGroupContainerNode(
  node: AllNodeType,
): node is GroupContainerNodeType {
  return node.type === "groupNode";
}

export function getNodeDimensions(
  node: AllNodeType,
): { width: number; height: number } {
  const width = (node.measured?.width ?? (node as any).width ?? 300) as number;
  const height = (node.measured?.height ?? (node as any).height ?? 180) as number;
  return { width, height };
}

export function getAbsolutePosition(
  node: AllNodeType,
  nodeById: Map<string, AllNodeType>,
): XYPosition {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodeById.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function getNextGroupName(nodes: AllNodeType[]): string {
  const prefix = "新建组";
  let max = 0;
  for (const n of nodes) {
    if (!isGroupContainerNode(n)) continue;
    const m = /^新建组(\d+)$/.exec((n.data as any)?.label ?? "");
    if (!m) continue;
    const num = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(num)) max = Math.max(max, num);
  }
  return `${prefix}${max + 1}`;
}

export function fitGroupToChildren(
  groupId: string,
  nodes: AllNodeType[],
): AllNodeType[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const group = nodeById.get(groupId);
  if (!group || !isGroupContainerNode(group)) return nodes;

  const children = nodes.filter((n) => n.parentId === groupId);
  if (children.length === 0) return nodes;

  const padding = (group.data as any)?.padding ?? GROUP_PADDING;
  const contentTop = GROUP_HEADER_HEIGHT + padding;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const { width, height } = getNodeDimensions(child);
    minX = Math.min(minX, child.position.x);
    minY = Math.min(minY, child.position.y);
    maxX = Math.max(maxX, child.position.x + width);
    maxY = Math.max(maxY, child.position.y + height);
  }

  // Shift group/children so the content starts at padding / contentTop.
  // This keeps child absolute positions stable while maintaining a snug wrapper.
  const shiftX = minX - padding;
  const shiftY = minY - contentTop;

  const groupAbs = getAbsolutePosition(group, nodeById);
  const parent =
    group.parentId && nodeById.get(group.parentId)
      ? nodeById.get(group.parentId)!
      : null;
  const parentAbs = parent ? getAbsolutePosition(parent, nodeById) : { x: 0, y: 0 };
  const nextGroupAbs = { x: groupAbs.x + shiftX, y: groupAbs.y + shiftY };
  const nextGroupPos = { x: nextGroupAbs.x - parentAbs.x, y: nextGroupAbs.y - parentAbs.y };

  const nextWidth = Math.max(240, maxX - minX + padding * 2);
  const nextHeight = Math.max(120, maxY - minY + contentTop + padding);

  return nodes.map((n) => {
    if (n.id === groupId) {
      return {
        ...n,
        position: nextGroupPos,
        width: nextWidth,
        height: nextHeight,
      };
    }
    if (n.parentId === groupId) {
      return {
        ...n,
        position: { x: n.position.x - shiftX, y: n.position.y - shiftY },
      };
    }
    return n;
  });
}

export function dissolveSmallGroups(nodes: AllNodeType[]): AllNodeType[] {
  // Repeat until stable because dissolving can cause parent groups to become small too.
  let next = nodes;
  for (let i = 0; i < 50; i++) {
    const nodeById = new Map(next.map((n) => [n.id, n]));
    let changed = false;

    for (const n of next) {
      if (!isGroupContainerNode(n)) continue;
      const children = next.filter((c) => c.parentId === n.id);
      // Requirement: auto-dissolve only when the group is empty.
      if (children.length > 0) continue;

      // Remove the group node.
      next = next.filter((x) => x.id !== n.id);
      changed = true;

      // Also: if the group was a child of another group, make sure the parent can shrink later.
      // We keep `fitGroupToChildren` as an explicit action from the page events.
      break;
    }

    if (!changed) break;
  }
  return next;
}

export function sortNodesByParentDepth(nodes: AllNodeType[]): AllNodeType[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (visiting.has(id)) return 0; // break cycles defensively
    visiting.add(id);
    const n = byId.get(id);
    const d = n?.parentId ? 1 + depthOf(n.parentId) : 0;
    visiting.delete(id);
    depthMemo.set(id, d);
    return d;
  };

  const indexed = nodes.map((n, idx) => ({ n, idx, d: depthOf(n.id) }));
  indexed.sort((a, b) => a.d - b.d || a.idx - b.idx);
  return indexed.map((x) => x.n);
}
