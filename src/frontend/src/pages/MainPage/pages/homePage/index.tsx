import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import PaginatorComponent from "@/components/common/paginatorComponent";
import CardsWrapComponent from "@/components/core/cardsWrapComponent";
import { IS_MAC } from "@/constants/constants";
import { useGetFolderQuery } from "@/controllers/API/queries/folders/use-get-folder";
import { usePostFolders } from "@/controllers/API/queries/folders/use-post-folders";
import { usePostAddFlow } from "@/controllers/API/queries/flows/use-post-add-flow";
import { CustomBanner } from "@/customization/components/custom-banner";
import { ENABLE_DATASTAX_LANGFLOW } from "@/customization/feature-flags";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useCreateBlankFlow from "@/hooks/flows/use-create-blank-flow";
import { t } from "@/i18n/t";
import { useFolderStore } from "@/stores/foldersStore";
import useAuthStore from "@/stores/authStore";
import useAlertStore from "@/stores/alertStore";
import ListComponent from "../../components/list";
import ListSkeleton from "../../components/listSkeleton";
import useFileDrop from "../../hooks/use-on-file-drop";
import EmptyFolder from "../emptyFolder";
import { cn } from "@/utils/utils";
import { TapNowWorkflowsHeader } from "./TapNowWorkflowsHeader";

const DEFAULT_VIEWPORT = { zoom: 1, x: 0, y: 0 };

