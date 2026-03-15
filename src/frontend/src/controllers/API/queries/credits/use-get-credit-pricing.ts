import type { CreditPricingRule, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useGetCreditPricingQuery: useQueryFunctionType<undefined, CreditPricingRule[]> = (
  options,
) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getCreditPricing = async (): Promise<CreditPricingRule[]> => {
    const res = await api.get(`${getURL("CREDITS")}/pricing`);
    return res.data;
  };

  return query(["credits", "pricing"], getCreditPricing, {
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });
};
