import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { RouteTransition } from "@/components/common/route-transition";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useGetRefreshFlowsQuery } from "@/controllers/API/queries/flows/use-get-refresh-flows-query";
import CustomEmptyPageCommunity from "@/customization/components/custom-empty-page";
import CustomLoader from "@/customization/components/custom-loader";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useFolderStore } from "@/stores/foldersStore";

export default function CollectionPage(): JSX.Element {
  const location = useLocation();
  const flows = useFlowsManagerStore((state) => state.flows);
  const setFlows = useFlowsManagerStore((state) => state.setFlows);
  const examples = useFlowsManagerStore((state) => state.examples);
  const folders = useFolderStore((state) => state.folders);
  const queryClient = useQueryClient();

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

  return (
    <SidebarProvider width="280px">
      <main className="flex h-full w-full overflow-hidden">
        {examples && folders ? (
          <div
            className={`relative mx-auto flex h-full w-full flex-col overflow-hidden`}
          >
            {flows?.length !== examples?.length || folders?.length > 1 ? (
              <RouteTransition
                transitionKey={location.pathname}
                className="flex h-full w-full flex-col overflow-hidden"
              >
                <Outlet />
              </RouteTransition>
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
    </SidebarProvider>
  );
}
