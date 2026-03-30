import type { UseMutationResult } from "@tanstack/react-query";
import useAlertStore from "@/stores/alertStore";
import type { useMutationFunctionType } from "@/types/api";
import type {
  ProviderRelay,
  UpdateProviderRelayRequest,
} from "@/types/providerRelays";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type ApiRequestError = {
  response?: { data?: { detail?: unknown } };
  message?: string;
};

type Variables = {
  relayId: string;
  payload: UpdateProviderRelayRequest;
};

export const useUpdateProviderRelay: useMutationFunctionType<
  undefined,
  Variables,
  ProviderRelay
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const mutation: UseMutationResult<ProviderRelay, ApiRequestError, Variables> = mutate(
    ["useUpdateProviderRelay"],
    async ({ relayId, payload }) => {
      const res = await api.patch(`${getURL("PROVIDER_RELAYS")}/${relayId}`, payload);
      return res.data;
    },
    {
      ...options,
      onSuccess: (data, variables, context) => {
        setSuccessData({ title: "供应商线路已更新" });
        queryClient.invalidateQueries({ queryKey: ["useGetProviderRelays"] });
        options?.onSuccess?.(data, variables, context);
      },
      onError: (error: ApiRequestError, variables, context) => {
        const detail =
          error?.response?.data?.detail ??
          error?.message ??
          "更新供应商线路失败";
        setErrorData({
          title: "更新供应商线路失败",
          list: [typeof detail === "string" ? detail : JSON.stringify(detail)],
        });
        options?.onError?.(error, variables, context);
      },
    },
  );

  return mutation;
};
