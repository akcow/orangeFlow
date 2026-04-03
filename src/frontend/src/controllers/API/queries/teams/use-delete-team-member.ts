import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type DeleteTeamMemberPayload = {
  userId: string;
};

export const useDeleteTeamMember: useMutationFunctionType<
  string,
  DeleteTeamMemberPayload,
  void
> = (teamId, options) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const deleteTeamMember = async ({
    userId,
  }: DeleteTeamMemberPayload): Promise<void> => {
    await api.delete(`${getURL("TEAMS")}/${teamId}/members/${userId}`);
  };

  const mutation: UseMutationResult<void, any, DeleteTeamMemberPayload> = mutate(
    ["teams", teamId, "members", "delete"],
    deleteTeamMember,
    {
      ...options,
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        queryClient.invalidateQueries({
          queryKey: ["teams", teamId, "members"],
        });
        queryClient.invalidateQueries({
          queryKey: ["teams", teamId, "user-search"],
        });
        options?.onSuccess?.(data, variables, context);
      },
    },
  );

  return mutation;
};
