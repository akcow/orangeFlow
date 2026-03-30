import type { UseMutationResult } from "@tanstack/react-query";
import useAlertStore from "@/stores/alertStore";
import type { useMutationFunctionType } from "@/types/api";
import type { DeleteProviderRelayResponse } from "@/types/providerRelays";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type ApiRequestError = {
  response?: { data?: { detail?: unknown } };
  message?: string;
};

type Variables = {
  relayId: string;
};

export const useDeleteProviderRelay: useMutationFunctionType<
  undefined,
  Variables,
  DeleteProviderRelayResponse
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const mutation: UseMutationResult<
    DeleteProviderRelayResponse,
    ApiRequestError,
    Variables
  > = mutate(
    ["useDeleteProviderRelay"],
    async ({ relayId }) => {
      const res = await api.delete(`${getURL("PROVIDER_RELAYS")}/${relayId}`);
      return res.data;
    },
    {
      ...options,
      onSuccess: (data, variables, context) => {
        setSuccessData({ title: "供应商线路已删除" });
        queryClient.invalidateQueries({ queryKey: ["useGetProviderRelays"] });
        options?.onSuccess?.(data, variables, context);
      },
      onError: (error: ApiRequestError, variables, context) => {
        const detail =
          error?.response?.data?.detail ??
          error?.message ??
          "删除供应商线路失败";
        setErrorData({
          title: "删除供应商线路失败",
          list: [typeof detail === "string" ? detail : JSON.stringify(detail)],
        });
        options?.onError?.(error, variables, context);
      },
    },
  );

  return mutation;
};
