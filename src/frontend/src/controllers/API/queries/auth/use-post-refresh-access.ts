import { IS_AUTO_LOGIN, LANGFLOW_ACCESS_TOKEN } from "@/constants/constants";
import useAuthStore from "@/stores/authStore";
import type { useMutationFunctionType } from "@/types/api";
import { setSessionStorage } from "@/utils/session-storage-util";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface IRefreshAccessToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const useRefreshAccessToken: useMutationFunctionType<
  undefined,
  undefined | void,
  IRefreshAccessToken
> = (options?) => {
  const { mutate } = UseRequestProcessor();
  const autoLogin = useAuthStore((state) => state.autoLogin);

  async function refreshAccess(): Promise<IRefreshAccessToken> {
    const res = await api.post<IRefreshAccessToken>(`${getURL("REFRESH")}`);
    useAuthStore.getState().setAccessToken(res.data.access_token);
    setSessionStorage(LANGFLOW_ACCESS_TOKEN, res.data.access_token);

    return res.data;
  }

  const mutation = mutate(["useRefreshAccessToken"], refreshAccess, {
    ...options,
    retry: (autoLogin ?? IS_AUTO_LOGIN) ? 0 : 2,
  });

  return mutation;
};
