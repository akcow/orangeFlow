import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Crown,
  FileText,
  Infinity,
  LogOut,
  Package2,
  Pencil,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  useGetCreditPricingQuery,
  useGetMyCreditLedgerQuery,
  useGetMyCreditsQuery,
} from "@/controllers/API/queries/credits";
import { customPreLoadImageUrl } from "@/customization/utils/custom-pre-load-image-url";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import useCreditsCenterStore, {
  type CreditsCenterSection,
} from "@/stores/creditsCenterStore";
import type { CreditLedgerEntry, CreditPricingRule } from "@/types/api";
import { cn } from "@/utils/utils";
import { EditTeamProfileModal } from "../core/appHeaderComponent/components/TeamMenu/EditTeamProfileModal";
import {
  type Role,
  useTeamMockData,
} from "../core/appHeaderComponent/components/TeamMenu/useTeamMockData";

type BillingView = "invoice" | "transactions";
type SidebarItem = {
  key:
    | CreditsCenterSection
    | "subscription"
    | "modelStore"
    | "personalSettings"
    | "tutorial"
    | "logout";
  labelZh: string;
  labelEn: string;
  icon: typeof CircleDollarSign;
};

const EXCHANGE_RATE = 10;
const MIN_TOPUP_CREDITS = 500;
const MAX_TOPUP_CREDITS = 500_000;
const TOPUP_STEP = 100;
const TOPUP_PRESETS = [1000, 2000, 3000, 5000, 10_000];

