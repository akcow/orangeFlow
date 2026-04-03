import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditsCenterDialog } from "@/components/CreditsCenterDialog";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGetMyCreditsQuery } from "@/controllers/API/queries/credits";
import useCreditsCenterStore from "@/stores/creditsCenterStore";
import { cn } from "@/utils/utils";
import { CreateTeamModal } from "./CreateTeamModal";
import { QuotaProgress } from "./QuotaProgress";
import { useTeamMockData } from "./useTeamMockData";

export default function TeamMenu() {
  const { i18n } = useTranslation();
  const { teams, currentTeam, switchTeam, createTeam } = useTeamMockData();
  const { data: creditAccount } = useGetMyCreditsQuery();
  const openCreditsCenter = useCreditsCenterStore(
    (state) => state.openCreditsCenter,
  );

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const currentUserRole =
    currentTeam.currentUserRole ??
    currentTeam.members.find((member) => member.isCurrentUser)?.role;
  const roleText =
    currentUserRole === "owner"
      ? isZh
        ? "\u6240\u6709\u8005"
        : "Owner"
      : currentUserRole === "admin"
        ? isZh
          ? "\u7ba1\u7406\u5458"
          : "Admin"
        : isZh
          ? "\u6210\u5458"
          : "Member";
  const memberCountText = `${currentTeam.memberCount ?? currentTeam.members.length} ${
    isZh ? "\u540d\u6210\u5458" : "members"
  }`;
  const creditBalance = creditAccount?.balance ?? 0;

  const handleOpenSection = (
    section: Parameters<typeof openCreditsCenter>[0],
  ) => {
    setIsMenuOpen(false);
    openCreditsCenter(section);
  };

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "hidden h-10 touch-manipulation select-none items-center gap-2 rounded-xl border border-white/15 bg-black px-3 text-white transition-colors active:!scale-100 !scale-100 md:inline-flex",
              "hover:bg-white/[0.08] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 !ring-0 !outline-none",
              isMenuOpen ? "bg-white/[0.08]" : "",
            )}
          >
            {currentTeam.avatar ? (
              <img
                src={currentTeam.avatar}
                alt="Team"
                className="h-7 w-7 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5E7B92] text-xs font-semibold">
                {currentTeam.name[0].toUpperCase()}
              </span>
            )}
            <span className="max-w-[180px] truncate text-sm font-medium">
              {currentTeam.name}
            </span>
            <IconComponent
              name="ChevronDown"
              className={cn(
                "h-3.5 w-3.5 shrink-0 opacity-65 transition-transform duration-500",
                isMenuOpen && "rotate-180",
              )}
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-[280px] rounded-xl border-zinc-800 bg-[#1A1A1A] p-2 text-zinc-100"
        >
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-3">
              {currentTeam.avatar ? (
                <img
                  src={currentTeam.avatar}
                  alt="Team"
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#5E7B92] text-lg font-semibold text-white">
                  {currentTeam.name[0].toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{currentTeam.name}</span>
                <span className="text-xs text-zinc-400">
                  {roleText} {"\u00b7"} {memberCountText}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => handleOpenSection("teamSettings")}
            >
              <IconComponent name="Settings" className="h-4 w-4" />
            </Button>
          </div>

          <DropdownMenuSeparator className="my-2 bg-zinc-800" />

          <div className="flex flex-col gap-2 px-2 py-2">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleOpenSection("topup")}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <IconComponent name="Box" className="h-4 w-4 text-zinc-400" />
                <span className="font-semibold">{creditBalance}</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#1BB3E4]">
                  CREDITS
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenSection("teamBenefits")}
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                aria-label={isZh ? "\u6253\u5f00\u56e2\u961f\u6743\u76ca" : "Open team benefits"}
              >
                <IconComponent name="ChevronRight" className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-1 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-[#1BB3E4]">
                <span>
                  {isZh ? "\u5269\u4f59 / \u603b\u989d" : "Remaining / Total"}
                </span>
                <IconComponent
                  name="HelpCircle"
                  className="h-3 w-3 text-zinc-500"
                />
              </div>
            </div>
            <QuotaProgress
              isZh={isZh}
              summary={currentTeam.quota}
              className="mt-1"
            />
          </div>

          <DropdownMenuSeparator className="my-2 bg-zinc-800" />

          <div className="flex flex-col gap-1 py-1">
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => {
                  setIsMenuOpen(false);
                  switchTeam(team.id);
                }}
                className="cursor-pointer justify-between rounded-md py-2 hover:bg-zinc-800"
              >
                <div className="flex items-center gap-2">
                  {team.avatar ? (
                    <img
                      src={team.avatar}
                      alt="Team"
                      className={cn(
                        "h-6 w-6 shrink-0 rounded object-cover",
                        team.id === currentTeam.id ? "ring-2 ring-white" : "",
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold text-white",
                        team.id === currentTeam.id ? "bg-[#5E7B92]" : "bg-zinc-700",
                      )}
                    >
                      {team.name[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm">{team.name}</span>
                </div>
                {team.id === currentTeam.id ? (
                  <IconComponent name="Check" className="h-4 w-4 text-white" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuItem
            onClick={() => {
              setIsMenuOpen(false);
              setIsCreateOpen(true);
            }}
            className="cursor-pointer gap-2 rounded-md py-2 text-[#1BB3E4] hover:bg-zinc-800"
          >
            <IconComponent name="Plus" className="h-4 w-4" />
            <span>{isZh ? "\u521b\u5efa\u56e2\u961f" : "Create team"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateTeamModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={createTeam}
      />
      <CreditsCenterDialog />
    </>
  );
}
