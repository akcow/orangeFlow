import type { UseMutationResult } from "@tanstack/react-query";
import type {
  TeamCreditLimitInterval,
  TeamCreditLimitKind,
  TeamMemberRecord,
  TeamRole,
  useMutationFunctionType,
} from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type UpdateTeamMemberRolePayload = {
  userId: string;
  role?: TeamRole;
  credit_limit?: number | null;
  credit_limit_kind?: TeamCreditLimitKind | null;
  credit_limit_interval?: TeamCreditLimitInterval | null;
};

export const useUpdateTeamMemberRole: useMutationFunctionType<
  string,
  UpdateTeamMemberRolePayload,
  TeamMemberRecord
> = (teamId, options) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const updateTeamMemberRole = async ({
    userId,
    ...payload
  }: UpdateTeamMemberRolePayload): Promise<TeamMemberRecord> => {
    const res = await api.patch(
      `${getURL("TEAMS")}/${teamId}/members/${userId}`,
      payload,
    );
    return res.data;
  };

  const mutation: UseMutationResult<
    TeamMemberRecord,
    any,
    UpdateTeamMemberRolePayload
  > = mutate(["teams", teamId, "members"], updateTeamMemberRole, {
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] });
      options?.onSuccess?.(data, variables, context);
    },
  });

  return mutation;
};
