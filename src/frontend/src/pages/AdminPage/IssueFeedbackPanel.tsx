import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquareWarning, Paperclip, Send } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  useGetAdminIssueFeedbacksQuery,
  useUpdateIssueFeedback,
} from "@/controllers/API/queries/feedback";
import type { IssueFeedback, IssueFeedbackStatus } from "@/types/api";
import useAlertStore from "@/stores/alertStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type StatusDraftMap = Record<string, IssueFeedbackStatus>;
type ReplyDraftMap = Record<string, string>;
const MAX_ADMIN_REPLY_LENGTH = 4000;
const TEXT = {
  title: "\u7528\u6237\u95ee\u9898\u53cd\u9988",
  description:
    "\u67e5\u770b\u7528\u6237\u5728\u7ad9\u5185\u53cd\u9988\u5f39\u7a97\u63d0\u4ea4\u7684\u95ee\u9898\uff0c\u66f4\u65b0\u5904\u7406\u72b6\u6001\uff0c\u5e76\u5728\u540e\u53f0\u76f4\u63a5\u56de\u590d\u7528\u6237\u3002",
  total: "\u5168\u90e8",
  pending: "\u5f85\u5904\u7406",
  inProgress: "\u5904\u7406\u4e2d",
  resolved: "\u5df2\u89e3\u51b3",
  searchPlaceholder:
    "\u6309\u53cd\u9988\u4eba\u3001\u7528\u6237\u540d\u3001\u53cd\u9988\u5185\u5bb9\u6216\u56de\u590d\u5185\u5bb9\u641c\u7d22",
  allStatuses: "\u5168\u90e8\u72b6\u6001",
  emptyFiltered: "\u6ca1\u6709\u5339\u914d\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u7684\u53cd\u9988",
  emptyAll: "\u6682\u65e0\u7528\u6237\u63d0\u4ea4\u7684\u95ee\u9898\u53cd\u9988",
  updateFirst: "\u8bf7\u5148\u4fee\u6539\u72b6\u6001\u6216\u586b\u5199\u56de\u590d",
  updateSuccess: "\u53cd\u9988\u5df2\u66f4\u65b0",
  updateFailedTitle: "\u53cd\u9988\u66f4\u65b0\u5931\u8d25",
  updateFailedFallback: "\u66f4\u65b0\u53cd\u9988\u5931\u8d25",
  fromNotificationLink: "\u6765\u81ea\u901a\u77e5\u8df3\u8f6c",
  submittedAt: "\u63d0\u4ea4\u65f6\u95f4\uff1a",
  updatedAt: "\u6700\u540e\u66f4\u65b0\uff1a",
  lastReplyAt: "\u6700\u540e\u56de\u590d\uff1a",
  latestReply: "\u6700\u8fd1\u56de\u590d",
  attachments: "\u9644\u4ef6",
  statusLabel: "\u5904\u7406\u72b6\u6001",
  replyLabel: "\u56de\u590d\u5185\u5bb9",
  replyPlaceholder:
    "\u8bf7\u8f93\u5165\u5904\u7406\u7ed3\u679c\u3001\u89e3\u51b3\u5efa\u8bae\u6216\u540e\u7eed\u8ddf\u8fdb\u8bf4\u660e\u3002",
  saving: "\u4fdd\u5b58\u4e2d",
  save: "\u4fdd\u5b58\u66f4\u65b0",
} as const;

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: IssueFeedbackStatus) {
  if (status === "PENDING") return TEXT.pending;
  if (status === "IN_PROGRESS") return TEXT.inProgress;
  if (status === "RESOLVED") return TEXT.resolved;
  return "\u5df2\u5173\u95ed";
}

function statusBadgeClass(status: IssueFeedbackStatus) {
  if (status === "PENDING") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "IN_PROGRESS") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (status === "RESOLVED") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

function attachmentKind(contentType: string) {
  return contentType.startsWith("image/") ? "image" : "video";
}

