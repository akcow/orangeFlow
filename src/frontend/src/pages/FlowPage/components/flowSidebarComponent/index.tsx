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
import { nodeColors } from "@/utils/styleUtils";
import { removeCountFromString } from "@/utils/utils";
import useFlowStore from "../../../../stores/flowStore";
import { useTypesStore } from "../../../../stores/typesStore";
import type { APIClassType } from "../../../../types/api";
import SidebarDraggableComponent from "./components/sidebarDraggableComponent";
import GenerationHistoryPanel from "./components/generationHistoryPanel";
import WorkflowsPanel from "./components/workflowsPanel";
import AssetsPanel from "./components/AssetsPanel";
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
  const [pendingCreateGroupId, setPendingCreateGroupId] = useState<string | null>(null);

  // Allow other parts of the app (e.g. selection menu) to open workflows panel.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail ?? {};
      if (detail?.groupId) setPendingCreateGroupId(String(detail.groupId));
      setWorkflowsOpen(true);
      setComponentsOpen(false);
      setHistoryOpen(false);
      setAssetsOpen(false);
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
    };
    window.addEventListener("lf:open-assets-panel", handler as any);
    return () => window.removeEventListener("lf:open-assets-panel", handler as any);
  }, []);

  const handleAddNote = useCallback(() => {
    window.dispatchEvent(new Event("lf:start-add-note"));
  }, []);

  return (
    <div className="noflow select-none pointer-events-none">
      <div className="fixed left-4 top-1/2 z-50 -translate-y-1/2 pointer-events-auto">
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-background/80 p-2 shadow-lg backdrop-blur">
          <Popover
            open={componentsOpen}
            onOpenChange={(open) => {
              setComponentsOpen(open);
              if (open) {
                setHistoryOpen(false);
                setAssetsOpen(false);
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
                  <ForwardedIconComponent name="component" className="h-4 w-4" />
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
