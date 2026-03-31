import type { UseMutationResult } from "@tanstack/react-query";
import type { IssueFeedback, useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type CreateIssueFeedbackPayload = {
  description: string;
  files?: File[];
};

export const useCreateIssueFeedback: useMutationFunctionType<
  undefined,
  CreateIssueFeedbackPayload,
  IssueFeedback
> = (options) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const createIssueFeedback = async (
    payload: CreateIssueFeedbackPayload,
  ): Promise<IssueFeedback> => {
    const formData = new FormData();
    formData.append("description", payload.description);
    (payload.files ?? []).forEach((file) => {
      formData.append("files", file);
    });

    const res = await api.post(`${getURL("FEEDBACK")}/`, formData);
    return res.data;
  };

  const mutation: UseMutationResult<
    IssueFeedback,
    any,
    CreateIssueFeedbackPayload
  > = mutate(["feedback"], createIssueFeedback, {
    ...options,
    onSettled: (data, error, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["feedback", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["feedback", "admin"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "mine"] });
      options?.onSettled?.(data, error, variables, context);
    },
  });

  return mutation;
};
