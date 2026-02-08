import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import IconComponent from "@/components/common/genericIconComponent";
import PaginatorComponent from "@/components/common/paginatorComponent";
import { Button } from "@/components/ui/button";
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
import { PAGINATION_PAGE, PAGINATION_ROWS_COUNT, PAGINATION_SIZE } from "@/constants/constants";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import ConfirmationModal from "@/modals/confirmationModal";
import useAlertStore from "@/stores/alertStore";
import type { CommunityItem, CommunityItemStatus, CommunityItemType } from "@/types/community";
import { cn } from "@/utils/utils";

type ReviewTypeFilter = "ALL" | CommunityItemType;
type ReviewStatusFilter = CommunityItemStatus;

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

export default function CommunityModerationPanel() {
  const queryClient = useQueryClient();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);

  const [status, setStatus] = useState<ReviewStatusFilter>("UNREVIEWED");
  const [type, setType] = useState<ReviewTypeFilter>("ALL");
  const [q, setQ] = useState("");

  const [size, setPageSize] = useState(PAGINATION_SIZE);
  const [index, setPageIndex] = useState(PAGINATION_PAGE);

  // Reset paging when filters change.
  useEffect(() => {
    setPageIndex(1);
  }, [status, type, q]);

  const offset = useMemo(() => size * (index - 1), [index, size]);

  const reviewList = useQuery({
    queryKey: ["community", "review", { status, type, q, size, index }],
    queryFn: async () => {
      const r = await api.get<ReviewListResponse>(`${getURL("COMMUNITY")}/items/review`, {
        params: {
          status,
          type: type === "ALL" ? undefined : type,
          q: q.trim() || undefined,
          limit: size,
          offset,
        },
      });
      return r.data;
    },
  });

  const total = reviewList.data?.total_count ?? 0;
  const items = reviewList.data?.items ?? [];

  const paginate = (pageIndex: number, pageSize: number) => {
    setPageIndex(pageIndex);
    setPageSize(pageSize);
  };

  const approve = async (itemId: string) => {
    try {
      await api.post(`${getURL("COMMUNITY")}/items/${itemId}/approve`);
      setSuccessData({ title: "审核通过，已公开" });
      await queryClient.invalidateQueries({ queryKey: ["community", "review"] });
      await queryClient.invalidateQueries({ queryKey: ["community", "tv", "public"] });
      await queryClient.invalidateQueries({ queryKey: ["community", "workflows", "public"] });
    } catch (e: any) {
      setErrorData({ title: "审核失败", list: [e?.message ?? "未知错误"] });
    }
  };

  const hide = async (itemId: string) => {
    try {
      await api.post(`${getURL("COMMUNITY")}/items/${itemId}/hide`);
      setSuccessData({ title: "已设为未公开" });
      await queryClient.invalidateQueries({ queryKey: ["community", "review"] });
      await queryClient.invalidateQueries({ queryKey: ["community", "tv", "public"] });
      await queryClient.invalidateQueries({ queryKey: ["community", "workflows", "public"] });
    } catch (e: any) {
      setErrorData({ title: "操作失败", list: [e?.message ?? "未知错误"] });
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4 px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as ReviewStatusFilter)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNREVIEWED">待审核</SelectItem>
              <SelectItem value="PUBLIC">已公开</SelectItem>
              <SelectItem value="PRIVATE">未公开</SelectItem>
            </SelectContent>
          </Select>

          <Select value={type} onValueChange={(v) => setType(v as ReviewTypeFilter)}>
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
            placeholder="搜索标题/描述..."
            className="w-[320px]"
          />
        </div>

        <Button
          variant="ghost"
          onClick={() => reviewList.refetch()}
          disabled={reviewList.isFetching}
          title="刷新"
        >
          <IconComponent name="RefreshCcw" className={cn("mr-2 h-4 w-4", reviewList.isFetching && "animate-spin")} />
          刷新
        </Button>
      </div>

      {reviewList.isLoading ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">加载中...</div>
      ) : items.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">暂无内容</div>
      ) : (
        <>
          <div className="h-fit overflow-x-hidden overflow-y-scroll rounded-md border-2 bg-background custom-scroll">
            <Table className={"table-fixed outline-1"}>
              <TableHeader className={"table-fixed bg-muted outline-1"}>
                <TableRow>
                  <TableHead className="h-10 w-[120px]">类型</TableHead>
                  <TableHead className="h-10 w-[120px]">状态</TableHead>
                  <TableHead className="h-10">标题</TableHead>
                  <TableHead className="h-10 w-[180px]">投稿人</TableHead>
                  <TableHead className="h-10 w-[140px]">投稿时间</TableHead>
                  <TableHead className="h-10 w-[180px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const canApprove = item.status !== "PUBLIC";
                  const canHide = item.status !== "PRIVATE";
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="truncate py-2">{typeLabel(item.type)}</TableCell>
                      <TableCell className="truncate py-2">{statusLabel(item.status)}</TableCell>
                      <TableCell className="truncate py-2 font-medium" title={item.title}>
                        {item.title}
                      </TableCell>
                      <TableCell className="truncate py-2">@{item.user_name ?? "匿名"}</TableCell>
                      <TableCell className="truncate py-2">
                        {new Date(item.created_at).toISOString().split("T")[0]}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <ConfirmationModal
                            size="x-small"
                            title="审核通过"
                            titleHeader="将投稿设为公开"
                            modalContentTitle="确认操作"
                            cancelText="取消"
                            confirmationText="通过并公开"
                            icon="Check"
                            onConfirm={() => approve(item.id)}
                            destructive={false}
                          >
                            <ConfirmationModal.Content>
                              <span>通过后会出现在 TV/工作流公开区。</span>
                            </ConfirmationModal.Content>
                            <ConfirmationModal.Trigger>
                              <Button size="sm" variant="primary" disabled={!canApprove}>
                                通过
                              </Button>
                            </ConfirmationModal.Trigger>
                          </ConfirmationModal>

                          <ConfirmationModal
                            size="x-small"
                            title={item.status === "UNREVIEWED" ? "拒绝/隐藏" : "下架"}
                            titleHeader="将投稿设为未公开"
                            modalContentTitle="确认操作"
                            cancelText="取消"
                            confirmationText="设为未公开"
                            icon="EyeOff"
                            onConfirm={() => hide(item.id)}
                            destructive
                          >
                            <ConfirmationModal.Content>
                              <span>该投稿将不再出现在公开区。</span>
                            </ConfirmationModal.Content>
                            <ConfirmationModal.Trigger>
                              <Button size="sm" variant="destructive" disabled={!canHide}>
                                设为未公开
                              </Button>
                            </ConfirmationModal.Trigger>
                          </ConfirmationModal>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
    </div>
  );
}

