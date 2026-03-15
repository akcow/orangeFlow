import type { useQueryFunctionType, UserNotification } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetMyNotificationsQuery: useQueryFunctionType<
  undefined,
  UserNotification[]
> = (options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getMyNotifications = async (): Promise<UserNotification[]> => {
    const res = await api.get(`${getURL("NOTIFICATIONS")}/mine`);
    return res.data;
  };

  return query(["notifications", "mine"], getMyNotifications, {
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });
};
