import { LANGFLOW_ACCESS_TOKEN } from "@/constants/constants";
import useAuthStore from "@/stores/authStore";
import { cookieManager } from "@/utils/cookie-manager";
import { getSessionStorage } from "@/utils/session-storage-util";

export const customGetAccessToken = () => {
  const fromStore = useAuthStore.getState().accessToken;
  if (fromStore) return fromStore;

  const fromSession = getSessionStorage(LANGFLOW_ACCESS_TOKEN);
  if (fromSession) return fromSession;

  const fromCookie = cookieManager.get(LANGFLOW_ACCESS_TOKEN);
  if (fromCookie) return fromCookie;

  try {
    // Legacy fallback for sessions created before the auth storage hardening.
    return localStorage.getItem(LANGFLOW_ACCESS_TOKEN) ?? undefined;
  } catch {
    return undefined;
  }
};
