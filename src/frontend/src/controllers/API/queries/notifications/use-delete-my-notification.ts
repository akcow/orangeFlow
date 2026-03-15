import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type HideNotificationParams = {
  recipientId: string;
};

type HideNotificationResponse = {
  detail: string;
};

export const useHideMyNotification: useMutationFunctionType<
  undefined,
  HideNotificationParams,
  HideNotificationResponse
> = (options) => {
  const { mutate } = UseRequestProcessor();

  const hideMyNotification = async ({
    recipientId,
  }: HideNotificationParams): Promise<HideNotificationResponse> => {
    const res = await api.delete(`${getURL("NOTIFICATIONS")}/mine/${recipientId}`);
    return res.data;
  };

  const mutation: UseMutationResult<
    HideNotificationResponse,
    any,
    HideNotificationParams
  > = mutate(["notifications"], hideMyNotification, options);

  return mutation;
};
