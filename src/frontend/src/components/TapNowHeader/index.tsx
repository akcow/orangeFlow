import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useAuthStore from "@/stores/authStore";
import { cn } from "@/utils/utils";

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
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [wordmarkLoadFailed, setWordmarkLoadFailed] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const activeNav = useMemo(() => getActiveNav(location.pathname), [location.pathname]);
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const lang = isZh ? "CN" : "EN";
  const username = userData?.username || (isZh ? "\u7528\u6237" : "User");
  const userInitial = username.slice(0, 1).toUpperCase();

  const navItems: Array<{ key: NavKey; label: string; to: string }> = [
    { key: "tv", label: "TapTV", to: "/community/tv" },
    {
      key: "templates",
      label: isZh ? "\u6A21\u677F\u5E93" : "Templates",
      to: "/community/workflows",
    },
    {
      key: "workspace",
      label: isZh ? "\u5DE5\u4F5C\u7A7A\u95F4" : "Workspace",
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

  return (
    <header
      data-testid={dataTestId}
      className="sticky top-0 z-50 flex h-[72px] w-full items-center justify-between border-b border-white/10 bg-black px-4 text-white md:px-8"
    >
      <div className="relative z-20 flex min-w-0 items-center gap-4 md:gap-8">
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
            <span className="text-xl font-semibold tracking-tight">TapNow</span>
          ) : (
            <img
              src="/branding/tapnow-wordmark.png?v=20260305"
              alt="TapNow"
              className="h-8 w-auto object-contain"
              onError={() => setWordmarkLoadFailed(true)}
            />
          )}
        </Link>

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
      </div>

      {centerContent ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block">
          <div className="pointer-events-auto">{centerContent}</div>
        </div>
      ) : null}

      <div className="relative z-20 flex items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          className="hidden h-10 rounded-xl px-4 text-sm font-medium text-white/75 hover:bg-white/[0.08] hover:text-white md:inline-flex"
        >
          {isZh ? "\u4EF7\u683C\u65B9\u6848" : "Pricing"}
        </Button>

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
              {"\u4E2D\u6587 (CN)"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeLanguage("en")}
              className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
            >
              English (EN)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isAuthenticated && userData ? (
          <>
            <DropdownMenu open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="hidden h-10 touch-manipulation select-none items-center gap-2 rounded-xl border border-white/15 bg-black px-3 text-white hover:bg-white/[0.08] active:scale-100 md:inline-flex"
                  onContextMenu={(event) => event.preventDefault()}
                  style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold">
                    {userInitial}
                  </span>
                  <span className="max-w-[180px] truncate text-sm font-medium">{username}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 opacity-65 transition-transform duration-200",
                      isUserMenuOpen && "rotate-180",
                    )}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#111] text-white">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{username}</p>
                    <p className="text-xs leading-none text-gray-400">
                      {userData.is_superuser
                        ? isZh
                          ? "\u8D85\u7EA7\u7BA1\u7406\u5458"
                          : "Superuser"
                        : isZh
                          ? "\u7528\u6237"
                          : "User"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={() => navigate("/settings/general")}
                  className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>{isZh ? "\u4E2A\u4EBA\u8D44\u6599" : "Profile"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/settings/general")}
                  className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{isZh ? "\u8BBE\u7F6E" : "Settings"}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-red-400 hover:bg-red-900/20 focus:bg-red-900/20"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{isZh ? "\u9000\u51FA\u767B\u5F55" : "Logout"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              onClick={() => navigate("/settings/general")}
              className="h-10 w-10 rounded-full border border-white/15 p-0 hover:bg-white/[0.08]"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={userData.profile_image ?? ""} alt={username} />
                <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-xs text-white">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </Button>
          </>
        ) : (
          <Button
            onClick={() => navigate("/login")}
            className="h-10 rounded-xl border border-white/10 bg-white px-5 text-black hover:bg-gray-200"
          >
            {isZh ? "\u767B\u5F55" : "Login"}
          </Button>
        )}
      </div>
    </header>
  );
};