const HomePage = ({ type: _type }: { type: "flows" | "components" }) => {
  const [view, setView] = useState<"grid" | "list">(() => {
    const savedView = localStorage.getItem("view");
    return savedView === "grid" || savedView === "list" ? savedView : "list";
  });
  const { folderId } = useParams();
  const queryClient = useQueryClient();
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const saved = localStorage.getItem("flow_sort_order");
    return saved === "asc" ? "asc" : "desc";
  });
  const [workspaceScope, setWorkspaceScope] = useState<"personal" | "team">(
    () => {
      const savedScope = localStorage.getItem("lf_workspace_scope");
      return savedScope === "team" ? "team" : "personal";
    },
  );
  const navigate = useCustomNavigate();
  const createBlankFlow = useCreateBlankFlow();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const { mutateAsync: postFolder } = usePostFolders();
  const { mutateAsync: postAddFlow } = usePostAddFlow();

  const myCollectionId = useFolderStore((state) => state.myCollectionId);
  const folders = useFolderStore((state) => state.folders);
  const [isCreatingTeamProject, setIsCreatingTeamProject] = useState(false);
  const [lastTeamFolderId, setLastTeamFolderId] = useState(() => {
    return (
      localStorage.getItem("lf_last_team_folder_id") ||
      localStorage.getItem("mock_current_team_id") ||
      ""
    );
  });
  const personalFolderId = myCollectionId ?? "";
  const isFolderAvailable = useCallback(
    (candidateId: string) =>
      Boolean(
        candidateId &&
          candidateId !== personalFolderId &&
          folders.some((folder) => folder.id === candidateId),
      ),
    [folders, personalFolderId],
  );
  const firstTeamFolderId = useMemo(
    () =>
      folders.find((folder) => folder?.id && folder.id !== personalFolderId)
        ?.id ?? "",
    [folders, personalFolderId],
  );
  const teamFolderId = useMemo(() => {
    if (isFolderAvailable(folderId ?? "")) {
      return folderId;
    }
    if (isFolderAvailable(lastTeamFolderId)) {
      return lastTeamFolderId;
    }
    return firstTeamFolderId;
  }, [folderId, firstTeamFolderId, isFolderAvailable, lastTeamFolderId]);
  const scopedFolderId =
    workspaceScope === "team" ? teamFolderId : personalFolderId;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  const handleWorkspaceScopeChange = useCallback(
    (scope: "personal" | "team") => {
      const nextFolderId = scope === "team" ? teamFolderId : personalFolderId;
      setWorkspaceScope(scope);
      localStorage.setItem("lf_workspace_scope", scope);
      setPageIndex(1);
      setSelectedFlows([]);
      setLastSelectedIndex(null);

      if (scope === "team" && nextFolderId) {
        localStorage.setItem("lf_last_team_folder_id", nextFolderId);
        localStorage.setItem("mock_current_team_id", nextFolderId);
        setLastTeamFolderId(nextFolderId);
      }

      if (nextFolderId && folderId !== nextFolderId) {
        navigate(`/all/folder/${nextFolderId}`);
      } else if (scope === "team" && !nextFolderId && folderId) {
        navigate("/all");
      }
    },
    [
      folderId,
      navigate,
      personalFolderId,
      teamFolderId,
    ],
  );

  useEffect(() => {
    if (!lastTeamFolderId) {
      return;
    }
    if (!isFolderAvailable(lastTeamFolderId)) {
      localStorage.removeItem("lf_last_team_folder_id");
      setLastTeamFolderId("");
    }
  }, [isFolderAvailable, lastTeamFolderId]);

  useEffect(() => {
    if (!scopedFolderId || folderId === scopedFolderId) {
      return;
    }
    navigate(`/all/folder/${scopedFolderId}`);
  }, [folderId, navigate, scopedFolderId]);

  useEffect(() => {
    const previousTeamId = localStorage.getItem("mock_current_team_id") || "";
    const nextTeamId =
      workspaceScope === "team" ? teamFolderId || lastTeamFolderId : "";

    if (nextTeamId) {
      localStorage.setItem("mock_current_team_id", nextTeamId);
      localStorage.setItem("lf_last_team_folder_id", nextTeamId);
      setLastTeamFolderId(nextTeamId);
    } else {
      localStorage.removeItem("mock_current_team_id");
    }

    if (previousTeamId !== nextTeamId) {
      void queryClient.invalidateQueries({ queryKey: ["useGetFolder"] });
      void queryClient.invalidateQueries({
        queryKey: ["useGetRefreshFlowsQuery"],
      });
    }
  }, [workspaceScope, teamFolderId, lastTeamFolderId, queryClient]);

  useEffect(() => {
    // Only check if we have a folderId and folders have loaded
    if (folderId && folders && folders.length > 0) {
      const folderExists = folders.find((folder) => folder.id === folderId);
      if (!folderExists) {
        // Folder doesn't exist for this user, redirect to /all
        console.error("Invalid folderId. Redirecting to /all.");
        navigate("/all");
      }
    }
  }, [folderId, folders, navigate]);

  const { data: folderData, isLoading } = useGetFolderQuery({
    id: scopedFolderId,
    page: pageIndex,
    size: pageSize,
    sort_order: sortOrder,
    is_component: false,
    is_flow: true,
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
    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    setPageIndex(1);
  }, []);

  const onSearch = useCallback((newSearch) => {
    setSearch(newSearch);
    setPageIndex(1);
  }, []);

  const isEmptyFolder =
    !isLoading && (!scopedFolderId || (folderData?.flows?.total ?? 0) === 0);
  const isTeamProjectEmptyState = workspaceScope === "team" && !teamFolderId;

  const handleFileDrop = useFileDrop(isEmptyFolder ? undefined : "flows");

  const handleCreateNewFlow = async () => {
    try {
      if (workspaceScope !== "team") {
        await createBlankFlow();
        return;
      }

      let targetFolderId = teamFolderId;
      if (!targetFolderId) {
        if (isCreatingTeamProject) {
          return;
        }
        setIsCreatingTeamProject(true);
        try {
          const createdFolder = (await postFolder({
            data: {
              name: "\u56e2\u961f\u9879\u76ee",
              description: "",
              parent_id: null,
              components: [],
              flows: [],
            },
          })) as
            | {
                id?: string | null;
                folder?: { id?: string | null };
                data?: { id?: string | null };
              }
            | string
            | undefined;

          targetFolderId =
            (typeof createdFolder === "string" ? createdFolder : undefined) ||
            createdFolder?.id ||
            createdFolder?.folder?.id ||
            createdFolder?.data?.id ||
            "";
          if (!targetFolderId) {
            throw new Error("\u521b\u5efa\u56e2\u961f\u9879\u76ee\u5931\u8d25");
          }
        } finally {
          setIsCreatingTeamProject(false);
        }
      }

      localStorage.setItem("lf_last_team_folder_id", targetFolderId);
      localStorage.setItem("lf_workspace_scope", "team");
      localStorage.setItem("mock_current_team_id", targetFolderId);
      setLastTeamFolderId(targetFolderId);
      setWorkspaceScope("team");

      const createdFlow = (await postAddFlow({
        name: t("New Flow"),
        data: { nodes: [], edges: [], viewport: DEFAULT_VIEWPORT },
        description: "",
        is_component: false,
        folder_id: targetFolderId,
        endpoint_name: undefined,
        icon: undefined,
        gradient: undefined,
        tags: undefined,
        mcp_enabled: true,
      })) as
        | { id?: string; flow?: { id?: string }; data?: { id?: string } }
        | string
        | undefined;

      const createdFlowId =
        (typeof createdFlow === "string" ? createdFlow : undefined) ||
        createdFlow?.id ||
        createdFlow?.flow?.id ||
        createdFlow?.data?.id ||
        "";
      if (!createdFlowId) {
        throw new Error("\u521b\u5efa flow \u5931\u8d25");
      }

      navigate(`/flow/${createdFlowId}/folder/${targetFolderId}`);
    } catch (error) {
      const message =
        (error as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ||
        (error as { message?: string } | undefined)?.message ||
        t("Please try again");
      setErrorData({
        title: "\u65b0\u5efa flow \u5931\u8d25",
        list: [message],
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

    const handleBlur = () => {
      setIsShiftPressed(false);
      setIsCtrlPressed(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);

      setIsShiftPressed(false);
      setIsCtrlPressed(false);
    };
  }, []);

  const setSelectedFlow = useCallback(
    (selected: boolean, flowId: string, index: number) => {
      setLastSelectedIndex(index);
      if (isShiftPressed && lastSelectedIndex !== null) {
        const flows = data.flows;
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const flowsToSelect = flows
          .slice(start, end + 1)
          .map((flow) => flow.id);

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

  useEffect(() => {
    return () => {
      setIsShiftPressed(false);
      setIsCtrlPressed(false);
    };
  }, [folderId]);

  return (
    <CardsWrapComponent
      onFileDrop={handleFileDrop}
      dragMessage={t("Drop your {{items}} here", {
        items: t("flows"),
      })}
    >
      <div className="flex h-full w-full flex-col overflow-y-auto bg-black px-8 py-6 text-white">
        {ENABLE_DATASTAX_LANGFLOW && <CustomBanner />}

        <TapNowWorkflowsHeader
          workspaceScope={workspaceScope}
          setWorkspaceScope={handleWorkspaceScopeChange}
          onCreateFlow={handleCreateNewFlow}
          view={view}
          setView={setView}
          setSearch={onSearch}
          selectedFlows={selectedFlows}
          sortOrder={sortOrder}
          onToggleSortOrder={handleToggleSortOrder}
          isEmptyFolder={isEmptyFolder}
        />

        {!isAuthenticated ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/[0.04]">
                <svg
                  className="h-6 w-6 text-white/40"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <h2 className="text-[17px] font-medium tracking-wide">尚未登录</h2>
                <p className="text-[15px] text-white/40">请先登录来开启 OrangeFlow 旅程</p>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="mt-2 rounded-[12px] border border-white/10 px-5 py-2 text-[15px] font-medium text-white transition-colors duration-300 hover:bg-[#333333]"
              >
                登录以开始使用
              </button>
            </div>
          </div>
        ) : isEmptyFolder ? (
          <EmptyFolder
            onCreateFlow={handleCreateNewFlow}
            title={
              isTeamProjectEmptyState
                ? "\u6682\u65e0\u56e2\u961f\u9879\u76ee"
                : undefined
            }
            description={
              isTeamProjectEmptyState
                ? "\u5728\u56e2\u961f\u4e2d\u521b\u5efa\u65b0\u9879\u76ee\uff0c\u6216\u5c06\u4e2a\u4eba\u9879\u76ee\u79fb\u52a8\u81f3\u56e2\u961f"
                : undefined
            }
            hideCreateButton={isTeamProjectEmptyState}
          />
        ) : (
          <div className="flex h-full flex-col">
            {isLoading ? (
              view === "grid" ? (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  <ListSkeleton />
                  <ListSkeleton />
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-1">
                  <ListSkeleton />
                  <ListSkeleton />
                </div>
              )
            ) : data && data.pagination.total > 0 ? (
              <div
                className={cn(
                  "mt-4",
                  view === "grid"
                    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                    : "flex flex-col gap-1"
                )}
              >
                {view === "list" && (
                  <div className="grid min-w-[1060px] grid-cols-[72px,minmax(200px,2fr),120px,minmax(240px,2fr),180px,180px,56px] items-center gap-3 px-4 py-2 text-xs font-medium text-gray-400">
                    <div>{t("Preview")}</div>
                    <div>{t("Name")}</div>
                    <div>{t("Type")}</div>
                    <div>{t("Description")}</div>
                    <div>{t("Created at")}</div>
                    <div>{t("Updated")}</div>
                    <div className="text-right">{t("Actions")}</div>
                  </div>
                )}
                {data.flows.map((flow, index) => (
                  <ListComponent
                    key={flow.id}
                    flowData={flow}
                    view={view}
                    selected={selectedFlows.includes(flow.id)}
                    setSelected={(selected) =>
                      setSelectedFlow(selected, flow.id, index)
                    }
                    shiftPressed={isShiftPressed || isCtrlPressed}
                  />
                ))}
              </div>
            ) : (
              <div className="pt-24 text-center text-sm text-secondary-foreground">
                {t("No flows in this project.")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    void handleCreateNewFlow();
                  }}
                  className="cursor-pointer underline"
                >
                  {t("Create a new flow")}
                </button>
                {t(", or browse the store.")}
              </div>
            )}
          </div>
        )}

        {!isLoading &&
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
                isComponent={false}
              />
            </div>
          )}
      </div>
    </CardsWrapComponent>
  );
};

export default HomePage;
