import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Gift,
  Info,
  Loader2,
  MessageSquareWarning,
  Trash2,
} from "lucide-react";
import {
  useHideMyNotification,
  useReadAllNotifications,
} from "@/controllers/API/queries/notifications";
import { useGetMyNotificationsQuery } from "@/controllers/API/queries/notifications/use-get-my-notifications";
import { useGetMyIssueFeedbacksQuery } from "@/controllers/API/queries/feedback";
import type { IssueFeedback, IssueFeedbackStatus } from "@/types/api";
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

const ZH = {
  rewardCreditedTo: "\u5f52\u5c5e\u56e2\u961f\uff1a",
  rewardEmpty: "\u6682\u65e0\u5956\u52b1",
  rewardPending: "0 \u5f85\u9886\u53d6",
  rewardClaimAll: "\u4e00\u952e\u9886\u53d6",
  feedbackTitle: "\u95ee\u9898\u53cd\u9988",
  submittedAt: "\u63d0\u4ea4\u65f6\u95f4\uff1a",
  updatedAt: "\u6700\u540e\u66f4\u65b0\uff1a",
  lastReplyAt: "\u6700\u540e\u56de\u590d\uff1a",
  adminReply: "\u7ba1\u7406\u5458\u56de\u590d",
  replyBy: "\u56de\u590d\u4eba\uff1a",
  noAdminReply: "\u7ba1\u7406\u5458\u6682\u672a\u56de\u590d\uff0c\u540e\u7eed\u72b6\u6001\u53d8\u66f4\u4f1a\u5728\u8fd9\u91cc\u663e\u793a\u3002",
  attachments: "\u9644\u4ef6",
  noticesTab: "\u901a\u77e5",
  rewardsTab: "\u5956\u52b1",
  myNoticesAndFeedback: "\u6211\u7684\u901a\u77e5\u4e0e\u53cd\u9988",
  unreadSuffix: "\u6761\u672a\u8bfb",
  allRead: "\u5168\u90e8\u5df2\u8bfb",
  loadFailed: "\u901a\u77e5\u52a0\u8f7d\u5931\u8d25",
  adminNotices: "\u7ba1\u7406\u901a\u77e5",
  from: "\u53d1\u9001\u4eba\uff1a",
  sentAt: "\u53d1\u9001\u65f6\u95f4\uff1a",
  expiresAt: "\u8fc7\u671f\u65f6\u95f4\uff1a",
  viewDetails: "\u67e5\u770b\u8be6\u60c5",
  noAdminNotices: "\u6682\u65e0\u7ba1\u7406\u901a\u77e5",
  currentTeam: "\u5f53\u524d\u56e2\u961f",
} as const;