const sidebarGroups: Array<{ titleZh: string; titleEn: string; items: SidebarItem[] }> = [
  {
    titleZh: "订阅和充值",
    titleEn: "Subscriptions",
    items: [
      { key: "subscription", labelZh: "订阅套餐", labelEn: "Subscriptions", icon: Package2 },
      { key: "modelStore", labelZh: "模型超市", labelEn: "Model Store", icon: ShoppingBag },
      { key: "topup", labelZh: "充值积分", labelEn: "Top Up Credits", icon: CircleDollarSign },
    ],
  },
  {
    titleZh: "权益和账单",
    titleEn: "Benefits & Billing",
    items: [
      { key: "teamBenefits", labelZh: "团队权益", labelEn: "Team Benefits", icon: ShieldCheck },
      { key: "billing", labelZh: "账单记录", labelEn: "Billing Records", icon: ReceiptText },
    ],
  },
  {
    titleZh: "通用设置",
    titleEn: "General",
    items: [
      { key: "personalSettings", labelZh: "个人设置", labelEn: "Personal Settings", icon: UserRound },
      { key: "teamSettings", labelZh: "团队设置", labelEn: "Team Settings", icon: Settings2 },
    ],
  },
];

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string, isZh: boolean) {
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function clampTopupAmount(value: number) {
  if (!Number.isFinite(value)) return MIN_TOPUP_CREDITS;
  const stepped = Math.round(value / TOPUP_STEP) * TOPUP_STEP;
  return Math.min(MAX_TOPUP_CREDITS, Math.max(MIN_TOPUP_CREDITS, stepped));
}

function getRoleLabel(role: Role, isZh: boolean) {
  if (role === "owner") return isZh ? "所有者" : "Owner";
  if (role === "admin") return isZh ? "管理员" : "Admin";
  return isZh ? "成员" : "Member";
}

function getLedgerDisplayName(
  entry: CreditLedgerEntry,
  pricingRuleMap: Map<string, CreditPricingRule>,
  isZh: boolean,
) {
  const pricingKey = `${entry.component_key ?? ""}:${entry.model_key ?? ""}`;
  const matchedRule = pricingRuleMap.get(pricingKey);
  if (entry.remark?.trim()) return entry.remark;
  if (matchedRule?.display_name) return matchedRule.display_name;
  if (entry.entry_type === "INITIAL_GRANT") return isZh ? "初始赠送积分" : "Initial credit grant";
  if (entry.entry_type === "MANUAL_ADJUSTMENT")
    return isZh ? "管理员手动调整" : "Manual credit adjustment";
  return isZh ? "模型使用扣费" : "Model usage charge";
}

function getLedgerTypeLabel(entry: CreditLedgerEntry, isZh: boolean) {
  if (entry.delta > 0) return isZh ? "收入" : "Credit In";
  if (entry.entry_type === "INITIAL_GRANT") return isZh ? "赠送" : "Grant";
  return isZh ? "支出" : "Usage";
}

function TeamSettingsPanel({
  isZh,
  team,
  canEditTeam,
  searchQuery,
  onSearchChange,
  onRefresh,
  onCopyTeamId,
  onInviteMembers,
  onEditProfile,
  updateMemberRole,
}: {
  isZh: boolean;
  team: ReturnType<typeof useTeamMockData>["currentTeam"];
  canEditTeam: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCopyTeamId: () => void;
  onInviteMembers: () => void;
  onEditProfile: () => void;
  updateMemberRole: (userId: string, role: Role) => void;
}) {
  const members = team.members.filter(
    (member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-4">
        <div className="relative">
          {team.avatar ? (
            <img src={team.avatar} alt={team.name} className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#5E7B92] text-2xl font-semibold text-white">
              {team.name[0]?.toUpperCase()}
            </div>
          )}
          {canEditTeam ? (
            <button
              type="button"
              onClick={onEditProfile}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md hover:bg-zinc-200"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div>
          <div className="text-[15px] font-semibold text-white">{team.name}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/38">
            <span>{isZh ? "团队 ID" : "Team ID"}: {team.id}</span>
            <button type="button" onClick={onCopyTeamId} className="text-white/48 hover:text-white">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 text-[18px] font-semibold text-white">{isZh ? "团队设置" : "Team Settings"}</div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={onRefresh} className="rounded-full p-2 text-white/45 hover:bg-white/[0.05] hover:text-white">
            <RefreshCcw className="h-4 w-4" />
          </button>
          <div className="relative w-[250px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={isZh ? "查找成员" : "Search members"}
              className="h-10 rounded-2xl border-white/10 bg-transparent pl-10 text-sm text-white"
            />
          </div>
          <Button
            unstyled
            onClick={onInviteMembers}
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#2FA8E5] px-5 text-sm font-medium text-white transition-colors hover:bg-[#47b3ea]"
          >
            + {isZh ? "邀请成员" : "Invite Member"}
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[20px] border border-white/6 bg-[#171717]">
        <div className="grid grid-cols-[minmax(220px,1fr)_240px_140px] gap-4 border-b border-white/6 px-5 py-3 text-sm text-white/40">
          <span>{isZh ? "成员信息" : "Member Info"}</span>
          <span className="justify-self-center">{isZh ? "剩余 / 总额" : "Remaining / Total"}</span>
          <span className="justify-self-end">{isZh ? "角色" : "Role"}</span>
        </div>
        {members.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-white/40">{isZh ? "暂无匹配成员" : "No members found"}</div>
        ) : (
          members.map((member, index) => (
            <div
              key={member.userId}
              className={cn(
                "grid grid-cols-[minmax(220px,1fr)_240px_140px] items-center gap-4 px-5 py-5",
                index !== members.length - 1 && "border-b border-white/6",
              )}
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  {member.avatar ? (
                    <img src={member.avatar} alt={member.name} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                      <UserRound className="h-5 w-5 text-white/80" />
                    </div>
                  )}
                  {member.role === "owner" ? (
                    <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#171717]">
                      <Crown className="h-3.5 w-3.5 fill-white text-white" />
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-white">
                    {member.name}
                    {member.isCurrentUser ? <span className="ml-1 text-[#1BB3E4]">{isZh ? "(你)" : "(You)"}</span> : null}
                  </div>
                  <div className="truncate text-sm text-white/55">{member.email}</div>
                </div>
              </div>

              <div className="flex flex-col gap-1 px-4">
                {member.role === "owner" ? (
                  <>
                    <div className="flex items-center justify-between text-sm text-[#39BFFF]">
                      <span>{isZh ? "无额度限制" : "Unlimited quota"}</span>
                      <Infinity className="h-4 w-4" />
                    </div>
                    <div className="h-2 rounded-full bg-white/8">
                      <div className="h-full w-full rounded-full bg-[#39BFFF]" />
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-white/35">-</span>
                )}
              </div>

              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={!canEditTeam}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/8 bg-transparent px-4 text-sm text-white/70 hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>{getRoleLabel(member.role, isZh)}</span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="border-white/10 bg-[#1A1A1A] text-white">
                    {(["owner", "admin", "member"] as const).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onClick={() => updateMemberRole(member.userId, role)}
                        className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
                      >
                        {getRoleLabel(role, isZh)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TeamBenefitsPanel({
  isZh,
  currentTeam,
  currentBalance,
  onCopyTeamId,
  onRecharge,
  onUpgrade,
}: {
  isZh: boolean;
  currentTeam: ReturnType<typeof useTeamMockData>["currentTeam"];
  currentBalance: number;
  onCopyTeamId: () => void;
  onRecharge: () => void;
  onUpgrade: () => void;
}) {
  return (
    <div className="pt-2">
      <div className="overflow-hidden rounded-[22px] border border-white/6 bg-[#202020]">
        <div className="flex items-start justify-between gap-6 border-b border-white/8 px-6 py-7">
          <div>
            <div className="text-[18px] font-semibold text-white">{isZh ? "积分余额" : "Credit Balance"}: {formatCredits(currentBalance)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/38">
              <span>{isZh ? "当前汇率" : "Current Rate"}</span>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-white/55">{`${isZh ? "¥1 = 10 积分" : "¥1 = 10 credits"}`}</span>
              <span>{isZh ? "升级套餐，解锁更高充值汇率" : "Upgrade the plan to unlock a better recharge rate"}</span>
            </div>
          </div>
          <Button onClick={onRecharge} className="h-11 rounded-2xl border border-white/8 bg-white/[0.05] px-6 text-sm text-white hover:bg-white/[0.08]">
            {isZh ? "充值" : "Recharge"}
          </Button>
        </div>
        <div className="flex items-start justify-between gap-6 border-b border-white/8 px-6 py-7">
          <div>
            <div className="text-[18px] font-semibold text-white">{currentTeam.quota.type === "PRO" ? (isZh ? "专业版" : "Pro") : isZh ? "免费版" : "Free"}</div>
            <div className="mt-2 text-sm text-white/38">{isZh ? "升级订阅套餐解锁更多功能，为专业创作加速" : "Upgrade your subscription to unlock more features and accelerate creation"}</div>
          </div>
          <Button onClick={onUpgrade} className="h-11 rounded-2xl border border-white/8 bg-white/[0.05] px-6 text-sm text-white hover:bg-white/[0.08]">
            {isZh ? "升级" : "Upgrade"}
          </Button>
        </div>
        <div className="flex items-start justify-between gap-6 px-6 py-7">
          <div>
            <div className="text-[18px] font-semibold text-white">{isZh ? "你的团队" : "Your Team"}: {currentTeam.name}</div>
            <div className="mt-2 text-sm text-white/38">{isZh ? "团队ID" : "Team ID"}: {currentTeam.id}</div>
          </div>
          <Button onClick={onCopyTeamId} className="h-11 rounded-2xl border border-white/8 bg-white/[0.05] px-5 text-sm text-white hover:bg-white/[0.08]">
            <Copy className="mr-2 h-4 w-4" />
            {isZh ? "复制团队ID" : "Copy Team ID"}
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[16px] font-semibold text-white">{isZh ? "配额信息" : "Quota Information"}</div>
        <div className="mt-4 flex h-[120px] items-center justify-center rounded-[22px] border border-white/6 bg-[#202020] text-[16px] font-medium text-white/28">
          {isZh ? "暂无配额信息" : "No quota information yet"}
        </div>
      </div>
    </div>
  );
}

export function CreditsCenterDialog() {
  const { i18n } = useTranslation();
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const { userData } = useAuthStore();
  const setNoticeData = useAlertStore((state) => state.setNoticeData);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const { open, section, closeCreditsCenter, setSection } = useCreditsCenterStore();
  const { currentTeam, updateMemberRole, updateTeamProfile } = useTeamMockData();
  const [billingView, setBillingView] = useState<BillingView>("transactions");
  const [topupAmount, setTopupAmount] = useState(3000);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);

  const { data: creditAccount } = useGetMyCreditsQuery({ enabled: open });
  const { data: creditLedger = [] } = useGetMyCreditLedgerQuery({ limit: 50 }, { enabled: open });
  const { data: pricingRules = [] } = useGetCreditPricingQuery({ enabled: open });

  const pricingRuleMap = useMemo(
    () => new Map(pricingRules.map((rule) => [`${rule.component_key}:${rule.model_key}`, rule] as const)),
    [pricingRules],
  );
  const activePricingRules = useMemo(() => pricingRules.filter((rule) => rule.is_active), [pricingRules]);
  const accountName = userData?.nickname || userData?.username || (isZh ? "用户" : "User");
  const accountSubline = userData?.username ? `@${userData.username}` : "";
  const currentBalance = creditAccount?.balance ?? 0;
  const totalCost = topupAmount / EXCHANGE_RATE;
  const avatarSrc = userData?.profile_image ? customPreLoadImageUrl(userData.profile_image) : undefined;
  const avatarFallback = accountName.slice(0, 1).toUpperCase();
  const currentUserRole = currentTeam.members.find((member) => member.isCurrentUser)?.role;
  const canEditTeam = currentUserRole === "owner";

  const handleSidebarAction = (key: SidebarItem["key"]) => {
    if (key === "topup" || key === "billing" || key === "teamBenefits" || key === "teamSettings") {
      setSection(key);
      return;
    }
    if (key === "tutorial") {
      window.open("https://docs.langflow.org", "_blank");
      return;
    }
    setNoticeData({ title: isZh ? "该入口暂时只保留展示。" : "This entry is display-only for now." });
  };

  const handleCopyTeamId = () => {
    void navigator.clipboard.writeText(currentTeam.id);
    setSuccessData({ title: isZh ? "团队 ID 已复制" : "Team ID copied" });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeCreditsCenter()}>
        <DialogContent
          className="h-[min(720px,calc(100vh-40px))] w-[min(1520px,calc(100vw-40px))] max-w-[1520px] gap-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#0E0E0F] p-0 text-white shadow-[0_40px_140px_rgba(0,0,0,0.55)]"
          closeButtonClassName="right-5 top-5 h-9 w-9 rounded-full bg-transparent text-white/65 hover:bg-white/[0.05] hover:text-white"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{isZh ? "付费管理中心" : "Billing Center"}</DialogTitle>
            <DialogDescription>{isZh ? "查看积分余额、账单记录、团队设置和团队权益。" : "View credits, billing records, team settings, and team benefits."}</DialogDescription>
          </DialogHeader>

          <div className="flex h-full min-h-0">
            <aside className="flex w-[250px] shrink-0 flex-col border-r border-white/6 bg-[#1A1A1A] px-4 py-7">
              {sidebarGroups.map((group) => (
                <div key={group.titleEn} className="mt-7 first:mt-0">
                  <div className="px-3 text-[13px] font-semibold text-white/30">{isZh ? group.titleZh : group.titleEn}</div>
                  <div className="mt-3 space-y-1.5">
                    {group.items
                      .filter((item) => item.key !== "personalSettings")
                      .map((item) => {
                      const Icon = item.icon;
                      const active = section === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleSidebarAction(item.key)}
                          className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] transition-colors", active ? "bg-white/[0.06] text-white" : "text-white/72 hover:bg-white/[0.04] hover:text-white")}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{isZh ? item.labelZh : item.labelEn}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="mt-7">
                <div className="px-3 text-[13px] font-semibold text-white/30">{isZh ? "帮助与支持" : "Help"}</div>
                <button type="button" onClick={() => handleSidebarAction("tutorial")} className="mt-3 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] text-white/72 hover:bg-white/[0.04] hover:text-white">
                  <BookOpen className="h-4 w-4" />
                  <span>{isZh ? "使用教程" : "Tutorial"}</span>
                </button>
              </div>

              <div className="mt-auto px-3 pt-8">
                <div className="flex items-center gap-2 text-[14px] text-white/55">
                  <RefreshCcw className="h-4 w-4" />
                  <span>v1.00.00</span>
                </div>
                <button type="button" onClick={() => handleSidebarAction("logout")} className="mt-4 flex items-center gap-2 text-[15px] font-medium text-[#F05A5A] hover:text-[#ff7b7b]">
                  <LogOut className="h-4 w-4" />
                  <span>{isZh ? "登出账号" : "Log Out"}</span>
                </button>
              </div>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#111111]">
              <div className="min-h-0 flex-1 overflow-y-auto px-9 py-9">
                {section === "topup" ? (
                  <div className="space-y-6">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 border border-white/10">
                          <AvatarImage src={avatarSrc} alt={accountName} />
                          <AvatarFallback className="bg-white/10 text-white">{avatarFallback}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h2 className="text-[24px] font-semibold leading-none tracking-tight">{accountName}</h2>
                          {accountSubline ? <p className="mt-2 text-sm text-white/40">{accountSubline}</p> : null}
                        </div>
                      </div>
                      <div className="pr-10 text-right">
                        <div className="text-[38px] font-semibold leading-none tracking-tight">{formatCredits(currentBalance)}</div>
                        <div className="mt-2 text-sm text-white/42">{isZh ? "积分余额" : "Credit Balance"}</div>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/8 bg-[#202020]">
                      <div className="grid min-h-[300px] grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
                        <div className="border-r border-white/8 px-6 py-6">
                          <h3 className="text-[24px] font-semibold leading-none">{isZh ? "充值积分" : "Top Up Credits"}</h3>
                          <div className="mt-10 text-[20px] font-semibold text-white/90">{isZh ? "选择充值额度" : "Select credit amount"}</div>
                          <div className="mt-3 flex items-end gap-3">
                            <span className="text-[40px] font-semibold leading-none text-[#32B8FF]">{formatCredits(topupAmount)}</span>
                            <span className="pb-1.5 text-lg text-white/70">{isZh ? "积分" : "credits"}</span>
                          </div>
                          <div className="mt-8">
                            <input type="range" min={MIN_TOPUP_CREDITS} max={MAX_TOPUP_CREDITS} step={TOPUP_STEP} value={topupAmount} onChange={(event) => setTopupAmount(clampTopupAmount(Number(event.target.value)))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#2FA8E5]" />
                            <div className="mt-3 flex items-center justify-between text-sm text-white/34">
                              <span>{formatCredits(MIN_TOPUP_CREDITS)}</span>
                              <span>{formatCredits(MAX_TOPUP_CREDITS)}</span>
                            </div>
                          </div>
                          <Input value={String(topupAmount)} onChange={(event) => setTopupAmount(clampTopupAmount(Number(event.target.value.replace(/[^\d]/g, ""))))} className="mt-5 h-10 rounded-xl border-white/10 bg-transparent px-4 text-sm text-white" />
                          <div className="mt-6 grid grid-cols-5 gap-3">
                            {TOPUP_PRESETS.map((preset) => (
                              <button key={preset} type="button" onClick={() => setTopupAmount(preset)} className={cn("rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors", topupAmount === preset ? "border-[#2FA8E5] bg-[#2FA8E5] text-white" : "border-white/10 bg-[#131313] text-white/80 hover:border-white/20 hover:text-white")}>
                                {formatCredits(preset)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col justify-between px-6 py-6">
                          <div>
                            <div className="text-[20px] font-semibold text-white">{isZh ? "获得积分" : "Credits received"}</div>
                            <div className="mt-5 text-[38px] font-semibold leading-none text-[#32B8FF]">{formatCredits(topupAmount)}</div>
                            <div className="mt-2 text-base text-white/70">{isZh ? "积分" : "credits"}</div>
                            <div className="mt-8 flex items-center justify-between border-b border-white/8 pb-4">
                              <span className="text-sm text-white/42">{isZh ? "当前汇率" : "Current rate"}</span>
                              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-white/82">{`¥1 = ${EXCHANGE_RATE} ${isZh ? "积分" : "Credits"}`}</span>
                            </div>
                            <div className="mt-5 flex items-center justify-between">
                              <span className="text-[18px] text-white/62">{isZh ? "应付金额" : "Amount due"}</span>
                              <span className="text-[38px] font-semibold leading-none text-white">{formatCurrency(totalCost)}</span>
                            </div>
                          </div>
                          <Button
                            unstyled
                            onClick={() => setNoticeData({ title: isZh ? "充值页面当前仅做展示，暂未接入真实支付能力。" : "Top-up is display-only for now." })}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#2FA8E5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#47b3ea]"
                          >
                            {isZh ? "立即充值" : "Recharge Now"}
                          </Button>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : null}

                {section === "billing" ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="inline-flex w-fit rounded-xl bg-white/10 p-1">
                      {(["invoice", "transactions"] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setBillingView(key)}
                          className={cn("min-w-[184px] rounded-lg px-6 py-2.5 text-sm font-medium transition-colors", billingView === key ? "bg-[#0D0D0F] text-white" : "text-white/45 hover:text-white/80")}
                        >
                          <span className="inline-flex items-center gap-2">
                            {key === "invoice" ? <FileText className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />}
                            {key === "invoice" ? (isZh ? "账单" : "Invoices") : isZh ? "交易记录" : "Transactions"}
                          </span>
                        </button>
                      ))}
                    </div>

                    {billingView === "invoice" ? (
                      <div className="mt-7 flex min-h-0 flex-1 flex-col">
                        <div className="mb-5 flex items-center justify-between gap-4">
                          <h3 className="text-[28px] font-semibold leading-none">{isZh ? "账单详情" : "Invoice Details"}</h3>
                          <Button variant="ghost" disabled className="h-10 rounded-xl bg-[#2FA8E5] px-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60">
                            {isZh ? "生成账单" : "Generate Invoice"}
                          </Button>
                        </div>
                        <div className="overflow-hidden rounded-[18px] border border-white/8 bg-[#161719]">
                          <div className="grid grid-cols-[minmax(260px,1.2fr)_220px_minmax(260px,1.1fr)_160px_140px] gap-4 border-b border-white/8 bg-white/[0.05] px-4 py-3 text-[13px] text-white/45">
                            <span>{isZh ? "账单ID" : "Invoice ID"}</span>
                            <span>{isZh ? "创建时间" : "Created At"}</span>
                            <span>{isZh ? "描述" : "Description"}</span>
                            <span>{isZh ? "金额" : "Amount"}</span>
                            <span>{isZh ? "状态" : "Status"}</span>
                          </div>
                          <div className="flex h-[280px] items-center justify-center px-6 text-center text-[13px] text-white/45">{isZh ? "当前充值功能仅做展示，暂未生成真实账单记录。" : "Top-up is not available yet, so there are no invoice records to generate."}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-7 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-white/8 bg-[#121315]">
                        <div className="grid grid-cols-[220px_220px_110px_minmax(280px,1fr)_110px_160px_90px] gap-4 border-b border-white/8 bg-white/[0.05] px-4 py-3 text-[13px] text-white/45">
                          <span>{isZh ? "交易ID" : "Transaction ID"}</span>
                          <span>{isZh ? "创建时间" : "Created At"}</span>
                          <span>{isZh ? "类型" : "Type"}</span>
                          <span>{isZh ? "说明" : "Description"}</span>
                          <span>{isZh ? "金额" : "Amount"}</span>
                          <span>{isZh ? "状态" : "Status"}</span>
                          <span>{isZh ? "余额" : "Balance"}</span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                          {creditLedger.length === 0 ? (
                            <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-white/45">{isZh ? "暂无交易记录" : "No credit transactions yet"}</div>
                          ) : (
                            creditLedger.map((entry) => (
                              <div key={entry.id} className="grid grid-cols-[220px_220px_110px_minmax(280px,1fr)_110px_160px_90px] gap-4 border-t border-white/6 px-4 py-4 text-[13px]">
                                <span className="truncate text-white/90">{entry.id}</span>
                                <span className="text-white/58">{formatDateTime(entry.created_at, isZh)}</span>
                                <span className="font-medium text-white">{getLedgerTypeLabel(entry, isZh)}</span>
                                <span className="truncate text-white/60">{getLedgerDisplayName(entry, pricingRuleMap, isZh)}</span>
                                <span className={cn("font-semibold", entry.delta > 0 ? "text-emerald-400" : "text-rose-400")}>
                                  {entry.delta > 0 ? `+${formatCredits(entry.delta)}` : formatCredits(Math.abs(entry.delta))}
                                </span>
                                <span className={cn("w-fit rounded-full px-3 py-1 text-xs font-semibold", entry.delta > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-[#0F3D26] text-[#1CE07A]")}>
                                  COMPLETED
                                </span>
                                <span className="font-medium text-white">{formatCredits(entry.balance_after)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {section === "teamSettings" ? (
                  <TeamSettingsPanel
                    isZh={isZh}
                    team={currentTeam}
                    canEditTeam={canEditTeam}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onRefresh={() => setNoticeData({ title: isZh ? "团队成员列表已是最新状态。" : "Team member list is already up to date." })}
                    onCopyTeamId={handleCopyTeamId}
                    onInviteMembers={() => setNoticeData({ title: isZh ? "邀请成员功能暂未接入，当前页面先保留展示。" : "Member invitation is not connected yet." })}
                    onEditProfile={() => setIsProfileEditOpen(true)}
                    updateMemberRole={updateMemberRole}
                  />
                ) : null}

                {section === "teamBenefits" ? (
                  <TeamBenefitsPanel
                    isZh={isZh}
                    currentTeam={currentTeam}
                    currentBalance={currentBalance}
                    onCopyTeamId={handleCopyTeamId}
                    onRecharge={() => setSection("topup")}
                    onUpgrade={() => setNoticeData({ title: isZh ? "升级功能暂未接入，当前仅保留展示。" : "Upgrade is display-only for now." })}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditTeamProfileModal
        open={isProfileEditOpen}
        onOpenChange={setIsProfileEditOpen}
        team={currentTeam}
        updateTeamProfile={updateTeamProfile}
      />
    </>
  );
}
