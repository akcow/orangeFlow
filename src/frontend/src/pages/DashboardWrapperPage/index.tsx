import { Outlet, useLocation } from "react-router-dom";
import { TapNowHeader } from "@/components/TapNowHeader";
import FlowMenu from "@/components/core/appHeaderComponent/components/FlowMenu";
import useTheme from "@/customization/hooks/use-custom-theme";
import useFlowStore from "@/stores/flowStore";

export function DashboardWrapperPage() {
  useTheme();
  const location = useLocation();
  const onFlowPage = useFlowStore((state) => state.onFlowPage);

  const isTapNowHeaderRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/home") ||
    location.pathname.startsWith("/community") ||
    location.pathname.startsWith("/flows") ||
    location.pathname.startsWith("/components") ||
    location.pathname.startsWith("/all") ||
    location.pathname.startsWith("/assets");

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {!onFlowPage && (isTapNowHeaderRoute ? (
        <TapNowHeader />
      ) : (
        <TapNowHeader centerContent={<FlowMenu />} dataTestId="app-header" />
      ))}
      <div className="flex w-full flex-1 flex-row overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
