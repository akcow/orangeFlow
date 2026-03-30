import type { UseQueryResult } from "@tanstack/react-query";
import useAuthStore from "@/stores/authStore";
import type { useQueryFunctionType } from "@/types/api";
import type { ProviderRelay } from "@/types/providerRelays";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetProviderRelaysQuery: useQueryFunctionType<
  undefined,
  ProviderRelay[]
> = (options?) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const fetchProviderRelays = async (): Promise<ProviderRelay[]> => {
    if (!isAuthenticated) return [];
    const res = await api.get(getURL("PROVIDER_RELAYS"));
    return res.data;
  };

  const queryResult: UseQueryResult<ProviderRelay[], Error> = query(
    ["useGetProviderRelays"],
    fetchProviderRelays,
    {
      refetchOnWindowFocus: false,
      enabled: isAuthenticated && (options?.enabled ?? true),
      retry: options?.retry ?? 0,
      ...options,
    },
  );

  return queryResult;
};
