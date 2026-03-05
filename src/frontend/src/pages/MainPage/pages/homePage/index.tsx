import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import PaginatorComponent from "@/components/common/paginatorComponent";
import CardsWrapComponent from "@/components/core/cardsWrapComponent";
import { Card } from "@/components/ui/card";
import { IS_MAC } from "@/constants/constants";
import { useGetFolderQuery } from "@/controllers/API/queries/folders/use-get-folder";
import { CustomBanner } from "@/customization/components/custom-banner";
import {
  ENABLE_DATASTAX_LANGFLOW,
  ENABLE_MCP,
} from "@/customization/feature-flags";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useCreateBlankFlow from "@/hooks/flows/use-create-blank-flow";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useFolderStore } from "@/stores/foldersStore";
import HeaderComponent from "../../components/header";
import ListComponent from "../../components/list";
import ListSkeleton from "../../components/listSkeleton";
import useFileDrop from "../../hooks/use-on-file-drop";
import EmptyFolder from "../emptyFolder";

const HomePage = ({ type }: { type: "flows" | "components" }) => {
  const [view, setView] = useState<"grid" | "list">(() => {
    const savedView = localStorage.getItem("view");
    return savedView === "grid" || savedView === "list" ? savedView : "list";
  });
  const { folderId } = useParams();
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const saved = localStorage.getItem("flow_sort_order");
    return saved === "asc" ? "asc" : "desc";
  });
  const navigate = useCustomNavigate();
  const createBlankFlow = useCreateBlankFlow();
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);

  const [flowType, setFlowType] = useState<"flows" | "components">(type);
  const myCollectionId = useFolderStore((state) => state.myCollectionId);
  const folders = useFolderStore((state) => state.folders);
  const folderName =
    folders.find((folder) => folder.id === folderId)?.name ??
    folders[0]?.name ??
    "";
  const flows = useFlowsManagerStore((state) => state.flows);

  useEffect(() => {
    // Only check if we have a folderId and folders have loaded
    if (folderId && folders && folders.length > 0) {
      const folderExists = folders.find((folder) => folder.id === folderId);
      if (!folderExists) {
        // Folder doesn't exist for this user, redirect to /all
        console.error("无效的 folderId，正在重定向到 /all");
        navigate("/all");
      }
    }
  }, [folderId, folders, navigate]);

  const { data: folderData, isLoading } = useGetFolderQuery({
    id: folderId ?? myCollectionId!,
    page: pageIndex,
    size: pageSize,
    sort_order: sortOrder,
    is_component: flowType === "components",
    is_flow: flowType === "flows",
    search,
  });

  const data = {
    flows: folderData?.flows?.items ?? [],
    name: folderData?.folder?.name ?? "",
    description: folderData?.folder?.description ?? "",
    parent_id: folderData?.folder?.parent_id ?? "",
    components: folderData?.folder?.components ?? [],
    pagination: {
      page: folderData?.flows?.page ?? 1,
      size: folderData?.flows?.size ?? 12,
      total: folderData?.flows?.total ?? 0,
      pages: folderData?.flows?.pages ?? 0,
    },
  };

  useEffect(() => {
    localStorage.setItem("view", view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem("flow_sort_order", sortOrder);
  }, [sortOrder]);

  const handlePageChange = useCallback((newPageIndex, newPageSize) => {
    setPageIndex(newPageIndex);
    setPageSize(newPageSize);
  }, []);

  const handleToggleSortOrder = useCallback(() => {
    // Keep UX simple: toggles between newest-first and oldest-first, and resets pagination.
    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    setPageIndex(1);
  }, []);

  const onSearch = useCallback((newSearch) => {
    setSearch(newSearch);
    setPageIndex(1);
  }, []);

  const isEmptyFolder =
    flows?.find(
      (flow) =>
        flow.folder_id === (folderId ?? myCollectionId) &&
        (ENABLE_MCP ? flow.is_component === false : true),
    ) === undefined;

  const handleFileDrop = useFileDrop(isEmptyFolder ? undefined : flowType);

  const handleCreateNewFlow = async () => {
    if (isCreatingFlow) return;
    setIsCreatingFlow(true);
    try {
      await createBlankFlow();
    } catch {
    } finally {
      setIsCreatingFlow(false);
    }
  };

  useEffect(() => {
    if (
      !isEmptyFolder &&
      flows?.find(
        (flow) =>
          flow.folder_id === (folderId ?? myCollectionId) &&
          flow.is_component === (flowType === "components"),
      ) === undefined
    ) {
      const otherTabHasItems =
        flows?.find(
          (flow) =>
            flow.folder_id === (folderId ?? myCollectionId) &&
            flow.is_component === (flowType === "flows"),
        ) !== undefined;

      if (otherTabHasItems) {
        setFlowType(flowType === "flows" ? "components" : "flows");
      }
    }
  }, [isEmptyFolder]);

  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only track these keys when we're in list/selection mode and not when a modal is open
      // or when an input field is focused
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Shift") {
        setIsShiftPressed(true);
      } else if ((!IS_MAC && e.key === "Control") || e.key === "Meta") {
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Shift") {
        setIsShiftPressed(false);
      } else if ((!IS_MAC && e.key === "Control") || e.key === "Meta") {
        setIsCtrlPressed(false);
      }
    };

    // Reset key states when window loses focus
    const handleBlur = () => {
      setIsShiftPressed(false);
      setIsCtrlPressed(false);
    };

    // Only add listeners if we're in flows or components mode, not MCP mode
    if (flowType === "flows" || flowType === "components") {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
      window.addEventListener("blur", handleBlur);
    }

    // Clean up event listeners when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);

      // Reset key states on unmount
      setIsShiftPressed(false);
      setIsCtrlPressed(false);
    };
  }, [flowType]);

  const setSelectedFlow = useCallback(
    (selected: boolean, flowId: string, index: number) => {
      setLastSelectedIndex(index);
      if (isShiftPressed && lastSelectedIndex !== null) {
        // Find the indices of the last selected and current flow
        const flows = data.flows;

        // Determine the range to select
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        // Get all flow IDs in the range
        const flowsToSelect = flows
          .slice(start, end + 1)
          .map((flow) => flow.id);

        // Update selection
        if (selected) {
          setSelectedFlows((prev) =>
            Array.from(new Set([...prev, ...flowsToSelect])),
          );
        } else {
          setSelectedFlows((prev) =>
            prev.filter((id) => !flowsToSelect.includes(id)),
          );
        }
      } else {
        if (selected) {
          setSelectedFlows([...selectedFlows, flowId]);
        } else {
          setSelectedFlows(selectedFlows.filter((id) => id !== flowId));
        }
      }
    },
    [selectedFlows, lastSelectedIndex, data.flows, isShiftPressed],
  );

  useEffect(() => {
    setSelectedFlows((old) =>
      old.filter((id) => data.flows.some((flow) => flow.id === id)),
    );
  }, [folderData?.flows?.items]);

  // Reset key states when navigating away
  useEffect(() => {
    return () => {
      setIsShiftPressed(false);
      setIsCtrlPressed(false);
    };
  }, [folderId]);

  return (
    <CardsWrapComponent
      onFileDrop={handleFileDrop}
      dragMessage={
        isEmptyFolder
          ? "将流程或组件拖放到这里"
          : flowType === "flows"
            ? "将流程拖放到这里"
            : "将组件拖放到这里"
      }
    >
      <div
        className="flex h-full w-full flex-col overflow-y-auto"
        data-testid="cards-wrapper"
      >
        <div className="flex h-full w-full flex-col 3xl:container">
          {ENABLE_DATASTAX_LANGFLOW && <CustomBanner />}
          <div className="flex flex-1 flex-col justify-start p-4">
            <div className="flex h-full flex-col justify-start">
              <HeaderComponent
                folderName={folderName}
                flowType={flowType}
                setFlowType={setFlowType}
                view={view}
                setView={setView}
                setSearch={onSearch}
                isEmptyFolder={isEmptyFolder}
                selectedFlows={selectedFlows}
                sortOrder={sortOrder}
                onToggleSortOrder={handleToggleSortOrder}
              />
              {isEmptyFolder ? (
                <EmptyFolder onCreateFlow={handleCreateNewFlow} />
              ) : (
                <div className="flex h-full flex-col">
                  {isLoading ? (
                    view === "grid" ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                        <ListSkeleton />
                        <ListSkeleton />
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-col gap-2">
                        <ListSkeleton />
                        <ListSkeleton />
                      </div>
                    )
                  ) : (flowType === "flows" || flowType === "components") &&
                    data &&
                    data.pagination.total > 0 ? (
                    view === "grid" ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                        {flowType === "flows" && (
                          <Card
                            onClick={() => {
                              void handleCreateNewFlow();
                            }}
                            className="group/new flex min-h-[240px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/60 transition-all duration-300 hover:-translate-y-1 hover:border-border hover:bg-muted/30 hover:shadow-xl"
                          >
                            <div className="flex flex-col items-center gap-4">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-transform duration-300 group-hover/new:scale-105">
                                <ForwardedIconComponent
                                  name="Plus"
                                  aria-hidden="true"
                                  className="h-8 w-8"
                                />
                              </div>
                              <div className="text-base font-semibold text-foreground">
                                新建项目
                              </div>
                            </div>
                          </Card>
                        )}
                        {data.flows.map((flow, index) => (
                          <ListComponent
                            key={flow.id}
                            flowData={flow}
                            selected={selectedFlows.includes(flow.id)}
                            setSelected={(selected) =>
                              setSelectedFlow(selected, flow.id, index)
                            }
                            shiftPressed={isShiftPressed || isCtrlPressed}
                            view={view}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card/35">
                        <div className="overflow-x-auto">
                          <div className="min-w-[1060px]">
                            <div className="grid grid-cols-[72px,minmax(200px,2fr),120px,minmax(240px,2fr),180px,180px,56px] items-center gap-3 border-b border-border/60 bg-muted/25 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              <span>预览</span>
                              <span>名称</span>
                              <span>类型</span>
                              <span>内容</span>
                              <span>创建时间</span>
                              <span>最近更新</span>
                              <span />
                            </div>
                            <div className="flex flex-col gap-2 p-2">
                              {data.flows.map((flow, index) => (
                                <ListComponent
                                  key={flow.id}
                                  flowData={flow}
                                  selected={selectedFlows.includes(flow.id)}
                                  setSelected={(selected) =>
                                    setSelectedFlow(selected, flow.id, index)
                                  }
                                  shiftPressed={isShiftPressed || isCtrlPressed}
                                  view={view}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  ) : flowType === "flows" ? (
                    <div className="pt-24 text-center text-sm text-secondary-foreground">
                      当前项目暂无流程。{" "}
                      <button
                        type="button"
                        onClick={() => {
                          void handleCreateNewFlow();
                        }}
                        className="cursor-pointer underline"
                      >
                        创建新流程
                      </button>
                      ，或前往商店浏览。
                    </div>
                  ) : (
                    <div className="pt-24 text-center text-sm text-secondary-foreground">
                      暂无已保存或自定义组件。可了解{" "}
                      <a
                        href="https://docs.langflow.org/components-custom-components"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        如何创建自定义组件
                      </a>
                      ，或前往商店浏览。
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {(flowType === "flows" || flowType === "components") &&
            !isLoading &&
            !isEmptyFolder &&
            data.pagination.total >= 10 && (
              <div className="flex justify-end px-3 py-4">
                <PaginatorComponent
                  pageIndex={data.pagination.page}
                  pageSize={data.pagination.size}
                  rowsCount={[12, 24, 48, 96]}
                  totalRowsCount={data.pagination.total}
                  paginate={handlePageChange}
                  pages={data.pagination.pages}
                  isComponent={flowType === "components"}
                />
              </div>
            )}
        </div>
      </div>
    </CardsWrapComponent>
  );
};

export default HomePage;
