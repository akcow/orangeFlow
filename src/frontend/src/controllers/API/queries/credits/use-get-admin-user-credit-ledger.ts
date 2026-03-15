import type { CreditLedgerEntry, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type Params = {
  userId: string;
  limit?: number;
};

export const useGetAdminUserCreditLedgerQuery: useQueryFunctionType<Params, CreditLedgerEntry[]> = (
  params,
  options,
) => {
  const { query } = UseRequestProcessor();
  const userData = useAuthStore((state) => state.userData);
  const limit = params.limit ?? 20;

  const getAdminUserCreditLedger = async (): Promise<CreditLedgerEntry[]> => {
    const res = await api.get(`${getURL("CREDITS")}/admin/users/${params.userId}/ledger`, {
      params: { limit },
    });
    return res.data;
  };

  return query(["credits", "admin", "users", params.userId, "ledger", limit], getAdminUserCreditLedger, {
    refetchOnWindowFocus: false,
    enabled: !!userData?.is_superuser && !!params.userId && (options?.enabled ?? true),
    ...options,
  });
};
