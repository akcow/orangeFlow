import { useCallback, useMemo, useState } from "react";
import { useStoreApi } from "@xyflow/react";
import { cloneDeep } from "lodash";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { NODE_WIDTH } from "@/constants/constants";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import useFlowStore from "@/stores/flowStore";
import { useTypesStore } from "@/stores/typesStore";
import type { OutputLogType, VertexBuildTypeAPI } from "@/types/api";
import type { AllNodeType } from "@/types/flow";
import { getNodeId } from "@/utils/reactflowUtils";
import { cn } from "@/utils/utils";
import { parseDoubaoPreviewData } from "@/CustomNodes/hooks/use-doubao-preview";
import { sanitizePreviewDataUrl } from "@/CustomNodes/GenericNode/components/DoubaoPreviewPanel/helpers";

type GenerationHistoryItem = {
  id: string;
  kind: "image" | "video";
  generatedAt?: string;
  generatedDate?: string;
  sourceNodeName?: string;
  payload: any;
  thumbnail?: string | null;
};

const MAX_HISTORY_ITEMS = 50;

function normalizeOutputLogs(outputData: OutputLogType | OutputLogType[] | undefined) {
  if (!outputData) return [];
  return Array.isArray(outputData) ? outputData.filter(Boolean) : [outputData];
}

function resolveImageThumbnail(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const images = Array.isArray(payload.images) ? payload.images : [];
  const firstImage = images[0] ?? null;
  const inlineSource =
    sanitizePreviewDataUrl(
      firstImage?.image_data_url ??
        firstImage?.preview_base64 ??
        firstImage?.preview_data_url ??
        firstImage?.data_url,
    ) ??
    null;
  const remoteSource =
    firstImage?.image_url ??
    firstImage?.url ??
    firstImage?.edited_image_url ??
    firstImage?.original_image_url ??
    null;
  const fallbackInline =
    sanitizePreviewDataUrl(
      payload.image_data_url ?? payload.preview_base64 ?? payload.preview_data_url,
    ) ?? null;
  const fallbackRemote =
    payload.image_url ??
    payload.edited_image_url ??
    payload.original_image_url ??
    null;

  return (
    remoteSource ??
    inlineSource ??
    fallbackRemote ??
    fallbackInline ??
    null
  );
}

function resolveVideoThumbnail(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const inlineCover = sanitizePreviewDataUrl(
    payload.cover_preview_base64 ??
      payload?.doubao_preview?.payload?.cover_preview_base64,
  );
  const remoteCover =
    payload.cover_url ??
    payload.last_frame_url ??
    payload?.doubao_preview?.payload?.cover_url ??
    payload?.doubao_preview?.payload?.last_frame_url ??
    null;
  return inlineCover ?? remoteCover ?? null;
}

function resolveVideoSource(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    payload.video_url ?? payload.video_base64 ?? payload?.video ?? null;
  if (direct) return direct;
  const previewPayload = payload?.doubao_preview?.payload ?? {};
  return (
    previewPayload.video_url ??
    previewPayload.video_base64 ??
    (Array.isArray(previewPayload.videos)
      ? previewPayload.videos.find((video: any) => video?.video_url || video?.url)
          ?.video_url ??
        previewPayload.videos.find((video: any) => video?.video_url || video?.url)
          ?.url
      : null) ??
    null
  );
}

