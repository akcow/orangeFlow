import type { AxiosError } from "axios";
import { useContext, useRef } from "react";
import {
  AUTO_LOGIN_MAX_RETRY_DELAY,
  AUTO_LOGIN_RETRY_DELAY,
  IS_AUTO_LOGIN,
} from "@/constants/constants";
import { AuthContext } from "@/contexts/authContext";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAuthStore from "@/stores/authStore";
import { useStoreStore } from "@/stores/storeStore";
import type { Users, useQueryFunctionType } from "../../../../types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";
import { useLogout } from "./use-post-logout";

export interface AutoLoginResponse {
  frontend_timeout: number;
  auto_saving: boolean;
  auto_saving_interval: number;
  health_check_max_retries: number;
}

export const isAutoLoginDisabledError = (error: unknown): boolean => {
  const axiosError = error as AxiosError<{
    detail?: { auto_login?: boolean };
  }>;

  return axiosError?.response?.data?.detail?.auto_login === false;
};

export async function restoreManualSession(
  onRestored: (user: Users) => void,
): Promise<boolean> {
  try {
    const response = await api.get<Users>(`${getURL("USERS")}/whoami`);
    if (!response.data) {
      return false;
    }
    onRestored(response.data);
    return true;
  } catch {
    return false;
  }
}

export const useGetAutoLogin: useQueryFunctionType<undefined, undefined> = (
  options,
) => {
  const { query } = UseRequestProcessor();
  const { login, setUserData, getUser } = useContext(AuthContext);
  const setAutoLogin = useAuthStore((state) => state.setAutoLogin);
  const isLoginPage = location.pathname.includes("login");
  const navigate = useCustomNavigate();
  const { mutateAsync: mutationLogout } = useLogout();

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const restoreCookieBackedSession = async () => {
    return restoreManualSession((user) => {
      setUserData(user);

      const authStore = useAuthStore.getState();
      authStore.setUserData(user);
      authStore.setIsAdmin(Boolean(user.is_superuser));
      authStore.setIsAuthenticated(true);

      useStoreStore.getState().checkHasStore();
      void useStoreStore.getState().fetchApiData();
    });
  };

  async function getAutoLoginFn(): Promise<null> {
    try {
      // Manual-login mode: don't hit the backend auto_login endpoint.
      if (!IS_AUTO_LOGIN) {
        resetTimer();
        setAutoLogin(false);
        const restoredSession = await restoreCookieBackedSession();
        if (restoredSession) {
          return null;
        }
        if (!isLoginPage) {
          await handleAutoLoginError({ forceManualLogin: true });
        }
        return null;
      }

      const response = await api.get<Users>(`${getURL("AUTOLOGIN")}`);
      const user = response.data;
      if (user && user["access_token"]) {
        user["refresh_token"] = "auto";
        login(user["access_token"], "auto");
        setUserData(user);
        setAutoLogin(true);
        resetTimer();
      }
    } catch (e) {
      const error = e as AxiosError;
      if (error.name !== "CanceledError") {
        const autoLoginDisabled = isAutoLoginDisabledError(error);

        if (autoLoginDisabled || !IS_AUTO_LOGIN) {
          resetTimer();
          setAutoLogin(false);
        }

        if (!isLoginPage) {
          await handleAutoLoginError({
            forceManualLogin: autoLoginDisabled,
          });
        }
      }
    }
    return null;
  }

  const resetTimer = () => {
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const handleAutoLoginError = async ({
    forceManualLogin = false,
  }: {
    forceManualLogin?: boolean;
  } = {}) => {
    const { autoLogin, isAuthenticated } = useAuthStore.getState();
    const manualLoginMode =
      forceManualLogin || !IS_AUTO_LOGIN || autoLogin === false;

    if (!isAuthenticated && manualLoginMode) {
      await mutationLogout();
      const currentPath = window.location.pathname;
      const isHomePath = currentPath === "/" || currentPath === "/flows";
      navigate(
        "/login" +
          (!isHomePath && !isLoginPage ? "?redirect=" + currentPath : ""),
      );
    } else if (!isAuthenticated) {
      const retryCount = retryCountRef.current;
      const delay = Math.min(
        AUTO_LOGIN_RETRY_DELAY * 2 ** retryCount,
        AUTO_LOGIN_MAX_RETRY_DELAY,
      );

      retryCountRef.current += 1;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      retryTimerRef.current = setTimeout(() => {
        getAutoLoginFn();
      }, delay);
    } else {
      getUser();
    }
  };

  const queryResult = query(["useGetAutoLogin"], getAutoLoginFn, {
    refetchOnWindowFocus: false,
    retry: false,
    ...options,
  });

  return queryResult;
};
