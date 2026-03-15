import { cloneDeep } from "lodash";
import {
  BellRing,
  ExternalLink,
  Loader2,
  Megaphone,
  RotateCcw,
  Search,
  Send,
  Users2,
} from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import PaginatorComponent from "@/components/common/paginatorComponent";
import {
  useAddUser,
  useDeleteUsers,
  useGetUsers,
  useUpdateUser,
} from "@/controllers/API/queries/auth";
import {
  useGetAdminCreditUsersQuery,
  useGetAdminUserCreditLedgerQuery,
  usePostAdjustUserCredits,
} from "@/controllers/API/queries/credits";
import {
  useCreateAdminNotification,
  useGetAdminNotificationsQuery,
} from "@/controllers/API/queries/notifications";
import { useGetTeamsQuery } from "@/controllers/API/queries/teams";
import CustomLoader from "@/customization/components/custom-loader";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { t } from "@/i18n/t";
import type {
  AdminNotificationTargetType,
  CreditAdminUser,
  CreateAdminNotificationResponse,
  CreateAdminNotificationPayload,
  TeamSummary,
  Users,
} from "@/types/api";
import { dispatchCreditsRefreshEvent } from "@/utils/creditsEvents";
import IconComponent from "../../components/common/genericIconComponent";
import ShadTooltip from "../../components/common/shadTooltipComponent";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox, CheckBoxDiv } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";
import {
  USER_ADD_ERROR_ALERT,
  USER_ADD_SUCCESS_ALERT,
  USER_DEL_ERROR_ALERT,
  USER_DEL_SUCCESS_ALERT,
  USER_EDIT_ERROR_ALERT,
  USER_EDIT_SUCCESS_ALERT,
} from "../../constants/alerts_constants";
import {
  ADMIN_HEADER_DESCRIPTION,
  ADMIN_HEADER_TITLE,
  PAGINATION_PAGE,
  PAGINATION_ROWS_COUNT,
  PAGINATION_SIZE,
} from "../../constants/constants";
import { AuthContext } from "../../contexts/authContext";
import ConfirmationModal from "../../modals/confirmationModal";
import UserManagementModal from "../../modals/userManagementModal";
import useAlertStore from "../../stores/alertStore";
import type { UserInputType } from "../../types/components";

type NotificationFormState = {
  title: string;
  content: string;
  link: string;
  targetType: AdminNotificationTargetType;
  selectedUserIds: string[];
  selectedTeamIds: string[];
};

const INITIAL_NOTIFICATION_FORM: NotificationFormState = {
  title: "",
  content: "",
  link: "",
  targetType: "ALL",
  selectedUserIds: [],
  selectedTeamIds: [],
};

type NotificationHistoryFilterType = "ANY" | AdminNotificationTargetType;

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function targetTypeLabel(targetType: AdminNotificationTargetType) {
  if (targetType === "ALL") return "\u5168\u4f53\u7528\u6237";
  if (targetType === "USERS") return "\u6307\u5b9a\u7528\u6237";
  return "\u6307\u5b9a\u56e2\u961f";
}

function includesSearch(value: string | undefined | null, keyword: string) {
  if (!keyword) return true;
  return value?.toLowerCase().includes(keyword) ?? false;
}

function isValidHttpUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function SelectableList({
  title,
  description,
  emptyText,
  searchPlaceholder,
  items,
  selectedIds,
  searchValue,
  onToggle,
  onSearchChange,
  onClearSelection,
}: {
  title: string;
  description: string;
  emptyText: string;
  searchPlaceholder: string;
  items: Array<{ id: string; title: string; subtitle?: string }>;
  selectedIds: string[];
  searchValue: string;
  onToggle: (id: string) => void;
  onSearchChange: (value: string) => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <Badge variant="secondaryStatic" className="px-2 py-1 text-xs">
            {`\u5df2\u9009 ${selectedIds.length}`}
          </Badge>
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            disabled={selectedIds.length === 0}
            className="shrink-0"
          >
            {"\u6e05\u7a7a\u5df2\u9009"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{`\u5339\u914d ${items.length} \u9879`}</p>
      </div>
      <div className="max-h-64 overflow-y-auto px-3 py-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 ${
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(item.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    {item.subtitle ? (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useCustomNavigate();
  const { userData } = useContext(AuthContext);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const [inputValue, setInputValue] = useState("");
  const [size, setPageSize] = useState(PAGINATION_SIZE);
  const [index, setPageIndex] = useState(PAGINATION_PAGE);
  const [totalRowsCount, setTotalRowsCount] = useState(0);
  const [filterUserList, setFilterUserList] = useState<Users[]>([]);
  const [selectableUsers, setSelectableUsers] = useState<Users[]>([]);
  const [notificationForm, setNotificationForm] = useState<NotificationFormState>(
    INITIAL_NOTIFICATION_FORM,
  );
  const [notificationUserFilter, setNotificationUserFilter] = useState("");
  const [notificationTeamFilter, setNotificationTeamFilter] = useState("");
  const [notificationHistoryFilter, setNotificationHistoryFilter] = useState("");
  const [notificationHistoryTargetFilter, setNotificationHistoryTargetFilter] =
    useState<NotificationHistoryFilterType>("ANY");
  const [expandedNotificationIds, setExpandedNotificationIds] = useState<string[]>([]);
  const [highlightedNotificationId, setHighlightedNotificationId] = useState<string | null>(
    null,
  );
  const [selectedCreditUser, setSelectedCreditUser] = useState<CreditAdminUser | null>(null);
  const [creditAdjustAmount, setCreditAdjustAmount] = useState("0");
  const [creditAdjustRemark, setCreditAdjustRemark] = useState("");

  const userList = useRef<Users[]>([]);

  const { mutate: mutateDeleteUser } = useDeleteUsers();
  const { mutate: mutateUpdateUser } = useUpdateUser();
  const { mutate: mutateAddUser } = useAddUser();
  const { mutate: mutateAdjustUserCredits, isPending: isAdjustingCredits } =
    usePostAdjustUserCredits();
  const { mutate: mutateGetUsers, isPending, isIdle } = useGetUsers({});
  const { mutate: mutateGetSelectableUsers } = useGetUsers({});
  const { mutate: mutateCreateAdminNotification, isPending: isCreatingNotification } =
    useCreateAdminNotification();
  const {
    data: notificationHistory = [],
    isLoading: isLoadingNotificationHistory,
  } = useGetAdminNotificationsQuery({
    enabled: !!userData?.is_superuser,
  });
  const { data: teamOptions = [], isLoading: isLoadingTeams } = useGetTeamsQuery(
    { includeAll: true },
    { enabled: !!userData?.is_superuser },
  );
  const {
    data: adminCreditUsersPage,
    refetch: refetchAdminCreditUsers,
  } = useGetAdminCreditUsersQuery(
    { skip: size * (index - 1), limit: size },
    { enabled: !!userData?.is_superuser },
  );
  const {
    data: selectedCreditLedger = [],
    refetch: refetchSelectedCreditLedger,
  } = useGetAdminUserCreditLedgerQuery(
    { userId: selectedCreditUser?.id ?? "", limit: 20 },
    { enabled: !!userData?.is_superuser && !!selectedCreditUser?.id },
  );

  useEffect(() => {
    const timer = setTimeout(() => getUsers(), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!userData?.is_superuser) return;
    mutateGetSelectableUsers(
      { skip: 0, limit: 2000 },
      {
        onSuccess: (users) => {
          setSelectableUsers(users["users"] ?? []);
        },
      },
    );
  }, [mutateGetSelectableUsers, userData?.is_superuser]);

  const activeSelectableUsers = useMemo(
    () => selectableUsers.filter((user) => user.is_active),
    [selectableUsers],
  );
  const normalizedUserFilter = notificationUserFilter.trim().toLowerCase();
  const normalizedTeamFilter = notificationTeamFilter.trim().toLowerCase();
  const normalizedNotificationHistoryFilter = notificationHistoryFilter
    .trim()
    .toLowerCase();
  const userSelectionItems = useMemo(
    () =>
      activeSelectableUsers.map((user) => ({
        id: user.id,
        title: user.nickname || user.username,
        subtitle: user.username,
      })),
    [activeSelectableUsers],
  );
  const teamSelectionItems = useMemo(
    () =>
      teamOptions.map((team: TeamSummary) => ({
        id: team.id,
        title: team.name,
        subtitle: `${team.member_count} \u540d\u6210\u5458`,
      })),
    [teamOptions],
  );
  const filteredUserSelectionItems = useMemo(
    () =>
      userSelectionItems.filter(
        (item) =>
          includesSearch(item.title, normalizedUserFilter) ||
          includesSearch(item.subtitle, normalizedUserFilter),
      ),
    [normalizedUserFilter, userSelectionItems],
  );
  const filteredTeamSelectionItems = useMemo(
    () =>
      teamSelectionItems.filter(
        (item) =>
          includesSearch(item.title, normalizedTeamFilter) ||
          includesSearch(item.subtitle, normalizedTeamFilter),
      ),
    [normalizedTeamFilter, teamSelectionItems],
  );
  const selectedUserPreview = useMemo(
    () =>
      activeSelectableUsers
        .filter((user) => notificationForm.selectedUserIds.includes(user.id))
        .map((user) => user.nickname || user.username),
    [activeSelectableUsers, notificationForm.selectedUserIds],
  );
  const selectedTeamPreview = useMemo(
    () =>
      teamOptions
        .filter((team) => notificationForm.selectedTeamIds.includes(team.id))
        .map((team) => team.name),
    [notificationForm.selectedTeamIds, teamOptions],
  );
  const trimmedNotificationTitle = notificationForm.title.trim();
  const trimmedNotificationContent = notificationForm.content.trim();
  const trimmedNotificationLink = notificationForm.link.trim();
  const notificationValidationMessage = useMemo(() => {
    if (!trimmedNotificationTitle) {
      return "\u8bf7\u586b\u5199\u901a\u77e5\u6807\u9898";
    }
    if (!trimmedNotificationContent) {
      return "\u8bf7\u586b\u5199\u901a\u77e5\u5185\u5bb9";
    }
    if (trimmedNotificationLink && !isValidHttpUrl(trimmedNotificationLink)) {
      return "\u8df3\u8f6c\u94fe\u63a5\u4ec5\u652f\u6301 http \u6216 https";
    }
    if (
      notificationForm.targetType === "USERS" &&
      notificationForm.selectedUserIds.length === 0
    ) {
      return "\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u76ee\u6807\u7528\u6237";
    }
    if (
      notificationForm.targetType === "TEAMS" &&
      notificationForm.selectedTeamIds.length === 0
    ) {
      return "\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u76ee\u6807\u56e2\u961f";
    }
    return "";
  }, [
    notificationForm.selectedTeamIds.length,
    notificationForm.selectedUserIds.length,
    notificationForm.targetType,
    trimmedNotificationContent,
    trimmedNotificationLink,
    trimmedNotificationTitle,
  ]);
  const isNotificationFormDirty = useMemo(
    () =>
      notificationForm.title !== INITIAL_NOTIFICATION_FORM.title ||
      notificationForm.content !== INITIAL_NOTIFICATION_FORM.content ||
      notificationForm.link !== INITIAL_NOTIFICATION_FORM.link ||
      notificationForm.targetType !== INITIAL_NOTIFICATION_FORM.targetType ||
      notificationForm.selectedUserIds.length > 0 ||
      notificationForm.selectedTeamIds.length > 0,
    [notificationForm],
  );
  const canSubmitNotification =
    !notificationValidationMessage && !isCreatingNotification && !!userData?.is_superuser;
  const filteredNotificationHistory = useMemo(
    () =>
      notificationHistory.filter((item) => {
        const matchesTarget =
          notificationHistoryTargetFilter === "ANY" ||
          item.target_type === notificationHistoryTargetFilter;
        const matchesKeyword =
          !normalizedNotificationHistoryFilter ||
          includesSearch(item.title, normalizedNotificationHistoryFilter) ||
          includesSearch(item.content, normalizedNotificationHistoryFilter) ||
          includesSearch(item.created_by_name, normalizedNotificationHistoryFilter);
        return matchesTarget && matchesKeyword;
      }),
    [
      normalizedNotificationHistoryFilter,
      notificationHistory,
      notificationHistoryTargetFilter,
    ],
  );
  const filteredNotificationHistoryMetrics = useMemo(
    () =>
      filteredNotificationHistory.reduce(
        (acc, item) => ({
          recipientCount: acc.recipientCount + item.recipient_count,
          readCount: acc.readCount + item.read_count,
          hiddenCount: acc.hiddenCount + item.hidden_count,
        }),
        {
          recipientCount: 0,
          readCount: 0,
          hiddenCount: 0,
        },
      ),
    [filteredNotificationHistory],
  );
  const adminCreditUserMap = useMemo(
    () =>
      new Map(
        (adminCreditUsersPage?.users ?? []).map((user) => [user.id, user] as const),
      ),
    [adminCreditUsersPage?.users],
  );

  function getUsers() {
    mutateGetUsers(
      { skip: size * (index - 1), limit: size },
      {
        onSuccess: (users) => {
          setTotalRowsCount(users["total_count"]);
          userList.current = users["users"];
          setFilterUserList(users["users"]);
        },
      },
    );
  }

  function handleChangePagination(pageIndex: number, pageSize: number) {
    setPageSize(pageSize);
    setPageIndex(pageIndex);
    mutateGetUsers(
      { skip: pageSize * (pageIndex - 1), limit: pageSize },
      {
        onSuccess: (users) => {
          setTotalRowsCount(users["total_count"]);
          userList.current = users["users"];
          setFilterUserList(users["users"]);
        },
      },
    );
  }

  function resetFilter() {
    setPageIndex(PAGINATION_PAGE);
    setPageSize(PAGINATION_SIZE);
    getUsers();
  }

  function handleFilterUsers(input: string) {
    setInputValue(input);
    if (!input) {
      setFilterUserList(userList.current);
      return;
    }
    setFilterUserList(
      userList.current.filter(
        (user) =>
          user.username.toLowerCase().includes(input.toLowerCase()) ||
          user.nickname?.toLowerCase().includes(input.toLowerCase()),
      ),
    );
  }

  function handleDeleteUser(user) {
    mutateDeleteUser(
      { user_id: user.id },
      {
        onSuccess: () => {
          resetFilter();
          void refetchAdminCreditUsers();
          setSuccessData({ title: USER_DEL_SUCCESS_ALERT });
        },
        onError: (error) => {
          setErrorData({
            title: USER_DEL_ERROR_ALERT,
            list: [error["response"]["data"]["detail"]],
          });
        },
      },
    );
  }

  function handleEditUser(userId, user) {
    mutateUpdateUser(
      { user_id: userId, user },
      {
        onSuccess: () => {
          resetFilter();
          void refetchAdminCreditUsers();
          setSuccessData({ title: USER_EDIT_SUCCESS_ALERT });
        },
        onError: (error) => {
          setErrorData({
            title: USER_EDIT_ERROR_ALERT,
            list: [error["response"]["data"]["detail"]],
          });
        },
      },
    );
  }

  function handleFlagToggle(check, userId, user, key: "is_active" | "is_superuser" | "is_reviewer") {
    const userEdit = cloneDeep(user);
    userEdit[key] = !check;
    mutateUpdateUser(
      { user_id: userId, user: userEdit },
      {
        onSuccess: () => {
          resetFilter();
          void refetchAdminCreditUsers();
          setSuccessData({ title: USER_EDIT_SUCCESS_ALERT });
        },
        onError: (error) => {
          setErrorData({
            title: USER_EDIT_ERROR_ALERT,
            list: [error["response"]["data"]["detail"]],
          });
        },
      },
    );
  }

  function handleNewUser(user: UserInputType) {
    mutateAddUser(user, {
      onSuccess: (res) => {
        mutateUpdateUser(
          {
            user_id: res["id"],
            user: {
              is_active: user.is_active,
              is_superuser: user.is_superuser,
              is_reviewer: user.is_reviewer,
            },
          },
          {
            onSuccess: () => {
              resetFilter();
              void refetchAdminCreditUsers();
              setSuccessData({ title: USER_ADD_SUCCESS_ALERT });
            },
            onError: (error) => {
              setErrorData({
                title: USER_ADD_ERROR_ALERT,
                list: [error["response"]["data"]["detail"]],
              });
            },
          },
        );
      },
      onError: (error) => {
        setErrorData({
          title: USER_ADD_ERROR_ALERT,
          list: [error["response"]["data"]["detail"]],
        });
      },
    });
  }

  function openCreditDialog(user: Users) {
    const matchedUser = adminCreditUserMap.get(user.id) ?? ({
      ...user,
      credit_balance: 0,
      credit_total_consumed: 0,
      credit_total_recharged: 0,
    } as CreditAdminUser);
    setSelectedCreditUser(matchedUser);
    setCreditAdjustAmount("0");
    setCreditAdjustRemark("");
  }

  function handleAdjustCredits() {
    if (!selectedCreditUser) return;
    const amount = Number(creditAdjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setErrorData({ title: "请输入非 0 的积分调整值" });
      return;
    }
    if (!creditAdjustRemark.trim()) {
      setErrorData({ title: "请填写调整备注" });
      return;
    }

    mutateAdjustUserCredits(
      {
        userId: selectedCreditUser.id,
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
          setSuccessData({ title: "积分调整成功" });
        },
        onError: (error) => {
          const detail = error?.response?.data?.detail;
          setErrorData({
            title: "积分调整失败",
            list: detail ? [typeof detail === "string" ? detail : JSON.stringify(detail)] : undefined,
          });
        },
      },
    );
  }

  function toggleSelection(kind: "selectedUserIds" | "selectedTeamIds", id: string) {
    setNotificationForm((prev) => ({
      ...prev,
      [kind]: prev[kind].includes(id)
        ? prev[kind].filter((itemId) => itemId !== id)
        : [...prev[kind], id],
    }));
  }

  function updateNotificationField<Key extends keyof NotificationFormState>(
    key: Key,
    value: NotificationFormState[Key],
  ) {
    setNotificationForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTargetTypeChange(value: AdminNotificationTargetType) {
    setNotificationForm((prev) => ({
      ...prev,
      targetType: value,
      selectedUserIds: value === "USERS" ? prev.selectedUserIds : [],
      selectedTeamIds: value === "TEAMS" ? prev.selectedTeamIds : [],
    }));
  }

  function resetNotificationDraft() {
    setNotificationForm(INITIAL_NOTIFICATION_FORM);
    setNotificationUserFilter("");
    setNotificationTeamFilter("");
  }

  function clearTargetSelection(kind: "selectedUserIds" | "selectedTeamIds") {
    setNotificationForm((prev) => ({ ...prev, [kind]: [] }));
  }

  function clearNotificationHistoryFilters() {
    setNotificationHistoryFilter("");
    setNotificationHistoryTargetFilter("ANY");
  }

  function toggleNotificationHistoryExpanded(notificationId: string) {
    setExpandedNotificationIds((prev) =>
      prev.includes(notificationId)
        ? prev.filter((itemId) => itemId !== notificationId)
        : [...prev, notificationId],
    );
  }

  function handleCreateNotification() {
    const payload: CreateAdminNotificationPayload = {
      title: trimmedNotificationTitle,
      content: trimmedNotificationContent,
      link: trimmedNotificationLink || null,
      target_type: notificationForm.targetType,
      user_ids: notificationForm.selectedUserIds,
      team_ids: notificationForm.selectedTeamIds,
    };

    if (notificationValidationMessage) {
      return setErrorData({ title: notificationValidationMessage });
    }

    mutateCreateAdminNotification(payload, {
      onSuccess: (response: CreateAdminNotificationResponse) => {
        resetNotificationDraft();
        setNotificationHistoryFilter("");
        setNotificationHistoryTargetFilter("ANY");
        setHighlightedNotificationId(response.id);
        setExpandedNotificationIds((prev) =>
          prev.includes(response.id) ? prev : [response.id, ...prev],
        );
        setSuccessData({
          title: "\u901a\u77e5\u5df2\u53d1\u9001\uff0c7 \u5929\u540e\u5c06\u81ea\u52a8\u8fc7\u671f",
        });
      },
      onError: (error) => {
        const detail = error?.response?.data?.detail;
        setErrorData({
          title: "\u901a\u77e5\u53d1\u9001\u5931\u8d25",
          list: detail ? [String(detail)] : undefined,
        });
      },
    });
  }

  function renderToggleCell(user, rowIndex, key, checked) {
    return (
      <ConfirmationModal
        size="x-small"
        title={t("Edit")}
        titleHeader={`${user.nickname ?? user.username}`}
        modalContentTitle={t("Attention!")}
        cancelText={t("Cancel")}
        confirmationText={t("Confirm")}
        icon={"UserCog2"}
        data={user}
        index={rowIndex}
        onConfirm={(_modalIndex, nextUser) => {
          handleFlagToggle(checked, nextUser.id, nextUser, key);
        }}
      >
        <ConfirmationModal.Content>
          <span>
            {t(
              "Are you completely confident about the changes you are making to this user?",
            )}
          </span>
        </ConfirmationModal.Content>
        <ConfirmationModal.Trigger>
          <div className="flex w-fit">
            <CheckBoxDiv checked={checked} />
          </div>
        </ConfirmationModal.Trigger>
      </ConfirmationModal>
    );
  }

  return (
    <>
      {userData && (
        <>
        <div className="admin-page-panel flex h-full flex-col pb-8">
          <div className="main-page-nav-arrangement">
            <span className="main-page-nav-title">
              <IconComponent name="Shield" className="w-6" />
              {ADMIN_HEADER_TITLE}
            </span>
          </div>
          <span className="admin-page-description-text">{ADMIN_HEADER_DESCRIPTION}</span>

          {userData.is_superuser ? (
            <div className="grid gap-4 px-4 pb-4 pt-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <Card className="border-border bg-background">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Megaphone className="h-5 w-5 text-primary" />
                        {"\u53d1\u5e03\u7ba1\u7406\u5458\u901a\u77e5"}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {"\u4ec5\u8d85\u7ea7\u7ba1\u7406\u5458\u53ef\u53d1\u9001\uff0c\u652f\u6301\u5168\u4f53\u7528\u6237\u3001\u6307\u5b9a\u7528\u6237\u6216\u6307\u5b9a\u56e2\u961f\uff0c7 \u5929\u540e\u81ea\u52a8\u8fc7\u671f\u3002"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondaryStatic" className="px-2.5 py-1 text-xs">
                        {"\u56fa\u5b9a\u6709\u6548\u671f 7 \u5929"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetNotificationDraft}
                        disabled={!isNotificationFormDirty || isCreatingNotification}
                        data-testid="admin-notification-reset"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {"\u6e05\u7a7a\u8349\u7a3f"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{"\u901a\u77e5\u6807\u9898"}</Label>
                      <Input
                        value={notificationForm.title}
                        onChange={(e) => updateNotificationField("title", e.target.value)}
                        placeholder={"\u8f93\u5165\u901a\u77e5\u6807\u9898"}
                        data-testid="admin-notification-title"
                      />
                      <p className="text-xs text-muted-foreground">
                        {`\u5df2\u8f93\u5165 ${notificationForm.title.length} \u5b57`}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>{"\u8df3\u8f6c\u94fe\u63a5\uff08\u53ef\u9009\uff09"}</Label>
                      <Input
                        value={notificationForm.link}
                        onChange={(e) => updateNotificationField("link", e.target.value)}
                        placeholder="https://example.com"
                        data-testid="admin-notification-link"
                      />
                      <p
                        className={`text-xs ${
                          trimmedNotificationLink && !isValidHttpUrl(trimmedNotificationLink)
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {trimmedNotificationLink && !isValidHttpUrl(trimmedNotificationLink)
                          ? "\u8bf7\u8f93\u5165 http \u6216 https \u94fe\u63a5"
                          : "\u7528\u6237\u70b9\u51fb\u901a\u77e5\u540e\u53ef\u8df3\u8f6c\u5230\u6307\u5b9a\u5730\u5740"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{"\u901a\u77e5\u5185\u5bb9"}</Label>
                    <Textarea
                      value={notificationForm.content}
                      onChange={(e) => updateNotificationField("content", e.target.value)}
                      placeholder={"\u8f93\u5165\u901a\u77e5\u6b63\u6587\uff0c\u652f\u6301\u591a\u884c"}
                      className="min-h-[132px] rounded-md border border-input bg-background px-3 py-2 text-sm !text-foreground !placeholder:text-muted-foreground"
                      data-testid="admin-notification-content"
                    />
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {`\u5df2\u8f93\u5165 ${notificationForm.content.length} \u5b57`}
                      </span>
                      <span
                        className={
                          notificationValidationMessage
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {notificationValidationMessage ||
                          "\u5185\u5bb9\u5b8c\u6574\u540e\u5373\u53ef\u53d1\u9001"}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label>{"\u53d1\u9001\u8303\u56f4"}</Label>
                      <Select
                        value={notificationForm.targetType}
                        onValueChange={(value: AdminNotificationTargetType) =>
                          handleTargetTypeChange(value)
                        }
                      >
                        <SelectTrigger
                          className="h-10"
                          data-testid="admin-notification-target-type"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">{"\u5168\u4f53\u7528\u6237"}</SelectItem>
                          <SelectItem value="USERS">{"\u6307\u5b9a\u7528\u6237"}</SelectItem>
                          <SelectItem value="TEAMS">{"\u6307\u5b9a\u56e2\u961f"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      {notificationForm.targetType === "USERS" ? (
                        <SelectableList
                          title={"\u9009\u62e9\u76ee\u6807\u7528\u6237"}
                          description={"\u53ea\u4f1a\u53d1\u9001\u7ed9\u8fd9\u91cc\u52fe\u9009\u7684\u6d3b\u8dc3\u7528\u6237\u3002"}
                          emptyText={
                            notificationUserFilter
                              ? "\u6ca1\u6709\u5339\u914d\u7684\u7528\u6237"
                              : "\u6682\u65e0\u53ef\u9009\u7528\u6237"
                          }
                          searchPlaceholder={"\u641c\u7d22\u7528\u6237\u6635\u79f0\u6216\u7528\u6237\u540d"}
                          items={filteredUserSelectionItems}
                          selectedIds={notificationForm.selectedUserIds}
                          searchValue={notificationUserFilter}
                          onToggle={(id) => toggleSelection("selectedUserIds", id)}
                          onSearchChange={setNotificationUserFilter}
                          onClearSelection={() => clearTargetSelection("selectedUserIds")}
                        />
                      ) : null}
                      {notificationForm.targetType === "TEAMS" ? (
                        <SelectableList
                          title={"\u9009\u62e9\u76ee\u6807\u56e2\u961f"}
                          description={"\u5c06\u53d1\u9001\u7ed9\u56e2\u961f\u5185\u6240\u6709\u6210\u5458\uff0c\u7528\u6237\u53ea\u80fd\u5bf9\u81ea\u5df1\u9690\u85cf\u3002"}
                          emptyText={
                            isLoadingTeams
                              ? "\u56e2\u961f\u52a0\u8f7d\u4e2d..."
                              : notificationTeamFilter
                                ? "\u6ca1\u6709\u5339\u914d\u7684\u56e2\u961f"
                                : "\u6682\u65e0\u53ef\u9009\u56e2\u961f"
                          }
                          searchPlaceholder={"\u641c\u7d22\u56e2\u961f\u540d\u79f0"}
                          items={filteredTeamSelectionItems}
                          selectedIds={notificationForm.selectedTeamIds}
                          searchValue={notificationTeamFilter}
                          onToggle={(id) => toggleSelection("selectedTeamIds", id)}
                          onSearchChange={setNotificationTeamFilter}
                          onClearSelection={() => clearTargetSelection("selectedTeamIds")}
                        />
                      ) : null}
                      {notificationForm.targetType === "ALL" ? (
                        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                          {"\u5c06\u53d1\u9001\u7ed9\u6240\u6709\u6d3b\u8dc3\u7528\u6237\u3002"}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users2 className="h-4 w-4 text-primary" />
                        {"\u53d1\u9001\u9884\u89c8"}
                      </div>
                      <Badge variant="secondaryStatic" className="px-2 py-1 text-xs">
                        {notificationForm.targetType === "ALL"
                          ? "\u5c06\u89e6\u8fbe\u5168\u4f53\u7528\u6237"
                          : notificationForm.targetType === "USERS"
                            ? `\u5c06\u89e6\u8fbe ${notificationForm.selectedUserIds.length} \u4e2a\u7528\u6237`
                            : `\u5c06\u89e6\u8fbe ${notificationForm.selectedTeamIds.length} \u4e2a\u56e2\u961f`}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <p>
                        {`\u6807\u9898\uff1a${trimmedNotificationTitle || "\u672a\u586b\u5199"}`}
                      </p>
                      <p>
                        {`\u6709\u6548\u671f\uff1a\u53d1\u9001\u540e 7 \u5929\uff08\u7cfb\u7edf\u81ea\u52a8\u8fc7\u671f\uff09`}
                      </p>
                      {notificationForm.targetType === "USERS" && selectedUserPreview.length > 0 ? (
                        <p>
                          {`\u7528\u6237\uff1a${selectedUserPreview.slice(0, 3).join("\u3001")}${
                            selectedUserPreview.length > 3
                              ? ` \u7b49 ${selectedUserPreview.length} \u4eba`
                              : ""
                          }`}
                        </p>
                      ) : null}
                      {notificationForm.targetType === "TEAMS" && selectedTeamPreview.length > 0 ? (
                        <p>
                          {`\u56e2\u961f\uff1a${selectedTeamPreview.slice(0, 3).join("\u3001")}${
                            selectedTeamPreview.length > 3
                              ? ` \u7b49 ${selectedTeamPreview.length} \u4e2a\u56e2\u961f`
                              : ""
                          }`}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                      {notificationValidationMessage
                        ? notificationValidationMessage
                        : "\u901a\u77e5\u5b8c\u6210\u540e\u4f1a\u7acb\u5373\u51fa\u73b0\u5728\u53f3\u4fa7\u5386\u53f2\u5217\u8868"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={resetNotificationDraft}
                        disabled={!isNotificationFormDirty || isCreatingNotification}
                      >
                        {"\u91cd\u7f6e"}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleCreateNotification}
                        disabled={!canSubmitNotification}
                        className="min-w-[168px]"
                        data-testid="admin-notification-submit"
                      >
                        {isCreatingNotification ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {"\u53d1\u9001\u4e2d"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Send className="h-4 w-4" />
                            {"\u53d1\u9001\u901a\u77e5"}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-background">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <BellRing className="h-5 w-5 text-primary" />
                          {"\u5df2\u53d1\u9001\u901a\u77e5"}
                        </CardTitle>
                        <CardDescription className="mt-2">
                          {"\u53ef\u6309\u76ee\u6807\u7c7b\u578b\u3001\u6807\u9898\u3001\u5185\u5bb9\u6216\u53d1\u9001\u4eba\u7b5b\u9009\u3002"}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="px-2 py-1 text-[11px]">
                          {`\u5f53\u524d ${filteredNotificationHistory.length} \u6761`}
                        </Badge>
                        <Badge variant="outline" className="px-2 py-1 text-[11px]">
                          {`\u9001\u8fbe ${filteredNotificationHistoryMetrics.recipientCount}`}
                        </Badge>
                        <Badge variant="outline" className="px-2 py-1 text-[11px]">
                          {`\u5df2\u8bfb ${filteredNotificationHistoryMetrics.readCount}`}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                      <Input
                        value={notificationHistoryFilter}
                        onChange={(event) => setNotificationHistoryFilter(event.target.value)}
                        placeholder={"\u641c\u7d22\u6807\u9898\u3001\u5185\u5bb9\u6216\u53d1\u9001\u4eba"}
                        data-testid="admin-notification-history-search"
                      />
                      <Select
                        value={notificationHistoryTargetFilter}
                        onValueChange={(value: NotificationHistoryFilterType) =>
                          setNotificationHistoryTargetFilter(value)
                        }
                      >
                        <SelectTrigger data-testid="admin-notification-history-target-filter">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANY">{"\u5168\u90e8\u7c7b\u578b"}</SelectItem>
                          <SelectItem value="ALL">{"\u5168\u4f53\u7528\u6237"}</SelectItem>
                          <SelectItem value="USERS">{"\u6307\u5b9a\u7528\u6237"}</SelectItem>
                          <SelectItem value="TEAMS">{"\u6307\u5b9a\u56e2\u961f"}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        onClick={clearNotificationHistoryFilters}
                        disabled={
                          notificationHistoryTargetFilter === "ANY" &&
                          notificationHistoryFilter.length === 0
                        }
                      >
                        {"\u91cd\u7f6e\u7b5b\u9009"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingNotificationHistory ? (
                    <div className="flex min-h-[240px] items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredNotificationHistory.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                      {notificationHistoryFilter || notificationHistoryTargetFilter !== "ANY"
                        ? "\u6ca1\u6709\u5339\u914d\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u7684\u901a\u77e5"
                        : "\u6682\u65e0\u5df2\u53d1\u9001\u901a\u77e5"}
                    </div>
                  ) : (
                    <div className="max-h-[580px] space-y-3 overflow-y-auto pr-1">
                      {filteredNotificationHistory.map((item) => {
                        const isExpanded = expandedNotificationIds.includes(item.id);
                        const readRate =
                          item.recipient_count > 0
                            ? Math.round((item.read_count / item.recipient_count) * 100)
                            : 0;

                        return (
                          <div
                            key={item.id}
                            className={`rounded-lg border p-4 ${
                              item.id === highlightedNotificationId
                                ? "border-primary/40 bg-primary/5"
                                : "border-border bg-muted/20"
                            }`}
                            data-testid={`admin-notification-history-item-${item.id}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold">{item.title}</p>
                                <Badge variant="secondaryStatic" className="px-2 py-1 text-[11px]">
                                  {targetTypeLabel(item.target_type)}
                                </Badge>
                                {item.id === highlightedNotificationId ? (
                                  <Badge
                                    variant="secondaryStatic"
                                    className="px-2 py-1 text-[11px]"
                                  >
                                    {"\u521a\u521a\u53d1\u9001"}
                                  </Badge>
                                ) : null}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleNotificationHistoryExpanded(item.id)}
                                data-testid={`admin-notification-history-toggle-${item.id}`}
                              >
                                {isExpanded ? "\u6536\u8d77" : "\u5c55\u5f00"}
                              </Button>
                            </div>
                            <p
                              className={`mt-2 whitespace-pre-wrap text-sm text-muted-foreground ${
                                isExpanded ? "" : "line-clamp-3"
                              }`}
                            >
                              {item.content}
                            </p>
                            {isExpanded && item.link ? (
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                              >
                                <ExternalLink className="h-4 w-4" />
                                {item.link}
                              </a>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge variant="secondaryStatic" className="px-2 py-1 text-[11px]">
                                {`\u5df2\u9001\u8fbe ${item.recipient_count}`}
                              </Badge>
                              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                                {`\u5df2\u8bfb ${item.read_count}`}
                              </Badge>
                              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                                {`\u5df2\u8bfb\u7387 ${readRate}%`}
                              </Badge>
                              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                                {`\u5df2\u9690\u85cf ${item.hidden_count}`}
                              </Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                              <span>{`\u53d1\u9001\u4eba\uff1a${item.created_by_name}`}</span>
                              <span>{`\u53d1\u9001\u65f6\u95f4\uff1a${formatDateLabel(item.created_at)}`}</span>
                              <span>{`\u8fc7\u671f\u65f6\u95f4\uff1a${formatDateLabel(item.expires_at)}`}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <div className="flex w-full justify-between px-4">
            <div className="flex w-96 items-center gap-4">
              <Input
                placeholder={t("Search username or nickname")}
                value={inputValue}
                onChange={(e) => handleFilterUsers(e.target.value)}
              />
              {inputValue.length > 0 ? (
                <div
                  className="cursor-pointer"
                  onClick={() => {
                    setInputValue("");
                    setFilterUserList(userList.current);
                  }}
                >
                  <IconComponent name="X" className="w-6 text-foreground" />
                </div>
              ) : (
                <div>
                  <Search className="h-6 w-6 text-foreground" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UserManagementModal
                title={t("New User")}
                titleHeader={t("Add a new user")}
                cancelText={t("Cancel")}
                confirmationText={t("Save")}
                icon={"UserPlus2"}
                onConfirm={(_modalIndex, user) => {
                  handleNewUser(user);
                }}
                asChild
              >
                <Button variant="primary">{t("New User")}</Button>
              </UserManagementModal>

              <Button variant="secondary" onClick={() => navigate("/admin/community")}>
                {"\u5185\u5bb9\u5ba1\u6838"}
              </Button>
            </div>
          </div>

          {isPending || isIdle ? (
            <div className="flex h-full w-full items-center justify-center">
              <CustomLoader remSize={12} />
            </div>
          ) : userList.current.length === 0 && !isIdle ? (
            <div className="m-4 flex items-center justify-between text-sm">
              {t("No users registered.")}
            </div>
          ) : (
            <>
              <div
                className={
                  "m-4 h-fit overflow-x-hidden overflow-y-scroll rounded-md border-2 bg-background custom-scroll" +
                  (isPending ? " border-0" : "")
                }
              >
                <Table className={"table-fixed outline-1"}>
                  <TableHeader className={isPending ? "hidden" : "table-fixed bg-muted outline-1"}>
                    <TableRow>
                      <TableHead className="h-10">{t("ID")}</TableHead>
                      <TableHead className="h-10">{t("Username")}</TableHead>
                      <TableHead className="h-10">{t("Nickname")}</TableHead>
                      <TableHead className="h-10">{"积分"}</TableHead>
                      <TableHead className="h-10">{"累计消耗"}</TableHead>
                      <TableHead className="h-10">{"累计充值"}</TableHead>
                      <TableHead className="h-10">{t("Active")}</TableHead>
                      <TableHead className="h-10">{t("Reviewer")}</TableHead>
                      <TableHead className="h-10">{t("Superuser")}</TableHead>
                      <TableHead className="h-10">{t("Created At")}</TableHead>
                      <TableHead className="h-10">{t("Updated At")}</TableHead>
                      <TableHead className="h-10 w-[150px] text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  {!isPending && (
                    <TableBody>
                      {filterUserList.map((user: UserInputType, rowIndex) => {
                        const creditUser = adminCreditUserMap.get(user.id ?? "");

                        return (
                          <TableRow key={rowIndex}>
                          <TableCell className="truncate py-2 font-medium">
                            <ShadTooltip content={user.id}>
                              <span className="cursor-default">{user.id}</span>
                            </ShadTooltip>
                          </TableCell>
                          <TableCell className="truncate py-2">
                            <ShadTooltip content={user.username}>
                              <span className="cursor-default">{user.username}</span>
                            </ShadTooltip>
                          </TableCell>
                          <TableCell className="truncate py-2">
                            <ShadTooltip content={user.nickname}>
                              <span className="cursor-default">{user.nickname}</span>
                            </ShadTooltip>
                          </TableCell>
                          <TableCell className="truncate py-2 font-medium">
                            {creditUser?.credit_balance ?? 0}
                          </TableCell>
                          <TableCell className="truncate py-2">
                            {creditUser?.credit_total_consumed ?? 0}
                          </TableCell>
                          <TableCell className="truncate py-2">
                            {creditUser?.credit_total_recharged ?? 0}
                          </TableCell>
                          <TableCell className="relative left-1 truncate py-2 text-align-last-left">
                            {renderToggleCell(user, rowIndex, "is_active", user.is_active)}
                          </TableCell>
                          <TableCell className="relative left-1 truncate py-2 text-align-last-left">
                            {renderToggleCell(user, rowIndex, "is_reviewer", user.is_reviewer)}
                          </TableCell>
                          <TableCell className="relative left-1 truncate py-2 text-align-last-left">
                            {renderToggleCell(user, rowIndex, "is_superuser", user.is_superuser)}
                          </TableCell>
                          <TableCell className="truncate py-2">
                            {new Date(user.create_at!).toISOString().split("T")[0]}
                          </TableCell>
                          <TableCell className="truncate py-2">
                            {new Date(user.updated_at!).toISOString().split("T")[0]}
                          </TableCell>
                          <TableCell className="flex w-[150px] py-2 text-right">
                            <div className="flex">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                onClick={() => openCreditDialog(user as Users)}
                              >
                                {"积分"}
                              </Button>
                              <UserManagementModal
                                title={t("Edit")}
                                titleHeader={`${user.id}`}
                                cancelText={t("Cancel")}
                                confirmationText={t("Save")}
                                icon={"UserPlus2"}
                                data={user}
                                index={rowIndex}
                                onConfirm={(_modalIndex, editUser) => {
                                  handleEditUser(user.id, editUser);
                                }}
                              >
                                <ShadTooltip content={t("Edit")} side="top">
                                  <IconComponent name="Pencil" className="h-4 w-4 cursor-pointer" />
                                </ShadTooltip>
                              </UserManagementModal>

                              <ConfirmationModal
                                size="x-small"
                                title={t("Delete")}
                                titleHeader={t("Delete User")}
                                modalContentTitle={t("Attention!")}
                                cancelText={t("Cancel")}
                                confirmationText={t("Delete")}
                                icon={"UserMinus2"}
                                data={user}
                                index={rowIndex}
                                onConfirm={(_modalIndex, nextUser) => {
                                  handleDeleteUser(nextUser);
                                }}
                              >
                                <ConfirmationModal.Content>
                                  <span>
                                    {t(
                                      "Are you sure you want to delete this user? This action cannot be undone.",
                                    )}
                                  </span>
                                </ConfirmationModal.Content>
                                <ConfirmationModal.Trigger>
                                  <IconComponent name="Trash2" className="ml-2 h-4 w-4 cursor-pointer" />
                                </ConfirmationModal.Trigger>
                              </ConfirmationModal>
                            </div>
                          </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  )}
                </Table>
              </div>

              <PaginatorComponent
                pageIndex={index}
                pageSize={size}
                totalRowsCount={totalRowsCount}
                paginate={handleChangePagination}
                rowsCount={PAGINATION_ROWS_COUNT}
              ></PaginatorComponent>
            </>
          )}
        </div>
        <Dialog
          open={!!selectedCreditUser}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedCreditUser(null);
              setCreditAdjustAmount("0");
              setCreditAdjustRemark("");
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {selectedCreditUser
                  ? `积分管理 · ${selectedCreditUser.nickname || selectedCreditUser.username}`
                  : "积分管理"}
              </DialogTitle>
              <DialogDescription>
                查看当前余额、最近消耗记录，并直接为该用户增加或扣减积分。
              </DialogDescription>
            </DialogHeader>

            {selectedCreditUser ? (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="border-border bg-muted/20">
                    <CardContent className="pt-5">
                      <div className="text-xs text-muted-foreground">当前积分</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {adminCreditUserMap.get(selectedCreditUser.id)?.credit_balance ??
                          selectedCreditUser.credit_balance ??
                          0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-muted/20">
                    <CardContent className="pt-5">
                      <div className="text-xs text-muted-foreground">累计消耗</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {adminCreditUserMap.get(selectedCreditUser.id)?.credit_total_consumed ??
                          selectedCreditUser.credit_total_consumed ??
                          0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-muted/20">
                    <CardContent className="pt-5">
                      <div className="text-xs text-muted-foreground">累计充值</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {adminCreditUserMap.get(selectedCreditUser.id)?.credit_total_recharged ??
                          selectedCreditUser.credit_total_recharged ??
                          0}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <Card className="border-border bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">手动调整积分</CardTitle>
                      <CardDescription>
                        正数表示增加积分，负数表示扣减积分。备注必填。
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>调整数值</Label>
                        <Input
                          type="number"
                          value={creditAdjustAmount}
                          onChange={(event) => setCreditAdjustAmount(event.target.value)}
                          placeholder="例如 100 或 -20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>备注</Label>
                        <Textarea
                          value={creditAdjustRemark}
                          onChange={(event) => setCreditAdjustRemark(event.target.value)}
                          placeholder="填写调整原因，例如活动赠送、客服补偿、误扣回退"
                          className="min-h-[120px]"
                        />
                      </div>
                      <Button
                        variant="primary"
                        className="w-full"
                        onClick={handleAdjustCredits}
                        disabled={isAdjustingCredits}
                      >
                        {isAdjustingCredits ? "提交中..." : "确认调整"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">最近积分流水</CardTitle>
                      <CardDescription>最新 20 条记录，包含人工调整和模型扣费。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedCreditLedger.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                          暂无积分记录
                        </div>
                      ) : (
                        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                          {selectedCreditLedger.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between rounded-lg border px-4 py-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {entry.remark || entry.component_key || entry.entry_type}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatDateLabel(entry.created_at)}
                                  {entry.model_key ? ` · ${entry.model_key}` : ""}
                                </p>
                              </div>
                              <div className="text-right">
                                <p
                                  className={`text-sm font-semibold ${
                                    entry.delta > 0 ? "text-emerald-600" : "text-amber-600"
                                  }`}
                                >
                                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  余额 {entry.balance_after}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
        </>
      )}
    </>
  );
}
