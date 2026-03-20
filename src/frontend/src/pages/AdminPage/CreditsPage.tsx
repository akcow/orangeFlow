import {
  CircleDollarSign,
  History,
  Search,
  Shield,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PaginatorComponent from "@/components/common/paginatorComponent";
import {
  useGetAdminCreditUsersQuery,
  useGetAdminUserCreditLedgerQuery,
  usePostAdjustUserCredits,
} from "@/controllers/API/queries/credits";
import { useTranslation } from "react-i18next";
import type { CreditLedgerEntry, CreditLedgerEntryType } from "@/types/api";
import { dispatchCreditsRefreshEvent } from "@/utils/creditsEvents";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import CustomLoader from "@/customization/components/custom-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PAGINATION_PAGE,
  PAGINATION_ROWS_COUNT,
  PAGINATION_SIZE,
} from "@/constants/constants";
import useAlertStore from "@/stores/alertStore";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string, isZh: boolean) {
  return new Date(value).toLocaleString(isZh ? "zh-CN" : "en-US", {
    hour12: false,
  });
}

function getLedgerTypeLabel(entryType: CreditLedgerEntryType, isZh: boolean) {
  if (entryType === "INITIAL_GRANT") {
    return isZh ? "初始赠送" : "Initial grant";
  }
  if (entryType === "MANUAL_ADJUSTMENT") {
    return isZh ? "手动调整" : "Manual adjustment";
  }
  return isZh ? "模型扣费" : "Usage charge";
}

function getLedgerTitle(entry: CreditLedgerEntry, isZh: boolean) {
  if (entry.remark?.trim()) return entry.remark;
  return getLedgerTypeLabel(entry.entry_type, isZh);
}