function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDateLabel(value?: string): string {
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

export default function GenerationHistoryPanel() {
  const [activeKind, setActiveKind] = useState<"image" | "video">("image");
  const flowPool = useFlowStore((state) => state.flowPool);
  const nodes = useFlowStore((state) => state.nodes);
  const paste = useFlowStore((state) => state.paste);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const store = useStoreApi();

  const items = useMemo(() => {
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
      const ordered = (builds as VertexBuildTypeAPI[] | undefined) ?? [];
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        const entry = ordered[i];
        const outputs = entry?.data?.outputs ?? {};
        const outputLogs = Object.values(outputs).flatMap(normalizeOutputLogs);
        for (const log of outputLogs) {
          const payload = log?.message;
          if (!payload || typeof payload !== "object") continue;
          const preview = parseDoubaoPreviewData(componentName, payload);
          if (!preview || !preview.available) continue;
          if (preview.kind !== "image" && preview.kind !== "video") continue;

          const dedupeKey = preview.token
            ? `${preview.kind}-${preview.token}`
            : "";
          if (dedupeKey && dedupe.has(dedupeKey)) continue;
          if (dedupeKey) {
            dedupe.add(dedupeKey);
          }

          const thumbnail =
            preview.kind === "image"
              ? resolveImageThumbnail(preview.payload)
              : resolveVideoThumbnail(preview.payload);

          historyItems.push({
            id: dedupeKey || `${nodeId}-${i}-${preview.kind}`,
            kind: preview.kind,
            generatedAt: preview.generated_at ?? entry?.timestamp,
            generatedDate: formatDateLabel(
              preview.generated_at ?? entry?.timestamp,
            ),
            sourceNodeName: nodeNameById.get(nodeId) ?? componentName ?? nodeId,
            payload,
            thumbnail,
          });
        }
      }
    });

    return historyItems
      .sort(
        (a, b) =>
          parseTimestamp(b.generatedAt) - parseTimestamp(a.generatedAt),
      )
      .slice(0, MAX_HISTORY_ITEMS);
  }, [flowPool, nodes]);

  const handleInsert = useCallback(
    (item: GenerationHistoryItem) => {
      const componentType =
        item.kind === "image" ? "DoubaoImageCreator" : "DoubaoVideoGenerator";
      const template = templates[componentType];
      if (!template) return;

      takeSnapshot();

      const newId = getNodeId(componentType);
      const clonedTemplate = cloneDeep(template);
      const draftField = {
        ...(clonedTemplate.template?.draft_output ?? {}),
        type: "Data",
        required: false,
        placeholder: "",
        list: false,
        show: false,
        readonly: false,
        value: item.payload,
        input_types: ["Data"],
        name: "draft_output",
        display_name: "预览缓存",
      };

      clonedTemplate.template = {
        ...(clonedTemplate.template ?? {}),
        draft_output: draftField,
      };
      if (clonedTemplate.template?.prompt) {
        clonedTemplate.template.prompt = {
          ...clonedTemplate.template.prompt,
          value: "",
        };
      }

      const newNode: AllNodeType = {
        id: newId,
        type: "genericNode",
        position: { x: 0, y: 0 },
        data: {
          node: clonedTemplate,
          showNode: !clonedTemplate.minimized,
          type: componentType,
          id: newId,
        },
      };

      const { height, width, transform } = store.getState();
      const zoomMultiplier = 1 / (transform?.[2] ?? 1);
      const centerX = -(transform?.[0] ?? 0) * zoomMultiplier +
        (width * zoomMultiplier) / 2;
      const centerY = -(transform?.[1] ?? 0) * zoomMultiplier +
        (height * zoomMultiplier) / 2;
      const nodeOffset = NODE_WIDTH / 2;

      paste(
        { nodes: [newNode], edges: [] },
        {
          x: -nodeOffset,
          y: -nodeOffset,
          paneX: centerX,
          paneY: centerY,
        },
      );
    },
    [paste, store, takeSnapshot, templates],
  );

  return (
    <div className="flex h-full flex-col px-3 pb-3 pt-2">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ForwardedIconComponent name="History" className="h-4 w-4" />
        <span>生成历史</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        仅显示当前 flow 本次会话的生成结果，点击可加入画布。
      </p>
      <div className="flex-1 overflow-auto pr-1">
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["image", "video"] as const).map((kind) => {
            const count = items.filter((item) => item.kind === kind).length;
            const isActive = activeKind === kind;
            const label = kind === "image" ? "图片历史" : "视频历史";
            return (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 justify-center rounded-full border text-sm font-medium",
                  isActive
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30 shadow-sm"
                    : "border-border/60 text-muted-foreground",
                )}
                onClick={() => setActiveKind(kind)}
              >
                <span>{label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {count}
                </span>
              </Button>
            );
          })}
        </div>
        {items.filter((item) => item.kind === activeKind).length === 0 ? (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
            暂无记录
          </div>
        ) : (
          <div className="space-y-2">
            {items
              .filter((item) => item.kind === activeKind)
              .map((item) => {
                const videoSource =
                  item.kind === "video"
                    ? resolveVideoSource(item.payload)
                    : null;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "flex h-auto w-full items-center gap-3 rounded-xl border border-border/70 px-3 py-2",
                      "justify-start text-left hover:bg-accent/40",
                    )}
                    onClick={() => handleInsert(item)}
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt="preview"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : item.kind === "video" && videoSource ? (
                        <video
                          src={videoSource}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <ForwardedIconComponent
                          name={item.kind === "image" ? "Image" : "Clapperboard"}
                          className="h-5 w-5 text-muted-foreground"
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="text-sm font-medium text-foreground">
                        {item.kind === "image" ? "图片生成" : "视频生成"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.sourceNodeName ?? "未知节点"}
                      </div>
                      {item.generatedDate && (
                        <div className="text-[11px] text-muted-foreground">
                          {item.generatedDate}
                        </div>
                      )}
                    </div>
                  </Button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
