import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  Crown,
  HelpCircle,
  Infinity,
  Lock,
  LogOut,
  Pencil,
  RefreshCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchTeamUsersQuery } from "@/controllers/API/queries/teams";
import { customPreLoadImageUrl } from "@/customization/utils/custom-pre-load-image-url";
import useAlertStore from "@/stores/alertStore";
import { cn } from "@/utils/utils";
import { QuotaProgress } from "./QuotaProgress";
import { getMemberQuotaSummary } from "./quota";
import { type Role, useTeamMockData } from "./useTeamMockData";

type TeamSettingsSectionProps = {
  isZh: boolean;
  onCopyTeamId: () => void;
  onEditProfile: () => void;
  team?: unknown;
  canEditTeam?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onRefresh?: () => void;
  onInviteMembers?: () => void;
  updateMemberRole?: (userId: string, role: Role) => void;
};

type LimitModalState = {
  userId: string;
  memberName: string;
  currentLimit: number | null;
  currentKind: "unlimited" | "recurring" | "fixed";
  currentInterval: "daily" | "weekly" | "monthly" | null;
};

function getRoleLabel(role: Role, isZh: boolean) {
  if (role === "owner") return isZh ? "\u6240\u6709\u8005" : "Owner";
  if (role === "admin") return isZh ? "\u7ba1\u7406\u5458" : "Admin";
  return isZh ? "\u6210\u5458" : "Member";
}

function getErrorMessage(error: any) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (detail?.message) {
    return detail.message;
  }
  return error?.message ?? "Unknown error";
}

function getLimitModeLabel(
  mode: "unlimited" | "recurring" | "fixed",
  isZh: boolean,
) {
  if (mode === "unlimited") {
    return isZh ? "\u65e0\u989d\u5ea6\u9650\u5236" : "Unlimited";
  }
  if (mode === "recurring") {
    return isZh ? "\u5468\u671f\u989d\u5ea6" : "Recurring";
  }
  return isZh ? "\u56fa\u5b9a\u989d\u5ea6" : "Fixed";
}

function getLimitIntervalLabel(
  interval: "daily" | "weekly" | "monthly",
  isZh: boolean,
) {
  if (interval === "daily") {
    return isZh ? "\u6bcf\u65e5" : "Daily";
  }
  if (interval === "weekly") {
    return isZh ? "\u6bcf\u5468" : "Weekly";
  }
  return isZh ? "\u6bcf\u6708" : "Monthly";
}

function getLimitIntervalHint(
  interval: "daily" | "weekly" | "monthly",
  isZh: boolean,
) {
  if (interval === "daily") {
    return isZh ? "\u6bcf\u65e500:00\u6062\u590d" : "Resets daily at 00:00";
  }
  if (interval === "weekly") {
    return isZh ? "\u6bcf\u5468\u4e00\u6062\u590d" : "Resets every Monday";
  }
  return isZh ? "\u6bcf\u67081\u65e5\u6062\u590d" : "Resets on the 1st of each month";
}

