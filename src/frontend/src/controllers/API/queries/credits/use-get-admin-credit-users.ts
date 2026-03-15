import type { CreditAdminUsersPage, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type Params = {
  skip?: number;
  limit?: number;
  search?: string;
};

export const useGetAdminCreditUsersQuery: useQueryFunctionType<Params, CreditAdminUsersPage> = (
  params,
  options,
) => {
  const { query } = UseRequestProcessor();
  const userData = useAuthStore((state) => state.userData);
  const skip = params?.skip ?? 0;
  const limit = params?.limit ?? 20;
  const search = params?.search ?? "";

  const getAdminCreditUsers = async (): Promise<CreditAdminUsersPage> => {
    const res = await api.get(`${getURL("CREDITS")}/admin/users`, {
      params: { skip, limit, search },
    });
    return res.data;
  };

  return query(["credits", "admin", "users", skip, limit, search], getAdminCreditUsers, {
    refetchOnWindowFocus: false,
    enabled: !!userData?.is_superuser && (options?.enabled ?? true),
    ...options,
  });
};
