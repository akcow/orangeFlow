import type { CreditAccount, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";
import { useCreditsRefresh } from "./use-credits-refresh";

export const useGetMyCreditsQuery: useQueryFunctionType<undefined, CreditAccount> = (options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getMyCredits = async (): Promise<CreditAccount> => {
    const res = await api.get(`${getURL("CREDITS")}/me`);
    return res.data;
  };

  const result = query(["credits", "me"], getMyCredits, {
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });

  useCreditsRefresh(() => {
    void result.refetch();
  }, !!result.isFetched && !!isAuthenticated && (options?.enabled ?? true));

  return result;
};
