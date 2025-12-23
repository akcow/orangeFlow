import type { UseQueryResult } from "@tanstack/react-query";
import { DEFAULT_PROVIDER_KEY } from "@/constants/providerCredentials";
import useAuthStore from "@/stores/authStore";
import type { useQueryFunctionType } from "@/types/api";
import type { ProviderCredentialsResponse } from "@/types/providerCredentials";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetProviderCredentials: useQueryFunctionType<
  string | undefined,
  ProviderCredentialsResponse | null
> = (provider, options?) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const providerKey = provider?.trim() || DEFAULT_PROVIDER_KEY;

  const fetchProviderCredentials = async (): Promise<ProviderCredentialsResponse | null> => {
    if (!isAuthenticated) return null;
    const res = await api.get(`${getURL("PROVIDER_CREDENTIALS")}/${providerKey}`);
    return res.data;
  };

  const queryResult: UseQueryResult<ProviderCredentialsResponse | null, Error> = query(
    ["useGetProviderCredentials", providerKey],
    fetchProviderCredentials,
    {
      refetchOnWindowFocus: false,
      enabled: isAuthenticated && (options?.enabled ?? true),
      retry: options?.retry ?? 0,
      ...options,
    },
  );

  return queryResult;
};
