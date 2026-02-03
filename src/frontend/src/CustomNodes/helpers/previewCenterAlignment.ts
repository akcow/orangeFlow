import { getNodeDimensions } from "@/utils/groupingUtils";
import useFlowStore from "@/stores/flowStore";
import type { AllNodeType } from "@/types/flow";

type AlignOptions = {
  // Try not to overlap existing nodes; smaller step = tighter stacking.
  avoidOverlap?: boolean;
  stepY?: number;
  maxSteps?: number;
};

// Cache "preview center Y offset (flow space) from node.position.y" per component type.
// This avoids extra renders (add node -> mount -> measure -> adjust) on every creation.
const PREVIEW_CENTER_OFFSET_CACHE = new Map<string, number>();

function getReactFlowNodeElement(nodeId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const esc =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(nodeId)
      : nodeId.replace(/["\\\\]/g, "\\\\$&");
  // XYFlow typically renders nodes as `.react-flow__node[data-id="..."]`.
  const byDataId = document.querySelector(
    `.react-flow__node[data-id="${esc}"]`,
  ) as HTMLElement | null;
  if (byDataId) return byDataId;

  // Fallback: find our testid and walk up to the node container.
  const byTestId = document.querySelector(
    `[data-testid="${esc}-main-node"]`,
  ) as HTMLElement | null;
  return (byTestId?.closest(".react-flow__node") as HTMLElement | null) ?? null;
}

function getPreviewWrapElement(nodeId: string): HTMLElement | null {
  const nodeEl = getReactFlowNodeElement(nodeId);
  if (!nodeEl) return null;
  return nodeEl.querySelector(
    `[data-preview-wrap="doubao"]`,
  ) as HTMLElement | null;
}

function screenPointToFlowY(clientX: number, clientY: number): number | null {
  const instance = useFlowStore.getState().reactFlowInstance;
  if (!instance) return null;
  return instance.screenToFlowPosition({ x: clientX, y: clientY }).y;
}

export function getNodePreviewCenterFlowY(nodeId: string): number | null {
  const wrap = getPreviewWrapElement(nodeId);
  if (!wrap) return null;
  const rect = wrap.getBoundingClientRect();
  if (!rect) return null;
  return screenPointToFlowY(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function getNodeCenterFlowY(nodeId: string, nodes: AllNodeType[]): number | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const { height } = getNodeDimensions(node);
  return node.position.y + height / 2;
}

function getApproxNodeDimensions(node: AllNodeType): { width: number; height: number } {
  const base = getNodeDimensions(node);
  const hasMeasuredWidth = typeof node.measured?.width === "number";
  const hasMeasuredHeight = typeof node.measured?.height === "number";
  const hasLegacyWidth = typeof (node as any).width === "number";
  const hasLegacyHeight = typeof (node as any).height === "number";

  return {
    // When we don't have measured sizes yet, use conservative defaults so we don't stack nodes on top of each other.
    width: hasMeasuredWidth || hasLegacyWidth ? base.width : Math.max(base.width, 360),
    height: hasMeasuredHeight || hasLegacyHeight ? base.height : Math.max(base.height, 320),
  };
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

function pickNonOverlappingYForProposedRect(
  proposed: { x: number; y: number; w: number; h: number },
  opts: Required<Pick<AlignOptions, "stepY" | "maxSteps">>,
): number {
  const nodes = (useFlowStore.getState().nodes as AllNodeType[]) ?? [];
  const otherRects = nodes.map((n) => {
    const dim = getApproxNodeDimensions(n);
    return { x: n.position.x, y: n.position.y, w: dim.width, h: dim.height };
  });

  const candidates: number[] = [];
  for (let k = 0; k <= opts.maxSteps; k += 1) {
    if (k === 0) candidates.push(0);
    else {
      candidates.push(k);
      candidates.push(-k);
    }
  }

  for (const k of candidates) {
    const y = proposed.y + k * opts.stepY;
    const candidateRect = { ...proposed, y };
    const overlaps = otherRects.some((r) => rectsOverlap(candidateRect, r));
    if (!overlaps) return y;
  }

  return proposed.y;
}

function measurePreviewCenterOffsetFlowY(nodeId: string): number | null {
  const nodes = (useFlowStore.getState().nodes as AllNodeType[]) ?? [];
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const center = getNodePreviewCenterFlowY(nodeId);
  if (center == null) return null;
  return center - node.position.y;
}

function getOrMeasurePreviewCenterOffsetForType(nodeType: string): number | null {
  const cached = PREVIEW_CENTER_OFFSET_CACHE.get(nodeType);
  if (typeof cached === "number") return cached;

  const nodes = (useFlowStore.getState().nodes as AllNodeType[]) ?? [];
  const candidate = nodes.find((n) => (n.data as any)?.type === nodeType);
  if (!candidate) return null;
  const measured = measurePreviewCenterOffsetFlowY(candidate.id);
  if (typeof measured === "number" && Number.isFinite(measured)) {
    PREVIEW_CENTER_OFFSET_CACHE.set(nodeType, measured);
    return measured;
  }
  return null;
}

function getApproxDimensionsForType(nodeType: string): { width: number; height: number } {
  const nodes = (useFlowStore.getState().nodes as AllNodeType[]) ?? [];
  const candidate = nodes.find((n) => (n.data as any)?.type === nodeType);
  if (candidate) return getApproxNodeDimensions(candidate);
  return { width: 360, height: 320 };
}

export function computeAlignedNodeTopY(params: {
  anchorNodeId: string;
  anchorNodeType?: string;
  targetNodeType: string;
  targetX: number;
  fallbackTopY: number;
  avoidOverlap?: boolean;
  stepY?: number;
  maxSteps?: number;
}): number {
  const nodes = (useFlowStore.getState().nodes as AllNodeType[]) ?? [];
  const desiredCenter =
    getNodePreviewCenterFlowY(params.anchorNodeId) ?? getNodeCenterFlowY(params.anchorNodeId, nodes);
  if (desiredCenter == null) return params.fallbackTopY;

  const targetOffset =
    getOrMeasurePreviewCenterOffsetForType(params.targetNodeType) ??
    (params.anchorNodeType ? getOrMeasurePreviewCenterOffsetForType(params.anchorNodeType) : null) ??
    // Reasonable default for our wide preview layouts.
    240;

  const baseTopY = desiredCenter - targetOffset;

  const options: Required<AlignOptions> = {
    avoidOverlap: params.avoidOverlap ?? true,
    stepY: params.stepY ?? 160,
    maxSteps: params.maxSteps ?? 8,
  };
  if (!options.avoidOverlap) return baseTopY;

  const { width, height } = getApproxDimensionsForType(params.targetNodeType);
  return pickNonOverlappingYForProposedRect(
    { x: params.targetX, y: baseTopY, w: width, h: height },
    { stepY: options.stepY, maxSteps: options.maxSteps },
  );
}

export function alignNodePreviewCenterToFlowY(
  nodeId: string,
  desiredCenterFlowY: number,
  opts: AlignOptions = {},
): void {
  if (typeof window === "undefined") return;

  const options: Required<AlignOptions> = {
    avoidOverlap: opts.avoidOverlap ?? true,
    stepY: opts.stepY ?? 160,
    maxSteps: opts.maxSteps ?? 8,
  };

  let attemptsLeft = 12;

  const tryAlign = () => {
    attemptsLeft -= 1;
    const { nodes, setNodes } = useFlowStore.getState();
    const allNodes = nodes as AllNodeType[];

    const currentCenter =
      getNodePreviewCenterFlowY(nodeId) ?? getNodeCenterFlowY(nodeId, allNodes);

    if (currentCenter == null) {
      if (attemptsLeft > 0) window.requestAnimationFrame(tryAlign);
      return;
    }

    const delta = desiredCenterFlowY - currentCenter;

    // Update position using the latest store state to avoid stale closures.
    setNodes((currentNodes: AllNodeType[]) => {
      const next = currentNodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          position: { ...n.position, y: n.position.y + delta },
        };
      });
      return next;
    });

    if (!options.avoidOverlap) return;

    // After the first alignment, nudge slightly to avoid overlaps (new nodes can be stacked).
    window.requestAnimationFrame(() => {
      const latestNodes = (useFlowStore.getState().nodes as AllNodeType[]) ?? [];
      const self = latestNodes.find((n) => n.id === nodeId);
      if (!self) return;
      const dim = getApproxNodeDimensions(self);
      const targetY = pickNonOverlappingYForProposedRect(
        { x: self.position.x, y: self.position.y, w: dim.width, h: dim.height },
        { stepY: options.stepY, maxSteps: options.maxSteps },
      );
      if (Math.abs(targetY - self.position.y) < 0.5) return;
      useFlowStore.getState().setNodes((curr: AllNodeType[]) =>
        curr.map((n) =>
          n.id === nodeId ? { ...n, position: { ...n.position, y: targetY } } : n,
        ),
      );
    });
  };

  window.requestAnimationFrame(tryAlign);
}
