import { useState } from "react";
import { Crown, Search, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import useAlertStore from "@/stores/alertStore";
import { cn } from "@/utils/utils";
import { EditTeamProfileModal } from "./EditTeamProfileModal";
import { QuotaProgress } from "./QuotaProgress";
import { getMemberQuotaSummary } from "./quota";
import { Role, Team } from "./useTeamMockData";

interface TeamSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team;
  updateMemberRole: (userId: string, newRole: Role) => void;
  updateTeamProfile: (name: string, avatarUrl: string | undefined) => void;
}

function getRoleLabel(role: Role, isZh: boolean) {
  if (role === "owner") return isZh ? "所有者" : "Owner";
  if (role === "admin") return isZh ? "管理员" : "Admin";
  return isZh ? "成员" : "Member";
}

export function TeamSettingsModal({
  open,
  onOpenChange,
  team,
  updateMemberRole,
  updateTeamProfile,
}: TeamSettingsModalProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);

  const handleCopyId = () => {
    navigator.clipboard.writeText(team.id);
    setSuccessData({ title: isZh ? "团队 ID 已复制" : "Team ID copied" });
  };

  const handleInvite = () => {
    setSuccessData({
      title: isZh ? "邀请成员入口暂未接通" : "Member invitation is not connected yet.",
    });
  };

  const filteredMembers = team.members.filter(
    (member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-[80vw] flex-col border-zinc-800 bg-[#121212] p-0 text-white">
        <DialogHeader className="sr-only p-6 pb-2">
          <DialogTitle>{isZh ? "团队设置" : "Team Settings"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-8">
          <div className="mb-4 flex items-start gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#5E7B92] text-2xl font-semibold text-white">
              {team.avatar ? (
                <img
                  src={team.avatar}
                  alt="Team Avatar"
                  className="h-full w-full rounded-xl object-cover"
                />
              ) : (
                team.name[0].toUpperCase()
              )}
              {team.members.find((member) => member.isCurrentUser)?.role ===
              "owner" ? (
                <button
                  className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md transition-colors hover:bg-zinc-200"
                  onClick={() => setIsProfileEditOpen(true)}
                >
                  <IconComponent name="Pencil" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{team.name}</h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                <span>{isZh ? "团队 ID" : "Team ID"}: {team.id}</span>
                <button className="hover:text-zinc-200" onClick={handleCopyId}>
                  <IconComponent name="Copy" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4 mt-6 flex items-center justify-between">
            <h3 className="text-lg font-medium">
              {isZh ? "团队设置" : "Team Settings"}
            </h3>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <Input
                  placeholder={isZh ? "查找成员" : "Search members"}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 border-zinc-800 bg-transparent pl-10 text-sm text-white"
                />
              </div>
              <Button
                className="rounded-full border-0 px-6 hover:bg-[#206add]"
                style={{ backgroundColor: "#2f88ff", color: "white" }}
                onClick={handleInvite}
              >
                + {isZh ? "邀请成员" : "Invite Member"}
              </Button>
            </div>
          </div>

          <div className="mb-2 flex items-center px-4 py-2 text-sm text-zinc-400">
            <div className="w-64">{isZh ? "成员信息" : "Member Info"}</div>
            <div className="w-64 text-center">
              {isZh ? "剩余 / 总额" : "Remaining / Total"}
            </div>
            <div className="flex-1 pr-2 text-right">
              {isZh ? "角色" : "Role"}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#1A1A1A]">
            {filteredMembers.map((member, index) => (
              <div
                key={member.userId}
                className={cn(
                  "flex items-center p-4",
                  index !== filteredMembers.length - 1 &&
                    "border-b border-zinc-800",
                )}
              >
                <div className="flex w-64 items-center gap-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700">
                    <UserRound className="h-5 w-5 text-white" />
                    {member.role === "owner" ? (
                      <div className="absolute -right-1 -top-1">
                        <Crown className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {member.name}{" "}
                      {member.isCurrentUser ? (
                        <span className="text-[#1BB3E4]">
                          ({isZh ? "你" : "You"})
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-zinc-400">{member.email}</span>
                  </div>
                </div>

                <div className="flex w-64 items-center justify-center px-3">
                  <QuotaProgress
                    isZh={isZh}
                    summary={getMemberQuotaSummary(member)}
                    showUsage
                    align="center"
                    className="w-full"
                  />
                </div>

                <div className="flex flex-1 justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800">
                        {getRoleLabel(member.role, isZh)}
                        <IconComponent name="ChevronDown" className="h-3 w-3" />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[120px] border-zinc-800 bg-[#1A1A1A] text-white"
                    >
                      {(["owner", "admin", "member"] as const).map((role) => (
                        <DropdownMenuItem
                          key={role}
                          onClick={() => updateMemberRole(member.userId, role)}
                          className="cursor-pointer hover:bg-zinc-800"
                        >
                          {getRoleLabel(role, isZh)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                {isZh ? "未找到成员" : "No members found"}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>

      <EditTeamProfileModal
        open={isProfileEditOpen}
        onOpenChange={setIsProfileEditOpen}
        team={team}
        updateTeamProfile={updateTeamProfile}
      />
    </Dialog>
  );
}
