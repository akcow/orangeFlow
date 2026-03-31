import type { UseMutationResult } from "@tanstack/react-query";
import type {
  IssueFeedback,
  UpdateIssueFeedbackPayload,
  useMutationFunctionType,
} from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type UpdateIssueFeedbackParams = {
  feedbackId: string;
  payload: UpdateIssueFeedbackPayload;
};

export const useUpdateIssueFeedback: useMutationFunctionType<
  undefined,
  UpdateIssueFeedbackParams,
  IssueFeedback
> = (options) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const updateIssueFeedback = async ({
    feedbackId,
    payload,
  }: UpdateIssueFeedbackParams): Promise<IssueFeedback> => {
    const res = await api.patch(`${getURL("FEEDBACK")}/${feedbackId}`, payload);
    return res.data;
  };

  const mutation: UseMutationResult<
    IssueFeedback,
    any,
    UpdateIssueFeedbackParams
  > = mutate(["feedback"], updateIssueFeedback, {
    ...options,
    onSettled: (data, error, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["feedback", "admin"] });
      queryClient.invalidateQueries({ queryKey: ["feedback", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "mine"] });
      options?.onSettled?.(data, error, variables, context);
    },
  });

  return mutation;
};
