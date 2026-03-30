import { Outlet, useLocation } from "react-router-dom";
import { RouteTransition } from "@/components/common/route-transition";
import FlowMenu from "@/components/core/appHeaderComponent/components/FlowMenu";
import { TapNowHeader } from "@/components/TapNowHeader";
import useTheme from "@/customization/hooks/use-custom-theme";
import useFlowStore from "@/stores/flowStore";

const DASHBOARD_ANIMATED_SEGMENTS = new Set([
  "account",
  "admin",
  "community",
  "home",
  "profile",
]);

const DASHBOARD_DISABLED_PREFIXES = [
  "/all",
  "/assets",
  "/components",
  "/flow",
  "/flow-view",
  "/flows",
  "/playground",
  "/settings",
];

export function DashboardWrapperPage() {
  useTheme();
  const location = useLocation();
  const onFlowPage = useFlowStore((state) => state.onFlowPage);
  const firstSegment = location.pathname.split("/").filter(Boolean)[0] ?? "";

  const isTapNowHeaderRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/home") ||
    location.pathname.startsWith("/community") ||
    location.pathname.startsWith("/flows") ||
    location.pathname.startsWith("/components") ||
    location.pathname.startsWith("/all") ||
    location.pathname.startsWith("/assets");

  const disableRouteTransition =
    onFlowPage ||
    DASHBOARD_DISABLED_PREFIXES.some((prefix) =>
      location.pathname.startsWith(prefix),
    ) ||
    !DASHBOARD_ANIMATED_SEGMENTS.has(firstSegment);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {!onFlowPage &&
        (isTapNowHeaderRoute ? (
          <TapNowHeader />
        ) : (
          <TapNowHeader centerContent={<FlowMenu />} dataTestId="app-header" />
        ))}
      <div className="flex w-full min-h-0 flex-1 flex-row overflow-hidden">
        <RouteTransition
          transitionKey={location.pathname}
          disabled={disableRouteTransition}
          className="flex w-full min-h-0 flex-1 flex-row overflow-hidden"
        >
          <Outlet />
        </RouteTransition>
      </div>
    </div>
  );
}
