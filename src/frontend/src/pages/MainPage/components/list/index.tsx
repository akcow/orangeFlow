import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import useDragStart from "@/components/core/cardComponent/hooks/use-on-drag-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useDeleteFlow from "@/hooks/flows/use-delete-flow";
import { t } from "@/i18n/t";
import DeleteConfirmationModal from "@/modals/deleteConfirmationModal";
import ExportModal from "@/modals/exportModal";
import FlowSettingsModal from "@/modals/flowSettingsModal";
import useAlertStore from "@/stores/alertStore";
import type { FlowType } from "@/types/flow";
import { downloadFlow } from "@/utils/reactflowUtils";
import { swatchColors } from "@/utils/styleUtils";
import { cn, getNumberFromString } from "@/utils/utils";
import { extractLatestImageFromFlow } from "@/utils/workflowUtils";
import useDescriptionModal from "../../hooks/use-description-modal";
import { useGetTemplateStyle } from "../../utils/get-template-style";
import DropdownComponent from "../dropdown";

const formatCreatedAt = (dateString?: string): string => {
  if (!dateString) return "--";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "--";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatElapsedZh = (dateString?: string): string => {
  if (!dateString) return "";
  const givenDate = new Date(dateString);
  if (Number.isNaN(givenDate.getTime())) return "";

  const now = new Date();
  const diffInMs = Math.abs(now.getTime() - givenDate.getTime());
  const minutes = Math.floor(diffInMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  if (years > 0) return `${years}年`;
  if (months > 0) return `${months}个月`;
  if (days > 0) return `${days}天`;
  if (hours > 0) return `${hours}小时`;
  if (minutes > 0) return `${minutes}分钟`;
  return "不到1分钟";
};

const ListComponent = ({
  flowData,
  selected,
  setSelected,
  shiftPressed,
  view,
}: {
  flowData: FlowType;
  selected: boolean;
  setSelected: (selected: boolean) => void;
  shiftPressed: boolean;
  view: "list" | "grid";
}) => {
  const navigate = useCustomNavigate();
  const [openDelete, setOpenDelete] = useState(false);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const { deleteFlow } = useDeleteFlow();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const { folderId } = useParams();
  const [openSettings, setOpenSettings] = useState(false);
  const [openExportModal, setOpenExportModal] = useState(false);
  const isComponent = flowData.is_component ?? false;

  const { getIcon } = useGetTemplateStyle(flowData);

  const editFlowLink = `/flow/${flowData.id}${folderId ? `/folder/${folderId}` : ""}`;

  const handleClick = async () => {
    if (shiftPressed) {
      setSelected(!selected);
    } else {
      if (!isComponent) {
        navigate(editFlowLink);
      }
    }
  };

  const handleDelete = () => {
    deleteFlow({ id: [flowData.id] })
      .then(() => {
        setSuccessData({
          title: t("Selected items deleted successfully"),
        });
      })
      .catch(() => {
        setErrorData({
          title: t("Error deleting items"),
          list: [t("Please try again")],
        });
      });
  };

  const { onDragStart } = useDragStart(flowData);

  const descriptionModal = useDescriptionModal(
    [flowData?.id],
    flowData.is_component ? "component" : "flow",
  );

  const swatchIndex =
    (flowData.gradient && !isNaN(parseInt(flowData.gradient))
      ? parseInt(flowData.gradient)
      : getNumberFromString(flowData.gradient ?? flowData.id)) %
    swatchColors.length;

  const handleExport = () => {
    if (flowData.is_component) {
      downloadFlow(flowData, flowData.name, flowData.description);
      setSuccessData({
        title: t("{{name}} exported successfully", { name: flowData.name }),
      });
    } else {
      setOpenExportModal(true);
    }
  };

  const [icon, setIcon] = useState<string>("");

  useEffect(() => {
    getIcon().then(setIcon);
  }, [getIcon]);

  const coverImage = useMemo(
    () => extractLatestImageFromFlow(flowData),
    [flowData],
  );
  const createdAtLabel = useMemo(
    () => formatCreatedAt(flowData.date_created ?? flowData.updated_at),
    [flowData.date_created, flowData.updated_at],
  );
  const updatedLabel = flowData.updated_at
    ? `编辑于 ${formatElapsedZh(flowData.updated_at)}前`
    : "--";
  const typeLabel = isComponent ? "组件" : "项目";

  return (
    <>
      {view === "list" ? (
        <Card
          key={flowData.id}
          draggable
          onDragStart={onDragStart}
          onClick={handleClick}
          className={cn(
            "group/list min-w-[1060px] rounded-xl border border-border/60 bg-card/70 p-0 shadow-sm transition-all duration-300",
            "hover:-translate-y-0.5 hover:border-border hover:bg-muted/30",
            isComponent ? "cursor-default" : "cursor-pointer",
          )}
          data-testid="list-card"
        >
          <div className="grid min-h-[90px] grid-cols-[72px,minmax(200px,2fr),120px,minmax(240px,2fr),180px,180px,56px] items-center gap-3 px-4 py-3">
            <div className="relative">
              <div className="h-12 w-16 overflow-hidden rounded-md border border-border/70 bg-muted">
                {coverImage ? (
                  <img
                    src={coverImage}
                    alt={flowData.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover/list:scale-105"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-full w-full items-center justify-center",
                      swatchColors[swatchIndex],
                    )}
                  >
                    <ForwardedIconComponent
                      name={flowData?.icon || icon}
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  </div>
                )}
              </div>
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => setSelected(checked as boolean)}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "absolute left-1 top-1 border-background bg-background/90 shadow-sm transition-opacity focus-visible:ring-0",
                  !selected && "opacity-0 group-hover/list:opacity-100",
                )}
                data-testid={`checkbox-${flowData.id}`}
              />
            </div>

            <div className="min-w-0">
              <div
                className="truncate text-sm font-semibold text-foreground"
                data-testid="flow-name-div"
              >
                <span
                  className="truncate"
                  data-testid={`flow-name-${flowData.id}`}
                >
                  {flowData.name}
                </span>
              </div>
            </div>

            <div className="min-w-0 truncate text-sm text-muted-foreground">
              {typeLabel}
            </div>

            <div className="min-w-0 line-clamp-2 text-sm text-muted-foreground">
              {flowData.description?.trim() ? flowData.description : ""}
            </div>

            <div className="min-w-0 truncate text-sm text-foreground">
              {createdAtLabel}
            </div>

            <div className="min-w-0 truncate text-sm text-muted-foreground">
              {updatedLabel}
            </div>

            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="iconMd"
                    data-testid="home-dropdown-menu"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    className={cn(
                      "h-8 w-8 rounded-md text-muted-foreground transition-all duration-200 hover:text-foreground",
                      selected
                        ? "opacity-100"
                        : "pointer-events-none translate-x-1 opacity-0 group-hover/list:pointer-events-auto group-hover/list:translate-x-0 group-hover/list:opacity-100 group-focus-within/list:pointer-events-auto group-focus-within/list:translate-x-0 group-focus-within/list:opacity-100",
                    )}
                  >
                    <ForwardedIconComponent
                      name="Ellipsis"
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[185px]"
                  sideOffset={5}
                  side="bottom"
                >
                  <DropdownComponent
                    flowData={flowData}
                    setOpenDelete={setOpenDelete}
                    handleExport={handleExport}
                    handleEdit={() => {
                      setOpenSettings(true);
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          key={flowData.id}
          draggable
          onDragStart={onDragStart}
          onClick={handleClick}
          className={cn(
            "group/grid relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-0 shadow-sm transition-all duration-300",
            "hover:-translate-y-1 hover:border-border hover:shadow-xl",
            isComponent ? "cursor-default" : "cursor-pointer",
          )}
          data-testid="list-card"
        >
          <div className="relative aspect-[16/10] overflow-hidden border-b border-border/60 bg-muted/40">
            {coverImage ? (
              <img
                src={coverImage}
                alt={flowData.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover/grid:scale-105"
              />
            ) : (
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center",
                  swatchColors[swatchIndex],
                )}
              >
                <ForwardedIconComponent
                  name={flowData?.icon || icon}
                  aria-hidden="true"
                  className="h-8 w-8"
                />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/55 via-background/5 to-transparent opacity-0 transition-opacity duration-300 group-hover/grid:opacity-100" />

            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => setSelected(checked as boolean)}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "absolute left-3 top-3 border-background bg-background/90 shadow-sm transition-opacity focus-visible:ring-0",
                !selected && "opacity-0 group-hover/grid:opacity-100",
              )}
              data-testid={`checkbox-${flowData.id}`}
            />

            <div className="absolute right-3 top-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    data-testid="home-dropdown-menu"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    className={cn(
                      "h-8 w-8 rounded-md border border-border/40 bg-background/75 text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:text-foreground",
                      selected
                        ? "opacity-100"
                        : "pointer-events-none translate-y-1 opacity-0 group-hover/grid:pointer-events-auto group-hover/grid:translate-y-0 group-hover/grid:opacity-100 group-focus-within/grid:pointer-events-auto group-focus-within/grid:translate-y-0 group-focus-within/grid:opacity-100",
                    )}
                  >
                    <ForwardedIconComponent
                      name="Ellipsis"
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[185px]"
                  sideOffset={5}
                  side="bottom"
                >
                  <DropdownComponent
                    flowData={flowData}
                    setOpenDelete={setOpenDelete}
                    handleExport={handleExport}
                    handleEdit={() => {
                      setOpenSettings(true);
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-1 px-4 py-3">
            <div
              className="truncate text-base font-semibold"
              data-testid="flow-name-div"
            >
              <span
                className="truncate"
                data-testid={`flow-name-${flowData.id}`}
              >
                {flowData.name}
              </span>
            </div>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {flowData.description?.trim() ? flowData.description : ""}
            </p>
            <p className="text-xs text-muted-foreground">{updatedLabel}</p>
          </div>
        </Card>
      )}
      {openDelete && (
        <DeleteConfirmationModal
          open={openDelete}
          setOpen={setOpenDelete}
          onConfirm={handleDelete}
          description={descriptionModal}
          note={!flowData.is_component ? "and its message history" : ""}
        />
      )}
      <ExportModal
        open={openExportModal}
        setOpen={setOpenExportModal}
        flowData={flowData}
      />
      <FlowSettingsModal
        open={openSettings}
        setOpen={setOpenSettings}
        flowData={flowData}
      />
    </>
  );
};

export default ListComponent;
