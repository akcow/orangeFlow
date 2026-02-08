import { cloneDeep } from "lodash";
import { getURL } from "@/controllers/API/helpers/constants";
import type { AllNodeType, EdgeType } from "@/types/flow";
import { getAbsolutePosition, isGroupContainerNode } from "@/utils/groupingUtils";

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

function findFirstImageLikeString(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Prefer data url or direct image url
    if (trimmed.toLowerCase().startsWith("data:image")) return trimmed;
    if (trimmed.includes("/files/download/") && looksLikeImageFile(trimmed.split("?")[0] ?? trimmed)) {
      return trimmed;
    }
    if ((/^https?:\/\//i.test(trimmed) || /^\/api\//i.test(trimmed)) && looksLikeImageFile(trimmed.split("?")[0] ?? trimmed)) {
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
    for (const key of preferredKeys) {
      if (key in value) {
        const hit = findFirstImageLikeString((value as any)[key]);
        if (hit) return hit;
      }
    }
    for (const v of Object.values(value)) {
      const hit = findFirstImageLikeString(v);
      if (hit) return hit;
    }
  }
  return null;
}

export function extractGroupSelectionForWorkflow(
  groupId: string,
  nodes: AllNodeType[],
  edges: EdgeType[],
): WorkflowSelection | null {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const root = nodeById.get(groupId);
  if (!root || !isGroupContainerNode(root)) return null;

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

export function guessWorkflowCoverFromSelection(nodes: AllNodeType[]): string | null {
  for (const node of nodes) {
    const template = (node as any)?.data?.node?.template;
    if (template && typeof template === "object") {
      for (const field of Object.values(template)) {
        if (!field || typeof field !== "object") continue;
        const filePaths = (field as any).file_path;
        const paths = (field as any).path;
        const check = (p: any) => {
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
        if ("value" in (field as any)) {
          const hit = findFirstImageLikeString((field as any).value);
          if (hit) return hit;
        }
      }
    }
  }
  return null;
}

export function getFilesDownloadUrl(filePath: string): string {
  const normalized = String(filePath || "").replace(/^\/+/, "");
  const encoded = normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${getURL("FILES_V2_DOWNLOAD_BY_PATH", {}, true)}/${encoded}`;
}
