import type { TeamMemberRecord, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type GetTeamMembersParams = {
  teamId: string;
};

export const useGetTeamMembersQuery: useQueryFunctionType<
  GetTeamMembersParams,
  TeamMemberRecord[]
> = (params, options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const getTeamMembers = async (): Promise<TeamMemberRecord[]> => {
    const res = await api.get(`${getURL("TEAMS")}/${params.teamId}/members`);
    return res.data;
  };

  return query(["teams", params.teamId, "members"], getTeamMembers, {
    refetchOnWindowFocus: false,
    enabled:
      isAuthenticated &&
      Boolean(params.teamId) &&
      (options?.enabled ?? true),
    ...options,
  });
};
