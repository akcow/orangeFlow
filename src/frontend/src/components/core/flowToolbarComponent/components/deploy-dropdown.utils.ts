import type { TeamSummary } from "@/types/api";

export type TeamProjectOption = Pick<TeamSummary, "id" | "name" | "description">;

export function getAvailableTeamProjects(
  teamSummaries: TeamSummary[],
  personalProjectId: string,
): TeamProjectOption[] {
  return teamSummaries
    .filter((team) => Boolean(team.id) && team.id !== personalProjectId)
    .map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description ?? null,
    }));
}
