import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import PaginatorComponent from "@/components/common/paginatorComponent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PAGINATION_PAGE,
  PAGINATION_ROWS_COUNT,
  PAGINATION_SIZE,
} from "@/constants/constants";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import useAlertStore from "@/stores/alertStore";
import type {
  CommunityBatchReviewResult,
  CommunityItem,
  CommunityItemStatus,
  CommunityItemType,
  CommunityReviewDetail,
} from "@/types/community";
import {
  getCommunityImageUrl,
  getCommunityPreviewUrl,
  isLikelyImagePath,
} from "@/utils/communityFiles";
import { cn } from "@/utils/utils";

type ReviewTypeFilter = "ALL" | CommunityItemType;
type ReviewStatusFilter = "ALL" | CommunityItemStatus;

type ReviewListResponse = {
  total_count: number;
  items: CommunityItem[];
};

function statusLabel(status: CommunityItemStatus) {
  switch (status) {
    case "UNREVIEWED":
      return "待审核";
    case "PUBLIC":
      return "已公开";
    case "PRIVATE":
      return "未公开";
    default:
      return status;
  }
}

function typeLabel(type: CommunityItemType) {
  switch (type) {
    case "TV":
      return "TV";
    case "WORKFLOW":
      return "工作流";
    default:
      return type;
  }
}

