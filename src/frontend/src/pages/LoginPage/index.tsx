import * as Form from "@radix-ui/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useContext, useState } from "react";
import LangflowLogo from "@/assets/LangflowLogo.svg?react";
import { useLoginUser } from "@/controllers/API/queries/auth";
import { useSanitizeRedirectUrl } from "@/hooks/use-sanitize-redirect-url";
import { t } from "@/i18n/t";
import InputComponent from "../../components/core/parameterRenderComponent/components/inputComponent";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SIGNIN_ERROR_ALERT } from "../../constants/alerts_constants";
import { CONTROL_LOGIN_STATE } from "../../constants/constants";
import { AuthContext } from "../../contexts/authContext";
import useAlertStore from "../../stores/alertStore";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/utils";
import type { LoginType } from "../../types/api";
import type {
  inputHandlerEventType,
  loginInputStateType,
} from "../../types/components";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import IconComponent from "@/components/common/genericIconComponent";

export default function LoginPage(): JSX.Element {
  const [inputState, setInputState] =
    useState<loginInputStateType>(CONTROL_LOGIN_STATE);

  const { password, username } = inputState;

  useSanitizeRedirectUrl();

  const navigate = useCustomNavigate();
  const { login, clearAuthSession } = useContext(AuthContext);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const { i18n } = useTranslation();
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [wordmarkLoadFailed, setWordmarkLoadFailed] = useState(false);
  const [isSignTransitioning, setIsSignTransitioning] = useState(false);
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const lang = isZh ? "CN" : "EN";

  const changeLanguage = (nextLang: "zh-CN" | "en") => {
    void i18n.changeLanguage(nextLang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("langflow-language", nextLang);
    }
  };

  function handleInput({
    target: { name, value },
  }: inputHandlerEventType): void {
    setInputState((prev) => ({ ...prev, [name]: value }));
  }

  const { mutate, isPending } = useLoginUser();
  const queryClient = useQueryClient();

  function signIn() {
    const user: LoginType = {
      username: username.trim(),
      password: password.trim(),
    };

    mutate(user, {
      onSuccess: (data) => {
        setIsSignTransitioning(true);
        clearAuthSession();
        login(data.access_token, "login", data.refresh_token);
        // 立即主动跳转，不等 ProtectedLoginRoute 被动重定向
        navigate("/home", { replace: true });
      },
      onError: (error) => {
        setIsSignTransitioning(false);
        setErrorData({
          title: SIGNIN_ERROR_ALERT,
          list: [error["response"]?.["data"]?.["detail"] ?? "登录失败"],
        });
      },
    });
  }

  // 登录成功过渡中，保持黑屏不要闪白
  if (isSignTransitioning) {
    return <div className="flex h-screen w-full items-center justify-center bg-black" />;
  }

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center bg-black text-white">
      {/* 顶部返回 Logo 导航 */}
      <div className="absolute left-6 top-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="flex items-center gap-3 rounded-full px-3 py-1.5 transition-colors hover:bg-white/5"
        >
          {iconLoadFailed ? (
            <div className="h-8 w-8 rounded-2xl bg-[radial-gradient(circle_at_20%_20%,#FDE68A_0%,#60A5FA_35%,#A78BFA_65%,#F472B6_100%)] shadow-[0_0_16px_rgba(192,132,252,0.35)]" />
          ) : (
            <img
              src="/branding/orangeflow-icon-512.png?v=20260305"
              alt="OrangeFlow icon"
              className="h-8 w-8 rounded-2xl object-cover"
              onError={() => setIconLoadFailed(true)}
            />
          )}

          {wordmarkLoadFailed ? (
            <span className="text-[17px] font-semibold tracking-wide text-white">OrangeFlow</span>
          ) : (
            <img
              src="/branding/tapnow-wordmark.png?v=20260305"
              alt="OrangeFlow"
              className="h-7 w-auto object-contain"
              onError={() => setWordmarkLoadFailed(true)}
            />
          )}
        </button>
      </div>

      {/* 右上角多语言切换 */}
      <div className="absolute right-6 top-6 flex items-center">
        <DropdownMenu open={isLanguageMenuOpen} onOpenChange={setIsLanguageMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-10 touch-manipulation select-none items-center gap-1 rounded-xl border border-white/10 px-3 text-[14px] font-medium text-white/90 hover:bg-white/[0.08] hover:text-white"
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
              中文 (CN)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeLanguage("en")}
              className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
            >
              English (EN)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Form.Root
        onSubmit={(event) => {
          if (password === "" || isPending || isSignTransitioning) {
            event.preventDefault();
            return;
          }
          setIsSignTransitioning(true);
          signIn();
          event.preventDefault();
        }}
        className="w-full max-w-[400px] px-6"
      >
        <div className="flex flex-col items-center">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight">
            登录
          </h1>
          <p className="mb-8 text-[14px] text-white/50">
            欢迎回到 OrangeFlow
          </p>

          <div className="w-full space-y-4">
            <Form.Field name="username" className="w-full">
              <Form.Control asChild>
                <div className="relative">
                  <Input
                    type="text"
                    onChange={({ target: { value } }) => {
                      handleInput({ target: { name: "username", value } });
                    }}
                    value={username}
                    className="h-[52px] w-full rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/30 hover:border-white/20 focus:border-white/30"
                    required
                    placeholder="邮箱或管理员账号"
                  />
                  {username && (
                    <div className="absolute right-4 top-[17px] text-[12px] font-medium text-[#209CEE]">
                      编辑
                    </div>
                  )}
                </div>
              </Form.Control>
              <Form.Message match="valueMissing" className="mt-1 text-xs text-red-500">
                请输入您的账号或邮箱
              </Form.Message>
              <Form.Message 
                match={(value) => {
                  if (!value) return false;
                  if (value.toLowerCase() === "admin") return false;
                  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                }} 
                className="mt-1 text-xs text-red-500"
              >
                请输入有效的邮箱地址
              </Form.Message>
            </Form.Field>

            <Form.Field name="password" className="w-full">
              <div className="relative">
                <InputComponent
                  onChange={(value) => {
                    handleInput({ target: { name: "password", value } });
                  }}
                  value={password}
                  isForm
                  password={true}
                  required
                  placeholder={t("Password")}
                  className="h-[52px] w-full rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/30 hover:border-white/20 focus:border-white/30"
                />
              </div>
              <Form.Message className="mt-1 text-xs text-red-500" match="valueMissing">
                {t("Please enter your password")}
              </Form.Message>
            </Form.Field>
          </div>

          <div className="mt-6 w-full">
            <Form.Submit asChild>
              <Button
                unstyled
                className="inline-flex h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 text-[15px] font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:opacity-70 disabled:pointer-events-none"
                type="submit"
                disabled={isPending || isSignTransitioning}
              >
                {t("Sign in")}
              </Button>
            </Form.Submit>
          </div>

          <div className="my-8 flex w-full items-center">
            <div className="h-[1px] flex-1 bg-white/10"></div>
            <div className="px-4 text-[13px] text-white/40">或</div>
            <div className="h-[1px] flex-1 bg-white/10"></div>
          </div>

          <div className="w-full">
            <Button
              unstyled
              className="inline-flex h-[52px] w-full items-center justify-center rounded-2xl border border-white/10 bg-transparent text-[15px] font-medium text-white transition-colors hover:bg-white/5"
              type="button"
              onClick={() => {
                // UI 占位，等待接入真实 OAuth
              }}
            >
              <IconComponent name="Chrome" className="mr-2 h-5 w-5" />
              使用 Google 继续
            </Button>
          </div>

          <div className="mt-8 text-center text-[13px] text-white/40">
            还未拥有账户？{" "}
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="text-white hover:underline"
            >
              立刻注册
            </button>
          </div>
        </div>
      </Form.Root>
    </div>
  );
}