export default function IssueFeedbackPanel() {
  const location = useLocation();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | IssueFeedbackStatus>("ALL");
  const [statusDrafts, setStatusDrafts] = useState<StatusDraftMap>({});
  const [replyDrafts, setReplyDrafts] = useState<ReplyDraftMap>({});
  const feedbackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightedFeedbackId = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("focus") === "feedback"
      ? searchParams.get("feedbackId")
      : null;
  }, [location.search]);

  const {
    data: feedbacks = [],
    isLoading,
  } = useGetAdminIssueFeedbacksQuery();
  const { mutate: updateIssueFeedback, isPending: isUpdating } =
    useUpdateIssueFeedback();

  useEffect(() => {
    if (feedbacks.length === 0) return;

    setStatusDrafts((current) => {
      const next = { ...current };
      feedbacks.forEach((item) => {
        if (!next[item.id]) next[item.id] = item.status;
      });
      return next;
    });

    setReplyDrafts((current) => {
      const next = { ...current };
      feedbacks.forEach((item) => {
        if (next[item.id] === undefined) next[item.id] = "";
      });
      return next;
    });
  }, [feedbacks]);

  useEffect(() => {
    if (!highlightedFeedbackId) return;
    const target = feedbackRefs.current[highlightedFeedbackId];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [feedbacks, highlightedFeedbackId]);

  const filteredFeedbacks = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    return feedbacks.filter((item) => {
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;
      return [
        item.reporter_name,
        item.reporter_username,
        item.description,
        item.latest_admin_reply ?? "",
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [feedbacks, searchValue, statusFilter]);

  const metrics = useMemo(
    () =>
      feedbacks.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.status === "PENDING") acc.pending += 1;
          if (item.status === "IN_PROGRESS") acc.inProgress += 1;
          if (item.status === "RESOLVED") acc.resolved += 1;
          if (item.status === "CLOSED") acc.closed += 1;
          return acc;
        },
        { total: 0, pending: 0, inProgress: 0, resolved: 0, closed: 0 },
      ),
    [feedbacks],
  );

  function handleUpdate(feedback: IssueFeedback) {
    const nextStatus = statusDrafts[feedback.id] ?? feedback.status;
    const reply = (replyDrafts[feedback.id] ?? "").trim();
    const hasStatusChange = nextStatus !== feedback.status;
    const hasReply = reply.length > 0;

    if (!hasStatusChange && !hasReply) {
      setErrorData({ title: TEXT.updateFirst });
      return;
    }

    updateIssueFeedback(
      {
        feedbackId: feedback.id,
        payload: {
          status: nextStatus,
          admin_reply: hasReply ? reply : undefined,
        },
      },
      {
        onSuccess: () => {
          setSuccessData({ title: TEXT.updateSuccess });
          setReplyDrafts((current) => ({ ...current, [feedback.id]: "" }));
        },
        onError: (error: any) => {
          const detail =
            error?.response?.data?.detail ||
            error?.message ||
            TEXT.updateFailedFallback;
          setErrorData({
            title: TEXT.updateFailedTitle,
            list: typeof detail === "string" ? [detail] : undefined,
          });
        },
      },
    );
  }

  return (
    <Card className="border-border bg-background">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquareWarning className="h-5 w-5 text-primary" />
                {TEXT.title}
              </CardTitle>
              <CardDescription className="mt-2">
                {TEXT.description}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                {`${TEXT.total} ${metrics.total}`}
              </Badge>
              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                {`${TEXT.pending} ${metrics.pending}`}
              </Badge>
              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                {`${TEXT.inProgress} ${metrics.inProgress}`}
              </Badge>
              <Badge variant="outline" className="px-2 py-1 text-[11px]">
                {`${TEXT.resolved} ${metrics.resolved}`}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={TEXT.searchPlaceholder}
            />
            <Select
              value={statusFilter}
              onValueChange={(value: "ALL" | IssueFeedbackStatus) =>
                setStatusFilter(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{TEXT.allStatuses}</SelectItem>
                <SelectItem value="PENDING">{TEXT.pending}</SelectItem>
                <SelectItem value="IN_PROGRESS">{TEXT.inProgress}</SelectItem>
                <SelectItem value="RESOLVED">{TEXT.resolved}</SelectItem>
                <SelectItem value="CLOSED">{"\u5df2\u5173\u95ed"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {searchValue || statusFilter !== "ALL"
              ? TEXT.emptyFiltered
              : TEXT.emptyAll}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFeedbacks.map((feedback) => {
              const currentStatus = statusDrafts[feedback.id] ?? feedback.status;
              const currentReply = replyDrafts[feedback.id] ?? "";
              const hasDraftChanges =
                currentStatus !== feedback.status || currentReply.trim().length > 0;

              return (
                <div
                  key={feedback.id}
                  ref={(node) => {
                    feedbackRefs.current[feedback.id] = node;
                  }}
                  className={`rounded-xl border p-4 ${
                    feedback.id === highlightedFeedbackId
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {feedback.reporter_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          @{feedback.reporter_username}
                        </span>
                        <Badge
                          variant="secondaryStatic"
                          className={`px-2 py-1 text-[11px] ${statusBadgeClass(
                            feedback.status,
                          )}`}
                        >
                          {statusLabel(feedback.status)}
                        </Badge>
                        {feedback.id === highlightedFeedbackId ? (
                          <Badge variant="secondaryStatic" className="px-2 py-1 text-[11px]">
                            {TEXT.fromNotificationLink}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {feedback.description}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>{`${TEXT.submittedAt}${formatDateLabel(feedback.created_at)}`}</span>
                        <span>{`${TEXT.updatedAt}${formatDateLabel(feedback.updated_at)}`}</span>
                        {feedback.last_replied_at ? (
                          <span>{`${TEXT.lastReplyAt}${formatDateLabel(feedback.last_replied_at)}`}</span>
                        ) : null}
                      </div>

                      {feedback.latest_admin_reply ? (
                        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-3">
                          <div className="text-xs font-medium text-sky-700 dark:text-sky-300">
                            {`${TEXT.latestReply}${feedback.last_replied_by_name ? ` - ${feedback.last_replied_by_name}` : ""}`}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                            {feedback.latest_admin_reply}
                          </div>
                        </div>
                      ) : null}

                      {feedback.attachments.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Paperclip className="h-3.5 w-3.5" />
                            <span>{`${TEXT.attachments} ${feedback.attachments.length}`}</span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {feedback.attachments.map((attachment) => {
                              const kind = attachmentKind(attachment.content_type);
                              return (
                                <a
                                  key={attachment.id}
                                  href={attachment.preview_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="overflow-hidden rounded-lg border border-border bg-black/60"
                                >
                                  <div className="aspect-[16/10] bg-black">
                                    {kind === "image" ? (
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
                                  <div className="px-3 py-2 text-xs text-zinc-200">
                                    <div className="line-clamp-1">{attachment.original_name}</div>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="w-full max-w-[320px] space-y-3 xl:shrink-0">
                      <div className="space-y-2">
                        <Label>{TEXT.statusLabel}</Label>
                        <Select
                          value={currentStatus}
                          onValueChange={(value: IssueFeedbackStatus) =>
                            setStatusDrafts((current) => ({
                              ...current,
                              [feedback.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">{TEXT.pending}</SelectItem>
                            <SelectItem value="IN_PROGRESS">{TEXT.inProgress}</SelectItem>
                            <SelectItem value="RESOLVED">{TEXT.resolved}</SelectItem>
                            <SelectItem value="CLOSED">{"\u5df2\u5173\u95ed"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>{TEXT.replyLabel}</Label>
                        <Textarea
                          value={currentReply}
                          onChange={(event) =>
                            setReplyDrafts((current) => ({
                              ...current,
                              [feedback.id]: event.target.value,
                            }))
                          }
                          placeholder={TEXT.replyPlaceholder}
                          className="min-h-[140px]"
                          maxLength={MAX_ADMIN_REPLY_LENGTH}
                        />
                        <div className="text-xs text-muted-foreground">
                          {`${currentReply.length} / ${MAX_ADMIN_REPLY_LENGTH}`}
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        className="w-full"
                        onClick={() => handleUpdate(feedback)}
                        disabled={!hasDraftChanges || isUpdating}
                      >
                        {isUpdating ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {TEXT.saving}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Send className="h-4 w-4" />
                            {TEXT.save}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
