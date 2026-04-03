import type { UseQueryResult } from "@tanstack/react-query";
import useAuthStore from "@/stores/authStore";
import type { useQueryFunctionType } from "@/types/api";
import type { ProviderRelayModelCatalogItem } from "@/types/providerRelays";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetProviderRelayModelCatalogQuery: useQueryFunctionType<
  undefined,
  ProviderRelayModelCatalogItem[]
> = (options?) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  const fetchModelCatalog = async (): Promise<ProviderRelayModelCatalogItem[]> => {
    if (!isAuthenticated || !isAdmin) return [];
    const res = await api.get(`${getURL("PROVIDER_RELAYS")}/model-catalog`);
    return res.data;
  };

  const queryResult: UseQueryResult<ProviderRelayModelCatalogItem[], Error> = query(
    ["useGetProviderRelayModelCatalog"],
    fetchModelCatalog,
    {
      refetchOnWindowFocus: false,
      enabled: isAuthenticated && isAdmin && (options?.enabled ?? true),
      retry: options?.retry ?? 0,
      ...options,
    },
  );

  return queryResult;
};
