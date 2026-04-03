import type { UseMutationResult } from "@tanstack/react-query";
import type {
  TeamMemberRecord,
  TeamRole,
  useMutationFunctionType,
} from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type InviteTeamMemberPayload = {
  user_id: string;
  role?: TeamRole;
};

export const useInviteTeamMember: useMutationFunctionType<
  string,
  InviteTeamMemberPayload,
  TeamMemberRecord
> = (teamId, options) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const inviteTeamMember = async (
    payload: InviteTeamMemberPayload,
  ): Promise<TeamMemberRecord> => {
    const res = await api.post(`${getURL("TEAMS")}/${teamId}/invite`, payload);
    return res.data;
  };

  const mutation: UseMutationResult<
    TeamMemberRecord,
    any,
    InviteTeamMemberPayload
  > = mutate(["teams", teamId, "invite"], inviteTeamMember, {
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] });
      queryClient.invalidateQueries({
        queryKey: ["teams", teamId, "user-search"],
      });
      options?.onSuccess?.(data, variables, context);
    },
  });

  return mutation;
};
