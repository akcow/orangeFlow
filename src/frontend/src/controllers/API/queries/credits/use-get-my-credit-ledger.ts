import type { CreditLedgerEntry, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";
import { useCreditsRefresh } from "./use-credits-refresh";

type Params = {
  limit?: number;
};

export const useGetMyCreditLedgerQuery: useQueryFunctionType<Params, CreditLedgerEntry[]> = (
  params,
  options,
) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const limit = params?.limit ?? 20;

  const getMyCreditLedger = async (): Promise<CreditLedgerEntry[]> => {
    const res = await api.get(`${getURL("CREDITS")}/me/ledger`, {
      params: { limit },
    });
    return res.data;
  };

  const result = query(["credits", "me", "ledger", limit], getMyCreditLedger, {
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });

  useCreditsRefresh(() => {
    void result.refetch();
  }, !!result.isFetched && !!isAuthenticated && (options?.enabled ?? true));

  return result;
};
