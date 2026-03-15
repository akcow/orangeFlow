import type { TeamSummary, useQueryFunctionType } from "@/types/api";
import useAuthStore from "@/stores/authStore";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type GetTeamsParams = {
  includeAll?: boolean;
};

export const useGetTeamsQuery: useQueryFunctionType<
  GetTeamsParams,
  TeamSummary[]
> = (params, options) => {
  const { query } = UseRequestProcessor();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const includeAll = params?.includeAll ?? false;

  const getTeams = async (): Promise<TeamSummary[]> => {
    const querySuffix = includeAll ? "?include_all=true" : "";
    const res = await api.get(`${getURL("TEAMS")}/${querySuffix}`);
    return res.data;
  };

  return query(["teams", includeAll ? "all" : "mine"], getTeams, {
    refetchOnWindowFocus: false,
    enabled: isAuthenticated && (options?.enabled ?? true),
    ...options,
  });
};
