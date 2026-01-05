import type { UseMutationResult } from "@tanstack/react-query";
import { DEFAULT_PROVIDER_KEY } from "@/constants/providerCredentials";
import useAlertStore from "@/stores/alertStore";
import type { useMutationFunctionType } from "@/types/api";
import type {
  ProviderCredentialsResponse,
  ProviderCredentialsUpdateRequest,
} from "@/types/providerCredentials";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const usePutProviderCredentials: useMutationFunctionType<
  undefined,
  {
    provider?: string;
    payload: ProviderCredentialsUpdateRequest;
  }
  ,
  ProviderCredentialsResponse
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const mutation: UseMutationResult<
    ProviderCredentialsResponse,
    any,
    { provider?: string; payload: ProviderCredentialsUpdateRequest }
  > = mutate(
    ["usePutProviderCredentials"],
    async ({ provider, payload }) => {
      const providerKey = provider?.trim() || DEFAULT_PROVIDER_KEY;
      const res = await api.put(
        `${getURL("PROVIDER_CREDENTIALS")}/${providerKey}`,
        payload,
      );
      return res.data;
    },
    {
      ...options,
      onSuccess: (data, variables, context) => {
        setSuccessData({ title: "密钥已保存" });
        queryClient.invalidateQueries({
          queryKey: ["useGetProviderCredentials", variables.provider || DEFAULT_PROVIDER_KEY],
        });
        options?.onSuccess?.(data, variables, context);
      },
      onError: (error, variables, context) => {
        const detail =
          (error as any)?.response?.data?.detail ??
          (error as any)?.message ??
          (error as any)?.toString?.() ??
          "请稍后重试";
        const detailStr =
          typeof detail === "string" ? detail : JSON.stringify(detail);
        setErrorData({
          title: "保存密钥时出错",
          list: [detailStr],
        });
        options?.onError?.(error, variables, context);
      },
    },
  );

  return mutation;
};
