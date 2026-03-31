import type { IssueFeedback, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetAdminIssueFeedbacksQuery: useQueryFunctionType<
  undefined,
  IssueFeedback[]
> = (options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getAdminIssueFeedbacks = async (): Promise<IssueFeedback[]> => {
    const res = await api.get(`${getURL("FEEDBACK")}/admin`);
    return res.data;
  };

  return query(["feedback", "admin"], getAdminIssueFeedbacks, {
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });
};
