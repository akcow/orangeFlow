import { cloneDeep } from "lodash";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import SkeletonGroup from "@/components/ui/skeletonGroup";
import { t } from "@/i18n/t";
import useSaveFlow from "@/hooks/flows/use-save-flow";
import { nodeColors } from "@/utils/styleUtils";
import { removeCountFromString } from "@/utils/utils";
import { createFileUpload } from "@/helpers/create-file-upload";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import useAlertStore from "@/stores/alertStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { getNodeId } from "@/utils/reactflowUtils";
import { useAddComponent } from "@/hooks/use-add-component";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import useFlowStore from "../../../../stores/flowStore";
import { useTypesStore } from "../../../../stores/typesStore";
import type { APIClassType } from "../../../../types/api";
import SidebarDraggableComponent from "./components/sidebarDraggableComponent";
import GenerationHistoryPanel from "./components/generationHistoryPanel";
import WorkflowsPanel from "./components/workflowsPanel";
import AssetsPanel from "./components/AssetsPanel";
import PoseGeneratorModal from "./components/PoseGeneratorModal";
import { SidebarFilterComponent } from "./components/sidebarFilterComponent";
import { applyComponentFilter } from "./helpers/apply-component-filter";
import { applyEdgeFilter } from "./helpers/apply-edge-filter";
import sensitiveSort from "./helpers/sensitive-sort";

const CUSTOM_COMPONENT_KEYS = [
  "DoubaoImageCreator",
  "DoubaoVideoGenerator",
  "DoubaoTTS",
  "TextCreation",
];
const CUSTOM_CATEGORY_NAME = "custom_components";
const CUSTOM_CATEGORY_META = {
  display_name: "自定义组件",
  name: CUSTOM_CATEGORY_NAME,
  icon: "ToyBrick",
};
const customNodeColors = { ...nodeColors, [CUSTOM_CATEGORY_NAME]: "#2563eb" };

const COMPONENT_ICON_OVERRIDES: Record<string, string> = {
  TextCreation: "Type",
  DoubaoTTS: "Music",
  DoubaoVideoGenerator: "Video",
};

function extractCustomComponents(data: Record<string, any>) {
  const result: Record<string, Record<string, any>> = {
    [CUSTOM_CATEGORY_NAME]: {},
  };
  Object.values(data ?? {}).forEach((category: any) => {
    Object.entries(category ?? {}).forEach(([key, value]) => {
      const typeName = (value as any)?.type ?? key;
      if (CUSTOM_COMPONENT_KEYS.includes(typeName)) {
        result[CUSTOM_CATEGORY_NAME][key] = value;
      }
    });
  });
  return result;
}

interface FlowSidebarComponentProps {
  isLoading?: boolean;
  showLegacy?: boolean;
  setShowLegacy?: (value: boolean) => void;
}

