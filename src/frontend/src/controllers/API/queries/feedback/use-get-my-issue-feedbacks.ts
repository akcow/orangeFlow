import type { IssueFeedback, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetMyIssueFeedbacksQuery: useQueryFunctionType<
  undefined,
  IssueFeedback[]
> = (options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getMyIssueFeedbacks = async (): Promise<IssueFeedback[]> => {
    const res = await api.get(`${getURL("FEEDBACK")}/mine`);
    return res.data;
  };

  return query(["feedback", "mine"], getMyIssueFeedbacks, {
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });
};
