import { cloneDeep } from "lodash";
import { getURL } from "@/controllers/API/helpers/constants";
import type { AllNodeType, EdgeType } from "@/types/flow";
import {
  getAbsolutePosition,
  isGroupContainerNode,
} from "@/utils/groupingUtils";

export type WorkflowSelection = { nodes: AllNodeType[]; edges: EdgeType[] };

function looksLikeImageFile(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp")
  );
}

function findFirstImageLikeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Prefer data url or direct image url
    if (trimmed.toLowerCase().startsWith("data:image")) return trimmed;
    if (
      trimmed.includes("/files/download/") &&
      looksLikeImageFile(trimmed.split("?")[0] ?? trimmed)
    ) {
      return trimmed;
    }
    if (
      (/^https?:\/\//i.test(trimmed) || /^\/api\//i.test(trimmed)) &&
      looksLikeImageFile(trimmed.split("?")[0] ?? trimmed)
    ) {
      return trimmed;
    }
    // Some payloads store file name only; ignore.
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = findFirstImageLikeString(entry);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    // Heuristics: common keys that carry image data/urls.
    const preferredKeys = [
      "image_data_url",
      "preview_data_url",
      "preview_base64",
      "image_url",
      "url",
      "edited_image_url",
      "original_image_url",
      "cover_url",
      "last_frame_url",
      "cover_preview_base64",
    ];
    const record = value as Record<string, unknown>;
    for (const key of preferredKeys) {
      if (key in record) {
        const hit = findFirstImageLikeString(record[key]);
        if (hit) return hit;
      }
    }
    for (const v of Object.values(record)) {
      const hit = findFirstImageLikeString(v);
      if (hit) return hit;
    }
  }
  return null;
}

export function extractGroupSelectionForWorkflow(params: {
  groupId: string;
  nodes: AllNodeType[];
  edges: EdgeType[];
}): WorkflowSelection {
  const { groupId, nodes, edges } = params;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const root = nodeById.get(groupId);
  if (!root || !isGroupContainerNode(root)) {
    return { nodes: [], edges: [] };
  }

  const expandedIds = new Set<string>([groupId]);
  const queue = [groupId];
  while (queue.length) {
    const currentId = queue.pop()!;
    for (const child of nodes) {
      if (child.parentId !== currentId) continue;
      if (expandedIds.has(child.id)) continue;
      expandedIds.add(child.id);
      if (isGroupContainerNode(child)) queue.push(child.id);
    }
  }

  const absNodeById = new Map<string, { x: number; y: number }>();
  expandedIds.forEach((id) => {
    const n = nodeById.get(id);
    if (!n) return;
    absNodeById.set(id, getAbsolutePosition(n, nodeById));
  });

  const selectionNodes = Array.from(expandedIds)
    .map((id) => nodeById.get(id))
    .filter(Boolean)
    .map((n) => ({ ...cloneDeep(n!), position: absNodeById.get(n!.id)! }));

  const selectionEdges = edges
    .filter((e) => expandedIds.has(e.source) && expandedIds.has(e.target))
    .map((e) => ({ ...cloneDeep(e), selected: false }));

  return { nodes: selectionNodes, edges: selectionEdges };
}

export function guessWorkflowCoverFromSelection(
  nodes: AllNodeType[],
): string | null {
  for (const node of nodes) {
    if (!("node" in node.data)) continue;
    const template = node.data.node?.template;
    if (template && typeof template === "object") {
      for (const field of Object.values(template)) {
        if (!field || typeof field !== "object") continue;
        const fieldData = field as Record<string, unknown>;
        const filePaths = fieldData.file_path;
        const paths = fieldData.path;
        const check = (p: unknown) => {
          if (typeof p !== "string") return null;
          if (!looksLikeImageFile(p)) return null;
          return getFilesDownloadUrl(p);
        };
        if (Array.isArray(filePaths)) {
          for (const p of filePaths) {
            const hit = check(p);
            if (hit) return hit;
          }
        } else {
          const hit = check(filePaths);
          if (hit) return hit;
        }
        if (Array.isArray(paths)) {
          for (const p of paths) {
            const hit = check(p);
            if (hit) return hit;
          }
        } else {
          const hit = check(paths);
          if (hit) return hit;
        }
        // Fallback: search value payloads for any image-like string (draft_output etc).
        if ("value" in fieldData) {
          const hit = findFirstImageLikeString(fieldData.value);
          if (hit) return hit;
        }
      }
    }
  }
  return null;
}

function asImageCandidate(value: string): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("data:image")) return trimmed;
  if (
    trimmed.includes("/files/download/") ||
    trimmed.includes("/files/images/")
  )
    return trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^\/api\//i.test(trimmed)) {
    if (looksLikeImageFile(trimmed.split("?")[0] ?? trimmed)) return trimmed;
    if (trimmed.includes("/images/")) return trimmed;
    return null;
  }
  if (looksLikeImageFile(trimmed)) return getFilesDownloadUrl(trimmed);
  return null;
}

