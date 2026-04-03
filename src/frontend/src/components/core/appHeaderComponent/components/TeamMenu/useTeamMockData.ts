import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useDeleteTeamMember,
  useGetTeamMembersQuery,
  useGetTeamsQuery,
  useInviteTeamMember,
  useLeaveTeam,
  useUpdateTeamMemberRole,
} from "@/controllers/API/queries/teams";
import { useDeleteFolders } from "@/controllers/API/queries/folders/use-delete-folders";
import { useGetFoldersQuery } from "@/controllers/API/queries/folders/use-get-folders";
import { usePostFolders } from "@/controllers/API/queries/folders/use-post-folders";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAuthStore from "@/stores/authStore";
import { useFolderStore } from "@/stores/foldersStore";
import useAlertStore from "@/stores/alertStore";
import {
  getStoredCurrentTeamId,
  getStoredWorkspaceScope,
  syncWorkspaceSelection,
} from "@/utils/workspace-selection";
import {
  getMemberQuotaSummary,
  type QuotaAmount,
} from "./quota";

export type Role = "owner" | "admin" | "member";
export type CreditLimitKind = "unlimited" | "recurring" | "fixed";
export type CreditLimitInterval = "daily" | "weekly" | "monthly";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: Role;
  creditLimit?: number | null;
  creditLimitKind?: CreditLimitKind;
  creditLimitInterval?: CreditLimitInterval | null;
  creditsUsed: number;
  creditsRemaining?: number | null;
  isCurrentUser?: boolean;
}

export interface TeamQuota {
  type: string;
  used: number;
  remaining: QuotaAmount;
  total: QuotaAmount;
  progressRatio: number;
  isUnlimited: boolean;
}

export interface Team {
  id: string;
  name: string;
  avatar?: string;
  members: TeamMember[];
  quota: TeamQuota;
  isDefault?: boolean;
  memberCount?: number;
  currentUserRole?: Role;
}

type TeamOverrides = Record<
  string,
  {
    name?: string;
    avatar?: string;
  }
>;

const TEAM_OVERRIDES_KEY = "team_overrides_registry";

function readTeamOverrides(): TeamOverrides {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(TEAM_OVERRIDES_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as TeamOverrides;
  } catch {
    return {};
  }
}

function writeTeamOverrides(overrides: TeamOverrides) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TEAM_OVERRIDES_KEY, JSON.stringify(overrides));
}

function mapRole(role?: string | null): Role {
  if (role === "OWNER") {
    return "owner";
  }
  if (role === "ADMIN") {
    return "admin";
  }
  return "member";
}

function mapCreditLimitKind(kind?: string | null): CreditLimitKind {
  if (kind === "RECURRING") {
    return "recurring";
  }
  if (kind === "FIXED") {
    return "fixed";
  }
  return "unlimited";
}

function mapCreditLimitInterval(interval?: string | null): CreditLimitInterval | null {
  if (interval === "DAILY") {
    return "daily";
  }
  if (interval === "WEEKLY") {
    return "weekly";
  }
  if (interval === "MONTHLY") {
    return "monthly";
  }
  return null;
}

