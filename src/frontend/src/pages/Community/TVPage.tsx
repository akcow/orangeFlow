import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getURL } from "@/controllers/API/helpers/constants";
import { api } from "@/controllers/API/api";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAddFlow from "@/hooks/flows/use-add-flow";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import type { CommunityItem } from "@/types/community";
import { getCommunityImageUrl, getCommunityPreviewUrl, isLikelyImagePath } from "@/utils/communityFiles";
import { cn } from "@/utils/utils";

type Scope = "public" | "mine";
type TopTab = "works" | "events";

export default function TVPage() {
  const navigate = useCustomNavigate();
  const addFlow = useAddFlow();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [scope, setScope] = useState<Scope>("public");
  const [topTab, setTopTab] = useState<TopTab>("works");
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CommunityItem | null>(null);

  const listPublic = useQuery({
    queryKey: ["community", "tv", "public"],
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(`${getURL("COMMUNITY")}/items/public`, {
        params: { type: "TV" },
      });
      return r.data ?? [];
    },
  });

  const listMine = useQuery({
    queryKey: ["community", "tv", "mine"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(`${getURL("COMMUNITY")}/items/mine`, {
        params: { type: "TV" },
      });
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

  const loading = listPublic.isLoading || (scope === "mine" && listMine.isLoading);

  const cloneToWorkspace = async (flowId: string) => {
    try {
      const r = await api.get<any>(getURL("PUBLIC_FLOW", { flowId }));
      const flow = r.data;
      const newId = await addFlow({ flow });
      if (typeof newId === "string" && newId) {
        setSuccessData({ title: "已克隆到工作空间" });
        navigate(`/flow/${newId}/`);
      }
    } catch (e: any) {
      setErrorData({ title: "克隆失败", list: [e?.message ?? "未知错误"] });
    }
  };

  const categories = useMemo(
    () => ["全部", "精选画布", "电视广告", "动画", "叙事短片", "MV", "创意", "教程", "其他"],
    [],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="px-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <button
              type="button"
              className={cn(
                "pb-2 text-base font-semibold",
                topTab === "works" ? "border-b-2 border-foreground" : "text-muted-foreground",
              )}
              onClick={() => setTopTab("works")}
            >
              作品
            </button>
            <button
              type="button"
              className={cn(
                "pb-2 text-base font-semibold",
                topTab === "events" ? "border-b-2 border-foreground" : "text-muted-foreground",
              )}
              onClick={() => setTopTab("events")}
            >
              活动
            </button>
          </div>

          <div className="flex items-center gap-2">
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
            <Input
              icon="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 TapTV..."
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
                className={cn("h-8 rounded-full", !active && "text-muted-foreground")}
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-8 pt-6">
        {topTab === "events" ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            暂未开放
          </div>
        ) : loading ? (
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
              const coverUrl = item.cover_path ? getCommunityImageUrl(item.cover_path) : null;
              const canClone = isAuthenticated && item.public_canvas && item.status === "PUBLIC";
              return (
                <div key={item.id} className="group">
                  <div className="overflow-hidden rounded-2xl border bg-muted/10">
                    <div className="relative aspect-video w-full bg-muted/20">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                          无封面
                        </div>
                      )}

                      <div className="pointer-events-none absolute inset-0 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100" />

                      <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          className="rounded-full"
                          onClick={() => setSelected(item)}
                        >
                          查看创作过程
                          <IconComponent name="ArrowUpRight" className="ml-1 h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className={cn("rounded-full", !canClone && "opacity-60")}
                          disabled={!canClone}
                          onClick={() => cloneToWorkspace(item.flow_id)}
                          title={
                            !isAuthenticated
                              ? "请先登录"
                              : !item.public_canvas
                                ? "作者未公开画布"
                                : item.status !== "PUBLIC"
                                  ? "未公开"
                                  : "克隆到工作空间"
                          }
                        >
                          克隆
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">@{item.user_name ?? "匿名"}</div>
                    <div className="mt-1 truncate font-medium">{item.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? "预览"}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="flex flex-col gap-3">
              {selected.description && (
                <div className="text-sm text-muted-foreground">{selected.description}</div>
              )}
              {selected.media_path ? (
                isLikelyImagePath(selected.media_path) ? (
                  <img
                    className="w-full overflow-hidden rounded-lg bg-black object-contain"
                    src={getCommunityPreviewUrl(selected.media_path) ?? undefined}
                    alt={selected.title}
                  />
                ) : (
                  <video
                    controls
                    className="w-full overflow-hidden rounded-lg bg-black"
                    src={getCommunityPreviewUrl(selected.media_path) ?? undefined}
                  />
                )
              ) : (
                <div className="text-sm text-muted-foreground">无作品文件</div>
              )}
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  disabled={!isAuthenticated || !selected.public_canvas || selected.status !== "PUBLIC"}
                  onClick={() => cloneToWorkspace(selected.flow_id)}
                >
                  克隆到工作空间
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
