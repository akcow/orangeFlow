import { cloneDeep } from "lodash";
import { parseDoubaoPreviewData } from "@/CustomNodes/hooks/use-doubao-preview";
import { sanitizePreviewDataUrl } from "@/CustomNodes/GenericNode/components/DoubaoPreviewPanel/helpers";
import type { OutputLogType, VertexBuildTypeAPI } from "@/types/api";
import type { AllNodeType } from "@/types/flow";
import type { FlowPoolType } from "@/types/zustand/flow";

export type GenerationHistoryItem = {
  id: string;
  kind: "image" | "video";
  generatedAt?: string;
  generatedDate?: string;
  sourceNodeName?: string;
  sourceNodeId: string;
  sourceType: "build" | "draft";
  previewToken?: string;
  buildIndex?: number;
  outputKey?: string;
  logIndex?: number;
  payload: any;
  thumbnail?: string | null;
};

export const MAX_HISTORY_ITEMS = 50;
export const GENERATION_HISTORY_COMPONENTS = new Set(["DoubaoImageCreator", "DoubaoVideoGenerator"]);

function normalizePublicPreviewUrl(
  source: unknown,
  kind: "image" | "video" | "audio",
): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  if (/^(data:|blob:)/i.test(trimmed)) return trimmed;

  const markers = ["/api/v1/files/public-inline/", "/api/v1/files/public/"];
  const marker = markers.find((candidate) => trimmed.includes(candidate));
  if (!marker) return trimmed;

  const idx = trimmed.indexOf(marker);
  if (idx < 0) return trimmed;

  const rest = trimmed.slice(idx + marker.length).split("?", 1)[0];
  const replacement =
    kind === "image" ? "/api/v1/files/images/" : "/api/v1/files/media/";
  return `${trimmed.slice(0, idx)}${replacement}${rest}`;
}

export function normalizeOutputLogs(
  outputData: OutputLogType | OutputLogType[] | undefined,
) {
  if (!outputData) return [];
  return Array.isArray(outputData) ? outputData.filter(Boolean) : [outputData];
}

export function resolveImageThumbnail(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const images = Array.isArray(payload.images) ? payload.images : [];
  const firstImage = images[0] ?? null;
  const inlineSource =
    sanitizePreviewDataUrl(
      firstImage?.image_data_url ??
        firstImage?.preview_base64 ??
        firstImage?.preview_data_url ??
        firstImage?.data_url,
    ) ?? null;
  const remoteSource =
    normalizePublicPreviewUrl(firstImage?.image_url, "image") ??
    normalizePublicPreviewUrl(firstImage?.url, "image") ??
    normalizePublicPreviewUrl(firstImage?.edited_image_url, "image") ??
    normalizePublicPreviewUrl(firstImage?.original_image_url, "image") ??
    null;
  const fallbackInline =
    sanitizePreviewDataUrl(
      payload.image_data_url ?? payload.preview_base64 ?? payload.preview_data_url,
    ) ?? null;
  const fallbackRemote =
    normalizePublicPreviewUrl(payload.image_url, "image") ??
    normalizePublicPreviewUrl(payload.edited_image_url, "image") ??
    normalizePublicPreviewUrl(payload.original_image_url, "image") ??
    null;

  return remoteSource ?? inlineSource ?? fallbackRemote ?? fallbackInline ?? null;
}

export function resolveVideoThumbnail(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const inlineCover = sanitizePreviewDataUrl(
    payload.cover_preview_base64 ??
      payload?.doubao_preview?.payload?.cover_preview_base64,
  );
  const remoteCover =
    normalizePublicPreviewUrl(payload.cover_url, "image") ??
    normalizePublicPreviewUrl(payload.last_frame_url, "image") ??
    normalizePublicPreviewUrl(payload?.doubao_preview?.payload?.cover_url, "image") ??
    normalizePublicPreviewUrl(payload?.doubao_preview?.payload?.last_frame_url, "image") ??
    null;
  return inlineCover ?? remoteCover ?? null;
}