export function TeamSettingsSection({
  isZh,
  onCopyTeamId,
  onEditProfile,
}: TeamSettingsSectionProps) {
  const {
    currentTeam,
    inviteMember,
    removeMember,
    updateMemberRole,
    updateMemberCreditLimit,
    leaveCurrentTeam,
    dissolveCurrentTeam,
    refetchCurrentTeamMembers,
    isLoadingCurrentTeamMembers,
  } = useTeamMockData();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setNoticeData = useAlertStore((state) => state.setNoticeData);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInviteUserId, setSelectedInviteUserId] = useState<
    string | null
  >(null);
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [limitModalState, setLimitModalState] = useState<LimitModalState | null>(
    null,
  );
  const [limitInput, setLimitInput] = useState("");
  const [limitMode, setLimitMode] = useState<"unlimited" | "recurring" | "fixed">(
    "fixed",
  );
  const [limitInterval, setLimitInterval] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [isSavingLimit, setIsSavingLimit] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [isDissolvingTeam, setIsDissolvingTeam] = useState(false);

  const currentUserRole =
    currentTeam.currentUserRole ??
    currentTeam.members.find((member) => member.isCurrentUser)?.role ??
    "member";
  const canManageTeam =
    currentUserRole === "owner" || currentUserRole === "admin";
  const canChangeRoles = currentUserRole === "owner";
  const canEditProfile = currentUserRole === "owner";
  const normalizedSearchQuery = searchQuery.trim();

  const {
    data: searchResults = [],
    isFetching: isSearchingUsers,
    refetch: refetchSearchResults,
  } = useSearchTeamUsersQuery(
    {
      teamId: currentTeam.id,
      query: normalizedSearchQuery,
    },
    {
      enabled:
        canManageTeam &&
        Boolean(currentTeam.id) &&
        normalizedSearchQuery.length > 0,
    },
  );

  useEffect(() => {
    if (!limitModalState) {
      setLimitInput("");
      setLimitMode("fixed");
      setLimitInterval("monthly");
      return;
    }
    setLimitInput(
      limitModalState.currentLimit == null
        ? ""
        : String(limitModalState.currentLimit),
    );
    setLimitMode(limitModalState.currentKind);
    setLimitInterval(limitModalState.currentInterval ?? "monthly");
  }, [limitModalState]);

  useEffect(() => {
    if (!selectedInviteUserId) {
      return;
    }
    if (!searchResults.some((user) => user.user_id === selectedInviteUserId)) {
      setSelectedInviteUserId(null);
    }
  }, [searchResults, selectedInviteUserId]);

  const selectedInviteUser = useMemo(
    () =>
      searchResults.find((user) => user.user_id === selectedInviteUserId) ??
      null,
    [searchResults, selectedInviteUserId],
  );

  const filteredMembers = useMemo(() => {
    if (!normalizedSearchQuery) {
      return currentTeam.members;
    }
    const keyword = normalizedSearchQuery.toLowerCase();
    return currentTeam.members.filter(
      (member) =>
        member.name.toLowerCase().includes(keyword) ||
        member.email.toLowerCase().includes(keyword),
    );
  }, [currentTeam.members, normalizedSearchQuery]);

  const handleRefresh = async () => {
    await refetchCurrentTeamMembers();
    if (normalizedSearchQuery) {
      await refetchSearchResults();
    }
    setNoticeData({
      title: isZh
        ? "\u6210\u5458\u5217\u8868\u5df2\u5237\u65b0"
        : "Team member list refreshed",
    });
  };

  const handleInvite = async () => {
    if (!canManageTeam) {
      setNoticeData({
        title: isZh
          ? "\u4ec5\u56e2\u961f\u6240\u6709\u8005\u6216\u7ba1\u7406\u5458\u53ef\u4ee5\u9080\u8bf7\u6210\u5458"
          : "Only team owners or admins can invite members",
      });
      return;
    }

    if (!selectedInviteUser) {
      setNoticeData({
        title: isZh
          ? "\u8bf7\u5148\u5728\u67e5\u627e\u6210\u5458\u4e2d\u9009\u62e9\u4e00\u4e2a\u7528\u6237"
          : "Select a user from search before inviting",
      });
      return;
    }

    setIsInvitingMember(true);
    try {
      await inviteMember(selectedInviteUser.user_id, inviteRole);
      await refetchCurrentTeamMembers();
      if (normalizedSearchQuery) {
        await refetchSearchResults();
      }
      setSuccessData({
        title: isZh
          ? "\u9080\u8bf7\u5df2\u53d1\u9001\u5230\u5bf9\u65b9\u7684\u6211\u7684\u901a\u77e5"
          : "Invitation sent to the recipient's notifications",
      });
      setSelectedInviteUserId(null);
      setSearchQuery("");
      setInviteRole("member");
    } catch (error: any) {
      setErrorData({
        title: isZh ? "\u9080\u8bf7\u6210\u5458\u5931\u8d25" : "Failed to invite member",
        list: [getErrorMessage(error)],
      });
    } finally {
      setIsInvitingMember(false);
    }
  };

  const handleUpdateMemberRole = async (userId: string, role: Role) => {
    setUpdatingMemberId(userId);
    try {
      await updateMemberRole(userId, role);
      setSuccessData({
        title: isZh ? "\u6210\u5458\u89d2\u8272\u5df2\u66f4\u65b0" : "Member role updated",
      });
    } catch (error: any) {
      setErrorData({
        title: isZh
          ? "\u66f4\u65b0\u6210\u5458\u89d2\u8272\u5931\u8d25"
          : "Failed to update member role",
        list: [getErrorMessage(error)],
      });
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    const confirmed = window.confirm(
      isZh
        ? `\u786e\u5b9a\u5c06 ${memberName} \u79fb\u51fa\u8be5\u56e2\u961f\u5417\uff1f`
        : `Remove ${memberName} from this team?`,
    );
    if (!confirmed) {
      return;
    }

    setRemovingMemberId(userId);
    try {
      await removeMember(userId);
      await refetchCurrentTeamMembers();
      setSuccessData({
        title: isZh
          ? "\u6210\u5458\u5df2\u79fb\u51fa\u56e2\u961f"
          : "Member removed from team",
      });
    } catch (error: any) {
      setErrorData({
        title: isZh
          ? "\u79fb\u51fa\u56e2\u961f\u6210\u5458\u5931\u8d25"
          : "Failed to remove member",
        list: [getErrorMessage(error)],
      });
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleSaveCreditLimit = async () => {
    if (!limitModalState) {
      return;
    }

    const trimmedValue = limitInput.trim();
    const nextLimit = trimmedValue === "" ? null : Number(trimmedValue.replace(/[^\d]/g, ""));

    if (
      limitMode !== "unlimited" &&
      (trimmedValue === "" || !Number.isFinite(nextLimit) || nextLimit == null || nextLimit < 0)
    ) {
      setErrorData({
        title: isZh ? "\u79ef\u5206\u603b\u989d\u65e0\u6548" : "Invalid credit limit",
        list: [
          isZh
            ? "\u8bf7\u8f93\u5165\u5927\u4e8e\u7b49\u4e8e 0 \u7684\u6574\u6570\uff0c\u6216\u7559\u7a7a\u8868\u793a\u4e0d\u9650\u5236\u3002"
            : "Enter an integer greater than or equal to 0. Leave blank for unlimited.",
        ],
      });
      return;
    }

    setIsSavingLimit(true);
    try {
      await updateMemberCreditLimit(limitModalState.userId, {
        creditLimit: limitMode === "unlimited" ? null : nextLimit,
        creditLimitKind: limitMode,
        creditLimitInterval: limitMode === "recurring" ? limitInterval : null,
      });
      await refetchCurrentTeamMembers();
      setSuccessData({
        title: isZh
          ? "\u6210\u5458\u79ef\u5206\u603b\u989d\u5df2\u66f4\u65b0"
          : "Member credit limit updated",
      });
      setLimitModalState(null);
    } catch (error: any) {
      setErrorData({
        title: isZh
          ? "\u66f4\u65b0\u79ef\u5206\u603b\u989d\u5931\u8d25"
          : "Failed to update credit limit",
        list: [getErrorMessage(error)],
      });
    } finally {
      setIsSavingLimit(false);
    }
  };

  const handleLeaveTeam = async () => {
    const confirmed = window.confirm(
      isZh
        ? "\u786e\u5b9a\u9000\u51fa\u5f53\u524d\u56e2\u961f\u5417\uff1f"
        : "Are you sure you want to leave this team?",
    );
    if (!confirmed) {
      return;
    }

    setIsLeavingTeam(true);
    try {
      await leaveCurrentTeam();
      setSuccessData({
        title: isZh ? "\u5df2\u9000\u51fa\u56e2\u961f" : "Left the team",
      });
    } catch (error: any) {
      setErrorData({
        title: isZh ? "\u9000\u51fa\u56e2\u961f\u5931\u8d25" : "Failed to leave team",
        list: [getErrorMessage(error)],
      });
    } finally {
      setIsLeavingTeam(false);
    }
  };

  const handleDissolveTeam = async () => {
    const confirmed = window.confirm(
      isZh
        ? "\u786e\u5b9a\u89e3\u6563\u5f53\u524d\u56e2\u961f\u5417\uff1f\u8be5\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002"
        : "Are you sure you want to dissolve this team? This action cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setIsDissolvingTeam(true);
    try {
      await dissolveCurrentTeam();
      setSuccessData({
        title: isZh ? "\u56e2\u961f\u5df2\u89e3\u6563" : "Team dissolved",
      });
    } catch (error: any) {
      setErrorData({
        title: isZh ? "\u89e3\u6563\u56e2\u961f\u5931\u8d25" : "Failed to dissolve team",
        list: [getErrorMessage(error)],
      });
    } finally {
      setIsDissolvingTeam(false);
    }
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex items-start gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#5E7B92] text-2xl font-semibold text-white">
            {currentTeam.avatar ? (
              <img
                src={customPreLoadImageUrl(currentTeam.avatar)}
                alt={currentTeam.name}
                className="h-full w-full object-cover"
              />
            ) : (
              currentTeam.name[0]?.toUpperCase()
            )}
            {canEditProfile ? (
              <button
                type="button"
                onClick={onEditProfile}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md transition-colors hover:bg-zinc-200"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white">{currentTeam.name}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-white/38">
              <span>
                {isZh ? "\u56e2\u961f ID" : "Team ID"}: {currentTeam.id}
              </span>
              <button
                type="button"
                onClick={onCopyTeamId}
                className="text-white/48 transition-colors hover:text-white"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 mt-6 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">
            {isZh ? "\u56e2\u961f\u8bbe\u7f6e" : "Team Settings"}
          </h3>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-full p-2 text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>

            <div className="relative w-[250px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={isZh ? "\u67e5\u627e\u6210\u5458" : "Search members"}
                className="h-10 rounded-2xl border-white/10 bg-transparent pl-10 text-sm text-white"
              />

              {canManageTeam && normalizedSearchQuery.length > 0 ? (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
                  <div className="border-b border-white/8 px-4 py-3 text-xs text-white/45">
                    {isZh
                      ? "\u6309\u7528\u6237\u540d\u6216\u90ae\u7bb1\u5168\u7ad9\u67e5\u627e"
                      : "Search site-wide by username or email"}
                  </div>

                  <div className="max-h-[280px] overflow-y-auto py-2">
                    {isSearchingUsers ? (
                      <div className="px-4 py-6 text-center text-sm text-white/40">
                        {isZh ? "\u67e5\u627e\u4e2d..." : "Searching..."}
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-white/40">
                        {isZh
                          ? "\u672a\u627e\u5230\u5339\u914d\u7684\u7528\u6237"
                          : "No matching users found"}
                      </div>
                    ) : (
                      searchResults.map((user) => {
                        const avatarSrc = user.profile_image
                          ? customPreLoadImageUrl(user.profile_image)
                          : undefined;
                        const isDisabled =
                          user.is_current_user || user.is_member;
                        const isSelected = user.user_id === selectedInviteUserId;

                        return (
                          <button
                            key={user.user_id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => setSelectedInviteUserId(user.user_id)}
                            className={cn(
                              "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                              isSelected
                                ? "bg-[#1f3a4a]"
                                : "hover:bg-white/[0.04]",
                              isDisabled && "cursor-not-allowed opacity-70",
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {avatarSrc ? (
                                <img
                                  src={avatarSrc}
                                  alt={user.nickname || user.email}
                                  className="h-9 w-9 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8">
                                  <UserRound className="h-4 w-4 text-white/75" />
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-white">
                                  {user.nickname || user.username}
                                </div>
                                <div className="truncate text-xs text-white/45">
                                  {user.email || user.username}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {user.is_current_user ? (
                                <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/55">
                                  {isZh ? "\u4f60\u81ea\u5df1" : "You"}
                                </span>
                              ) : user.is_member ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#2FA8E5]/20 px-2.5 py-1 text-xs text-[#6fcdf7]">
                                  {getRoleLabel(
                                    user.role === "OWNER"
                                      ? "owner"
                                      : user.role === "ADMIN"
                                        ? "admin"
                                        : "member",
                                    isZh,
                                  )}
                                </span>
                              ) : (
                                <span className="rounded-full bg-[#2FA8E5]/12 px-2.5 py-1 text-xs text-[#6fcdf7]">
                                  {isZh ? "\u53ef\u9080\u8bf7" : "Invitable"}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={!canManageTeam}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 text-sm text-white/75 transition-colors hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{getRoleLabel(inviteRole, isZh)}</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-white/10 bg-[#1A1A1A] text-white"
              >
                {(["member", "admin"] as const).map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => setInviteRole(role)}
                    className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
                  >
                    {getRoleLabel(role, isZh)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              unstyled
              type="button"
              onClick={handleInvite}
              disabled={!canManageTeam || isInvitingMember}
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#2FA8E5] px-5 text-sm font-medium text-white transition-colors hover:bg-[#47b3ea] disabled:cursor-not-allowed disabled:opacity-60"
            >
              +{" "}
              {isInvitingMember
                ? isZh
                  ? "\u9080\u8bf7\u4e2d..."
                  : "Inviting..."
                : isZh
                  ? "\u9080\u8bf7\u6210\u5458"
                  : "Invite Member"}
            </Button>
          </div>
        </div>

        <div className="mb-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/58">
          {isZh
            ? "团队所有者和管理员可为成员设置“使用积分总额”。可编辑成员右侧会显示“编辑额度”按钮。"
            : 'Team owners and admins can set each member\'s total credit limit. Editable members show an "Edit Limit" button on the right.'}
        </div>

        <div className="mb-2 grid grid-cols-[minmax(220px,1fr)_240px_190px] items-center gap-4 px-4 py-2 text-sm text-white/40">
          <div>{isZh ? "\u6210\u5458\u4fe1\u606f" : "Member Info"}</div>
          <div className="text-center">
            {isZh ? "\u5269\u4f59 / \u603b\u989d" : "Remaining / Total"}
          </div>
          <div className="pr-2 text-right">{isZh ? "\u89d2\u8272" : "Role"}</div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-white/6 bg-[#171717]">
          {isLoadingCurrentTeamMembers ? (
            <div className="px-6 py-12 text-center text-sm text-white/40">
              {isZh ? "\u52a0\u8f7d\u56e2\u961f\u6210\u5458..." : "Loading team members..."}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-white/40">
              {isZh ? "\u672a\u627e\u5230\u6210\u5458" : "No members found"}
            </div>
          ) : (
            filteredMembers.map((member, index) => {
              const avatarSrc = member.avatar
                ? customPreLoadImageUrl(member.avatar)
                : undefined;
              const isOwner = member.role === "owner";
              const canChangeRole =
                canChangeRoles && !member.isCurrentUser && !isOwner;
              const canEditCredits = currentUserRole === "owner"
                ? true
                : canManageTeam && !member.isCurrentUser && !isOwner;
              const canRemoveMember =
                canManageTeam && !member.isCurrentUser && !isOwner;
              const quotaSummary = getMemberQuotaSummary(member);

              return (
                <div
                  key={member.userId}
                  className={cn(
                    "group/member grid grid-cols-[minmax(220px,1fr)_240px_190px] items-center gap-4 px-5 py-5",
                    index !== filteredMembers.length - 1 &&
                      "border-b border-white/6",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="relative">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt={member.name}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                          <UserRound className="h-5 w-5 text-white/80" />
                        </div>
                      )}
                      {isOwner ? (
                        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#171717]">
                          <Crown className="h-3.5 w-3.5 fill-white text-white" />
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-white">
                        {member.name}
                        {member.isCurrentUser ? (
                          <span className="ml-1 text-[#1BB3E4]">
                            ({isZh ? "\u4f60" : "You"})
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-sm text-white/55">
                        {member.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 px-2">
                    <QuotaProgress
                      isZh={isZh}
                      summary={quotaSummary}
                      showUsage
                      align="center"
                      className="min-w-0 flex-1"
                    />

                    {canEditCredits ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLimitModalState({
                            userId: member.userId,
                            memberName: member.name,
                            currentLimit: member.creditLimit ?? null,
                            currentKind: member.creditLimitKind ?? "unlimited",
                            currentInterval: member.creditLimitInterval ?? null,
                          })
                        }
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2FA8E5]/35 bg-[#2FA8E5]/10 text-[#76d0f4] opacity-0 transition-[opacity,color,background-color] duration-150 pointer-events-none group-hover/member:opacity-100 group-hover/member:pointer-events-auto group-focus-within/member:opacity-100 group-focus-within/member:pointer-events-auto hover:bg-[#2FA8E5]/16 hover:text-white [&_span]:hidden"
                        title={isZh ? "\u7f16\u8f91\u79ef\u5206\u603b\u989d" : "Edit credit limit"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>{isZh ? "编辑额度" : "Edit Limit"}</span>
                      </button>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={
                            !canChangeRole || updatingMemberId === member.userId
                          }
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/8 bg-transparent px-4 text-sm text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span>{getRoleLabel(member.role, isZh)}</span>
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-white/10 bg-[#1A1A1A] text-white"
                      >
                        {(["admin", "member"] as const).map((role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() =>
                              handleUpdateMemberRole(member.userId, role)
                            }
                            className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
                          >
                            {getRoleLabel(role, isZh)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {canRemoveMember ? (
                      <button
                        type="button"
                        disabled={removingMemberId === member.userId}
                        onClick={() =>
                          handleRemoveMember(member.userId, member.name)
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        title={isZh ? "\u79fb\u51fa\u56e2\u961f" : "Remove from team"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!currentTeam.isDefault ? (
          <div className="mt-5 flex justify-end">
            {currentUserRole === "owner" ? (
              <button
                type="button"
                onClick={() => {
                  void handleDissolveTeam();
                }}
                disabled={isDissolvingTeam}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#f05a5a]/35 bg-[#f05a5a]/10 px-4 text-sm font-medium text-[#ff8a8a] transition-colors hover:bg-[#f05a5a]/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isZh ? "\u89e3\u6563\u56e2\u961f" : "Dissolve Team"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void handleLeaveTeam();
                }}
                disabled={isLeavingTeam}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                <span>{isZh ? "\u9000\u51fa\u56e2\u961f" : "Leave Team"}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      <Dialog
        open={Boolean(limitModalState)}
        onOpenChange={(open) => {
          if (!open) {
            setLimitModalState(null);
          }
        }}
      >
        <DialogContent className="w-[min(790px,calc(100vw-32px))] border border-[#30323b] bg-[#1f2026] p-0 text-white shadow-[0_30px_80px_rgba(0,0,0,0.5)] [&>button]:right-6 [&>button]:top-6 [&>button]:text-white/70 [&>button]:hover:text-white">
          <DialogHeader className="px-10 pb-0 pt-12 text-center">
            <DialogTitle className="text-[22px] font-semibold leading-none">
              {isZh ? "Tapies \u989d\u5ea6" : "Tapies Quota"}
            </DialogTitle>
            <DialogDescription className="mt-4 text-[18px] text-white/40">
              {limitModalState
                ? isZh
                  ? `\u8bbe\u7f6e ${limitModalState.memberName} \u7684 Tapies \u989d\u5ea6`
                  : `Set ${limitModalState.memberName}'s Tapies quota`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="px-10 pb-10 pt-8">
            <div className="text-[14px] font-medium text-white/55">
              {isZh ? "\u7c7b\u578b" : "Type"}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              {([
                {
                  mode: "unlimited",
                  icon: Infinity,
                },
                {
                  mode: "recurring",
                  icon: RefreshCcw,
                },
                {
                  mode: "fixed",
                  icon: Lock,
                },
              ] as const).map(({ mode, icon: ModeIcon }) => {
                const isActive = limitMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLimitMode(mode)}
                    className={cn(
                      "relative flex min-h-[148px] flex-col items-center justify-center rounded-[24px] border px-6 py-7 text-center transition-colors",
                      isActive
                        ? "border-[#1DAFFF] bg-[#1a2b35] text-white shadow-[inset_0_0_0_1px_rgba(29,175,255,0.25)]"
                        : "border-[#363944] bg-[#26272f] text-white/45 hover:border-white/20 hover:text-white/80",
                    )}
                  >
                    <HelpCircle className="absolute right-4 top-4 h-4 w-4 text-white/35" />
                    <ModeIcon
                      className={cn(
                        "mb-5 h-9 w-9",
                        isActive ? "text-[#1DAFFF]" : "text-white/45",
                      )}
                    />
                    <div className="text-[15px] font-semibold">
                      {getLimitModeLabel(mode, isZh)}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className={cn(limitMode !== "recurring" && "opacity-50")}>
                <div className="mb-3 text-[14px] font-medium text-white/55">
                  {isZh ? "\u6062\u590d\u5468\u671f" : "Reset Cycle"}
                </div>
                <Select
                  value={limitInterval}
                  onValueChange={(value: "daily" | "weekly" | "monthly") =>
                    setLimitInterval(value)
                  }
                  disabled={limitMode !== "recurring"}
                >
                  <SelectTrigger className="h-[58px] rounded-[18px] border border-[#3b3d49] bg-[#2b2c34] px-5 text-left text-[18px] font-semibold text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[#3b3d49] bg-[#2b2c34] text-white">
                    <SelectItem value="daily">
                      {getLimitIntervalLabel("daily", isZh)}
                    </SelectItem>
                    <SelectItem value="weekly">
                      {getLimitIntervalLabel("weekly", isZh)}
                    </SelectItem>
                    <SelectItem value="monthly">
                      {getLimitIntervalLabel("monthly", isZh)}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-3 min-h-5 text-[14px] text-white/40">
                  {limitMode === "recurring"
                    ? getLimitIntervalHint(limitInterval, isZh)
                    : ""}
                </div>
              </div>

              <div className={cn(limitMode === "unlimited" && "opacity-50")}>
                <div className="mb-3 text-[14px] font-medium text-white/55">
                  {isZh ? "\u5355\u671f\u989d\u5ea6" : "Quota"}
                </div>
                <div className="relative">
                  <Input
                    value={limitInput}
                    onChange={(event) => setLimitInput(event.target.value)}
                    inputMode="numeric"
                    disabled={limitMode === "unlimited"}
                    placeholder={limitMode === "unlimited" ? "" : "20000"}
                    className="h-[58px] rounded-[18px] border border-[#3b3d49] bg-[#2b2c34] px-5 pr-24 text-[18px] font-semibold text-white placeholder:text-white/32 disabled:cursor-not-allowed disabled:text-white/35"
                  />
                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[16px] text-white/38">
                    Tapies
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-8">
              <button
                type="button"
                className="inline-flex h-[58px] items-center justify-center rounded-[18px] border border-[#3b3d49] bg-[#2a2b33] text-[18px] font-semibold text-white transition-colors hover:bg-[#31333c] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setLimitModalState(null)}
                disabled={isSavingLimit}
              >
                {isZh ? "\u53d6\u6d88" : "Cancel"}
              </button>
              <Button
                unstyled
                type="button"
                className="inline-flex h-[58px] items-center justify-center rounded-[18px] bg-white px-6 text-[18px] font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                loading={isSavingLimit}
                onClick={handleSaveCreditLimit}
              >
                {isZh ? "\u4fdd\u5b58\u5e76\u5e94\u7528" : "Save and Apply"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