export default function AdminCreditsPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const [pageSize, setPageSize] = useState(PAGINATION_SIZE);
  const [pageIndex, setPageIndex] = useState(PAGINATION_PAGE);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [creditAdjustAmount, setCreditAdjustAmount] = useState("0");
  const [creditAdjustRemark, setCreditAdjustRemark] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const {
    data: adminCreditUsersPage,
    isLoading: isLoadingUsers,
    refetch: refetchAdminCreditUsers,
  } = useGetAdminCreditUsersQuery({
    skip: pageSize * (pageIndex - 1),
    limit: pageSize,
    search,
  });
  const users = adminCreditUsersPage?.users ?? [];
  const totalCount = adminCreditUsersPage?.total_count ?? 0;

  useEffect(() => {
    if (users.length === 0) {
      setSelectedUserId(null);
      return;
    }
    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
      setCreditAdjustAmount("0");
      setCreditAdjustRemark("");
    }
  }, [selectedUserId, users]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const {
    data: selectedCreditLedger = [],
    isLoading: isLoadingLedger,
    refetch: refetchSelectedCreditLedger,
  } = useGetAdminUserCreditLedgerQuery(
    { userId: selectedUserId ?? "", limit: 20 },
    { enabled: !!selectedUserId },
  );

  const { mutate: mutateAdjustUserCredits, isPending: isAdjustingCredits } =
    usePostAdjustUserCredits();

  function handleChangePagination(nextPageIndex: number, nextPageSize: number) {
    setPageIndex(nextPageIndex);
    setPageSize(nextPageSize);
  }

  function handleSelectUser(userId: string) {
    setSelectedUserId(userId);
    setCreditAdjustAmount("0");
    setCreditAdjustRemark("");
  }

  function handleAdjustCredits() {
    if (!selectedUser) return;

    const amount = Number(creditAdjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setErrorData({
        title: isZh ? "请输入非 0 的积分调整值" : "Enter a non-zero credit adjustment",
      });
      return;
    }

    if (!creditAdjustRemark.trim()) {
      setErrorData({
        title: isZh ? "请填写调整备注" : "Please enter a remark",
      });
      return;
    }

    mutateAdjustUserCredits(
      {
        userId: selectedUser.id,
        payload: {
          amount,
          remark: creditAdjustRemark.trim(),
        },
      },
      {
        onSuccess: async () => {
          await refetchAdminCreditUsers();
          await refetchSelectedCreditLedger();
          dispatchCreditsRefreshEvent();
          setCreditAdjustAmount("0");
          setCreditAdjustRemark("");
          setSuccessData({
            title: isZh ? "积分调整成功" : "Credit adjustment saved",
          });
        },
        onError: (error) => {
          const detail = error?.response?.data?.detail;
          setErrorData({
            title: isZh ? "积分调整失败" : "Credit adjustment failed",
            list: detail ? [typeof detail === "string" ? detail : JSON.stringify(detail)] : undefined,
          });
        },
      },
    );
  }

  return (
    <div className="admin-page-panel flex h-full flex-col pb-8">
      <div className="main-page-nav-arrangement">
        <span className="main-page-nav-title">
          <CircleDollarSign className="h-6 w-6" />
          {isZh ? "积分管理" : "Credit Management"}
        </span>
      </div>
      <span className="admin-page-description-text">
        {isZh
          ? "先搜索并选择用户，再直接发放/扣减积分，同时查看该用户最近流水。"
          : "Search and select a user, then adjust credits directly and review recent ledger entries."}
      </span>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4 pt-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>{isZh ? "仅超级管理员可见" : "Visible to superusers only"}</span>
        </div>
        <Button variant="secondary" onClick={() => navigate("/admin")}>
          {isZh ? "返回管理后台" : "Back to Admin"}
        </Button>
      </div>

      <div className="grid gap-4 px-4 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.45fr)]">
        <Card className="border-border bg-background">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserRound className="h-5 w-5 text-primary" />
              {isZh ? "选择用户" : "Select User"}
            </CardTitle>
            <CardDescription>
              {isZh
                ? "按用户名或昵称搜索，点击后即可在右侧直接发积分。"
                : "Search by username or nickname, then adjust credits on the right."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPageIndex(PAGINATION_PAGE);
                }}
                placeholder={isZh ? "搜索用户名 / 昵称" : "Search username / nickname"}
                className="pl-9"
                data-testid="admin-credits-search-input"
              />
            </div>

            <div className="min-h-[420px] rounded-lg border">
              {isLoadingUsers ? (
                <div className="flex h-[420px] items-center justify-center">
                  <CustomLoader remSize={10} />
                </div>
              ) : users.length === 0 ? (
                <div className="flex h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {isZh ? "没有找到匹配的用户" : "No matching users found"}
                </div>
              ) : (
                <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                  {users.map((user) => {
                    const isActive = user.id === selectedUserId;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user.id)}
                        data-testid={`admin-credits-user-item-${user.id}`}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {user.nickname || user.username}
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {user.username}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold">
                              {formatNumber(user.credit_balance)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {isZh ? "当前积分" : "Current credits"}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <PaginatorComponent
              pageIndex={pageIndex}
              pageSize={pageSize}
              totalRowsCount={totalCount}
              paginate={handleChangePagination}
              rowsCount={PAGINATION_ROWS_COUNT}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border bg-background">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-primary" />
                {selectedUser
                  ? `${isZh ? "用户积分" : "User Credits"} · ${
                      selectedUser.nickname || selectedUser.username
                    }`
                  : isZh
                    ? "用户积分"
                    : "User Credits"}
              </CardTitle>
              <CardDescription>
                {selectedUser
                  ? isZh
                    ? `当前选中 ${selectedUser.username}，可直接发放或扣减积分。`
                    : `Selected ${selectedUser.username}. Adjust credits directly below.`
                  : isZh
                    ? "请先从左侧选择一个用户。"
                    : "Select a user from the left first."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {selectedUser ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Card className="border-border bg-muted/20">
                      <CardContent className="pt-5">
                        <div className="text-xs text-muted-foreground">
                          {isZh ? "当前积分" : "Current credits"}
                        </div>
                        <div className="mt-2 text-2xl font-semibold">
                          {formatNumber(selectedUser.credit_balance)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-muted/20">
                      <CardContent className="pt-5">
                        <div className="text-xs text-muted-foreground">
                          {isZh ? "累计消耗" : "Total consumed"}
                        </div>
                        <div className="mt-2 text-2xl font-semibold">
                          {formatNumber(selectedUser.credit_total_consumed)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-muted/20">
                      <CardContent className="pt-5">
                        <div className="text-xs text-muted-foreground">
                          {isZh ? "累计充值/补发" : "Total recharged"}
                        </div>
                        <div className="mt-2 text-2xl font-semibold">
                          {formatNumber(selectedUser.credit_total_recharged)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {isZh ? "手动调整积分" : "Manual Adjustment"}
                        </CardTitle>
                        <CardDescription>
                          {isZh
                            ? "正数表示增加积分，负数表示扣减积分，备注必填。"
                            : "Positive numbers grant credits, negative numbers deduct credits. Remark is required."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>{isZh ? "调整数值" : "Amount"}</Label>
                          <Input
                            type="number"
                            value={creditAdjustAmount}
                            onChange={(event) => setCreditAdjustAmount(event.target.value)}
                            placeholder={isZh ? "例如 100 或 -20" : "For example 100 or -20"}
                            data-testid="admin-credits-amount-input"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{isZh ? "备注" : "Remark"}</Label>
                          <Textarea
                            value={creditAdjustRemark}
                            onChange={(event) => setCreditAdjustRemark(event.target.value)}
                            placeholder={
                              isZh
                                ? "填写原因，例如活动奖励、补偿、人工扣减等"
                                : "Describe the reason, such as reward, compensation, or manual deduction"
                            }
                            className="min-h-[120px]"
                            data-testid="admin-credits-remark-input"
                          />
                        </div>
                        <Button
                          variant="primary"
                          className="w-full"
                          onClick={handleAdjustCredits}
                          disabled={isAdjustingCredits}
                          data-testid="admin-credits-submit-button"
                        >
                          {isAdjustingCredits
                            ? isZh
                              ? "提交中..."
                              : "Submitting..."
                            : isZh
                              ? "确认调整积分"
                              : "Apply credit adjustment"}
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border-border bg-background">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <History className="h-4 w-4" />
                          {isZh ? "最近积分流水" : "Recent Ledger"}
                        </CardTitle>
                        <CardDescription>
                          {isZh
                            ? "展示最近 20 条记录，包含人工调整和模型扣费。"
                            : "Shows the latest 20 entries, including manual adjustments and usage charges."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingLedger ? (
                          <div className="flex h-[280px] items-center justify-center">
                            <CustomLoader remSize={8} />
                          </div>
                        ) : selectedCreditLedger.length === 0 ? (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                            {isZh ? "暂无积分记录" : "No credit records yet"}
                          </div>
                        ) : (
                          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                            {selectedCreditLedger.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between rounded-lg border px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {getLedgerTitle(entry, isZh)}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {getLedgerTypeLabel(entry.entry_type, isZh)} ·{" "}
                                    {formatDateTime(entry.created_at, isZh)}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div
                                    className={`text-sm font-semibold ${
                                      entry.delta >= 0 ? "text-emerald-500" : "text-rose-500"
                                    }`}
                                  >
                                    {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {isZh ? "余额" : "Balance"} {entry.balance_after}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
                  {isZh
                    ? "请先从左侧选择用户，再进行积分调整。"
                    : "Select a user from the left to adjust credits."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
