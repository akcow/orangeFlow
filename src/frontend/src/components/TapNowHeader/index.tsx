import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, HelpCircle, LogOut, Settings, Shield, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useGetMyNotificationsQuery } from "@/controllers/API/queries/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useAuthStore from "@/stores/authStore";
import useAlertStore from "@/stores/alertStore";
import { cn } from "@/utils/utils";
import TeamMenu from "@/components/core/appHeaderComponent/components/TeamMenu";
import useFlowStore from "@/stores/flowStore";
import PublishDropdown from "@/components/core/flowToolbarComponent/components/deploy-dropdown";
import IconComponent from "@/components/common/genericIconComponent";
import { NotificationPanel } from "./NotificationPanel";

type NavKey = "tv" | "templates" | "workspace" | "home";

interface TapNowHeaderProps {
  centerContent?: React.ReactNode;
  dataTestId?: string;
}

const getActiveNav = (pathname: string): NavKey => {
  if (pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/community/tv")) return "tv";
  if (pathname.startsWith("/community/workflows")) return "templates";
  return "workspace";
};

export const TapNowHeader = ({
  centerContent,
  dataTestId,
}: TapNowHeaderProps = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const { userData, isAuthenticated, logout } = useAuthStore();
  const notificationCenter = useAlertStore((state) => state.notificationCenter);
  const setNotificationCenter = useAlertStore(
    (state) => state.setNotificationCenter,
  );
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [wordmarkLoadFailed, setWordmarkLoadFailed] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const onFlowPage = useFlowStore((state) => state.onFlowPage);
  const { data: persistentNotifications = [] } = useGetMyNotificationsQuery({
    enabled: isAuthenticated && !!userData && !onFlowPage,
  });

  const activeNav = useMemo(() => getActiveNav(location.pathname), [location.pathname]);
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const lang = isZh ? "CN" : "EN";
  const username = userData?.nickname || userData?.username || (isZh ? "\u7528\u6237" : "User");
  const userInitial = username.slice(0, 1).toUpperCase();
  const canReview = !!(userData?.is_superuser || userData?.is_reviewer);
  const hasPersistentUnread = persistentNotifications.some(
    (item) => !item.read_at,
  );
  const hasNotificationDot = notificationCenter || hasPersistentUnread;

  const navItems: Array<{ key: NavKey; label: string; to: string }> = [
    { key: "tv", label: "OrangeTV", to: "/community/tv" },
    {
      key: "templates",
      label: isZh ? "\u6a21\u677f\u5e93" : "Templates",
      to: "/community/workflows",
    },
    {
      key: "workspace",
      label: isZh ? "\u5de5\u4f5c\u7a7a\u95f4" : "Workspace",
      to: "/flows",
    },
  ];

  const changeLanguage = (nextLang: "zh-CN" | "en") => {
    void i18n.changeLanguage(nextLang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("langflow-language", nextLang);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleOpenNotificationPanel = () => {
    setIsAvatarMenuOpen(false);
    setNotificationCenter(false);
    setIsNotificationPanelOpen(true);
  };

  return (
    <header
      data-testid={dataTestId}
      className={cn(
        "sticky top-0 z-50 flex h-[72px] w-full items-center justify-between px-4 md:px-8",
        onFlowPage
          ? "absolute left-0 top-0 pointer-events-none"
          : "border-b border-white/10 bg-black/75 backdrop-blur-md text-white",
      )}
    >
      <div
        className={cn(
          "relative z-20 flex min-w-0 items-center gap-4 md:gap-8",
          onFlowPage ? "pointer-events-auto" : "",
        )}
      >
        <Link
          to="/home"
          className="flex items-center gap-3 transition-opacity hover:opacity-85"
        >
          {iconLoadFailed ? (
            <div className="h-9 w-9 rounded-2xl bg-[radial-gradient(circle_at_20%_20%,#FDE68A_0%,#60A5FA_35%,#A78BFA_65%,#F472B6_100%)] shadow-[0_0_16px_rgba(192,132,252,0.35)]" />
          ) : (
            <img
              src="/branding/orangeflow-icon-512.png?v=20260305"
              alt="OrangeFlow icon"
              className="h-9 w-9 rounded-2xl object-cover"
              onError={() => setIconLoadFailed(true)}
            />
          )}

          {wordmarkLoadFailed ? (
            <span className="text-xl font-semibold tracking-tight text-white">OrangeFlow</span>
          ) : (
            <img
              src="/branding/tapnow-wordmark.png?v=20260305"
              alt="OrangeFlow"
              className="h-8 w-auto object-contain"
              onError={() => setWordmarkLoadFailed(true)}
            />
          )}
        </Link>

        {onFlowPage && centerContent && <div className="flex items-center">{centerContent}</div>}

        {!onFlowPage && (
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  activeNav === item.key
                    ? "bg-white/[0.08] text-white"
                    : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!onFlowPage && centerContent ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block">
          <div className="pointer-events-auto">{centerContent}</div>
        </div>
      ) : null}

      <div className="relative z-20 flex items-center gap-2 md:gap-3">
        {!onFlowPage && (
          <Button
            variant="ghost"
            className="hidden h-10 rounded-xl px-4 text-sm font-medium text-white/75 hover:bg-white/[0.08] hover:text-white md:inline-flex"
          >
            {isZh ? "\u4ef7\u683c\u65b9\u6848" : "Pricing"}
          </Button>
        )}

        {!onFlowPage && (
          <DropdownMenu open={isLanguageMenuOpen} onOpenChange={setIsLanguageMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-10 touch-manipulation select-none items-center gap-1 rounded-xl border border-white/15 px-3 text-sm font-medium text-white/90 hover:bg-white/[0.08] hover:text-white active:scale-100"
                onContextMenu={(event) => event.preventDefault()}
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
              >
                <span>{lang}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 opacity-65 transition-transform duration-200",
                    isLanguageMenuOpen && "rotate-180",
                  )}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-white/10 bg-[#111] text-white">
              <DropdownMenuItem
                onClick={() => changeLanguage("zh-CN")}
                className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
              >
                {"\u4e2d\u6587 (CN)"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage("en")}
                className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
              >
                English (EN)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isAuthenticated && userData && !onFlowPage ? (
          <>
            <TeamMenu />
            <DropdownMenu open={isAvatarMenuOpen} onOpenChange={setIsAvatarMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  data-testid="avatar-menu-trigger"
                  className="h-10 w-10 rounded-full border border-white/15 p-0 hover:bg-white/[0.08] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={userData.profile_image ?? ""} alt={username} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-xs text-white">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 border-white/10 bg-[#1E1E20] p-0 text-white shadow-xl"
                sideOffset={8}
              >
                <div className="flex items-center gap-3 px-4 py-4">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={userData.profile_image ?? ""} alt={username} />
                    <AvatarFallback className="bg-[#44444C] text-sm font-semibold text-white">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">{username}</span>
                    <span className="text-xs text-[#A0A0A0]">
                      {userData.is_superuser
                        ? isZh
                          ? "\u8d85\u7ea7\u7ba1\u7406\u5458"
                          : "Superuser"
                        : isZh
                          ? "\u666e\u901a\u7528\u6237"
                          : "User"}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator className="mx-4 my-0 bg-[#333338]" />
                <DropdownMenuItem
                  onClick={() => {
                    handleOpenNotificationPanel();
                  }}
                  data-testid="avatar-notification-menu-item"
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-white hover:bg-[#2D2D30] focus:bg-[#2D2D30]"
                >
                  <div className="relative">
                    <Bell className="h-4 w-4 text-[#A0A0A0]" />
                    {hasNotificationDot ? (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
                    ) : null}
                  </div>
                  <span>{isZh ? "\u6211\u7684\u901a\u77e5" : "My Notifications"}</span>
                </DropdownMenuItem>
                {canReview && (
                  <DropdownMenuItem
                    onClick={() => {
                      setIsAvatarMenuOpen(false);
                      navigate("/admin/community");
                    }}
                    data-testid="avatar-moderation-menu-item"
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-white hover:bg-[#2D2D30] focus:bg-[#2D2D30]"
                  >
                    <Shield className="h-4 w-4 text-[#A0A0A0]" />
                    <span>{isZh ? "\u5185\u5bb9\u5ba1\u6838" : "Content Moderation"}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setIsAvatarMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-white hover:bg-[#2D2D30] focus:bg-[#2D2D30]"
                >
                  <User className="h-4 w-4 text-[#A0A0A0]" />
                  <span>{isZh ? "\u4e2a\u4eba\u4e3b\u9875" : "Profile"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setIsAvatarMenuOpen(false);
                    navigate("/settings/general");
                  }}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-white hover:bg-[#2D2D30] focus:bg-[#2D2D30]"
                >
                  <Settings className="h-4 w-4 text-[#A0A0A0]" />
                  <span>{isZh ? "\u8d26\u6237\u8bbe\u7f6e" : "Account Settings"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setIsAvatarMenuOpen(false);
                    window.open("https://docs.langflow.org", "_blank");
                  }}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-white hover:bg-[#2D2D30] focus:bg-[#2D2D30]"
                >
                  <HelpCircle className="h-4 w-4 text-[#A0A0A0]" />
                  <span>{isZh ? "\u4f7f\u7528\u6559\u7a0b" : "Tutorial"}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="mx-4 my-0 bg-[#333338]" />
                <DropdownMenuItem
                  onClick={() => {
                    setIsAvatarMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-[#2D2D30] focus:bg-[#2D2D30]"
                >
                  <LogOut className="h-4 w-4 text-red-400" />
                  <span>{isZh ? "\u9000\u51fa\u8d26\u53f7" : "Log Out"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : !onFlowPage ? (
          <Button
            unstyled
            onClick={() => navigate("/login")}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700"
          >
            {isZh ? "\u514d\u8d39\u4f53\u9a8c" : "Start for Free"}
          </Button>
        ) : null}

        {onFlowPage && (
          <div className="pointer-events-auto flex items-center gap-3">
            <Button
              variant="secondary"
              className="h-8 rounded-full px-4 text-sm font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:bg-[#3D3D42]"
              style={{ backgroundColor: "#2E2E32" }}
            >
              <IconComponent name="Sparkles" className="mr-1.5 h-4 w-4 text-yellow-500" />
              {"\u7075\u611f\u52a9\u624b"}
            </Button>
            <PublishDropdown />
          </div>
        )}
      </div>

      <NotificationPanel
        open={isNotificationPanelOpen}
        onOpenChange={setIsNotificationPanelOpen}
        isZh={isZh}
        title={isZh ? "\u6211\u7684\u901a\u77e5" : "Notifications"}
        emptyText={isZh ? "\u6682\u65e0\u65b0\u901a\u77e5" : "No notifications yet"}
        clearLabel={isZh ? "\u6e05\u7a7a\u901a\u77e5" : "Clear notifications"}
      />
    </header>
  );
};
