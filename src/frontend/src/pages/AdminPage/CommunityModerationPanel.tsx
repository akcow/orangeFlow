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
type ReviewListResponse = { total_count: number; items: CommunityItem[] };

const TEXT = {
  unknown: "未知错误",
  unreviewed: "待审核",
  public: "已公开",
  private: "未公开",
  workflow: "工作流",
  approve: "通过",
  reject: "驳回",
  hide: "下架",
  none: "无",
  anonymous: "匿名",
  noDescription: "暂无描述",
  noNote: "无备注",
  noCover: "无封面",
  noPreview: "无作品预览",
  noFlowData: "无可用流程数据",
  preview: "预览",
  previewImage: "预览图",
};

function labelStatus(status: CommunityItemStatus) {
  return status === "UNREVIEWED"
    ? TEXT.unreviewed
    : status === "PUBLIC"
      ? TEXT.public
      : TEXT.private;
}

function labelType(type: CommunityItemType) {
  return type === "WORKFLOW" ? TEXT.workflow : "TV";
}

function labelAction(action?: "APPROVE" | "REJECT" | "HIDE" | null) {
  return action === "APPROVE"
    ? TEXT.approve
    : action === "REJECT"
      ? TEXT.reject
      : action === "HIDE"
        ? TEXT.hide
        : TEXT.none;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("zh-CN", { hour12: false });
}

function errText(error: unknown) {
  const err = error as { response?: { data?: { detail?: string } }; message?: string };
  return err?.response?.data?.detail ?? err?.message ?? TEXT.unknown;
}

