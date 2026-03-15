import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Gift,
  Info,
  Loader2,
  Trash2,
} from "lucide-react";
import { useHideMyNotification, useReadAllNotifications } from "@/controllers/API/queries/notifications";
import { useGetMyNotificationsQuery } from "@/controllers/API/queries/notifications/use-get-my-notifications";
import { useTeamMockData } from "@/components/core/appHeaderComponent/components/TeamMenu/useTeamMockData";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isZh: boolean;
  title: string;
  emptyText: string;
  clearLabel: string;
}

function formatDate(value: string, isZh: boolean) {
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function RewardEmptyState({
  isZh,
  teamName,
}: {
  isZh: boolean;
  teamName: string;
}) {
  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="px-7 pt-6">
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <span className="shrink-0">{isZh ? "奖励归属：" : "Credited to:"}</span>
          <div className="inline-flex min-h-12 min-w-[240px] items-center rounded-2xl border border-zinc-700/80 bg-zinc-800/70 px-5 text-[16px] font-semibold text-zinc-100">
            {teamName}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-800/60 text-zinc-400">
            <Gift className="h-7 w-7" />
          </div>
          <p className="text-[22px] font-semibold text-zinc-500">
            {isZh ? "暂无奖励" : "No rewards yet"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-7 pb-7 pt-4">
        <span className="text-[16px] text-zinc-500">
          {isZh ? "0 条待领取" : "0 pending"}
        </span>
        <Button
          disabled
          className="h-12 min-w-[196px] rounded-xl bg-slate-500/70 text-base font-semibold text-zinc-800 hover:bg-slate-500/70"
        >
          {isZh ? "领取全部奖励" : "Claim all"}
        </Button>
      </div>
    </div>
  );
}

export function NotificationPanel({
  open,
  onOpenChange,
  isZh,
  title,
  emptyText,
  clearLabel,
}: NotificationPanelProps) {
  const { currentTeam } = useTeamMockData();
  const [activeTab, setActiveTab] = useState("notifications");
  const [hidingRecipientId, setHidingRecipientId] = useState<string | null>(null);
  const {
    data: notifications = [],
    isLoading,
    isError,
  } = useGetMyNotificationsQuery({
    enabled: open,
  });
  const { mutate: readAllNotifications, isPending: isReadingAll } =
    useReadAllNotifications();
  const { mutate: hideNotification } = useHideMyNotification();

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  useEffect(() => {
    if (!open) {
      setActiveTab("notifications");
      return;
    }

    if (
      activeTab === "notifications" &&
      unreadCount > 0 &&
      !isReadingAll
    ) {
      readAllNotifications();
    }
  }, [activeTab, isReadingAll, open, readAllNotifications, unreadCount]);

  const handleHideNotification = (recipientId: string) => {
    setHidingRecipientId(recipientId);
    hideNotification(
      { recipientId },
      {
        onSettled: () => {
          setHidingRecipientId(null);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="notification-dropdown-content"
        className="overflow-hidden border-zinc-800 bg-[#232326] p-0 text-zinc-100 sm:max-w-[680px]"
        closeButtonClassName="right-6 top-6 text-zinc-300 hover:bg-zinc-800 hover:text-white"
      >
        <DialogHeader className="px-6 pb-0 pt-5">
          <DialogTitle className="text-[22px] font-semibold text-zinc-100">
            {title}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-6 pt-3">
            <TabsList className="h-auto w-auto gap-8 border-b border-zinc-700/80 bg-transparent p-0 text-zinc-400">
              <TabsTrigger
                value="notifications"
                className="h-auto rounded-none border-b-2 border-transparent px-0 pb-3 pt-1 text-[18px] font-semibold text-zinc-400 data-[state=active]:border-zinc-100 data-[state=active]:text-zinc-100 data-[state=inactive]:hover:text-zinc-200"
              >
                {isZh ? "通知" : "Notices"}
              </TabsTrigger>
              <TabsTrigger
                value="rewards"
                className="h-auto rounded-none border-b-2 border-transparent px-0 pb-3 pt-1 text-[18px] font-semibold text-zinc-400 data-[state=active]:border-zinc-100 data-[state=active]:text-zinc-100 data-[state=inactive]:hover:text-zinc-200"
              >
                {isZh ? "奖励" : "Rewards"}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="notifications" className="m-0">
            <div className="flex min-h-[560px] flex-col">
              <div className="flex items-center justify-between border-b border-zinc-800 px-7 py-4">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Bell className="h-4 w-4" />
                  <span>{isZh ? "管理员通知" : "Admin notices"}</span>
                </div>
                <div className="text-sm text-zinc-500">
                  {unreadCount > 0
                    ? isZh
                      ? `${unreadCount} 条未读`
                      : `${unreadCount} unread`
                    : isZh
                      ? "全部已读"
                      : "All caught up"}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-hide">
                {isLoading ? (
                  <div className="flex h-full min-h-[420px] items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                  </div>
                ) : isError ? (
                  <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/70 text-zinc-500">
                        <Bell className="h-6 w-6" />
                      </div>
                      <p className="text-lg font-medium text-zinc-500">
                        {isZh ? "通知加载失败，请稍后重试" : "Failed to load notifications"}
                      </p>
                    </div>
                  </div>
                ) : notifications.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {notifications.map((item) => {
                      const isUnread = !item.read_at;
                      const isHiding = hidingRecipientId === item.recipient_id;

                      return (
                        <div
                          key={item.recipient_id}
                          className={`rounded-2xl border p-4 transition-colors ${
                            isUnread
                              ? "border-sky-500/30 bg-sky-500/5"
                              : "border-zinc-800 bg-zinc-900/75"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                isUnread
                                  ? "bg-sky-500/15 text-sky-300"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              <Info className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-zinc-100">
                                  {item.title}
                                </p>
                                {isUnread ? (
                                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                                ) : null}
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                                {item.content}
                              </p>
                              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
                                <span>
                                  {isZh ? "发送人：" : "From: "}
                                  {item.sender_name}
                                </span>
                                <span>
                                  {isZh ? "时间：" : "Sent: "}
                                  {formatDate(item.created_at, isZh)}
                                </span>
                                <span>
                                  {isZh ? "过期：" : "Expires: "}
                                  {formatDate(item.expires_at, isZh)}
                                </span>
                              </div>
                              {item.link ? (
                                <a
                                  href={item.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sky-400 transition-colors hover:text-sky-300"
                                >
                                  <span>{isZh ? "查看详情" : "View details"}</span>
                                  <ChevronRight className="h-4 w-4" />
                                </a>
                              ) : null}
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isHiding}
                              onClick={() => handleHideNotification(item.recipient_id)}
                              className="h-8 w-8 shrink-0 rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                              aria-label={clearLabel}
                            >
                              {isHiding ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/70 text-zinc-500">
                        <Bell className="h-6 w-6" />
                      </div>
                      <p className="text-lg font-medium text-zinc-500">
                        {emptyText}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rewards" className="m-0">
            <RewardEmptyState
              isZh={isZh}
              teamName={currentTeam?.name || (isZh ? "当前团队" : "Current team")}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
