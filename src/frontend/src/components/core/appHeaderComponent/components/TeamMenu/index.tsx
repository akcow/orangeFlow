import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import IconComponent from "@/components/common/genericIconComponent";
import { useTeamMockData } from "./useTeamMockData";
import { CreateTeamModal } from "./CreateTeamModal";
import { TeamSettingsModal } from "./TeamSettingsModal";
import { cn } from "@/utils/utils";

export default function TeamMenu() {
    const { t } = useTranslation();
    const { teams, currentTeam, switchTeam, createTeam, updateMemberRole, updateTeamProfile } = useTeamMockData();

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const currentUserRole = currentTeam.members.find(m => m.isCurrentUser)?.role;
    const roleText = currentUserRole === "owner" ? t("所有者") : t("成员");
    const memberCountText = `${currentTeam.members.length} ${t("位成员")}`;

    return (
        <>
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            "hidden h-10 touch-manipulation select-none items-center gap-2 rounded-xl border border-white/15 bg-black px-3 text-white transition-colors active:!scale-100 !scale-100 md:inline-flex",
                            "hover:bg-white/[0.08] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 !ring-0 !outline-none",
                            isMenuOpen ? "bg-white/[0.08]" : ""
                        )}
                    >
                        {currentTeam.avatar ? (
                            <img src={currentTeam.avatar} alt="Team" className="h-7 w-7 rounded-lg object-cover" />
                        ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5E7B92] text-xs font-semibold">
                                {currentTeam.name[0].toUpperCase()}
                            </span>
                        )}
                        <span className="max-w-[180px] truncate text-sm font-medium">{currentTeam.name}</span>
                        <IconComponent name="ChevronDown" className={cn("h-3.5 w-3.5 shrink-0 opacity-65 transition-transform duration-500", isMenuOpen && "rotate-180")} />
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    align="end"
                    className="w-[280px] bg-[#1A1A1A] border-zinc-800 text-zinc-100 p-2 rounded-xl"
                >
                    {/* Current Team Header Info */}
                    <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex items-center gap-3">
                            {currentTeam.avatar ? (
                                <img src={currentTeam.avatar} alt="Team" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                            ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#5E7B92] text-lg font-semibold text-white">
                                    {currentTeam.name[0].toUpperCase()}
                                </div>
                            )}
                            <div className="flex flex-col">
                                <span className="font-semibold text-sm">{currentTeam.name}</span>
                                <span className="text-xs text-zinc-400">
                                    {roleText} · {memberCountText}
                                </span>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-white"
                            onClick={() => setIsSettingsOpen(true)}
                        >
                            <IconComponent name="Settings" className="h-4 w-4" />
                        </Button>
                    </div>

                    <DropdownMenuSeparator className="bg-zinc-800 my-2" />

                    {/* Quota Section */}
                    <div className="px-2 py-2 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <IconComponent name="Box" className="h-4 w-4 text-zinc-400" />
                                <span className="font-semibold">{currentTeam.quota.used}</span>
                                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase font-bold text-[#1BB3E4]">
                                    {currentTeam.quota.type}
                                </span>
                            </div>
                            <IconComponent name="ChevronRight" className="h-4 w-4 text-zinc-500" />
                        </div>

                        <div className="flex justify-between items-center text-xs mt-1">
                            <div className="flex items-center gap-1 text-[#1BB3E4]">
                                <span>{t("无额度限制")}</span>
                                <IconComponent name="HelpCircle" className="h-3 w-3 text-zinc-500" />
                            </div>
                            <IconComponent name="Infinity" className="h-3 w-3 text-[#1BB3E4]" />
                        </div>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-[#1BB3E4] w-full" />
                        </div>
                    </div>

                    <DropdownMenuSeparator className="bg-zinc-800 my-2" />

                    {/* Team Switch List */}
                    <div className="flex flex-col gap-1 py-1">
                        {teams.map((team) => (
                            <DropdownMenuItem
                                key={team.id}
                                onClick={() => switchTeam(team.id)}
                                className="flex items-center justify-between rounded-md cursor-pointer hover:bg-zinc-800 py-2"
                            >
                                <div className="flex items-center gap-2">
                                    {team.avatar ? (
                                        <img src={team.avatar} alt="Team" className={cn("h-6 w-6 shrink-0 rounded object-cover", team.id === currentTeam.id ? "ring-2 ring-white" : "")} />
                                    ) : (
                                        <div className={cn(
                                            "flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold text-white",
                                            team.id === currentTeam.id ? "bg-[#5E7B92]" : "bg-zinc-700"
                                        )}>
                                            {team.name[0].toUpperCase()}
                                        </div>
                                    )}
                                    <span className="text-sm">{team.name}</span>
                                </div>
                                {team.id === currentTeam.id && (
                                    <IconComponent name="Check" className="h-4 w-4 text-white" />
                                )}
                            </DropdownMenuItem>
                        ))}
                    </div>

                    <DropdownMenuSeparator className="bg-zinc-800 my-2" />

                    {/* Create Team Button */}
                    <DropdownMenuItem
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800 text-[#1BB3E4] rounded-md py-2"
                    >
                        <IconComponent name="Plus" className="h-4 w-4" />
                        <span>{t("创建团队")}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <CreateTeamModal
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onCreate={createTeam}
            />
            <TeamSettingsModal
                open={isSettingsOpen}
                onOpenChange={setIsSettingsOpen}
                team={currentTeam}
                updateMemberRole={updateMemberRole}
                updateTeamProfile={updateTeamProfile}
            />
        </>
    );
}
