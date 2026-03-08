import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import IconComponent from "@/components/common/genericIconComponent";
import { useTranslation } from "react-i18next";
import { Team, Role } from "./useTeamMockData";
import { cn } from "@/utils/utils";
import useAlertStore from "@/stores/alertStore";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditTeamProfileModal } from "./EditTeamProfileModal";

interface TeamSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    team: Team;
    updateMemberRole: (userId: string, newRole: Role) => void;
    updateTeamProfile: (name: string, avatarUrl: string | undefined) => void;
}

export function TeamSettingsModal({
    open,
    onOpenChange,
    team,
    updateMemberRole,
    updateTeamProfile
}: TeamSettingsModalProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
    const setSuccessData = useAlertStore((state) => state.setSuccessData);

    const handleCopyId = () => {
        navigator.clipboard.writeText(team.id);
        setSuccessData({ title: t("团队 ID 已复制") });
    };

    const handleInvite = () => {
        setSuccessData({ title: t("邀请链接已生成并复制到剪贴板") });
    };

    const filteredMembers = team.members.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[80vw] h-[80vh] flex flex-col border-zinc-800 bg-[#121212] p-0 text-white">
                <DialogHeader className="p-6 pb-2 sr-only">
                    {/* Keep accessible title hidden */}
                    <DialogTitle>{t("团队设置")}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-8">
                    {/* Top Info Section */}
                    <div className="flex items-start gap-4 mb-4">
                        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#5E7B92] text-2xl font-semibold text-white">
                            {team.avatar ? (
                                <img src={team.avatar} alt="Team Avatar" className="h-full w-full rounded-xl object-cover" />
                            ) : (
                                team.name[0].toUpperCase()
                            )}
                            {/* 如果当前是所有者，则显示修改小图标 */}
                            {team.members.find(m => m.isCurrentUser)?.role === "owner" && (
                                <button
                                    className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md transition-colors hover:bg-zinc-200"
                                    onClick={() => setIsProfileEditOpen(true)}
                                >
                                    <IconComponent name="Pencil" className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">{team.name}</h2>
                            <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                                <span>团队 ID: {team.id}</span>
                                <button className="hover:text-zinc-200" onClick={handleCopyId}>
                                    <IconComponent name="Copy" className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Members Table Toolbar */}
                    <div className="flex items-center justify-between mt-6 mb-4">
                        <h3 className="text-lg font-medium">{t("团队设置")}</h3>

                        <div className="flex items-center gap-3">
                            <Input
                                icon="Search"
                                placeholder={t("查找成员")}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-64"
                                inputClassName="bg-transparent border-zinc-800 text-sm text-white focus-visible:ring-1 focus-visible:ring-zinc-700 h-10 w-full rounded-md border px-3 py-2"
                            />
                            <Button
                                className="rounded-full px-6 border-0 hover:bg-[#206add]"
                                style={{ backgroundColor: "#2f88ff", color: "white" }}
                                onClick={handleInvite}
                            >
                                + {t("邀请成员")}
                            </Button>
                        </div>
                    </div>

                    {/* Table Header */}
                    <div className="flex items-center px-4 py-2 text-sm text-zinc-400 mb-2">
                        <div className="w-64">{t("成员信息")}</div>
                        <div className="w-64 text-center">{t("剩余 / 总额")}</div>
                        <div className="flex-1 text-right pr-2">{t("角色")}</div>
                    </div>

                    {/* Members List */}
                    <div className="rounded-xl border border-zinc-800 bg-[#1A1A1A]">
                        {filteredMembers.map((member, i) => (
                            <div
                                key={member.userId}
                                className={cn(
                                    "flex items-center p-4",
                                    i !== filteredMembers.length - 1 && "border-b border-zinc-800"
                                )}
                            >
                                {/* Member Identity */}
                                <div className="flex w-64 items-center gap-3">
                                    <div className="flex h-10 w-10 relative shrink-0 items-center justify-center rounded-full bg-zinc-700">
                                        <IconComponent name="User" className="h-5 w-5 text-white" />
                                        {member.role === "owner" && (
                                            <div className="absolute -top-1 -right-1">
                                                <IconComponent name="Crown" className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">
                                            {member.name} {member.isCurrentUser && <span className="text-[#1BB3E4]">({t("你")})</span>}
                                        </span>
                                        <span className="text-xs text-zinc-400">{member.email}</span>
                                    </div>
                                </div>

                                {/* Quota / Usage */}
                                <div className="flex w-64 flex-col items-center justify-center gap-1 text-xs">
                                    {member.role === "owner" ? (
                                        <>
                                            <div className="flex w-full justify-between px-4 text-[#1BB3E4]">
                                                <span>无额度限制</span>
                                                <IconComponent name="Infinity" className="h-4 w-4" />
                                            </div>
                                            <div className="w-[180px] h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                                <div className="h-full w-full bg-[#1BB3E4]" />
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-zinc-500">-</span>
                                    )}
                                </div>

                                <div className="flex-1 flex justify-end">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <div className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 cursor-pointer hover:bg-zinc-800 flex items-center gap-2">
                                                {member.role === "owner" ? t("所有者") : member.role === "admin" ? t("管理员") : t("成员")}
                                                <IconComponent name="ChevronDown" className="h-3 w-3" />
                                            </div>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-[#1A1A1A] border-zinc-800 text-white min-w-[120px]">
                                            <DropdownMenuItem onClick={() => updateMemberRole(member.userId, "owner")} className="cursor-pointer hover:bg-zinc-800">
                                                {t("所有者")}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => updateMemberRole(member.userId, "admin")} className="cursor-pointer hover:bg-zinc-800">
                                                {t("管理员")}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => updateMemberRole(member.userId, "member")} className="cursor-pointer hover:bg-zinc-800">
                                                {t("成员")}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                        {filteredMembers.length === 0 && (
                            <div className="p-8 text-center text-sm text-zinc-500">
                                {t("没有找到匹配的成员")}
                            </div>
                        )}
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