export function resolveVideoSource(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    normalizePublicPreviewUrl(payload.video_url, "video") ??
    payload.video_base64 ??
    payload?.video ??
    null;
  if (direct) return direct;
  const previewPayload = payload?.doubao_preview?.payload ?? {};
  return (
    normalizePublicPreviewUrl(previewPayload.video_url, "video") ??
    previewPayload.video_base64 ??
    (Array.isArray(previewPayload.videos)
      ? normalizePublicPreviewUrl(
          previewPayload.videos.find((video: any) => video?.video_url || video?.url)
            ?.video_url ??
            previewPayload.videos.find((video: any) => video?.video_url || video?.url)
              ?.url,
          "video",
        )
      : null) ??
    null
  );
}

export function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function formatDateLabel(value?: string): string {
  if (!value) return "";
  const [dateOnly] = value.split("T");
  if (dateOnly && dateOnly !== value) return dateOnly;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchesHistoryPreview(
  payload: unknown,
  item: Pick<GenerationHistoryItem, "kind" | "previewToken">,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const preview = parseDoubaoPreviewData(undefined, payload);
  if (!preview || !preview.available) return false;
  if (preview.kind !== item.kind) return false;
  if (!item.previewToken) return false;
  return preview.token === item.previewToken;
}

export function buildGenerationHistoryItems(
  flowPool: Record<string, VertexBuildTypeAPI[] | undefined>,
  nodes: AllNodeType[],
): GenerationHistoryItem[] {
  const nodeNameById = new Map<string, string>();
  const nodeTypeById = new Map<string, string>();
  nodes.forEach((node) => {
    nodeNameById.set(node.id, node.data?.node?.display_name ?? node.data?.type);
    nodeTypeById.set(node.id, node.data?.type);
  });

  const dedupe = new Set<string>();
  const historyItems: GenerationHistoryItem[] = [];

  Object.entries(flowPool).forEach(([nodeId, builds]) => {
    const componentName = nodeTypeById.get(nodeId);
    if (!componentName || !GENERATION_HISTORY_COMPONENTS.has(componentName)) return;
    const ordered = (builds as VertexBuildTypeAPI[] | undefined) ?? [];
    for (let buildIndex = ordered.length - 1; buildIndex >= 0; buildIndex -= 1) {
      const entry = ordered[buildIndex];
      const outputs = entry?.data?.outputs ?? {};

      for (const [outputKey, outputData] of Object.entries(outputs)) {
        const outputLogs = normalizeOutputLogs(outputData);
        for (let logIndex = 0; logIndex < outputLogs.length; logIndex += 1) {
          const log = outputLogs[logIndex];
          const payload = log?.message;
          if (!payload || typeof payload !== "object") continue;

          const preview = parseDoubaoPreviewData(componentName, payload);
          if (!preview || !preview.available) continue;
          if (preview.kind !== "image" && preview.kind !== "video") continue;

          const dedupeKey = preview.token ? `${preview.kind}-${preview.token}` : "";
          if (dedupeKey && dedupe.has(dedupeKey)) continue;
          if (dedupeKey) dedupe.add(dedupeKey);

          const thumbnail =
            preview.kind === "image"
              ? resolveImageThumbnail(preview.payload)
              : resolveVideoThumbnail(preview.payload);

          historyItems.push({
            id: dedupeKey || `${nodeId}-${buildIndex}-${outputKey}-${logIndex}-${preview.kind}`,
            kind: preview.kind,
            generatedAt: preview.generated_at ?? entry?.timestamp,
            generatedDate: formatDateLabel(preview.generated_at ?? entry?.timestamp),
            sourceNodeName: nodeNameById.get(nodeId) ?? componentName ?? nodeId,
            sourceNodeId: nodeId,
            sourceType: "build",
            previewToken: preview.token || undefined,
            buildIndex,
            outputKey,
            logIndex,
            payload,
            thumbnail,
          });
        }
      }
    }
  });

  nodes.forEach((node) => {
    const componentName = nodeTypeById.get(node.id);
    if (!componentName || !GENERATION_HISTORY_COMPONENTS.has(componentName)) return;
    const payload = (node.data as any)?.node?.template?.draft_output?.value;
    if (!payload || typeof payload !== "object") return;

    const preview = parseDoubaoPreviewData(componentName, payload);
    if (!preview || !preview.available) return;
    if (preview.kind !== "image" && preview.kind !== "video") return;

    const dedupeKey = preview.token ? `${preview.kind}-${preview.token}` : "";
    if (dedupeKey && dedupe.has(dedupeKey)) return;
    if (dedupeKey) dedupe.add(dedupeKey);

    const thumbnail =
      preview.kind === "image"
        ? resolveImageThumbnail(preview.payload)
        : resolveVideoThumbnail(preview.payload);

    historyItems.push({
      id: dedupeKey || `${node.id}-draft-${preview.kind}`,
      kind: preview.kind,
      generatedAt: preview.generated_at,
      generatedDate: formatDateLabel(preview.generated_at),
      sourceNodeName: nodeNameById.get(node.id) ?? componentName ?? node.id,
      sourceNodeId: node.id,
      sourceType: "draft",
      previewToken: preview.token || undefined,
      payload,
      thumbnail,
    });
  });

  return historyItems
    .sort((a, b) => parseTimestamp(b.generatedAt) - parseTimestamp(a.generatedAt))
    .slice(0, MAX_HISTORY_ITEMS);
}

export function removeGenerationHistoryItem(
  flowPool: FlowPoolType,
  nodes: AllNodeType[],
  item: GenerationHistoryItem,
): {
  flowPool: FlowPoolType;
  nodes: AllNodeType[];
  removed: boolean;
} {
  let removed = false;
  const nextFlowPool = { ...flowPool };
  const nextNodes = [...nodes];

  if (
    item.sourceType === "build" &&
    item.buildIndex !== undefined &&
    item.outputKey !== undefined
  ) {
    const builds = Array.isArray(flowPool[item.sourceNodeId])
      ? [...(flowPool[item.sourceNodeId] as VertexBuildTypeAPI[])]
      : [];
    const build = builds[item.buildIndex];
    const outputs = build?.data?.outputs;

    if (build && outputs && Object.hasOwn(outputs, item.outputKey)) {
      const nextBuild = cloneDeep(build);
      const nextOutputs = nextBuild?.data?.outputs ?? {};
      const outputData = nextOutputs[item.outputKey];

      if (Array.isArray(outputData)) {
        const filteredLogs = outputData.filter((log, index) => {
          if (item.logIndex === index) {
            removed = true;
            return false;
          }
          if (matchesHistoryPreview(log?.message, item)) {
            removed = true;
            return false;
          }
          return true;
        });
        if (filteredLogs.length === 0) {
          delete nextOutputs[item.outputKey];
        } else {
          (nextOutputs as Record<string, OutputLogType | OutputLogType[]>)[item.outputKey] =
            filteredLogs as OutputLogType[];
        }
      } else if (
        item.logIndex === undefined ||
        item.logIndex === 0 ||
        matchesHistoryPreview(outputData?.message, item)
      ) {
        delete nextOutputs[item.outputKey];
        removed = true;
      }

      nextBuild.data.outputs = nextOutputs;
      if (Object.keys(nextOutputs).length === 0) {
        builds.splice(item.buildIndex, 1);
      } else {
        builds[item.buildIndex] = nextBuild;
      }
      nextFlowPool[item.sourceNodeId] = builds;
    }
  }

  for (let index = 0; index < nextNodes.length; index += 1) {
    const node = nextNodes[index];
    const template = (node.data as any)?.node?.template;
    const draftValue = template?.draft_output?.value;
    if (!draftValue || typeof draftValue !== "object") continue;

    const sameNodeDraft = item.sourceType === "draft" && node.id === item.sourceNodeId;
    const samePreviewDraft = matchesHistoryPreview(draftValue, item);
    if (!sameNodeDraft && !samePreviewDraft) continue;

    const nextNode = cloneDeep(node);
    const nextTemplate = (nextNode.data as any)?.node?.template;
    if (nextTemplate?.draft_output) {
      delete nextTemplate.draft_output;
      nextNodes[index] = nextNode;
      removed = true;
    }
  }

  return {
    flowPool: nextFlowPool,
    nodes: nextNodes,
    removed,
  };
}