function actionLabel(action?: "APPROVE" | "REJECT" | "HIDE" | null) {
  switch (action) {
    case "APPROVE":
      return "通过";
    case "REJECT":
      return "驳回";
    case "HIDE":
      return "下架";
    default:
      return "无";
  }
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toStartOfDayISO(dateInput: string) {
  if (!dateInput) return undefined;
  return `${dateInput}T00:00:00Z`;
}

function toEndOfDayISO(dateInput: string) {
  if (!dateInput) return undefined;
  return `${dateInput}T23:59:59Z`;
}

function getErrorMessage(error: unknown) {
  const err = error as {
    response?: { data?: { detail?: string } };
    message?: string;
  };
  return err?.response?.data?.detail ?? err?.message ?? "未知错误";
}

export default function CommunityModerationPanel() {
  const queryClient = useQueryClient();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);

  const [status, setStatus] = useState<ReviewStatusFilter>("UNREVIEWED");
  const [type, setType] = useState<ReviewTypeFilter>("ALL");
  const [q, setQ] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const [size, setPageSize] = useState(PAGINATION_SIZE);
  const [index, setPageIndex] = useState(PAGINATION_PAGE);

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [batchComment, setBatchComment] = useState("");
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRejectOpen, setBatchRejectOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [singleActionLoading, setSingleActionLoading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{
    url: string;
    kind: "image" | "video";
    title: string;
  } | null>(null);

  // Reset paging when filters change.
  useEffect(() => {
    setPageIndex(1);
  }, [status, type, q, submitter, createdFrom, createdTo]);

  const offset = useMemo(() => size * (index - 1), [index, size]);

  const reviewList = useQuery({
    queryKey: [
      "community",
      "review",
      { status, type, q, submitter, createdFrom, createdTo, size, index },
    ],
    queryFn: async () => {
      const r = await api.get<ReviewListResponse>(
        `${getURL("COMMUNITY")}/items/review`,
        {
          params: {
            status: status === "ALL" ? undefined : status,
            type: type === "ALL" ? undefined : type,
            q: q.trim() || undefined,
            submitter: submitter.trim() || undefined,
            created_from: toStartOfDayISO(createdFrom),
            created_to: toEndOfDayISO(createdTo),
            limit: size,
            offset,
          },
        },
      );
      return r.data;
    },
  });

  const reviewDetail = useQuery({
    queryKey: ["community", "review", "detail", detailItemId],
    enabled: detailOpen && !!detailItemId,
    queryFn: async () => {
      const r = await api.get<CommunityReviewDetail>(
        `${getURL("COMMUNITY")}/items/${detailItemId}/review-detail`,
      );
      return r.data;
    },
  });

  const total = reviewList.data?.total_count ?? 0;
  const items = reviewList.data?.items ?? [];

  useEffect(() => {
    const currentIds = new Set(items.map((item) => item.id));
    setSelectedIds((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(
          ([id, checked]) => checked && currentIds.has(id),
        ),
      ),
    );
  }, [items]);

  const checkedItemIds = useMemo(
    () => items.filter((item) => selectedIds[item.id]).map((item) => item.id),
    [items, selectedIds],
  );
  const checkedCount = checkedItemIds.length;
  const allChecked = items.length > 0 && checkedCount === items.length;

  const paginate = (pageIndex: number, pageSize: number) => {
    setPageIndex(pageIndex);
    setPageSize(pageSize);
  };

  const invalidateReviewQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["community", "review"] });
    await queryClient.invalidateQueries({
      queryKey: ["community", "tv", "public"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["community", "tv", "mine"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["community", "workflows", "public"],
    });
  };

  const openDetail = (itemId: string) => {
    setDetailItemId(itemId);
    setDecisionComment("");
    setDetailOpen(true);
  };

  const submitSingleAction = async (action: "APPROVE" | "REJECT" | "HIDE") => {
    if (!detailItemId) return;
    const comment = decisionComment.trim();
    if (action === "REJECT" && !comment) {
      setErrorData({
        title: "请填写驳回原因",
        list: ["驳回时必须填写原因，投稿人将可见。"],
      });
      return;
    }

    const endpoint =
      action === "APPROVE"
        ? `${getURL("COMMUNITY")}/items/${detailItemId}/approve`
        : action === "REJECT"
          ? `${getURL("COMMUNITY")}/items/${detailItemId}/reject`
          : `${getURL("COMMUNITY")}/items/${detailItemId}/hide`;

    setSingleActionLoading(true);
    try {
      await api.post(endpoint, { comment: comment || undefined });
      setSuccessData({
        title:
          action === "APPROVE"
            ? "审核通过，已公开"
            : action === "REJECT"
              ? "已驳回并设为未公开"
              : "已下架为未公开",
      });
      setDecisionComment("");
      await invalidateReviewQueries();
      await reviewDetail.refetch();
    } catch (e: unknown) {
      setErrorData({
        title: "审核操作失败",
        list: [getErrorMessage(e)],
      });
    } finally {
      setSingleActionLoading(false);
    }
  };

  const submitBatchAction = async (action: "APPROVE" | "REJECT") => {
    if (checkedItemIds.length === 0) {
      setErrorData({
        title: "请先选择投稿",
        list: ["至少选择 1 条投稿后再执行批量操作。"],
      });
      return false;
    }
    const comment = batchComment.trim();
    if (action === "REJECT" && !comment) {
      setErrorData({
        title: "请填写批量驳回原因",
        list: ["批量驳回时必须填写原因，投稿人将可见。"],
      });
      return false;
    }

    setBatchLoading(true);
    try {
      const r = await api.post<CommunityBatchReviewResult>(
        `${getURL("COMMUNITY")}/items/review/batch`,
        {
          item_ids: checkedItemIds,
          action,
          comment: comment || undefined,
        },
      );
      const result = r.data;
      const missing = result?.missing_item_ids?.length ?? 0;
      setSuccessData({
        title:
          action === "APPROVE"
            ? `批量通过完成：${result.processed_count}/${result.total_requested}`
            : `批量驳回完成：${result.processed_count}/${result.total_requested}`,
      });
      if (missing > 0) {
        setErrorData({
          title: "部分投稿未处理",
          list: [`${missing} 条未找到，可能已被删除。`],
        });
      }
      setSelectedIds({});
      setBatchComment("");
      await invalidateReviewQueries();
      return true;
    } catch (e: unknown) {
      setErrorData({
        title: "批量审核失败",
        list: [getErrorMessage(e)],
      });
      return false;
    } finally {
      setBatchLoading(false);
    }
  };

  const openBatchReject = () => {
    if (checkedItemIds.length === 0) {
      setErrorData({
        title: "请先选择投稿",
        list: ["至少选择 1 条投稿后再执行批量操作。"],
      });
      return;
    }
    setBatchRejectOpen(true);
  };

  const detailItem = reviewDetail.data?.item;
  const detailFlow = reviewDetail.data?.flow;
  const detailLogs = reviewDetail.data?.logs ?? [];
  const detailMediaUrl = detailItem?.media_path
    ? getCommunityPreviewUrl(detailItem.media_path)
    : null;
  const detailCoverUrl = detailItem?.cover_path
    ? getCommunityImageUrl(detailItem.cover_path)
    : null;
  const detailMediaIsImage = detailItem?.media_path
    ? isLikelyImagePath(detailItem.media_path)
    : false;

  return (
    <div className="flex h-full w-full flex-col gap-4 px-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ReviewStatusFilter)}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNREVIEWED">待审核</SelectItem>
              <SelectItem value="PUBLIC">已公开</SelectItem>
              <SelectItem value="PRIVATE">未公开</SelectItem>
              <SelectItem value="ALL">全部状态</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={type}
            onValueChange={(v) => setType(v as ReviewTypeFilter)}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类型</SelectItem>
              <SelectItem value="TV">TV</SelectItem>
              <SelectItem value="WORKFLOW">工作流</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题/描述"
            className="w-[220px]"
          />
          <Input
            value={submitter}
            onChange={(e) => setSubmitter(e.target.value)}
            placeholder="搜索投稿人"
            className="w-[180px]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              className="primary-input h-9 w-[160px]"
            />
            <span className="text-sm text-muted-foreground">至</span>
            <input
              type="date"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              className="primary-input h-9 w-[160px]"
            />
          </div>

          <Button
            variant="ghost"
            onClick={() => reviewList.refetch()}
            disabled={reviewList.isFetching}
            title="刷新"
          >
            <IconComponent
              name="RefreshCcw"
              className={cn(
                "mr-2 h-4 w-4",
                reviewList.isFetching && "animate-spin",
              )}
            />
            刷新
          </Button>
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            已选 {checkedCount} 条
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={checkedCount === 0 || batchLoading}
            onClick={() => submitBatchAction("APPROVE")}
          >
            批量通过
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={checkedCount === 0 || batchLoading}
            onClick={openBatchReject}
          >
            批量驳回
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          点击“批量驳回”后填写驳回原因（投稿人可见）。
        </div>
      </div>

      {reviewList.isLoading ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          暂无内容
        </div>
      ) : (
        <>
          <div className="h-fit overflow-x-hidden overflow-y-scroll rounded-md border-2 bg-background custom-scroll">
            <Table className={"table-fixed outline-1"}>
              <TableHeader className={"table-fixed bg-muted outline-1"}>
                <TableRow>
                  <TableHead className="h-10 w-[42px]">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(checked) => {
                        const next: Record<string, boolean> = {};
                        if (checked) {
                          for (const item of items) {
                            next[item.id] = true;
                          }
                        }
                        setSelectedIds(next);
                      }}
                    />
                  </TableHead>
                  <TableHead className="h-10 w-[95px]">类型</TableHead>
                  <TableHead className="h-10 w-[100px]">状态</TableHead>
                  <TableHead className="h-10">标题</TableHead>
                  <TableHead className="h-10 w-[160px]">投稿人</TableHead>
                  <TableHead className="h-10 w-[170px]">投稿时间</TableHead>
                  <TableHead className="h-10 w-[190px]">最近审核</TableHead>
                  <TableHead className="h-10 w-[120px] text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="py-2">
                      <Checkbox
                        checked={!!selectedIds[item.id]}
                        onCheckedChange={(checked) =>
                          setSelectedIds((prev) => ({
                            ...prev,
                            [item.id]: !!checked,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="truncate py-2">
                      {typeLabel(item.type)}
                    </TableCell>
                    <TableCell className="truncate py-2">
                      {statusLabel(item.status)}
                    </TableCell>
                    <TableCell
                      className="truncate py-2 font-medium"
                      title={item.title}
                    >
                      {item.title}
                    </TableCell>
                    <TableCell className="truncate py-2">
                      @{item.user_name ?? "匿名"}
                    </TableCell>
                    <TableCell className="truncate py-2">
                      {fmtDateTime(item.created_at)}
                    </TableCell>
                    <TableCell className="truncate py-2 text-xs text-muted-foreground">
                      {item.last_review_action ? (
                        <span>
                          {actionLabel(item.last_review_action)} ·{" "}
                          {fmtDateTime(item.last_reviewed_at)}
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDetail(item.id)}
                      >
                        查看详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginatorComponent
            pageIndex={index}
            pageSize={size}
            totalRowsCount={total}
            paginate={paginate}
            rowsCount={PAGINATION_ROWS_COUNT}
          />
        </>
      )}

      <Dialog open={detailOpen} onOpenChange={(open) => setDetailOpen(open)}>
        <DialogContent className="max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>投稿审核详情</DialogTitle>
            <DialogDescription>
              查看封面、描述、作品内容与审核记录，并执行审核动作。
            </DialogDescription>
          </DialogHeader>

          {reviewDetail.isLoading ? (
            <div className="flex h-[420px] items-center justify-center text-muted-foreground">
              加载详情中...
            </div>
          ) : !detailItem ? (
            <div className="flex h-[420px] items-center justify-center text-muted-foreground">
              未找到该投稿
            </div>
          ) : (
            <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto pr-1 xl:grid-cols-[2fr_1fr]">
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <div className="mb-2 text-lg font-semibold">
                    {detailItem.title}
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>状态：{statusLabel(detailItem.status)}</div>
                    <div>类型：{typeLabel(detailItem.type)}</div>
                    <div>投稿人：@{detailItem.user_name ?? "匿名"}</div>
                    <div>投稿时间：{fmtDateTime(detailItem.created_at)}</div>
                    <div>更新时间：{fmtDateTime(detailItem.updated_at)}</div>
                    <div>流程 ID：{detailItem.flow_id}</div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm">
                    {detailItem.description?.trim()
                      ? detailItem.description
                      : "暂无描述"}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-medium">封面</div>
                    <div className="aspect-video overflow-hidden rounded-md bg-muted/20">
                      {detailCoverUrl ? (
                        <button
                          type="button"
                          className="group relative h-full w-full cursor-zoom-in"
                          onClick={() =>
                            setMediaPreview({
                              url: detailCoverUrl,
                              kind: "image",
                              title: `${detailItem.title} - 封面`,
                            })
                          }
                          title="点击放大查看"
                        >
                          <img
                            src={detailCoverUrl}
                            alt={detailItem.title}
                            className="h-full w-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                            点击放大查看
                          </div>
                        </button>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          无封面
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-medium">作品预览</div>
                    <div className="aspect-video overflow-hidden rounded-md bg-muted/20">
                      {!detailMediaUrl ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          无作品预览
                        </div>
                      ) : detailMediaIsImage ? (
                        <button
                          type="button"
                          className="group relative h-full w-full cursor-zoom-in"
                          onClick={() =>
                            setMediaPreview({
                              url: detailMediaUrl,
                              kind: "image",
                              title: `${detailItem.title} - 作品详情`,
                            })
                          }
                          title="点击放大查看"
                        >
                          <img
                            src={detailMediaUrl}
                            alt={detailItem.title}
                            className="h-full w-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                            点击放大查看
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="group relative h-full w-full cursor-zoom-in"
                          onClick={() =>
                            setMediaPreview({
                              url: detailMediaUrl,
                              kind: "video",
                              title: `${detailItem.title} - 作品详情`,
                            })
                          }
                          title="点击放大查看"
                        >
                          <video
                            src={detailMediaUrl}
                            controls={false}
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                            点击放大查看
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-medium">
                    工作流快照（只读）
                  </div>
                  {!detailFlow?.data ? (
                    <div className="text-sm text-muted-foreground">
                      无可用流程数据
                    </div>
                  ) : (
                    <pre className="max-h-[260px] overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
                      {JSON.stringify(detailFlow.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-semibold">审核动作</div>
                  <Textarea
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    placeholder="审核备注；驳回时必填，投稿人可见。"
                    className="min-h-[110px]"
                  />
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <Button
                      variant="primary"
                      disabled={
                        singleActionLoading || detailItem.status === "PUBLIC"
                      }
                      onClick={() => submitSingleAction("APPROVE")}
                    >
                      通过并公开
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={singleActionLoading}
                      onClick={() => submitSingleAction("REJECT")}
                    >
                      驳回（不公开）
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={
                        singleActionLoading || detailItem.status === "PRIVATE"
                      }
                      onClick={() => submitSingleAction("HIDE")}
                    >
                      下架（设为未公开）
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-semibold">审核日志</div>
                  {detailLogs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      暂无审核记录
                    </div>
                  ) : (
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {detailLogs.map((log) => (
                        <div
                          key={log.id}
                          className="rounded border p-2 text-xs"
                        >
                          <div className="font-medium">
                            {actionLabel(log.action)} ·{" "}
                            {statusLabel(log.from_status)} →{" "}
                            {statusLabel(log.to_status)}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            审核人：{log.reviewer_name ?? log.reviewer_id}
                          </div>
                          <div className="text-muted-foreground">
                            {fmtDateTime(log.created_at)}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-foreground">
                            {log.comment?.trim() ? log.comment : "无备注"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={batchRejectOpen} onOpenChange={setBatchRejectOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>批量驳回</DialogTitle>
            <DialogDescription>
              已选择 {checkedCount} 条投稿。请填写驳回原因（投稿人可见）。
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={batchComment}
            onChange={(e) => setBatchComment(e.target.value)}
            placeholder="请输入批量驳回原因"
            className="min-h-[120px]"
          />

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setBatchRejectOpen(false)}
              disabled={batchLoading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={batchLoading}
              onClick={async () => {
                const ok = await submitBatchAction("REJECT");
                if (ok) {
                  setBatchRejectOpen(false);
                }
              }}
            >
              确认批量驳回
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!mediaPreview}
        onOpenChange={(open) => {
          if (!open) setMediaPreview(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[92vw]">
          <DialogHeader>
            <DialogTitle>{mediaPreview?.title ?? "预览"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[78vh] overflow-auto rounded-md bg-black/90 p-2">
            {mediaPreview?.kind === "video" ? (
              <video
                src={mediaPreview.url}
                controls
                autoPlay
                className="mx-auto max-h-[74vh] w-auto max-w-full"
              />
            ) : (
              <img
                src={mediaPreview?.url}
                alt={mediaPreview?.title ?? "预览图"}
                className="mx-auto max-h-[74vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
