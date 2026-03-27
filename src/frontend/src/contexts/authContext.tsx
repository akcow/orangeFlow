import { createContext, useEffect, useState } from "react";
import {
  LANGFLOW_ACCESS_TOKEN,
  LANGFLOW_API_TOKEN,
  LANGFLOW_AUTO_LOGIN_OPTION,
  LANGFLOW_REFRESH_TOKEN,
} from "@/constants/constants";
import { useGetUserData } from "@/controllers/API/queries/auth";
import { useGetGlobalVariablesMutation } from "@/controllers/API/queries/variables/use-get-mutation-global-variables";
import useAuthStore from "@/stores/authStore";
import { cookieManager } from "@/utils/cookie-manager";
import { getSessionStorage, removeSessionStorage, setSessionStorage } from "@/utils/session-storage-util";
import { useStoreStore } from "../stores/storeStore";
import type { Users } from "../types/api";
import type { AuthContextType } from "../types/contexts/auth";

const initialValue: AuthContextType = {
  accessToken: null,
  login: () => {},
  userData: null,
  setUserData: () => {},
  authenticationErrorCount: 0,
  setApiKey: () => {},
  apiKey: null,
  getUser: () => {},
  clearAuthSession: () => {},
};

export const AuthContext = createContext<AuthContextType>(initialValue);

export function AuthProvider({ children }): React.ReactElement {
  const [accessToken, setAccessToken] = useState<string | null>(
    getSessionStorage(LANGFLOW_ACCESS_TOKEN) ?? null,
  );
  const [userData, setUserData] = useState<Users | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(
    cookieManager.get(LANGFLOW_API_TOKEN!) ?? null,
  );

  const checkHasStore = useStoreStore((state) => state.checkHasStore);
  const fetchApiData = useStoreStore((state) => state.fetchApiData);
  const setIsAuthenticated = useAuthStore((state) => state.setIsAuthenticated);

  const { mutate: mutateLoggedUser } = useGetUserData();
  const { mutate: mutateGetGlobalVariables } = useGetGlobalVariablesMutation();

  useEffect(() => {
    const storedAccessToken = getSessionStorage(LANGFLOW_ACCESS_TOKEN);
    if (storedAccessToken) {
      setAccessToken(storedAccessToken);
      useAuthStore.getState().setAccessToken(storedAccessToken);
    }
  }, []);

  useEffect(() => {
    const storedApiKey = cookieManager.get(LANGFLOW_API_TOKEN);
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }
  }, []);

  function getUser() {
    mutateLoggedUser(
      {},
      {
        onSuccess: async (user) => {
          setUserData(user);
          const isSuperUser = user!.is_superuser;
          useAuthStore.getState().setIsAdmin(isSuperUser);
          checkHasStore();
          fetchApiData();
        },
        onError: () => {
          setUserData(null);
        },
      },
    );
  }

  function login(
    newAccessToken: string,
    autoLogin: string,
    _refreshToken?: string,
  ) {
    cookieManager.set(LANGFLOW_AUTO_LOGIN_OPTION, autoLogin);
    setSessionStorage(LANGFLOW_ACCESS_TOKEN, newAccessToken);
    setAccessToken(newAccessToken);
    useAuthStore.getState().setAccessToken(newAccessToken);

    let userLoaded = false;
    let userAuthenticated = false;
    let variablesLoaded = false;
    let retryCount = 0;
    const MAX_RETRIES = 20;

    const checkAndSetAuthenticated = () => {
      if (userLoaded && variablesLoaded && userAuthenticated) {
        setIsAuthenticated(true);
      }
    };

    const executeAuthRequests = () => {
      mutateLoggedUser(
        {},
        {
          onSuccess: async (user) => {
            if (!user) {
              setUserData(null);
              userLoaded = true;
              clearAuthSession();
              return;
            }
            setUserData(user);
            const isSuperUser = user!.is_superuser;
            useAuthStore.getState().setIsAdmin(isSuperUser);
            checkHasStore();
            fetchApiData();
            userAuthenticated = true;
            userLoaded = true;
            checkAndSetAuthenticated();
          },
          onError: () => {
            setUserData(null);
            userLoaded = true;
            clearAuthSession();
          },
        },
      );

      mutateGetGlobalVariables(
        {},
        {
          onSettled: () => {
            variablesLoaded = true;
            checkAndSetAuthenticated();
          },
        },
      );
    };

    // Wait until the in-tab token cache is persisted before firing follow-up requests.
    const verifyAndProceed = () => {
      const storedToken = getSessionStorage(LANGFLOW_ACCESS_TOKEN);
      if (storedToken) {
        executeAuthRequests();
      } else if (retryCount < MAX_RETRIES) {
        retryCount++;
        setTimeout(verifyAndProceed, 50);
      } else {
        // Proceed anyway after timeout to avoid blocking login
        executeAuthRequests();
      }
    };

    setTimeout(verifyAndProceed, 50);
  }

  function clearAuthSession() {
    cookieManager.clearAuthCookies();
    removeSessionStorage(LANGFLOW_ACCESS_TOKEN);
    localStorage.removeItem(LANGFLOW_ACCESS_TOKEN);
    localStorage.removeItem(LANGFLOW_API_TOKEN);
    localStorage.removeItem(LANGFLOW_REFRESH_TOKEN);
    setAccessToken(null);
    setApiKey(null);
    setUserData(null);
    setIsAuthenticated(false);
    useAuthStore.getState().setAccessToken(null);
  }

  return (
    // !! to convert string to boolean
    <AuthContext.Provider
      value={{
        accessToken,
        login,
        setUserData,
        userData,
        authenticationErrorCount: 0,
        setApiKey,
        apiKey,
        getUser,
        clearAuthSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
