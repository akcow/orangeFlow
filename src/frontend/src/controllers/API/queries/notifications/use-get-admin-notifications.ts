import type {
  AdminNotificationHistoryItem,
  useQueryFunctionType,
} from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetAdminNotificationsQuery: useQueryFunctionType<
  undefined,
  AdminNotificationHistoryItem[]
> = (options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getAdminNotifications = async (): Promise<AdminNotificationHistoryItem[]> => {
    const res = await api.get(`${getURL("NOTIFICATIONS")}/admin`);
    return res.data;
  };

  return query(["notifications", "admin"], getAdminNotifications, {
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });
};
