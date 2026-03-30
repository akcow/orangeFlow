import type { UseMutationResult } from "@tanstack/react-query";
import useAlertStore from "@/stores/alertStore";
import type { useMutationFunctionType } from "@/types/api";
import type {
  ProviderRelay,
  ReorderProviderRelaysRequest,
} from "@/types/providerRelays";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type ApiRequestError = {
  response?: { data?: { detail?: unknown } };
  message?: string;
};

export const useReorderProviderRelays: useMutationFunctionType<
  undefined,
  ReorderProviderRelaysRequest,
  ProviderRelay[]
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const mutation: UseMutationResult<
    ProviderRelay[],
    ApiRequestError,
    ReorderProviderRelaysRequest
  > = mutate(
    ["useReorderProviderRelays"],
    async (payload) => {
      const res = await api.post(`${getURL("PROVIDER_RELAYS")}/reorder`, payload);
      return res.data;
    },
    {
      ...options,
      onSuccess: (data, variables, context) => {
        setSuccessData({ title: "线路排序已更新" });
        queryClient.invalidateQueries({ queryKey: ["useGetProviderRelays"] });
        options?.onSuccess?.(data, variables, context);
      },
      onError: (error: ApiRequestError, variables, context) => {
        const detail =
          error?.response?.data?.detail ??
          error?.message ??
          "更新线路排序失败";
        setErrorData({
          title: "更新线路排序失败",
          list: [typeof detail === "string" ? detail : JSON.stringify(detail)],
        });
        options?.onError?.(error, variables, context);
      },
    },
  );

  return mutation;
};