function formatDate(value: string, isZh: boolean) {
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFeedbackStatus(status: IssueFeedbackStatus) {
  if (status === "PENDING") return "\u5f85\u5904\u7406";
  if (status === "IN_PROGRESS") return "\u5904\u7406\u4e2d";
  if (status === "RESOLVED") return "\u5df2\u89e3\u51b3";
  return "\u5df2\u5173\u95ed";
}

function feedbackStatusClass(status: IssueFeedbackStatus) {
  if (status === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "IN_PROGRESS") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (status === "RESOLVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-zinc-600 bg-zinc-800/80 text-zinc-300";
}

function RewardEmptyState({
  teamName,
}: {
  teamName: string;
}) {
  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="px-7 pt-6">
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <span className="shrink-0">{ZH.rewardCreditedTo}</span>
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
          <p className="text-[22px] font-semibold text-zinc-500">{ZH.rewardEmpty}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-7 pb-7 pt-4">
        <span className="text-[16px] text-zinc-500">{ZH.rewardPending}</span>
        <Button
          disabled
          className="h-12 min-w-[196px] rounded-xl bg-slate-500/70 text-base font-semibold text-zinc-800 hover:bg-slate-500/70"
        >
          {ZH.rewardClaimAll}
        </Button>
      </div>
    </div>
  );
}

function FeedbackCard({
  feedback,
  isZh,
}: {
  feedback: IssueFeedback;
  isZh: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
            <MessageSquareWarning className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-zinc-100">{ZH.feedbackTitle}</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${feedbackStatusClass(
                  feedback.status,
                )}`}
              >
                {formatFeedbackStatus(feedback.status)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {feedback.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
        <span>{`${ZH.submittedAt}${formatDate(feedback.created_at, isZh)}`}</span>
        <span>{`${ZH.updatedAt}${formatDate(feedback.updated_at, isZh)}`}</span>
        {feedback.last_replied_at ? (
          <span>{`${ZH.lastReplyAt}${formatDate(feedback.last_replied_at, isZh)}`}</span>
        ) : null}
      </div>

      {feedback.latest_admin_reply ? (
        <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-sky-300">
            {ZH.adminReply}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
            {feedback.latest_admin_reply}
          </p>
          {feedback.last_replied_by_name ? (
            <div className="mt-2 text-xs text-zinc-500">{`${ZH.replyBy}${feedback.last_replied_by_name}`}</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-3 text-sm text-zinc-400">
          {ZH.noAdminReply}
        </div>
      )}

      {feedback.attachments.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {ZH.attachments}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {feedback.attachments.map((attachment) => {
              const isImage = attachment.content_type.startsWith("image/");
              return (
                <a
                  key={attachment.id}
                  href={attachment.preview_url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-black/50"
                >
                  <div className="aspect-[16/10] bg-black">
                    {isImage ? (
                      <img
                        src={attachment.preview_url}
                        alt={attachment.original_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={attachment.preview_url}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-300">
                    <span className="line-clamp-1">{attachment.original_name}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
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
    isLoading: isLoadingNotifications,
    isError: isNotificationsError,
  } = useGetMyNotificationsQuery({
    enabled: open,
  });
  const {
    data: issueFeedbacks = [],
    isLoading: isLoadingFeedbacks,
    isError: isFeedbacksError,
  } = useGetMyIssueFeedbacksQuery({
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

    if (activeTab === "notifications" && unreadCount > 0 && !isReadingAll) {
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

  const isLoading = isLoadingNotifications || isLoadingFeedbacks;
  const isError = isNotificationsError || isFeedbacksError;
  const hasAnyContent = issueFeedbacks.length > 0 || notifications.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="notification-dropdown-content"
        className="overflow-hidden border-zinc-800 bg-[#232326] p-0 text-zinc-100 sm:max-w-[760px]"
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
                {ZH.noticesTab}
              </TabsTrigger>
              <TabsTrigger
                value="rewards"
                className="h-auto rounded-none border-b-2 border-transparent px-0 pb-3 pt-1 text-[18px] font-semibold text-zinc-400 data-[state=active]:border-zinc-100 data-[state=active]:text-zinc-100 data-[state=inactive]:hover:text-zinc-200"
              >
                {ZH.rewardsTab}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="notifications" className="m-0">
            <div className="flex min-h-[560px] flex-col">
              <div className="flex items-center justify-between border-b border-zinc-800 px-7 py-4">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Bell className="h-4 w-4" />
                  <span>{ZH.myNoticesAndFeedback}</span>
                </div>
                <div className="text-sm text-zinc-500">
                  {unreadCount > 0 ? `${unreadCount} ${ZH.unreadSuffix}` : ZH.allRead}
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
                        {ZH.loadFailed}
                      </p>
                    </div>
                  </div>
                ) : hasAnyContent ? (
                  <div className="space-y-6">
                    {issueFeedbacks.length > 0 ? (
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                          <MessageSquareWarning className="h-4 w-4 text-amber-300" />
                          <span>{ZH.feedbackTitle}</span>
                        </div>
                        <div className="space-y-3">
                          {issueFeedbacks.map((feedback) => (
                            <FeedbackCard
                              key={feedback.id}
                              feedback={feedback}
                              isZh={isZh}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                        <Info className="h-4 w-4 text-sky-300" />
                        <span>{ZH.adminNotices}</span>
                      </div>
                      {notifications.length > 0 ? (
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
                                      <span>{`${ZH.from}${item.sender_name}`}</span>
                                      <span>{`${ZH.sentAt}${formatDate(item.created_at, isZh)}`}</span>
                                      <span>{`${ZH.expiresAt}${formatDate(item.expires_at, isZh)}`}</span>
                                    </div>
                                    {item.link ? (
                                      <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sky-400 transition-colors hover:text-sky-300"
                                      >
                                        <span>{ZH.viewDetails}</span>
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
                        <div className="rounded-2xl border border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500">
                          {ZH.noAdminNotices}
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/70 text-zinc-500">
                        <Bell className="h-6 w-6" />
                      </div>
                      <p className="text-lg font-medium text-zinc-500">{emptyText}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rewards" className="m-0">
            <RewardEmptyState teamName={currentTeam?.name || ZH.currentTeam} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
