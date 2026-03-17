import { useDeferredValue, useMemo } from "react";
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
  const deferredPayloadKey = useDeferredValue(payloadKey);
  const deferredPayload = useMemo(
    () => JSON.parse(deferredPayloadKey || "{}") as CreditEstimatePayload,
    [deferredPayloadKey],
  );

  const getCreditEstimate = async (): Promise<CreditEstimate | null> => {
    if (!deferredPayload?.node_payload) {
      return null;
    }
    const res = await api.post(`${getURL("CREDITS")}/estimate`, deferredPayload);
    return res.data;
  };

  return query(
    ["credits", "estimate", deferredPayloadKey],
    getCreditEstimate,
    {
      refetchOnWindowFocus: false,
      enabled: isAuthenticated && Boolean(deferredPayload?.node_payload) && (options?.enabled ?? true),
      ...options,
    },
  );
};
