import { debounce } from "lodash";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteDeleteFlows } from "@/controllers/API/queries/flows/use-delete-delete-flows";
import { useGetDownloadFlows } from "@/controllers/API/queries/flows/use-get-download-flows";
import { ENABLE_MCP } from "@/customization/feature-flags";
import DeleteConfirmationModal from "@/modals/deleteConfirmationModal";
import useAlertStore from "@/stores/alertStore";
import useCreateBlankFlow from "@/hooks/flows/use-create-blank-flow";
import { cn } from "@/utils/utils";

interface TapNowWorkflowsHeaderProps {
  flowType: "flows" | "components";
  setFlowType: (flowType: "flows" | "components") => void;
  view: "list" | "grid";
  setView: (view: "list" | "grid") => void;
  setSearch: (search: string) => void;
  selectedFlows: string[];
  sortOrder?: "asc" | "desc";
  onToggleSortOrder?: () => void;
  isEmptyFolder: boolean;
}

export const TapNowWorkflowsHeader = ({
  flowType,
  setFlowType,
  view,
  setView,
  setSearch,
  selectedFlows,
  sortOrder = "desc",
  onToggleSortOrder,
  isEmptyFolder,
}: TapNowWorkflowsHeaderProps) => {
  const { t } = useTranslation();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);
  const isMCPEnabled = ENABLE_MCP;
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const createBlankFlow = useCreateBlankFlow();

  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
    }, 1000),
    [setSearch],
  );

  const { mutate: downloadFlows, isPending: isDownloading } =
    useGetDownloadFlows();
  const { mutate: deleteFlows, isPending: isDeleting } = useDeleteDeleteFlows();

  useEffect(() => {
    debouncedSetSearch(debouncedSearch);
    return () => {
      debouncedSetSearch.cancel();
    };
  }, [debouncedSearch, debouncedSetSearch]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDebouncedSearch(e.target.value);
  };

  const tabTypes = isMCPEnabled ? ["flows"] : ["components", "flows"];

  const handleDownload = () => {
    downloadFlows({ ids: selectedFlows });
    setSuccessData({ title: t("Flows downloaded successfully") });
  };

  const handleDelete = () => {
    deleteFlows(
      { flow_ids: selectedFlows },
      {
        onSuccess: () => {
          setSuccessData({ title: t("Flows deleted successfully") });
        },
      },
    );
  };

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

  if (isEmptyFolder) return null;

  return (
    <div className="flex flex-col gap-4 w-full mb-4">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {tabTypes.map((type) => (
          <Button
            key={type}
            variant="ghost"
            onClick={() => setFlowType(type as "flows" | "components")}
            className={cn(
              "rounded-none border-b-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-transparent hover:text-white",
              flowType === type
                ? "border-white text-white"
                : "border-transparent text-gray-400"
            )}
          >
            {type === "flows" ? t("Flows") : t("Components")}
          </Button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Input
            icon="Search"
            type="text"
            placeholder={
              flowType === "flows"
                ? t("Search flows...")
                : t("Search components...")
            }
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus-visible:ring-white/20"
            value={debouncedSearch}
            onChange={handleSearch}
          />
        </div>

        <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
            {["list", "grid"].map((viewType) => (
                <Button
                key={viewType}
                size="icon"
                variant="ghost"
                className={cn(
                    "h-8 w-8 rounded-md hover:bg-white/10 hover:text-white",
                    view === viewType ? "bg-white/10 text-white" : "text-gray-400"
                )}
                onClick={() => setView(viewType as "list" | "grid")}
                >
                <ForwardedIconComponent
                    name={viewType === "list" ? "Menu" : "LayoutGrid"}
                    className="h-4 w-4"
                />
                </Button>
            ))}
            </div>

            {/* Selected Actions */}
            {selectedFlows.length > 0 && (
                <>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 border-white/10 bg-white/5 hover:bg-white/10 hover:text-white"
                    onClick={handleDownload}
                    loading={isDownloading}
                >
                    <ForwardedIconComponent name="Download" className="h-4 w-4" />
                </Button>

                <DeleteConfirmationModal
                    onConfirm={handleDelete}
                    description={t("selected flows")}
                    note={t("and their message history")}
                >
                    <Button
                    variant="destructive"
                    size="icon"
                    className="h-10 w-10"
                    loading={isDeleting}
                    >
                    <ForwardedIconComponent name="Trash2" className="h-4 w-4" />
                    </Button>
                </DeleteConfirmationModal>
                </>
            )}

            {/* Sort & Create */}
            {selectedFlows.length === 0 && (
                <>
                <ShadTooltip
                    content={`${t("Sort by time")} (${sortOrder === "desc" ? t("Newest first") : t("Oldest first")})`}
                    side="bottom"
                >
                    <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 border-white/10 bg-white/5 hover:bg-white/10 hover:text-white text-gray-400"
                    onClick={onToggleSortOrder}
                    >
                    <ForwardedIconComponent
                        name={sortOrder === "desc" ? "ArrowDownNarrowWide" : "ArrowUpNarrowWide"}
                        className="h-4 w-4"
                    />
                    </Button>
                </ShadTooltip>

                <Button
                    onClick={handleCreateNewFlow}
                    className="bg-white text-black hover:bg-gray-200 border-0 font-semibold"
                    loading={isCreatingFlow}
                >
                    <ForwardedIconComponent name="Plus" className="mr-2 h-4 w-4" />
                    {t("New Flow")}
                </Button>
                </>
            )}
        </div>
      </div>
    </div>
  );
};
