import { useCallback, useMemo, useState } from "react";
import { useStoreApi } from "@xyflow/react";
import { cloneDeep } from "lodash";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { NODE_WIDTH } from "@/constants/constants";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import useFlowStore from "@/stores/flowStore";
import { useTypesStore } from "@/stores/typesStore";
import type { AllNodeType } from "@/types/flow";
import { getNodeId } from "@/utils/reactflowUtils";
import { cn } from "@/utils/utils";
import {
  buildGenerationHistoryItems,
  removeGenerationHistoryItem,
  resolveVideoSource,
  type GenerationHistoryItem,
} from "./generationHistoryUtils";

export default function GenerationHistoryPanel() {
  const [activeKind, setActiveKind] = useState<"image" | "video">("image");
  const flowPool = useFlowStore((state) => state.flowPool);
  const setFlowPool = useFlowStore((state) => state.setFlowPool);
  const nodes = useFlowStore((state) => state.nodes);
  const setNodes = useFlowStore((state) => state.setNodes);
  const paste = useFlowStore((state) => state.paste);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const store = useStoreApi();

  const items = useMemo<GenerationHistoryItem[]>(
    () => buildGenerationHistoryItems(flowPool, nodes),
    [flowPool, nodes],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => item.kind === activeKind),
    [activeKind, items],
  );

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
        display_name: "草稿输出",
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

  const handleDelete = useCallback(
    (item: GenerationHistoryItem) => {
      const next = removeGenerationHistoryItem(flowPool, nodes, item);
      if (!next.removed) return;
      takeSnapshot();
      setFlowPool(next.flowPool);
      setNodes(next.nodes);
    },
    [flowPool, nodes, setFlowPool, setNodes, takeSnapshot],
  );

  return (
    <div className="flex h-full flex-col px-3 pb-3 pt-2">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ForwardedIconComponent name="History" className="h-4 w-4" />
        <span>生成历史</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        这里只保留成功生成的图片和视频，便于再次插入节点或清理历史。
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
        {visibleItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
            暂无生成记录
          </div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((item) => {
              const videoSource =
                item.kind === "video"
                  ? resolveVideoSource(item.payload)
                  : null;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-border/70 px-2 py-2",
                    "bg-background/70",
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "flex h-auto min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-0",
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
                        {item.sourceNodeName ?? "未命名节点"}
                      </div>
                      {item.generatedDate && (
                        <div className="text-[11px] text-muted-foreground">
                          {item.generatedDate}
                        </div>
                      )}
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={() => handleDelete(item)}
                    title="删除记录"
                    aria-label="删除记录"
                  >
                    <ForwardedIconComponent name="Trash2" className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