export function useTeamMockData() {
  const storedFolders = useFolderStore((state) => state.folders) || [];
  const myCollectionId = useFolderStore((state) => state.myCollectionId);
  const { userData } = useAuthStore();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const navigate = useCustomNavigate();
  const { folderId } = useParams();

  const currentUrlFolderId =
    folderId ||
    (getStoredWorkspaceScope() === "team"
      ? getStoredCurrentTeamId() || myCollectionId
      : myCollectionId);

  const [teamOverrides, setTeamOverrides] = useState<TeamOverrides>(() =>
    readTeamOverrides(),
  );

  const { data: fetchedFolders = [] } = useGetFoldersQuery();
  const { data: teamSummaries = [] } = useGetTeamsQuery();
  const currentTeamId = currentUrlFolderId || myCollectionId || "";
  const folders = fetchedFolders.length > 0 ? fetchedFolders : storedFolders;

  const {
    data: currentTeamMembers = [],
    isLoading: isLoadingCurrentTeamMembers,
    refetch: refetchCurrentTeamMembers,
  } = useGetTeamMembersQuery(
    { teamId: currentTeamId },
    { enabled: Boolean(currentTeamId) },
  );

  const { mutateAsync: addFolder } = usePostFolders();
  const { mutateAsync: mutateUpdateMemberRole } =
    useUpdateTeamMemberRole(currentTeamId);
  const { mutateAsync: mutateInviteMember } = useInviteTeamMember(currentTeamId);
  const { mutateAsync: mutateDeleteMember } = useDeleteTeamMember(currentTeamId);
  const { mutateAsync: mutateLeaveTeam } = useLeaveTeam(currentTeamId);
  const { mutateAsync: mutateDeleteFolder } = useDeleteFolders();

  const teamSummaryMap = useMemo(
    () => new Map(teamSummaries.map((team) => [team.id, team] as const)),
    [teamSummaries],
  );

  const teams = useMemo(() => {
    return folders
      .filter((folder: any) => folder?.id)
      .map((folder: any) => {
        const summary = teamSummaryMap.get(folder.id);
        const overrides = teamOverrides[folder.id] ?? {};
        const isCurrent = folder.id === currentTeamId;
        const members = isCurrent
          ? currentTeamMembers.map((member) => ({
              userId: member.user_id,
              name: member.nickname || member.email || member.username,
              email: member.email || member.username,
              avatar: member.profile_image ?? undefined,
              role: mapRole(member.role),
              creditLimit: member.credit_limit ?? null,
              creditLimitKind: mapCreditLimitKind(member.credit_limit_kind),
              creditLimitInterval: mapCreditLimitInterval(
                member.credit_limit_interval,
              ),
              creditsUsed: member.credits_used ?? 0,
              creditsRemaining: member.credits_remaining ?? null,
              isCurrentUser: member.user_id === userData?.id,
            }))
          : [];
        const quotaSummary = getMemberQuotaSummary(
          members.find((member) => member.isCurrentUser),
          mapRole(summary?.current_user_role),
        );

        return {
          id: folder.id,
          name: overrides.name || summary?.name || folder.name,
          avatar: overrides.avatar,
          members,
          quota: {
            type: folder.id === myCollectionId ? "FREE" : "PRO",
            ...quotaSummary,
          },
          isDefault: folder.id === myCollectionId,
          memberCount: summary?.member_count ?? members.length,
          currentUserRole: mapRole(summary?.current_user_role),
        } satisfies Team;
      });
  }, [
    currentTeamId,
    currentTeamMembers,
    folders,
    myCollectionId,
    teamOverrides,
    teamSummaryMap,
    userData?.id,
  ]);

  const currentTeam = useMemo(() => {
    const matchedTeam =
      teams.find((team) => team.id === currentTeamId) ?? teams[0];
    if (matchedTeam) {
      return matchedTeam;
    }
    return {
      id: currentTeamId,
      name: "Loading...",
      members: [],
      quota: {
        type: "FREE",
        used: 0,
        remaining: "infinity",
        total: "infinity",
        progressRatio: 1,
        isUnlimited: true,
      },
      memberCount: 0,
      currentUserRole: "member",
    } satisfies Team;
  }, [currentTeamId, teams]);

  const switchTeam = (id: string) => {
    if (!id) return;
    if (id === myCollectionId) {
      syncWorkspaceSelection("personal");
      navigate(`/all/folder/${id}`);
      return;
    }
    syncWorkspaceSelection("team", id);
    navigate(`/all/folder/${id}`);
  };

  const createTeam = async (name: string) => {
    if (!name) return;
    try {
      const newFolder = await addFolder({
        data: { name, description: "", components: [], flows: [] } as any,
      });

      if (newFolder && (newFolder as any).id) {
        syncWorkspaceSelection("team", (newFolder as any).id);
        setSuccessData({ title: "\u56e2\u961f\u521b\u5efa\u6210\u529f" });
        navigate(`/all/folder/${(newFolder as any).id}`);
      }
    } catch (err: any) {
      setErrorData({
        title: "\u521b\u5efa\u56e2\u961f\u5931\u8d25",
        list: [err?.message ?? "Unknown error"],
      });
    }
  };

  const updateMemberRole = async (userId: string, newRole: Role) => {
    if (!currentTeamId) {
      return;
    }
    await mutateUpdateMemberRole({
      userId,
      role: newRole.toUpperCase() as "OWNER" | "ADMIN" | "MEMBER",
    });
  };

  const updateMemberCreditLimit = async (
    userId: string,
    config: {
      creditLimit: number | null;
      creditLimitKind: CreditLimitKind;
      creditLimitInterval: CreditLimitInterval | null;
    },
  ) => {
    if (!currentTeamId) {
      return;
    }
    await mutateUpdateMemberRole({
      userId,
      credit_limit: config.creditLimit,
      credit_limit_kind:
        config.creditLimitKind === "unlimited"
          ? "UNLIMITED"
          : config.creditLimitKind === "recurring"
            ? "RECURRING"
            : "FIXED",
      credit_limit_interval:
        config.creditLimitKind === "recurring"
          ? config.creditLimitInterval === "daily"
            ? "DAILY"
            : config.creditLimitInterval === "weekly"
              ? "WEEKLY"
              : "MONTHLY"
          : null,
    });
  };

  const inviteMember = async (userId: string, role: Role = "member") => {
    if (!currentTeamId) {
      return;
    }
    await mutateInviteMember({
      user_id: userId,
      role: role.toUpperCase() as "OWNER" | "ADMIN" | "MEMBER",
    });
  };

  const removeMember = async (userId: string) => {
    if (!currentTeamId) {
      return;
    }
    await mutateDeleteMember({ userId });
  };

  const leaveCurrentTeam = async () => {
    if (!currentTeamId || currentTeamId === myCollectionId) {
      return;
    }
    await mutateLeaveTeam();
    syncWorkspaceSelection("personal");
    navigate(`/all/folder/${myCollectionId}`);
  };

  const dissolveCurrentTeam = async () => {
    if (!currentTeamId || currentTeamId === myCollectionId) {
      return;
    }
    await mutateDeleteFolder({ folder_id: currentTeamId });
    syncWorkspaceSelection("personal");
    navigate(`/all/folder/${myCollectionId}`);
  };

  const updateTeamProfile = (name: string, avatarUrl: string | undefined) => {
    if (!currentTeam.id) {
      return;
    }
    const nextOverrides = {
      ...teamOverrides,
      [currentTeam.id]: {
        ...(teamOverrides[currentTeam.id] ?? {}),
        name,
        avatar: avatarUrl,
      },
    };
    writeTeamOverrides(nextOverrides);
    setTeamOverrides(nextOverrides);
  };

  return {
    teams,
    currentTeam,
    currentTeamId: currentTeam.id,
    switchTeam,
    createTeam,
    updateMemberRole,
    updateMemberCreditLimit,
    updateTeamProfile,
    inviteMember,
    removeMember,
    leaveCurrentTeam,
    dissolveCurrentTeam,
    refetchCurrentTeamMembers,
    isLoadingCurrentTeamMembers,
  };
}
