import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AlertDropdown from "@/alerts/alertDropDown";
import DataStaxLogo from "@/assets/DataStaxLogo.svg?react";
import LangflowLogo from "@/assets/LangflowLogo.svg?react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import CustomAccountMenu from "@/customization/components/custom-AccountMenu";
import { CustomOrgSelector } from "@/customization/components/custom-org-selector";
import { CustomProductSelector } from "@/customization/components/custom-product-selector";
import { ENABLE_DATASTAX_LANGFLOW } from "@/customization/feature-flags";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useTheme from "@/customization/hooks/use-custom-theme";
import useAlertStore from "@/stores/alertStore";
import useFlowStore from "@/stores/flowStore";
import { cn } from "@/utils/utils";
import FlowMenu from "./components/FlowMenu";
import PublishDropdown from "@/components/core/flowToolbarComponent/components/deploy-dropdown";

export default function AppHeader(): JSX.Element {
  const { t } = useTranslation();
  const notificationCenter = useAlertStore((state) => state.notificationCenter);
  const navigate = useCustomNavigate();
  const location = useLocation();
  const [activeState, setActiveState] = useState<"notifications" | null>(null);
  const notificationRef = useRef<HTMLButtonElement | null>(null);
  const notificationContentRef = useRef<HTMLDivElement | null>(null);
  useTheme();

  const onFlowPage = useFlowStore((state) => state.onFlowPage);

  const topNavActive = useMemo(() => {
    const path = location.pathname || "/";
    if (path.startsWith("/community/tv")) return "tv";
    if (path.startsWith("/community/workflows")) return "workflows";
    return "workspace";
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isNotificationButton = notificationRef.current?.contains(target);
      const isNotificationContent =
        notificationContentRef.current?.contains(target);

      if (!isNotificationButton && !isNotificationContent) {
        setActiveState(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const getNotificationBadge = () => {
    const baseClasses = "absolute h-1 w-1 rounded-full bg-destructive";
    return notificationCenter
      ? `${baseClasses} right-[0.3rem] top-[5px]`
      : "hidden";
  };

  return (
    <div
      className={`z-10 flex h-[48px] w-full items-center justify-between border-b pr-5 pl-2.5 dark:bg-background`}
      data-testid="app-header"
    >
      {/* Left Section */}
      <div
        className={`z-30 flex shrink-0 items-center gap-2`}
        data-testid="header_left_section_wrapper"
      >
        <Button
          unstyled
          onClick={() => navigate("/")}
          className="mr-1 flex h-8 w-8 items-center"
          data-testid="icon-ChevronLeft"
        >
          {ENABLE_DATASTAX_LANGFLOW ? (
            <DataStaxLogo className="fill-black dark:fill-[white]" />
          ) : (
            <LangflowLogo className="h-5 w-5" />
          )}
        </Button>
        {ENABLE_DATASTAX_LANGFLOW && (
          <>
            <CustomOrgSelector />
            <CustomProductSelector />
          </>
        )}
        {!ENABLE_DATASTAX_LANGFLOW && !onFlowPage && (
          <div className="flex items-center gap-1">
            <Button
              variant={topNavActive === "tv" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-8 px-3 font-normal", topNavActive !== "tv" && "text-muted-foreground")}
              onClick={() => navigate("/community/tv")}
            >
              TV
            </Button>
            <Button
              variant={topNavActive === "workflows" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-8 px-3 font-normal", topNavActive !== "workflows" && "text-muted-foreground")}
              onClick={() => navigate("/community/workflows")}
            >
              工作流
            </Button>
            <Button
              variant={topNavActive === "workspace" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-8 px-3 font-normal",
                topNavActive !== "workspace" && "text-muted-foreground",
              )}
              onClick={() => navigate("/")}
            >
              工作空间
            </Button>
          </div>
        )}
        {onFlowPage && <FlowMenu />}
      </div>

      {/* Middle Section */}
      {!onFlowPage && (
        <div className="absolute left-1/2 -translate-x-1/2">
          <FlowMenu />
        </div>
      )}

      {/* Right Section */}
      <div
        className={`relative left-3 z-30 flex shrink-0 items-center gap-3`}
        data-testid="header_right_section_wrapper"
      >
        {!onFlowPage ? (
          <>
            <AlertDropdown
              notificationRef={notificationContentRef}
              onClose={() => setActiveState(null)}
            >
              <ShadTooltip
                content={t("Notifications and errors")}
                side="bottom"
                styleClasses="z-10"
              >
                <AlertDropdown onClose={() => setActiveState(null)}>
                  <Button
                    ref={notificationRef}
                    unstyled
                    onClick={() =>
                      setActiveState((prev) =>
                        prev === "notifications" ? null : "notifications",
                      )
                    }
                    data-testid="notification_button"
                  >
                    <div className="hit-area-hover group relative items-center rounded-md px-2 py-2 text-muted-foreground">
                      <span className={getNotificationBadge()} />
                      <ForwardedIconComponent
                        name="Bell"
                        className={`side-bar-button-size h-4 w-4 ${activeState === "notifications"
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-primary"
                          }`}
                        strokeWidth={2}
                      />
                      <span className="hidden whitespace-nowrap">
                        {t("Notifications")}
                      </span>
                    </div>
                  </Button>
                </AlertDropdown>
              </ShadTooltip>
            </AlertDropdown>
            <Separator
              orientation="vertical"
              className="my-auto h-7 dark:border-zinc-700"
            />

            <div className="flex">
              <CustomAccountMenu />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 pr-4">
            <Button
              variant="secondary"
              className="h-8 rounded-full px-4 text-sm font-medium text-white shadow-none hover:bg-zinc-800"
              style={{ backgroundColor: "#2E2E32" }}
            >
              <ForwardedIconComponent name="Sparkles" className="mr-1.5 h-4 w-4 text-yellow-500" />
              社区
            </Button>
            <PublishDropdown />
          </div>
        )}
      </div>
    </div>
  );
}
