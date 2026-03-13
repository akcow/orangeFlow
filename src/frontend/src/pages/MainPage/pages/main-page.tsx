import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import SideBarFoldersButtonsComponent from "@/components/core/folderSidebarComponent/components/sideBarFolderButtons";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useDeleteFolders } from "@/controllers/API/queries/folders";
import { useGetRefreshFlowsQuery } from "@/controllers/API/queries/flows/use-get-refresh-flows-query";
import CustomEmptyPageCommunity from "@/customization/components/custom-empty-page";
import CustomLoader from "@/customization/components/custom-loader";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { t } from "@/i18n/t";
import useAlertStore from "@/stores/alertStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useFolderStore } from "@/stores/foldersStore";
import useAuthStore from "@/stores/authStore";
import ModalsComponent from "../components/modalsComponent";
import EmptyPageCommunity from "./empty-page";

export default function CollectionPage(): JSX.Element {
  const [openDeleteFolderModal, setOpenDeleteFolderModal] = useState(false);
  const setFolderToEdit = useFolderStore((state) => state.setFolderToEdit);
  const navigate = useCustomNavigate();
  const flows = useFlowsManagerStore((state) => state.flows);
  const setFlows = useFlowsManagerStore((state) => state.setFlows);
  const examples = useFlowsManagerStore((state) => state.examples);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const folderToEdit = useFolderStore((state) => state.folderToEdit);
  const folders = useFolderStore((state) => state.folders);
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const { isFetched: isFlowsFetched } = useGetRefreshFlowsQuery(
    {
      get_all: true,
      header_flows: true,
    },
    { enabled: true },
  );

  useEffect(() => {
    if (isFlowsFetched && flows === undefined) {
      setFlows([]);
    }
  }, [isFlowsFetched, flows, setFlows]);

  useEffect(() => {
    return () => queryClient.removeQueries({ queryKey: ["useGetFolder"] });
  }, []);

  const { mutate } = useDeleteFolders();

  const handleDeleteFolder = () => {
    mutate(
      {
        folder_id: folderToEdit?.id!,
      },
      {
        onSuccess: () => {
          setSuccessData({
            title: t("Project deleted successfully."),
          });
          navigate("/all");
        },
        onError: (err) => {
          console.error(err);
          setErrorData({
            title: t("Error deleting project."),
          });
        },
      },
    );
  };

  return (
    <SidebarProvider width="280px">
      {isAuthenticated &&
        flows &&
        examples &&
        folders &&
        (flows?.length !== examples?.length || folders?.length > 1) && (
          <SideBarFoldersButtonsComponent
            handleChangeFolder={(id: string) => {
              navigate(`all/folder/${id}`);
            }}
            handleDeleteFolder={(item) => {
              setFolderToEdit(item);
              setOpenDeleteFolderModal(true);
            }}
            handleFilesClick={() => {
              navigate("assets");
            }}
          />
        )}
      <main className="flex h-full w-full overflow-hidden">
        {examples && folders ? (
          <div
            className={`relative mx-auto flex h-full w-full flex-col overflow-hidden`}
          >
            {flows?.length !== examples?.length || folders?.length > 1 ? (
              <Outlet />
            ) : (
              <CustomEmptyPageCommunity />
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CustomLoader remSize={30} />
          </div>
        )}
      </main>
      <ModalsComponent
        openDeleteFolderModal={openDeleteFolderModal}
        setOpenDeleteFolderModal={setOpenDeleteFolderModal}
        handleDeleteFolder={handleDeleteFolder}
      />
    </SidebarProvider>
  );
}