export function FlowSidebarComponent({ isLoading }: FlowSidebarComponentProps) {
  const data = useTypesStore((state) => state.data);
  const templates = useTypesStore((state) => state.templates);
  const setTypes = useTypesStore((state) => state.setTypes);
  const addComponent = useAddComponent();

  const {
    getFilterEdge,
    setFilterEdge,
    filterType,
    getFilterComponent,
    setFilterComponent,
  } = useFlowStore(
    useShallow((state) => ({
      getFilterEdge: state.getFilterEdge,
      setFilterEdge: state.setFilterEdge,
      filterType: state.filterType,
      getFilterComponent: state.getFilterComponent,
      setFilterComponent: state.setFilterComponent,
    })),
  );

  // No beta/legacy toggles: always show all components.

  const baseData = useMemo(
    () => extractCustomComponents(data),
    [data],
  );

  const filteredData = useMemo(() => {
    let nextData = cloneDeep(baseData);

    if (getFilterEdge?.length > 0) {
      nextData = applyEdgeFilter(nextData, getFilterEdge);
    }

    if (getFilterComponent !== "") {
      nextData = applyComponentFilter(nextData, getFilterComponent);
    }

    return nextData;
  }, [
    baseData,
    getFilterEdge,
    getFilterComponent,
  ]);

  const customItems = filteredData[CUSTOM_CATEGORY_NAME] ?? {};

  const onDragStart = useCallback(
    (
      event: React.DragEvent<any>,
      data: { type: string; node?: APIClassType },
    ) => {
      var crt = event.currentTarget.cloneNode(true);
      crt.style.position = "absolute";
      crt.style.width = "215px";
      crt.style.top = "-500px";
      crt.style.right = "-500px";
      crt.classList.add("cursor-grabbing");
      document.body.appendChild(crt);
      event.dataTransfer.setDragImage(crt, 0, 0);
      event.dataTransfer.setData("genericNode", JSON.stringify(data));
    },
    [],
  );

  const [category, component] = getFilterComponent?.split(".") ?? ["", ""];

  const filterDescription =
    getFilterComponent !== ""
      ? (baseData[category][component]?.display_name ?? "")
      : (filterType?.type ?? "");

  const filterName =
    getFilterComponent !== ""
      ? "Component"
      : filterType
        ? filterType.source
          ? "Input"
          : "Output"
        : "";

  const resetFilters = useCallback(() => {
    setFilterEdge([]);
    setFilterComponent("");
  }, [setFilterEdge, setFilterComponent]);

  const [componentsOpen, setComponentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [advancedEditorOpen, setAdvancedEditorOpen] = useState(false);
  const [poseGeneratorOpen, setPoseGeneratorOpen] = useState(false);
  const [pendingCreateGroupId, setPendingCreateGroupId] = useState<string | null>(null);
  const nodes = useFlowStore((state) => state.nodes);
  const setNodes = useFlowStore((state) => state.setNodes);
  const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const saveFlow = useSaveFlow();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const { validateFileSize } = useFileSizeValidator();
  const { mutateAsync: uploadFile } = usePostUploadFile();

  const getNextUserUploadIndex = useCallback(() => {
    let max = 0;
    for (const node of nodes as any[]) {
      const type = (node as any)?.data?.type;
      if (
        type !== "UserUploadImage" &&
        type !== "UserUploadVideo" &&
        type !== "UserUploadAudio"
      ) {
        continue;
      }
      const name = String((node as any)?.data?.node?.display_name ?? "");
      const match = /^用户上传(\d+)$/.exec(name);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value)) max = Math.max(max, value);
    }
    return max + 1;
  }, [nodes]);

  const getViewportCenterPosition = useCallback(() => {
    const instance: any = reactFlowInstance as any;
    if (instance?.getViewport) {
      const view = instance.getViewport();
      const zoom = Number(view?.zoom ?? 1) || 1;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      // Convert viewport center to flow coords: (screen - viewport translate) / zoom.
      return {
        x: (cx - (Number(view?.x ?? 0) || 0)) / zoom,
        y: (cy - (Number(view?.y ?? 0) || 0)) / zoom,
      };
    }
    // Fallback: place near origin.
    return { x: 0, y: 0 };
  }, [reactFlowInstance]);

  const handleUploadResource = useCallback(async () => {
    try {
      // Ensure the flow exists in backend (and snapshots capture the node addition for undo).
      await saveFlow();

      const files = await createFileUpload({
        multiple: false,
        accept: "image/*,video/*,audio/*",
      });
      const file = files[0];
      if (!file) return;

      try {
        validateFileSize(file);
      } catch (e) {
        if (e instanceof Error) setErrorData({ title: e.message });
        return;
      }

      const mime = String(file.type || "").toLowerCase();
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const isImage =
        mime.startsWith("image/") ||
        ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"].includes(ext);
      const isVideo =
        mime.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext);
      const isAudio =
        mime.startsWith("audio/") ||
        ["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext);

      const nodeType = isImage
        ? "UserUploadImage"
        : isVideo
          ? "UserUploadVideo"
          : isAudio
            ? "UserUploadAudio"
            : null;

      if (!nodeType) {
        setErrorData({
          title: "文件类型不支持",
          list: ["请选择图片 / 视频 / 音频文件。"],
        });
        return;
      }

      const flowId = useFlowsManagerStore.getState().currentFlowId || currentFlowId;
      if (!flowId) {
        setErrorData({
          title: "无法上传资源",
          list: ["请先创建/保存流程后再上传。"],
        });
        return;
      }

      const resp = await uploadFile({ file, id: flowId });
      const serverPath = (resp as any)?.file_path;
      if (!serverPath) {
        throw new Error("缺少文件路径");
      }

      const template = templates?.[nodeType];
      if (!template) {
        setErrorData({
          title: "组件模板不存在",
          list: [`未找到 ${nodeType} 的模板，请刷新页面或检查后端组件索引。`],
        });
        return;
      }

      const nextIndex = getNextUserUploadIndex();
      const seeded = cloneDeep(template);
      seeded.display_name = `用户上传${nextIndex}`;
      if (seeded.template?.file) {
        seeded.template.file.value = file.name;
        seeded.template.file.file_path = serverPath;
      }

      const newNodeId = getNodeId(nodeType);
      const position = getViewportCenterPosition();

      const newNode: any = {
        id: newNodeId,
        type: "genericNode",
        position,
        data: {
          node: seeded,
          showNode: !seeded.minimized,
          type: nodeType,
          id: newNodeId,
        },
        selected: true,
      };

      takeSnapshot();
      setNodes((current) => [
        ...(current ?? []).map((n: any) => ({ ...n, selected: false })),
        newNode,
      ]);

      // Close popover so user can immediately see the new node.
      setComponentsOpen(false);
    } catch (e: any) {
      setErrorData({
        title: "上传失败",
        list: [e?.message ?? "网络异常，请稍后重试。"],
      });
    }
  }, [
    currentFlowId,
    getNextUserUploadIndex,
    getViewportCenterPosition,
    saveFlow,
    setComponentsOpen,
    setErrorData,
    setNodes,
    takeSnapshot,
    templates,
    uploadFile,
    validateFileSize,
  ]);

  // Allow other parts of the app (e.g. selection menu) to open workflows panel.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail ?? {};
      if (detail?.groupId) setPendingCreateGroupId(String(detail.groupId));
      setWorkflowsOpen(true);
      setComponentsOpen(false);
      setHistoryOpen(false);
      setAssetsOpen(false);
      setAdvancedEditorOpen(false);
    };
    window.addEventListener("lf:open-workflows-panel", handler as any);
    return () => window.removeEventListener("lf:open-workflows-panel", handler as any);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      setAssetsOpen(true);
      setWorkflowsOpen(false);
      setComponentsOpen(false);
      setHistoryOpen(false);
      setAdvancedEditorOpen(false);
    };
    window.addEventListener("lf:open-assets-panel", handler as any);
    return () => window.removeEventListener("lf:open-assets-panel", handler as any);
  }, []);

  const handleAddNote = useCallback(() => {
    window.dispatchEvent(new Event("lf:start-add-note"));
  }, []);

  const handleAddProCamera = useCallback(() => {
    const tryAdd = (t: any) => {
      const component = t?.ProCamera as APIClassType | undefined;
      if (!component) return false;
      addComponent(component, "ProCamera");
      setAdvancedEditorOpen(false);
      return true;
    };

    // Fast path: already in store.
    if (tryAdd(templates as any)) return;

    // Slow path: force-refresh types once, then retry.
    api
      .get(`${getURL("ALL")}?force_refresh=true`)
      .then((res) => {
        if (res?.data) setTypes(res.data);
        const refreshedTemplates = useTypesStore.getState().templates as any;
        if (tryAdd(refreshedTemplates)) return;
        setErrorData({
          title: "组件未加载",
          list: ["未找到「专业摄像机」组件模板，请重启服务并刷新页面后重试。"],
        });
      })
      .catch(() => {
        setErrorData({
          title: "组件未加载",
          list: ["拉取组件模板失败，请检查服务是否正常运行。"],
        });
      });
  }, [addComponent, setAdvancedEditorOpen, setErrorData, setTypes, templates]);

  const handleOpenPoseGenerator = useCallback(() => {
    setPoseGeneratorOpen(true);
    setAdvancedEditorOpen(false);
  }, []);

  const advancedEditorItems = useMemo(
    () => [
      {
        key: "pro-camera",
        label: "专业摄像机",
        icon: "Camera",
        onClick: handleAddProCamera,
      },
      {
        key: "pose-generator",
        label: "姿势生成器",
        icon: "PersonStanding",
        onClick: handleOpenPoseGenerator,
      },
    ],
    [handleAddProCamera, handleOpenPoseGenerator],
  );

  return (
    <div className="noflow select-none pointer-events-none">
      <PoseGeneratorModal
        open={poseGeneratorOpen}
        onOpenChange={setPoseGeneratorOpen}
      />
      <div className="fixed left-4 top-1/2 z-50 -translate-y-1/2 pointer-events-auto">
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-background/80 p-2 shadow-lg backdrop-blur">
          <Popover
            open={componentsOpen}
            onOpenChange={(open) => {
              setComponentsOpen(open);
              if (open) {
                setHistoryOpen(false);
                setAssetsOpen(false);
                setWorkflowsOpen(false);
                setAdvancedEditorOpen(false);
              }
            }}
          >
            <ShadTooltip content={t("Components")} side="right">
              <PopoverTrigger asChild>
                <Button
                  variant={componentsOpen ? "secondary" : "ghost"}
                  size="iconMd"
                  className="h-12 w-12 rounded-full p-0"
                  aria-label={t("Components")}
                  data-testid="flow-toolbar-components"
                >
                  <ForwardedIconComponent
                    name="component"
                    className="h-6 w-6"
                  />
                </Button>
              </PopoverTrigger>
            </ShadTooltip>
            <PopoverContent
              align="center"
              side="right"
              sideOffset={8}
              className="flex w-[500px] max-h-[50vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>添加节点</span>
                </div>
              </div>
              <Separator />

              <div className="flex-1 overflow-auto p-3 pr-2">
                {filterName !== "" && filterDescription !== "" && (
                  <div className="mb-2">
                    <SidebarFilterComponent
                      name={filterName}
                      description={filterDescription}
                      resetFilters={resetFilters}
                    />
                  </div>
                )}

                {isLoading ? (
                  <div className="flex flex-col gap-1">
                    <SkeletonGroup count={10} className="my-0.5 h-7" />
                  </div>
                ) : Object.keys(customItems).length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
                    <div>{t("No components found.")}</div>
                    {(getFilterEdge?.length ?? 0) > 0 ||
                      getFilterComponent !== "" ? (
                      <Button variant="secondary" size="sm" onClick={resetFilters}>
                        {t("Remove filter")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 py-1">
                    {Object.keys(customItems)
                      .sort((a, b) =>
                        sensitiveSort(
                          customItems[a].display_name,
                          customItems[b].display_name,
                        ),
                      )
                      .map((itemName) => {
                        const currentItem = customItems[itemName];
                        const typeName =
                          (currentItem?.type as string | undefined) ??
                          removeCountFromString(itemName);
                        const iconName =
                          COMPONENT_ICON_OVERRIDES[typeName] ??
                          currentItem.icon ??
                          CUSTOM_CATEGORY_META.icon;
                        return (
                          <ShadTooltip
                            content={currentItem.display_name}
                            side="right"
                            key={itemName}
                          >
                            <SidebarDraggableComponent
                              sectionName={CUSTOM_CATEGORY_NAME}
                              apiClass={currentItem}
                              icon={iconName}
                              onDragStart={(event) =>
                                onDragStart(event, {
                                  type: removeCountFromString(itemName),
                                  node: currentItem,
                                })
                              }
                              color={customNodeColors[CUSTOM_CATEGORY_NAME]}
                              itemName={itemName}
                              error={!!currentItem.error}
                              display_name={currentItem.display_name}
                              official={currentItem.official !== false}
                              beta={currentItem.beta ?? false}
                              legacy={currentItem.legacy ?? false}
                              disabled={false}
                              disabledTooltip=""
                            />
                          </ShadTooltip>
                        );
                      })}
                  </div>
                )}

                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    添加资源
                  </div>
                  <div
                    tabIndex={0}
                    className="rounded-md outline-none ring-ring focus-visible:ring-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUploadResource();
                      }
                    }}
                  >
                    <div
                      className="group/draggable flex w-full cursor-pointer items-center gap-4 rounded-xl bg-muted px-4 py-2.5 text-foreground hover:bg-secondary-hover/75"
                      onClick={handleUploadResource}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/60 ring-1 ring-border/60">
                        <ForwardedIconComponent name="Upload" className="h-5 w-5" />
                      </div>
                      <div className="flex flex-1 items-center overflow-hidden">
                        <span className="truncate text-base font-normal">上传</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover
            open={historyOpen}
            onOpenChange={(open) => {
              setHistoryOpen(open);
              if (open) {
                setComponentsOpen(false);
                setAssetsOpen(false);
                setWorkflowsOpen(false);
                setAdvancedEditorOpen(false);
              }
            }}
          >
            <ShadTooltip content={t("生成历史")} side="right">
              <PopoverTrigger asChild>
                <Button
                  variant={historyOpen ? "secondary" : "ghost"}
                  size="iconMd"
                  className="h-12 w-12 rounded-full p-0"
                  aria-label={t("生成历史")}
                  data-testid="flow-toolbar-history"
                >
                  <ForwardedIconComponent name="History" className="h-6 w-6" />
                </Button>
              </PopoverTrigger>
            </ShadTooltip>
            <PopoverContent
              align="center"
              side="right"
              sideOffset={8}
              className="h-[75vh] w-[560px] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
            >
              <GenerationHistoryPanel />
            </PopoverContent>
          </Popover>

          <Popover
            open={assetsOpen}
            onOpenChange={(open) => {
              setAssetsOpen(open);
              if (open) {
                setComponentsOpen(false);
                setHistoryOpen(false);
                setWorkflowsOpen(false);
                setAdvancedEditorOpen(false);
              }
            }}
          >
            <ShadTooltip content={t("我的资产")} side="right">
              <PopoverTrigger asChild>
                <Button
                  variant={assetsOpen ? "secondary" : "ghost"}
                  size="iconMd"
                  className="h-12 w-12 rounded-full p-0"
                  aria-label={t("我的资产")}
                  data-testid="flow-toolbar-assets"
                >
                  <ForwardedIconComponent name="Package" className="h-6 w-6" />
                </Button>
              </PopoverTrigger>
            </ShadTooltip>
              <PopoverContent
                align="center"
                side="right"
                sideOffset={8}
                className="h-[75vh] w-[800px] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
              >
                <AssetsPanel onRequestClose={() => setAssetsOpen(false)} />
              </PopoverContent>
          </Popover>

          <Popover
            open={workflowsOpen}
            onOpenChange={(open) => {
              setWorkflowsOpen(open);
              if (open) {
                setComponentsOpen(false);
                setHistoryOpen(false);
                setAssetsOpen(false);
                setAdvancedEditorOpen(false);
              }
            }}
          >
            <ShadTooltip content={t("我的工作流")} side="right">
              <PopoverTrigger asChild>
                <Button
                  variant={workflowsOpen ? "secondary" : "ghost"}
                  size="iconMd"
                  className="h-12 w-12 rounded-full p-0"
                  aria-label={t("我的工作流")}
                  data-testid="flow-toolbar-workflows"
                >
                  <ForwardedIconComponent name="Workflow" className="h-6 w-6" />
                </Button>
              </PopoverTrigger>
            </ShadTooltip>
            <PopoverContent
              align="center"
              side="right"
              sideOffset={8}
              className="h-[75vh] w-[980px] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
            >
              <WorkflowsPanel
                pendingCreateGroupId={pendingCreateGroupId}
                onConsumePendingCreate={() => setPendingCreateGroupId(null)}
                onRequestClose={() => setWorkflowsOpen(false)}
              />
            </PopoverContent>
          </Popover>

          <ShadTooltip content={t("Add Sticky Notes")} side="right">
            <Button
              variant="ghost"
              size="iconMd"
              className="h-12 w-12 rounded-full p-0"
              onClick={handleAddNote}
              aria-label={t("Add Sticky Notes")}
              data-testid="flow-toolbar-add-note"
            >
              <ForwardedIconComponent name="sticky-note" className="h-6 w-6" />
            </Button>
          </ShadTooltip>

          <Popover
            open={advancedEditorOpen}
            onOpenChange={(open) => {
              setAdvancedEditorOpen(open);
              if (open) {
                setComponentsOpen(false);
                setHistoryOpen(false);
                setAssetsOpen(false);
                setWorkflowsOpen(false);
              }
            }}
          >
            <ShadTooltip content={t("Advanced Editor")} side="right">
              <PopoverTrigger asChild>
                <Button
                  variant={advancedEditorOpen ? "secondary" : "ghost"}
                  size="iconMd"
                  className="h-12 w-12 rounded-full p-0"
                  aria-label={t("Advanced Editor")}
                  data-testid="flow-toolbar-advanced-editor"
                >
                  <ForwardedIconComponent name="FileSliders" className="h-6 w-6" />
                </Button>
              </PopoverTrigger>
            </ShadTooltip>
            <PopoverContent
              align="center"
              side="right"
              sideOffset={8}
              className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{t("Advanced Editor")}</span>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-2 p-3">
                {advancedEditorItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="group flex w-full items-center gap-4 rounded-xl bg-muted px-4 py-2.5 text-foreground hover:bg-secondary-hover/75"
                    onClick={item.onClick}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/60 ring-1 ring-border/60">
                      <ForwardedIconComponent name={item.icon} className="h-5 w-5" />
                    </div>
                    <div className="flex flex-1 items-center overflow-hidden">
                      <span className="truncate text-base font-normal">
                        {item.label}
                      </span>
                    </div>
                    <ForwardedIconComponent
                      name="ChevronRight"
                      className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5"
                    />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

FlowSidebarComponent.displayName = "FlowSidebarComponent";

export default memo(
  FlowSidebarComponent,
  (
    prevProps: FlowSidebarComponentProps,
    nextProps: FlowSidebarComponentProps,
  ) => {
    return (
      prevProps.showLegacy === nextProps.showLegacy &&
      prevProps.setShowLegacy === nextProps.setShowLegacy
    );
  },
);