function collectImageCandidates(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const hit = asImageCandidate(value);
    if (hit) out.push(hit);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectImageCandidates(entry, out));
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "preview_data_url",
    "preview_base64",
    "image_data_url",
    "image_url",
    "edited_image_url",
    "original_image_url",
    "cover_preview_base64",
    "cover_url",
    "last_frame_url",
    "url",
    "file_path",
    "path",
  ];

  preferredKeys.forEach((key) => {
    if (key in record) {
      collectImageCandidates(record[key], out);
    }
  });

  Object.values(record).forEach((entry) => collectImageCandidates(entry, out));
}

function parseCandidateTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: treat seconds timestamps as unix seconds.
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value !== "string") return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

type ImageCandidateEntry = {
  url: string;
  timestamp: number | null;
  order: number;
};

function collectImageCandidatesWithMeta(
  value: unknown,
  out: ImageCandidateEntry[],
  orderRef: { value: number },
  inheritedTimestamp: number | null = null,
): void {
  if (value === null || value === undefined) return;

  if (typeof value === "string") {
    const hit = asImageCandidate(value);
    if (hit) {
      out.push({
        url: hit,
        timestamp: inheritedTimestamp,
        order: orderRef.value++,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) =>
      collectImageCandidatesWithMeta(entry, out, orderRef, inheritedTimestamp),
    );
    return;
  }

  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const timestamp =
    parseCandidateTimestamp(record.generated_at) ??
    parseCandidateTimestamp(record.generatedAt) ??
    parseCandidateTimestamp(record.timestamp) ??
    parseCandidateTimestamp(record.updated_at) ??
    parseCandidateTimestamp(record.created_at) ??
    parseCandidateTimestamp(record.date_created) ??
    inheritedTimestamp;

  const preferredKeys = [
    "preview_data_url",
    "preview_base64",
    "image_data_url",
    "image_url",
    "edited_image_url",
    "original_image_url",
    "cover_preview_base64",
    "cover_url",
    "last_frame_url",
    "url",
    "file_path",
    "path",
  ];

  preferredKeys.forEach((key) => {
    if (key in record) {
      collectImageCandidatesWithMeta(record[key], out, orderRef, timestamp);
    }
  });

  Object.values(record).forEach((entry) =>
    collectImageCandidatesWithMeta(entry, out, orderRef, timestamp),
  );
}

function collectFlowImageCandidatesFromFlow(flow: {
  data?: { nodes?: AllNodeType[] } | null;
}): string[] {
  const nodes = flow?.data?.nodes ?? [];
  const candidates: string[] = [];

  nodes.forEach((node) => {
    if (!("node" in node.data)) return;
    const template = node.data.node?.template;
    if (!template || typeof template !== "object") return;

    Object.values(template as Record<string, unknown>).forEach((field) => {
      if (!field || typeof field !== "object") return;
      const value = field as Record<string, unknown>;
      collectImageCandidates(value.value, candidates);
      collectImageCandidates(value.file_path, candidates);
      collectImageCandidates(value.path, candidates);
    });
  });

  return candidates;
}

function collectFlowImageCandidateEntriesFromFlow(flow: {
  data?: { nodes?: AllNodeType[] } | null;
}): ImageCandidateEntry[] {
  const nodes = flow?.data?.nodes ?? [];
  const candidates: ImageCandidateEntry[] = [];
  const orderRef = { value: 0 };

  nodes.forEach((node) => {
    if (!("node" in node.data)) return;
    const template = node.data.node?.template;
    if (!template || typeof template !== "object") return;

    Object.values(template as Record<string, unknown>).forEach((field) => {
      if (!field || typeof field !== "object") return;
      const value = field as Record<string, unknown>;
      collectImageCandidatesWithMeta(value.value, candidates, orderRef);
      collectImageCandidatesWithMeta(value.file_path, candidates, orderRef);
      collectImageCandidatesWithMeta(value.path, candidates, orderRef);
    });
  });

  return candidates;
}

export function extractFirstImageFromFlow(flow: {
  data?: { nodes?: AllNodeType[] } | null;
}): string | null {
  const candidates = collectFlowImageCandidatesFromFlow(flow);
  return candidates.length > 0 ? (candidates[0] ?? null) : null;
}

export function extractLatestImageFromFlow(flow: {
  data?: { nodes?: AllNodeType[] } | null;
}): string | null {
  const candidates = collectFlowImageCandidateEntriesFromFlow(flow);
  if (!candidates.length) return null;

  const best = candidates.reduce<ImageCandidateEntry | null>((currentBest, candidate) => {
    if (!currentBest) return candidate;

    const bestHasTs = currentBest.timestamp !== null;
    const candidateHasTs = candidate.timestamp !== null;

    if (candidateHasTs && !bestHasTs) return candidate;
    if (candidateHasTs && bestHasTs) {
      if ((candidate.timestamp as number) > (currentBest.timestamp as number)) return candidate;
      if (
        candidate.timestamp === currentBest.timestamp &&
        candidate.order > currentBest.order
      )
        return candidate;
      return currentBest;
    }

    return candidate.order > currentBest.order ? candidate : currentBest;
  }, null);

  return best?.url ?? null;
}

export function getFilesDownloadUrl(filePath: string): string {
  const normalized = String(filePath || "").replace(/^\/+/, "");
  const encoded = normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${getURL("FILES_V2_DOWNLOAD_BY_PATH", {}, true)}/${encoded}`;
}
