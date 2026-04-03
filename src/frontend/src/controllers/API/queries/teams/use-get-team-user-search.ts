import type { TeamUserSearchResult, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type SearchTeamUsersParams = {
  teamId: string;
  query: string;
};

export const useSearchTeamUsersQuery: useQueryFunctionType<
  SearchTeamUsersParams,
  TeamUserSearchResult[]
> = (params, options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const normalizedQuery = params.query.trim();

  const searchTeamUsers = async (): Promise<TeamUserSearchResult[]> => {
    const res = await api.get(`${getURL("TEAMS")}/${params.teamId}/search-users`, {
      params: { query: normalizedQuery },
    });
    return res.data;
  };

  return query(
    ["teams", params.teamId, "user-search", normalizedQuery],
    searchTeamUsers,
    {
      refetchOnWindowFocus: false,
      enabled:
        isAuthenticated &&
        Boolean(params.teamId) &&
        normalizedQuery.length > 0 &&
        (options?.enabled ?? true),
      ...options,
    },
  );
};
