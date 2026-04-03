import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export const useLeaveTeam: useMutationFunctionType<string, void, void> = (
  teamId,
  options,
) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const leaveTeam = async (): Promise<void> => {
    await api.delete(`${getURL("TEAMS")}/${teamId}/leave`);
  };

  const mutation: UseMutationResult<void, any, void> = mutate(
    ["teams", teamId, "leave"],
    leaveTeam,
    {
      ...options,
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        queryClient.invalidateQueries({
          queryKey: ["teams", teamId, "members"],
        });
        options?.onSuccess?.(data, variables, context);
      },
    },
  );

  return mutation;
};
