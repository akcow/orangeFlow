import { LANGFLOW_ACCESS_TOKEN } from "@/constants/constants";
import { cookieManager } from "@/utils/cookie-manager";

export const customGetAccessToken = () => {
  // Prefer cookies, but fall back to localStorage for setups where the backend sets
  // HttpOnly cookies (unreadable by JS) while still returning the token in the
  // /login response body.
  const fromCookie = cookieManager.get(LANGFLOW_ACCESS_TOKEN);
  if (fromCookie) return fromCookie;

  try {
    return localStorage.getItem(LANGFLOW_ACCESS_TOKEN) ?? undefined;
  } catch {
    return undefined;
  }
};
