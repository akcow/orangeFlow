import * as Form from "@radix-ui/react-form";
import { ChevronDown } from "lucide-react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import IconComponent from "@/components/common/genericIconComponent";
import InputComponent from "@/components/core/parameterRenderComponent/components/inputComponent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useLoginUser } from "@/controllers/API/queries/auth";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { useSanitizeRedirectUrl } from "@/hooks/use-sanitize-redirect-url";
import { t } from "@/i18n/t";
import { SIGNIN_ERROR_ALERT } from "../../constants/alerts_constants";
import { CONTROL_LOGIN_STATE } from "../../constants/constants";
import { AuthContext } from "../../contexts/authContext";
import useAlertStore from "../../stores/alertStore";
import type { LoginType } from "../../types/api";
import type {
  inputHandlerEventType,
  loginInputStateType,
} from "../../types/components";
import { cn } from "../../utils/utils";

export default function LoginPage(): JSX.Element {
  const [inputState, setInputState] =
    useState<loginInputStateType>(CONTROL_LOGIN_STATE);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);
  const [wordmarkLoadFailed, setWordmarkLoadFailed] = useState(false);

  const { username, password, rememberMe } = inputState;

  useSanitizeRedirectUrl();

  const navigate = useCustomNavigate();
  const { login, clearAuthSession } = useContext(AuthContext);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const { mutate, isPending } = useLoginUser();
  const { i18n } = useTranslation();

  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const lang = isZh ? "CN" : "EN";
  const title = isZh ? "登录" : "Sign in";
  const subtitle = isZh ? "登录到 OrangeFlow" : "Sign in to OrangeFlow";
  const emailPlaceholder = isZh ? "邮箱地址" : "Email address";
  const usernameRequired = isZh
    ? "请输入邮箱地址"
    : "Please enter your email address";
  const usernameInvalid = isZh
    ? "请输入有效的邮箱地址"
    : "Please enter a valid email address";
  const rememberMeLabel = isZh ? "记住我" : "Remember me";
  const rememberMeHint = isZh
    ? "在这台设备上保持登录状态"
    : "Keep me signed in on this device";

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

  function signIn() {
    const user: LoginType = {
      username: username.trim(),
      password: password.trim(),
      remember_me: rememberMe,
    };

    mutate(user, {
      onSuccess: (data) => {
        clearAuthSession();
        login(data.access_token, "login", data.refresh_token);
      },
      onError: (error) => {
        setErrorData({
          title: SIGNIN_ERROR_ALERT,
          list: [error["response"]?.["data"]?.["detail"] ?? "Sign in failed"],
        });
      },
    });
  }

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center bg-black text-white">
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
            <span className="text-[17px] font-semibold tracking-wide text-white">
              OrangeFlow
            </span>
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

      <div className="absolute right-6 top-6 flex items-center">
        <DropdownMenu
          open={isLanguageMenuOpen}
          onOpenChange={setIsLanguageMenuOpen}
        >
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
          <DropdownMenuContent
            align="end"
            className="border-white/10 bg-[#111] text-white"
          >
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
          event.preventDefault();
          if (password === "" || isPending) {
            return;
          }
          signIn();
        }}
        className="w-full max-w-[400px] px-6"
      >
        <div className="flex flex-col items-center">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mb-8 text-[14px] text-white/50">{subtitle}</p>

          <div className="w-full space-y-4">
            <Form.Field name="username" className="w-full">
              <Form.Control asChild>
                <Input
                  type="text"
                  onChange={({ target: { value } }) => {
                    handleInput({ target: { name: "username", value } });
                  }}
                  value={username}
                  className="h-[52px] w-full rounded-2xl border-white/10 bg-white/5 px-4 text-white placeholder:text-white/30 hover:border-white/20 focus:border-white/30"
                  required
                  placeholder={emailPlaceholder}
                />
              </Form.Control>
              <Form.Message
                match="valueMissing"
                className="mt-1 text-xs text-red-500"
              >
                {usernameRequired}
              </Form.Message>
              <Form.Message
                match={(value) => {
                  if (!value) return false;
                  if (value.toLowerCase() === "admin") return false;
                  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                }}
                className="mt-1 text-xs text-red-500"
              >
                {usernameInvalid}
              </Form.Message>
            </Form.Field>

            <Form.Field name="password" className="w-full">
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
              <Form.Message
                className="mt-1 text-xs text-red-500"
                match="valueMissing"
              >
                {t("Please enter your password")}
              </Form.Message>
            </Form.Field>

            <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <label
                htmlFor="remember-me"
                className="flex cursor-pointer items-center gap-3"
              >
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => {
                    handleInput({
                      target: {
                        name: "rememberMe",
                        value: checked === true,
                      },
                    });
                  }}
                  className="border-white/30 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-white">
                    {rememberMeLabel}
                  </span>
                  <span className="text-xs text-white/45">
                    {rememberMeHint}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 w-full">
            <Form.Submit asChild>
              <Button
                unstyled
                className="inline-flex h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 text-[15px] font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-70"
                type="submit"
                disabled={isPending}
              >
                {t("Sign in")}
              </Button>
            </Form.Submit>
          </div>

          <div className="my-8 flex w-full items-center">
            <div className="h-[1px] flex-1 bg-white/10" />
            <div className="px-4 text-[13px] text-white/40">
              {isZh ? "或" : "Or"}
            </div>
            <div className="h-[1px] flex-1 bg-white/10" />
          </div>

          <div className="w-full">
            <Button
              unstyled
              className="inline-flex h-[52px] w-full items-center justify-center rounded-2xl border border-white/10 bg-transparent text-[15px] font-medium text-white transition-colors hover:bg-white/5"
              type="button"
            >
              <IconComponent name="Chrome" className="mr-2 h-5 w-5" />
              {isZh ? "使用 Google 登录" : "Continue with Google"}
            </Button>
          </div>

          <div className="mt-8 text-center text-[13px] text-white/40">
            {isZh ? "还没有账号？" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="text-white hover:underline"
            >
              {isZh ? "立即注册" : "Sign up"}
            </button>
          </div>
        </div>
      </Form.Root>
    </div>
  );
}
