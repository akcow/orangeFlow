import { CustomNavigate } from "@/customization/components/custom-navigate";
import useAuthStore from "@/stores/authStore";

export const ProtectedLoginRoute = ({ children }) => {
  const autoLogin = useAuthStore((state) => state.autoLogin);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const urlParams = new URLSearchParams(window.location.search);
  const forceLogin =
    urlParams.get("force") === "1" ||
    urlParams.get("force") === "true" ||
    urlParams.get("force_login") === "1" ||
    urlParams.get("force_login") === "true";

  // Allow users to reach the login pages even if a stale/invalid auth cookie exists.
  // Useful for switching accounts or recovering from invalid sessions.
  // Once the user is authenticated, fall back to normal redirect behavior.
  if (forceLogin && !isAuthenticated && autoLogin !== true) {
    return children;
  }

  if (autoLogin === true || isAuthenticated) {
    const redirectPath = urlParams.get("redirect");

    if (redirectPath) {
      return <CustomNavigate to={redirectPath} replace />;
    }
    return <CustomNavigate to="/home" replace />;
  }

  return children;
};
