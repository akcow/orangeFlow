import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAddFlow from "@/hooks/flows/use-add-flow";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import type { CommunityItem } from "@/types/community";
import type { FlowType } from "@/types/flow";
import { getCommunityImageUrl } from "@/utils/communityFiles";
import { cn } from "@/utils/utils";

type Scope = "public" | "mine";

function moderationStatusLabel(status: CommunityItem["status"]) {
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

function getApiErrorMessage(error: unknown) {
  const err = error as { message?: string };
  return err?.message ?? "未知错误";
}

export default function WorkflowsPage() {
  const navigate = useCustomNavigate();
  const addFlow = useAddFlow();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [scope, setScope] = useState<Scope>("public");
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");

  const listPublic = useQuery({
    queryKey: ["community", "workflows", "public"],
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(
        `${getURL("COMMUNITY")}/items/public`,
        {
          params: { type: "WORKFLOW" },
        },
      );
      return r.data ?? [];
    },
  });

  const listMine = useQuery({
    queryKey: ["community", "workflows", "mine"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(
        `${getURL("COMMUNITY")}/items/mine`,
        {
          params: { type: "WORKFLOW" },
        },
      );
      return r.data ?? [];
    },
  });

  const items = useMemo(() => {
    if (scope === "mine" && isAuthenticated) return listMine.data ?? [];
    return listPublic.data ?? [];
  }, [isAuthenticated, listMine.data, listPublic.data, scope]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.title} ${item.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const loading =
    listPublic.isLoading || (scope === "mine" && listMine.isLoading);

  const cloneToWorkspace = async (flowId: string) => {
    try {
      const r = await api.get<Record<string, unknown>>(
        getURL("PUBLIC_FLOW", { flowId }),
      );
      const flow = r.data as FlowType;
      const newId = await addFlow({ flow });
      if (typeof newId === "string" && newId) {
        setSuccessData({ title: "已克隆到工作空间" });
        navigate(`/flow/${newId}/`);
      }
    } catch (e: unknown) {
      setErrorData({ title: "克隆失败", list: [getApiErrorMessage(e)] });
    }
  };

  const categories = useMemo(
    () => [
      "全部",
      "广告",
      "电商",
      "影视",
      "生活",
      "工具",
      "有趣",
      "ACG",
      "其他",
    ],
    [],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="px-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-semibold">工作流</div>
            <Button
              variant={scope === "public" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScope("public")}
            >
              全部
            </Button>
            {isAuthenticated && (
              <Button
                variant={scope === "mine" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setScope("mine")}
              >
                我的
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              icon="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工作流..."
              className="w-[340px]"
              inputClassName="w-full"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {categories.map((c) => {
            const active = c === category;
            return (
              <Button
                key={c}
                type="button"
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 rounded-full",
                  !active && "text-muted-foreground",
                )}
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-8 pt-6">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            暂无内容
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((item) => {
              const coverUrl = item.cover_path
                ? getCommunityImageUrl(item.cover_path)
                : null;
              const canClone = isAuthenticated && item.status === "PUBLIC";
              return (
                <div key={item.id} className="group">
                  <div className="overflow-hidden rounded-2xl border bg-muted/10">
                    <div className="relative aspect-[4/3] w-full bg-muted/20">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                          <IconComponent
                            name="Workflow"
                            className="mr-2 h-4 w-4"
                          />
                          无封面
                        </div>
                      )}

                      <div className="pointer-events-none absolute inset-0 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          className={cn(
                            "rounded-full",
                            !canClone && "opacity-60",
                          )}
                          disabled={!canClone}
                          onClick={() => cloneToWorkspace(item.flow_id)}
                          title={
                            !isAuthenticated
                              ? "请先登录"
                              : item.status !== "PUBLIC"
                                ? "未公开"
                                : "克隆到工作空间"
                          }
                        >
                          克隆
                          <IconComponent
                            name="ArrowUpRight"
                            className="ml-1 h-4 w-4"
                          />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      @{item.user_name ?? "匿名"}
                    </div>
                    {scope === "mine" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        状态：{moderationStatusLabel(item.status)}
                      </div>
                    )}
                    {scope === "mine" && item.last_review_comment?.trim() && (
                      <div className="mt-1 line-clamp-2 text-xs text-amber-600 dark:text-amber-400">
                        审核意见：{item.last_review_comment}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
