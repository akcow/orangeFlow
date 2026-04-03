import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetTeamsQuery } from "@/controllers/API/queries/teams";
import { usePostAddFlow } from "@/controllers/API/queries/flows/use-post-add-flow";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { t } from "@/i18n/t";
import TVPublishForm from "@/pages/Community/TVPublishForm";
import useAlertStore from "@/stores/alertStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useFolderStore } from "@/stores/foldersStore";
import { cn } from "@/utils/utils";
import useDeleteFlow from "@/hooks/flows/use-delete-flow";
import { getAvailableTeamProjects } from "./deploy-dropdown.utils";

type DeployMenuItem = {
  key: "publish" | "share" | "move";
  title: string;
  description: string;
  actionLabel: string;
  iconName: string;
  disabled?: boolean;
  onClick: () => void;
};

type CreatedFlowResponse = {
  id: string;
  folder_id?: string | null;
};

const DEFAULT_VIEWPORT = { zoom: 1, x: 0, y: 0 };

export default function PublishDropdown() {
  const [openTvPublish, setOpenTvPublish] = useState(false);
  const [openMoveDialog, setOpenMoveDialog] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const currentFlow = useFlowsManagerStore((state) => state.currentFlow);
  const flowId = currentFlow?.id;
  const { folderId } = useParams();
  const myCollectionId = useFolderStore((state) => state.myCollectionId);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const navigate = useCustomNavigate();
  const { deleteFlow } = useDeleteFlow();
  const { mutate: postAddFlow } = usePostAddFlow();
  const { data: teamSummaries = [] } = useGetTeamsQuery();
  const [selectedTargetTeamProjectId, setSelectedTargetTeamProjectId] =
    useState("");

  const personalProjectId = myCollectionId ?? "";
  const isTeamContext = Boolean(localStorage.getItem("mock_current_team_id"));
  const availableTeamProjects = useMemo(
    () => getAvailableTeamProjects(teamSummaries, personalProjectId),
    [teamSummaries, personalProjectId],
  );
  const selectedTargetTeamProject = useMemo(
    () =>
      availableTeamProjects.find(
        (folder) => folder.id === selectedTargetTeamProjectId,
      ) ?? null,
    [availableTeamProjects, selectedTargetTeamProjectId],
  );
  const teamName = selectedTargetTeamProject?.name || "Team";

  useEffect(() => {
    if (isTeamContext) {
      return;
    }

    const currentFolderId = folderId ?? currentFlow?.folder_id ?? "";
    const preferredTarget =
      availableTeamProjects.find((folder) => folder.id === currentFolderId)
        ?.id ??
      availableTeamProjects[0]?.id ??
      "";

    setSelectedTargetTeamProjectId((currentValue) => {
      if (
        currentValue &&
        availableTeamProjects.some((folder) => folder.id === currentValue)
      ) {
        return currentValue;
      }
      return preferredTarget;
    });
  }, [availableTeamProjects, currentFlow?.folder_id, folderId, isTeamContext]);

  const restoreTeamContext = (teamId: string | null) => {
    if (teamId) {
      localStorage.setItem("mock_current_team_id", teamId);
    } else {
      localStorage.removeItem("mock_current_team_id");
    }
  };

  const createFlowCopy = (targetFolderId: string) =>
    new Promise<CreatedFlowResponse>((resolve, reject) => {
      if (!currentFlow) {
        reject(new Error("Current flow is unavailable"));
        return;
      }

      postAddFlow(
        {
          name: currentFlow.name,
          data: currentFlow.data ?? {
            nodes: [],
            edges: [],
            viewport: DEFAULT_VIEWPORT,
          },
          description: currentFlow.description ?? "",
          is_component: false,
          folder_id: targetFolderId,
          endpoint_name: currentFlow.endpoint_name ?? undefined,
          icon: currentFlow.icon ?? undefined,
          gradient: currentFlow.gradient ?? undefined,
          tags: currentFlow.tags ?? undefined,
          mcp_enabled: currentFlow.mcp_enabled ?? true,
        },
        {
          onSuccess: (createdFlow) => resolve(createdFlow as CreatedFlowResponse),
          onError: (error) => reject(error),
        },
      );
    });

  const getErrorMessage = (error: unknown) => {
    const maybeError = error as
      | { response?: { data?: { detail?: string } }; message?: string }
      | undefined;
    return (
      maybeError?.response?.data?.detail ??
      maybeError?.message ??
      t("Please try again")
    );
  };

  const handleMoveToTeam = async () => {
    if (!currentFlow || !flowId) {
      setErrorData({
        title: "\u65e0\u6cd5\u79fb\u52a8\u6d41\u7a0b",
        list: ["\u5f53\u524d\u6d41\u7a0b\u4e0d\u5b58\u5728"],
      });
      return;
    }

    if (!selectedTargetTeamProjectId) {
      setErrorData({
        title: "\u65e0\u6cd5\u79fb\u52a8\u6d41\u7a0b",
        list: ["\u672a\u627e\u5230\u76ee\u6807\u56e2\u961f\u9879\u76ee"],
      });
      return;
    }

    const previousTeamId = localStorage.getItem("mock_current_team_id");
    setIsTransferring(true);

    try {
      localStorage.setItem("mock_current_team_id", selectedTargetTeamProjectId);
      await createFlowCopy(selectedTargetTeamProjectId);

      restoreTeamContext(previousTeamId);
      await deleteFlow({ id: flowId });

      localStorage.setItem("lf_workspace_scope", "team");
      localStorage.setItem(
        "lf_last_team_folder_id",
        selectedTargetTeamProjectId,
      );
      localStorage.setItem(
        "mock_current_team_id",
        selectedTargetTeamProjectId,
      );

      setSuccessData({
        title: "\u6d41\u7a0b\u5df2\u79fb\u52a8\u5230\u56e2\u961f\u9879\u76ee",
      });
      setOpenMoveDialog(false);
      navigate(`/all/folder/${selectedTargetTeamProjectId}`);
    } catch (error) {
      restoreTeamContext(previousTeamId);
      setErrorData({
        title: "\u79fb\u52a8\u5230\u56e2\u961f\u5931\u8d25",
        list: [getErrorMessage(error)],
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCloneToPersonal = async () => {
    if (!currentFlow || !flowId) {
      setErrorData({
        title: "\u65e0\u6cd5\u514b\u9686\u6d41\u7a0b",
        list: ["\u5f53\u524d\u6d41\u7a0b\u4e0d\u5b58\u5728"],
      });
      return;
    }

    if (!personalProjectId) {
      setErrorData({
        title: "\u65e0\u6cd5\u514b\u9686\u6d41\u7a0b",
        list: ["\u672a\u627e\u5230\u4e2a\u4eba\u9879\u76ee"],
      });
      return;
    }

    const previousTeamId = localStorage.getItem("mock_current_team_id");
    setIsTransferring(true);

    try {
      localStorage.removeItem("mock_current_team_id");
      await createFlowCopy(personalProjectId);

      localStorage.setItem("lf_workspace_scope", "personal");
      localStorage.removeItem("mock_current_team_id");

      setSuccessData({
        title: "\u6d41\u7a0b\u5df2\u514b\u9686\u81f3\u4e2a\u4eba\u9879\u76ee",
      });
      setOpenMoveDialog(false);
      navigate(`/all/folder/${personalProjectId}`);
    } catch (error) {
      restoreTeamContext(previousTeamId);
      setErrorData({
        title: "\u514b\u9686\u5230\u4e2a\u4eba\u9879\u76ee\u5931\u8d25",
        list: [getErrorMessage(error)],
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const transferMenu = isTeamContext
    ? {
        title: "\u514b\u9686\u81f3\u4e2a\u4eba\u9879\u76ee",
        description:
          "\u5c06\u56e2\u961f\u6d41\u7a0b\u590d\u5236\u4e00\u4efd\u5230\u4e2a\u4eba\u9879\u76ee\uff0c\u56e2\u961f\u4e2d\u7684\u539f\u6d41\u7a0b\u5c06\u4fdd\u7559\u3002",
        actionLabel: "\u514b\u9686",
        onClick: () => {
          if (!flowId) return;
          setOpenMoveDialog(true);
        },
      }
    : {
        title: "\u79fb\u52a8\u5230\u56e2\u961f\u9879\u76ee",
        description:
          "\u5c06\u5f53\u524d\u4e2a\u4eba\u6d41\u7a0b\u79fb\u52a8\u5230\u56e2\u961f\u9879\u76ee\uff0c\u4fbf\u4e8e\u6210\u5458\u534f\u4f5c\u3002",
        actionLabel: "\u79fb\u52a8",
        onClick: () => {
          if (!flowId) return;
          setOpenMoveDialog(true);
        },
      };

  const deployMenuItems: DeployMenuItem[] = [
    {
      key: "publish",
      title: "\u53d1\u5e03\u5230 TapTV",
      description:
        "\u5c06\u6d41\u7a0b\u53d1\u5e03\u5230 TapTV \u793e\u533a\uff0c\u8ba9\u66f4\u591a\u4eba\u53ef\u4ee5\u4f7f\u7528\u548c\u514b\u9686\u3002",
      actionLabel: "\u53d1\u5e03",
      iconName: "Globe",
      disabled: !flowId,
      onClick: () => {
        if (!flowId) return;
        setOpenTvPublish(true);
      },
    },
    {
      key: "share",
      title: "\u5206\u4eab\u94fe\u63a5",
      description:
        "\u751f\u6210\u6d41\u7a0b\u7684\u5206\u4eab\u94fe\u63a5\uff0c\u65b9\u4fbf\u53d1\u9001\u7ed9\u5176\u4ed6\u4eba\u67e5\u770b\u3002",
      actionLabel: "\u5206\u4eab",
      iconName: "Link2",
      onClick: () => {},
    },
    {
      key: "move",
      title: transferMenu.title,
      description: transferMenu.description,
      actionLabel: transferMenu.actionLabel,
      iconName: "ScanSearch",
      disabled: !flowId,
      onClick: transferMenu.onClick,
    },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 flex cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:bg-gray-100 transition-colors"
            data-testid="publish-button"
          >
            <IconComponent
              name="Forward"
              className="h-[22px] w-[22px] text-gray-500"
              strokeWidth={2.5}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          forceMount
          sideOffset={7}
          alignOffset={-2}
          align="end"
          className="w-[400px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md"
        >
          {deployMenuItems.map((item, index) => (
            <DropdownMenuItem
              key={item.key}
              className={cn(
                "group flex cursor-pointer items-start gap-2.5 rounded-none px-0 py-3 outline-none focus:bg-transparent data-[highlighted]:bg-transparent",
                index !== deployMenuItems.length - 1 &&
                  "border-b border-border",
              )}
              disabled={item.disabled}
              onClick={item.onClick}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <IconComponent
                  name={item.iconName}
                  className="h-[18px] w-[18px]"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold leading-tight text-foreground">
                  {item.title}
                </div>
                <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <div className="ml-2 mt-0.5 flex h-9 min-w-[78px] items-center justify-center rounded-xl bg-muted px-3.5 text-[15px] font-semibold text-foreground transition-colors duration-150 group-hover:bg-accent">
                {item.actionLabel}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openTvPublish} onOpenChange={setOpenTvPublish}>
        <DialogContent className="max-w-3xl p-0" closeButtonClassName="hidden">
          {flowId ? (
            <TVPublishForm
              flowId={flowId}
              onClose={() => setOpenTvPublish(false)}
              onSuccess={() => setOpenTvPublish(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={openMoveDialog} onOpenChange={setOpenMoveDialog}>
        <DialogContent className="w-[min(480px,calc(100vw-20px))] border-[#4b4d59] bg-[#23242b] p-5 text-white">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-[22px] font-semibold leading-tight">
              {isTeamContext
                ? "\u514b\u9686\u81f3\u4e2a\u4eba\u9879\u76ee"
                : "\u79fb\u52a8\u5230\u56e2\u961f\u9879\u76ee"}
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-relaxed text-white/80">
              {isTeamContext
                ? "\u5c06\u56e2\u961f\u9879\u76ee\u590d\u5236\u4e00\u4efd\u81f3\u4e2a\u4eba\u8fdb\u884c\u4f7f\u7528\u3002\u4f60\u53ef\u4ee5\u5728\"\u4e2a\u4eba\u9879\u76ee\"\u4e2d\u8bbf\u95ee\u3002"
                : "\u9009\u62e9\u8981\u79fb\u5165\u7684\u5177\u4f53\u56e2\u961f\u9879\u76ee\uff0c\u4ee5\u4fbf\u56e2\u961f\u6210\u5458\u5728\u540c\u4e00\u753b\u5e03\u4e2d\u534f\u4f5c\u3002"}
            </DialogDescription>
          </DialogHeader>

          {!isTeamContext ? (
            <div className="mt-5 space-y-2">
              <div className="text-sm font-medium text-white/85">
                {"\u76ee\u6807\u56e2\u961f\u9879\u76ee"}
              </div>
              <Select
                value={selectedTargetTeamProjectId}
                onValueChange={setSelectedTargetTeamProjectId}
              >
                <SelectTrigger className="h-11 w-full rounded-lg border border-[#4b4d59] bg-[#2a2c34] px-4 text-left text-white hover:bg-[#2f3139]">
                  <SelectValue
                    placeholder={"\u8bf7\u9009\u62e9\u56e2\u961f\u9879\u76ee"}
                  />
                </SelectTrigger>
                <SelectContent className="border-[#4b4d59] bg-[#23242b] text-white">
                  {availableTeamProjects.map((folder) => (
                    <SelectItem
                      key={folder.id}
                      value={folder.id}
                      className="focus:bg-white/10 focus:text-white"
                    >
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTargetTeamProject ? (
                <div className="text-xs text-white/55">
                  {`\u5f53\u524d\u9009\u62e9: ${teamName}`}
                </div>
              ) : (
                <div className="text-xs text-[#ffb86b]">
                  {"\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u56e2\u961f\u9879\u76ee"}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border border-[#5a5d69] bg-[#444650] text-[15px] font-semibold text-white hover:bg-[#4c4f5b]"
              onClick={() => setOpenMoveDialog(false)}
              disabled={isTransferring}
            >
              {"\u53d6\u6d88"}
            </Button>
            <Button
              type="button"
              className="h-10 rounded-lg border-0 bg-white text-[15px] font-semibold text-black hover:bg-white/90"
              loading={isTransferring}
              disabled={!isTeamContext && !selectedTargetTeamProjectId}
              onClick={isTeamContext ? handleCloneToPersonal : handleMoveToTeam}
              data-testid="confirm-move-to-team-btn"
            >
              {isTeamContext
                ? "\u514b\u9686\u81f3\u4e2a\u4eba"
                : "\u79fb\u52a8\u5230\u56e2\u961f"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
