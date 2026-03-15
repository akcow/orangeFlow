import type { UseMutationResult } from "@tanstack/react-query";
import type {
  CreateAdminNotificationPayload,
  CreateAdminNotificationResponse,
  useMutationFunctionType,
} from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useCreateAdminNotification: useMutationFunctionType<
  undefined,
  CreateAdminNotificationPayload,
  CreateAdminNotificationResponse
> = (options) => {
  const { mutate } = UseRequestProcessor();

  const createAdminNotification = async (
    payload: CreateAdminNotificationPayload,
  ): Promise<CreateAdminNotificationResponse> => {
    const res = await api.post(`${getURL("NOTIFICATIONS")}/`, payload);
    return res.data;
  };

  const mutation: UseMutationResult<
    CreateAdminNotificationResponse,
    any,
    CreateAdminNotificationPayload
  > = mutate(["notifications"], createAdminNotification, options);

  return mutation;
};
