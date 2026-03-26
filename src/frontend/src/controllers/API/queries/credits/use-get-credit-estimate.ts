import { useMemo } from "react";
import type {
  CreditEstimate,
  CreditEstimatePayload,
  useQueryFunctionType,
} from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetCreditEstimateQuery: useQueryFunctionType<
  CreditEstimatePayload,
  CreditEstimate | null
> = (payload, options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const payloadKey = useMemo(() => JSON.stringify(payload ?? {}), [payload]);
  const requestPayload = useMemo(
    () => JSON.parse(payloadKey || "{}") as CreditEstimatePayload,
    [payloadKey],
  );

  const getCreditEstimate = async (): Promise<CreditEstimate | null> => {
    if (!requestPayload?.node_payload) {
      return null;
    }
    const res = await api.post(`${getURL("CREDITS")}/estimate`, requestPayload);
    return res.data;
  };

  return query(
    ["credits", "estimate", payloadKey],
    getCreditEstimate,
    {
      refetchOnWindowFocus: false,
      enabled: isAuthenticated && Boolean(requestPayload?.node_payload) && (options?.enabled ?? true),
      ...options,
    },
  );
};