export default function CommunityModerationPanel() {
  const queryClient = useQueryClient();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
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
  const [batchRejectOpen, setBatchRejectOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [singleActionLoading, setSingleActionLoading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<null | {
    url: string;
    kind: "image" | "video";
    title: string;
  }>(null);

  useEffect(() => {
    setPageIndex(1);
  }, [status, type, q, submitter, createdFrom, createdTo]);

  const offset = useMemo(() => size * (index - 1), [index, size]);

  const listQuery = useQuery({
    queryKey: [
      "community",
      "review",
      { status, type, q, submitter, createdFrom, createdTo, size, index },
    ],
    queryFn: async () =>
      (
        await api.get<ReviewListResponse>(`${getURL("COMMUNITY")}/items/review`, {
          params: {
            status: status === "ALL" ? undefined : status,
            type: type === "ALL" ? undefined : type,
            q: q.trim() || undefined,
            submitter: submitter.trim() || undefined,
            created_from: createdFrom ? `${createdFrom}T00:00:00Z` : undefined,
            created_to: createdTo ? `${createdTo}T23:59:59Z` : undefined,
            limit: size,
            offset,
          },
        })
      ).data,
  });

  const detailQuery = useQuery({
    queryKey: ["community", "review", "detail", detailItemId],
    enabled: detailOpen && !!detailItemId,
    queryFn: async () =>
      (
        await api.get<CommunityReviewDetail>(
          `${getURL("COMMUNITY")}/items/${detailItemId}/review-detail`,
        )
      ).data,
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total_count ?? 0;

  useEffect(() => {
    const currentIds = new Set(items.map((item) => item.id));
    setSelectedIds((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([id, checked]) => checked && currentIds.has(id)),
      ),
    );
  }, [items]);

  const checkedIds = useMemo(
    () => items.filter((item) => selectedIds[item.id]).map((item) => item.id),
    [items, selectedIds],
  );
  const checkedCount = checkedIds.length;
  const allChecked = items.length > 0 && checkedCount === items.length;
  const detailItem = detailQuery.data?.item;
  const detailLogs = detailQuery.data?.logs ?? [];
  const detailFlow = detailQuery.data?.flow;
  const coverUrl = detailItem?.cover_path ? getCommunityImageUrl(detailItem.cover_path) : null;
  const mediaUrl = detailItem?.media_path ? getCommunityPreviewUrl(detailItem.media_path) : null;
  const mediaIsImage = detailItem?.media_path ? isLikelyImagePath(detailItem.media_path) : false;

  async function refreshQueues() {
    await queryClient.invalidateQueries({ queryKey: ["community", "review"] });
    await queryClient.invalidateQueries({ queryKey: ["community", "tv", "public"] });
    await queryClient.invalidateQueries({ queryKey: ["community", "tv", "mine"] });
    await queryClient.invalidateQueries({ queryKey: ["community", "workflows", "public"] });
  }

  async function submitSingleAction(action: "APPROVE" | "REJECT" | "HIDE") {
    if (!detailItemId) return;

    if (action === "REJECT" && !decisionComment.trim()) {
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
      await api.post(endpoint, { comment: decisionComment.trim() || undefined });
      setSuccessData({
        title:
          action === "APPROVE"
            ? "审核通过，已公开"
            : action === "REJECT"
              ? "已驳回并设为未公开"
              : "已下架并设为未公开",
      });
      setDecisionComment("");
      await refreshQueues();
      await detailQuery.refetch();
    } catch (error) {
      setErrorData({ title: "审核操作失败", list: [errText(error)] });
    } finally {
      setSingleActionLoading(false);
    }
  }

  async function submitBatchAction(action: "APPROVE" | "REJECT") {
    if (checkedIds.length === 0) {
      setErrorData({
        title: "请先选择投稿",
        list: ["至少选择 1 条投稿后再执行批量操作。"],
      });
      return false;
    }

    if (action === "REJECT" && !batchComment.trim()) {
      setErrorData({
        title: "请填写批量驳回原因",
        list: ["批量驳回时必须填写原因，投稿人将可见。"],
      });
      return false;
    }

    setBatchLoading(true);
    try {
      const result = (
        await api.post<CommunityBatchReviewResult>(
          `${getURL("COMMUNITY")}/items/review/batch`,
          { item_ids: checkedIds, action, comment: batchComment.trim() || undefined },
        )
      ).data;

      setSuccessData({
        title:
          action === "APPROVE"
            ? `批量通过完成：${result.processed_count}/${result.total_requested}`
            : `批量驳回完成：${result.processed_count}/${result.total_requested}`,
      });

      if ((result.missing_item_ids?.length ?? 0) > 0) {
        setErrorData({
          title: "部分投稿未处理",
          list: [`${result.missing_item_ids.length} 条未找到，可能已被删除。`],
        });
      }

      setSelectedIds({});
      setBatchComment("");
      await refreshQueues();
      return true;
    } catch (error) {
      setErrorData({ title: "批量审核失败", list: [errText(error)] });
      return false;
    } finally {
      setBatchLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 pb-2">
      <div className="rounded-2xl border border-border/60 bg-background/95 p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={status} onValueChange={(value) => setStatus(value as ReviewStatusFilter)}>
              <SelectTrigger className="h-10 w-[150px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNREVIEWED">{TEXT.unreviewed}</SelectItem>
                <SelectItem value="PUBLIC">{TEXT.public}</SelectItem>
                <SelectItem value="PRIVATE">{TEXT.private}</SelectItem>
                <SelectItem value="ALL">全部状态</SelectItem>
              </SelectContent>
            </Select>

            <Select value={type} onValueChange={(value) => setType(value as ReviewTypeFilter)}>
              <SelectTrigger className="h-10 w-[150px]">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部类型</SelectItem>
                <SelectItem value="TV">TV</SelectItem>
                <SelectItem value="WORKFLOW">{TEXT.workflow}</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索标题或描述"
              className="w-full min-w-[220px] flex-1 lg:max-w-[320px]"
            />
            <Input
              value={submitter}
              onChange={(event) => setSubmitter(event.target.value)}
              placeholder="搜索投稿人"
              className="w-full min-w-[200px] lg:max-w-[220px]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <input
                type="date"
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
                className="primary-input h-9 w-[150px]"
              />
              <span className="text-sm text-muted-foreground">至</span>
              <input
                type="date"
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
                className="primary-input h-9 w-[150px]"
              />
            </div>

            <Button variant="ghost" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
              <IconComponent
                name="RefreshCcw"
                className={cn("mr-2 h-4 w-4", listQuery.isFetching && "animate-spin")}
              />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/95 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              已选择 {checkedCount} 条投稿
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              支持批量通过和批量驳回。驳回原因会展示给投稿人。
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => setBatchRejectOpen(true)}
            >
              批量驳回
            </Button>
          </div>
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-border/60 bg-background/95 text-muted-foreground shadow-sm">
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/80 px-6 text-center shadow-sm">
          <div className="rounded-full border border-border/60 bg-muted/40 p-3">
            <IconComponent name="Inbox" className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-4 text-base font-medium text-foreground">当前筛选条件下没有投稿</div>
          <div className="mt-1 text-sm text-muted-foreground">
            可以切换状态、类型或时间范围后再试。
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-[320px] overflow-auto rounded-2xl border border-border/60 bg-background/95 shadow-sm custom-scroll">
            <Table className="table-fixed">
              <TableHeader className="table-fixed bg-muted/50">
                <TableRow>
                  <TableHead className="h-11 w-[44px]">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(checked) => {
                        const next: Record<string, boolean> = {};
                        if (checked) {
                          items.forEach((item) => {
                            next[item.id] = true;
                          });
                        }
                        setSelectedIds(next);
                      }}
                    />
                  </TableHead>
                  <TableHead className="h-11 w-[90px]">类型</TableHead>
                  <TableHead className="h-11 w-[100px]">状态</TableHead>
                  <TableHead className="h-11">标题</TableHead>
                  <TableHead className="h-11 w-[160px]">投稿人</TableHead>
                  <TableHead className="h-11 w-[180px]">投稿时间</TableHead>
                  <TableHead className="h-11 w-[200px]">最近审核</TableHead>
                  <TableHead className="h-11 w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="py-3">
                      <Checkbox
                        checked={!!selectedIds[item.id]}
                        onCheckedChange={(checked) =>
                          setSelectedIds((prev) => ({ ...prev, [item.id]: !!checked }))
                        }
                      />
                    </TableCell>
                    <TableCell className="truncate py-3">{labelType(item.type)}</TableCell>
                    <TableCell className="truncate py-3">{labelStatus(item.status)}</TableCell>
                    <TableCell className="truncate py-3 font-medium" title={item.title}>
                      {item.title}
                    </TableCell>
                    <TableCell className="truncate py-3">@{item.user_name ?? TEXT.anonymous}</TableCell>
                    <TableCell className="truncate py-3">{fmtDate(item.created_at)}</TableCell>
                    <TableCell className="truncate py-3 text-xs text-muted-foreground">
                      {item.last_review_action
                        ? `${labelAction(item.last_review_action)} / ${fmtDate(item.last_reviewed_at)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDetailItemId(item.id);
                          setDecisionComment("");
                          setDetailOpen(true);
                        }}
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
            paginate={(pageIndex, pageSize) => {
              setPageIndex(pageIndex);
              setPageSize(pageSize);
            }}
            rowsCount={PAGINATION_ROWS_COUNT}
          />
        </>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[1120px]">
          <DialogHeader>
            <DialogTitle>投稿审核详情</DialogTitle>
            <DialogDescription>
              查看封面、作品预览、流程快照和历史审核记录，并在右侧执行审核动作。
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
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
                <div className="rounded-2xl border border-border/60 bg-background/95 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-foreground">{detailItem.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        @{detailItem.user_name ?? TEXT.anonymous}
                      </div>
                    </div>
                    <div className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                      {labelType(detailItem.type)} / {labelStatus(detailItem.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>投稿时间：{fmtDate(detailItem.created_at)}</div>
                    <div>更新时间：{fmtDate(detailItem.updated_at)}</div>
                    <div>流程 ID：{detailItem.flow_id}</div>
                    <div>访问状态：{detailFlow?.access_type ?? "-"}</div>
                  </div>

                  <div className="mt-4 whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-foreground">
                    {detailItem.description?.trim() ? detailItem.description : TEXT.noDescription}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/95 p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">封面</div>
                    <div className="aspect-video overflow-hidden rounded-xl bg-muted/20">
                      {coverUrl ? (
                        <button
                          type="button"
                          className="group relative h-full w-full cursor-zoom-in"
                          onClick={() =>
                            setMediaPreview({
                              url: coverUrl,
                              kind: "image",
                              title: `${detailItem.title} - 封面`,
                            })
                          }
                          title="点击放大查看"
                        >
                          <img src={coverUrl} alt={detailItem.title} className="h-full w-full object-cover" />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                            点击放大查看
                          </div>
                        </button>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          {TEXT.noCover}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/95 p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">作品预览</div>
                    <div className="aspect-video overflow-hidden rounded-xl bg-muted/20">
                      {!mediaUrl ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          {TEXT.noPreview}
                        </div>
                      ) : mediaIsImage ? (
                        <button
                          type="button"
                          className="group relative h-full w-full cursor-zoom-in"
                          onClick={() =>
                            setMediaPreview({
                              url: mediaUrl,
                              kind: "image",
                              title: `${detailItem.title} - 作品预览`,
                            })
                          }
                          title="点击放大查看"
                        >
                          <img src={mediaUrl} alt={detailItem.title} className="h-full w-full object-cover" />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                            点击放大查看
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="group relative h-full w-full cursor-zoom-in"
                          onClick={() =>
                            setMediaPreview({
                              url: mediaUrl,
                              kind: "video",
                              title: `${detailItem.title} - 作品预览`,
                            })
                          }
                          title="点击放大查看"
                        >
                          <video src={mediaUrl} controls={false} muted playsInline className="h-full w-full object-cover" />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-xs text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                            点击放大查看
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/95 p-4">
                  <div className="mb-3 text-sm font-medium text-foreground">工作流快照</div>
                  {detailFlow?.data ? (
                    <pre className="max-h-[280px] overflow-auto rounded-xl bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                      {JSON.stringify(detailFlow.data, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-sm text-muted-foreground">{TEXT.noFlowData}</div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-background/95 p-4">
                  <div className="mb-3 text-sm font-semibold text-foreground">审核动作</div>
                  <Textarea
                    value={decisionComment}
                    onChange={(event) => setDecisionComment(event.target.value)}
                    placeholder="审核备注；驳回时必填，投稿人可见。"
                    className="min-h-[120px]"
                  />
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    <Button
                      variant="primary"
                      disabled={singleActionLoading || detailItem.status === "PUBLIC"}
                      onClick={() => submitSingleAction("APPROVE")}
                    >
                      通过并公开
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={singleActionLoading}
                      onClick={() => submitSingleAction("REJECT")}
                    >
                      驳回并保持未公开
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={singleActionLoading || detailItem.status === "PRIVATE"}
                      onClick={() => submitSingleAction("HIDE")}
                    >
                      下架为未公开
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/95 p-4">
                  <div className="mb-3 text-sm font-semibold text-foreground">审核日志</div>
                  {detailLogs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无审核记录</div>
                  ) : (
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {detailLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
                          <div className="font-medium text-foreground">
                            {labelAction(log.action)} / {labelStatus(log.from_status)} {"->"}{" "}
                            {labelStatus(log.to_status)}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            审核人：{log.reviewer_name ?? log.reviewer_id}
                          </div>
                          <div className="text-muted-foreground">{fmtDate(log.created_at)}</div>
                          <div className="mt-2 whitespace-pre-wrap text-foreground">
                            {log.comment?.trim() ? log.comment : TEXT.noNote}
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
              已选择 {checkedCount} 条投稿，请填写驳回原因，投稿人会看到这段备注。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={batchComment}
            onChange={(event) => setBatchComment(event.target.value)}
            placeholder="请输入批量驳回原因"
            className="min-h-[120px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBatchRejectOpen(false)} disabled={batchLoading}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={batchLoading}
              onClick={async () => {
                const ok = await submitBatchAction("REJECT");
                if (ok) setBatchRejectOpen(false);
              }}
            >
              确认批量驳回
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!mediaPreview} onOpenChange={(open) => { if (!open) setMediaPreview(null); }}>
        <DialogContent className="max-h-[90vh] max-w-[92vw]">
          <DialogHeader>
            <DialogTitle>{mediaPreview?.title ?? TEXT.preview}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[78vh] overflow-auto rounded-xl bg-black/90 p-2">
            {mediaPreview?.kind === "video" ? (
              <video src={mediaPreview.url} controls autoPlay className="mx-auto max-h-[74vh] w-auto max-w-full" />
            ) : (
              <img
                src={mediaPreview?.url}
                alt={mediaPreview?.title ?? TEXT.previewImage}
                className="mx-auto max-h-[74vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
