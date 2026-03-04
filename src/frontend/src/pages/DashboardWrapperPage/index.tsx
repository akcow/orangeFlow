import { Outlet, useLocation } from "react-router-dom";
import { TapNowHeader } from "@/components/TapNowHeader";
import AppHeader from "@/components/core/appHeaderComponent";
import useTheme from "@/customization/hooks/use-custom-theme";

export function DashboardWrapperPage() {
  useTheme();
  const location = useLocation();

  const isTapNowHeaderRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/community") ||
    location.pathname.startsWith("/flows") ||
    location.pathname.startsWith("/components") ||
    location.pathname.startsWith("/all") ||
    location.pathname.startsWith("/assets");

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {isTapNowHeaderRoute ? <TapNowHeader /> : <AppHeader />}
      <div className="flex w-full flex-1 flex-row overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
