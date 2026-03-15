import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type ReadAllResponse = {
  updated_count: number;
};

export const useReadAllNotifications: useMutationFunctionType<
  undefined,
  void,
  ReadAllResponse
> = (options) => {
  const { mutate } = UseRequestProcessor();

  const readAllNotifications = async (): Promise<ReadAllResponse> => {
    const res = await api.post(`${getURL("NOTIFICATIONS")}/mine/read-all`);
    return res.data;
  };

  const mutation: UseMutationResult<ReadAllResponse, any, void> = mutate(
    ["notifications"],
    readAllNotifications,
    options,
  );

  return mutation;
};
