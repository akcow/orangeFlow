import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getURL } from "@/controllers/API/helpers/constants";
import { api } from "@/controllers/API/api";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAddFlow from "@/hooks/flows/use-add-flow";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import type { CommunityItem } from "@/types/community";
import {
  getCommunityImageUrl,
  getCommunityPreviewUrl,
  isLikelyImagePath,
} from "@/utils/communityFiles";
import { cn } from "@/utils/utils";

type Scope = "public" | "mine";
type TopTab = "works" | "events";
type PublicSortOption = "FEATURED_EDITABLE" | "POPULAR" | "LATEST";

function getFlowViewPath(flowId: string): string {
  if (typeof window === "undefined")
    return `/flow-view/${encodeURIComponent(flowId)}/`;
  const path = window.location.pathname;
  const communityIndex = path.indexOf("/community");
  const prefix = communityIndex >= 0 ? path.slice(0, communityIndex) : "";
  return `${prefix}/flow-view/${encodeURIComponent(flowId)}/`;
}

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

function formatCount(value?: number): string {
  const parsed = Number(value ?? 0);
  const n = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

export default function TVPage() {
  const navigate = useCustomNavigate();
  const addFlow = useAddFlow();
  const queryClient = useQueryClient();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [scope, setScope] = useState<Scope>("public");
  const [topTab, setTopTab] = useState<TopTab>("works");
  const [category, setCategory] = useState("为你推荐");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<CommunityItem | null>(null);
  const [watching, setWatching] = useState(false);
  const [processItem, setProcessItem] = useState<CommunityItem | null>(null);
  const [hoverPlayingId, setHoverPlayingId] = useState<string | null>(null);
  const [detailVideoReady, setDetailVideoReady] = useState(false);
  const [publicSort, setPublicSort] =
    useState<PublicSortOption>("FEATURED_EDITABLE");
  const [takeDownPendingId, setTakeDownPendingId] = useState<string | null>(null);
  const [likePendingId, setLikePendingId] = useState<string | null>(null);
  const [likedItemIds, setLikedItemIds] = useState<Record<string, boolean>>({});

  const cardVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const detailVideoRef = useRef<HTMLVideoElement | null>(null);
  const watchVideoRef = useRef<HTMLVideoElement | null>(null);
  const detailRailRef = useRef<HTMLDivElement | null>(null);
  const detailCardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const categoryFilter = useMemo(() => {
    if (category === "为你推荐" || category === "全部" || category === "精选画布") {
      return undefined;
    }
    return category;
  }, [category]);

  const listPublic = useQuery({
    queryKey: ["community", "tv", "public", categoryFilter],
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(
        `${getURL("COMMUNITY")}/items/public`,
        {
          params: {
            type: "TV",
            ...(categoryFilter ? { category: categoryFilter } : {}),
          },
        },
      );
      return r.data ?? [];
    },
  });

  const listMine = useQuery({
    queryKey: ["community", "tv", "mine", categoryFilter],
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(
        `${getURL("COMMUNITY")}/items/mine`,
        {
          params: {
            type: "TV",
            ...(categoryFilter ? { category: categoryFilter } : {}),
          },
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
    const searched = !q
      ? items
      : items.filter((item) => {
          const hay = `${item.title} ${item.description ?? ""}`.toLowerCase();
          return hay.includes(q);
        });

    let base = searched;
    if (category === "精选画布") {
      base = base.filter((item) => item.public_canvas);
    }

    if (scope !== "public") return base;

    if (category === "为你推荐") {
      return [...base].sort((a, b) => {
        const scoreA = (a.like_count ?? 0) * 2 + (a.view_count ?? 0);
        const scoreB = (b.like_count ?? 0) * 2 + (b.view_count ?? 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }

    if (publicSort === "FEATURED_EDITABLE") {
      return base.filter((item) => item.public_canvas);
    }

    if (publicSort === "POPULAR") {
      return [...base].sort((a, b) => {
        const likeDiff = (b.like_count ?? 0) - (a.like_count ?? 0);
        if (likeDiff !== 0) return likeDiff;
        const viewDiff = (b.view_count ?? 0) - (a.view_count ?? 0);
        if (viewDiff !== 0) return viewDiff;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    }

    return [...base].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [category, items, publicSort, scope, search]);

  const loading =
    listPublic.isLoading || (scope === "mine" && listMine.isLoading);

  useEffect(() => {
    if (!isAuthenticated) {
      setLikedItemIds({});
      return;
    }
    const itemIds = (listPublic.data ?? []).map((item) => item.id);
    if (!itemIds.length) {
      setLikedItemIds({});
      return;
    }

    let cancelled = false;
    void api
      .post<{ liked_item_ids?: string[] }>(
        `${getURL("COMMUNITY")}/items/likes/status`,
        { item_ids: itemIds },
      )
      .then((response) => {
        if (cancelled) return;
        const nextLiked: Record<string, boolean> = {};
        for (const itemId of response.data?.liked_item_ids ?? []) {
          nextLiked[itemId] = true;
        }
        setLikedItemIds(nextLiked);
      })
      .catch(() => {
        // ignore like-status failures
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, listPublic.data]);

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

  const hidePublicItem = async (item: CommunityItem) => {
    if (takeDownPendingId) return;
    setTakeDownPendingId(item.id);
    try {
      await api.post(`${getURL("COMMUNITY")}/items/${item.id}/hide`);
      setSuccessData({ title: "已下架该作品" });
      if (selected?.id === item.id) {
        setWatching(false);
        setSelected(null);
      }
      await Promise.all([listMine.refetch(), listPublic.refetch()]);
    } catch (e: any) {
      setErrorData({
        title: "下架失败",
        list: [e?.message ?? "未知错误"],
      });
    } finally {
      setTakeDownPendingId(null);
    }
  };

  const recordPlay = async (item: CommunityItem) => {
    if (item.status !== "PUBLIC") return;
    try {
      const r = await api.post<{
        id: string;
        view_count: number;
        like_count: number;
      }>(`${getURL("COMMUNITY")}/items/${item.id}/view`);
      const metrics = r.data;
      queryClient.setQueriesData<CommunityItem[]>(
        { queryKey: ["community", "tv", "public"] },
        (prev) =>
          (prev ?? []).map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  view_count: metrics.view_count,
                  like_count: metrics.like_count,
                }
              : it,
          ),
      );
      queryClient.setQueriesData<CommunityItem[]>(
        { queryKey: ["community", "tv", "mine"] },
        (prev) =>
          (prev ?? []).map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  view_count: metrics.view_count,
                  like_count: metrics.like_count,
                }
              : it,
          ),
      );
      if (selected?.id === item.id) {
        setSelected({
          ...selected,
          view_count: metrics.view_count,
          like_count: metrics.like_count,
        });
      }
    } catch {
      // ignore metrics failures to avoid interrupting playback
    }
  };

  const likePublicItem = async (item: CommunityItem) => {
    if (!isAuthenticated || likePendingId) return;
    setLikePendingId(item.id);
    try {
      const r = await api.post<{
        id: string;
        view_count: number;
        like_count: number;
        liked: boolean | null;
      }>(`${getURL("COMMUNITY")}/items/${item.id}/like`);
      const metrics = r.data;
      setLikedItemIds((prev) => ({ ...prev, [item.id]: !!metrics.liked }));
      queryClient.setQueriesData<CommunityItem[]>(
        { queryKey: ["community", "tv", "public"] },
        (prev) =>
          (prev ?? []).map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  view_count: metrics.view_count,
                  like_count: metrics.like_count,
                }
              : it,
          ),
      );
      queryClient.setQueriesData<CommunityItem[]>(
        { queryKey: ["community", "tv", "mine"] },
        (prev) =>
          (prev ?? []).map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  view_count: metrics.view_count,
                  like_count: metrics.like_count,
                }
              : it,
          ),
      );
      if (selected?.id === item.id) {
        setSelected({
          ...selected,
          view_count: metrics.view_count,
          like_count: metrics.like_count,
        });
      }
    } catch (e: any) {
      setErrorData({ title: "点赞失败", list: [e?.message ?? "未知错误"] });
    } finally {
      setLikePendingId(null);
    }
  };

  const categories = useMemo(
    () => [
      "为你推荐",
      "全部",
      "精选画布",
      "电视广告",
      "动画",
      "叙事短片",
      "MV",
      "创意",
      "教程",
      "其他",
    ],
    [],
  );

  const selectedPreviewUrl = selected?.media_path
    ? getCommunityPreviewUrl(selected.media_path)
    : null;
  const selectedCoverUrl = selected?.cover_path
    ? getCommunityImageUrl(selected.cover_path)
    : null;
  const selectedIsImage = selected?.media_path
    ? isLikelyImagePath(selected.media_path)
    : false;
  const selectedLiked = selected ? !!likedItemIds[selected.id] : false;
  const selectedIndex = selected
    ? filtered.findIndex((item) => item.id === selected.id)
    : -1;
  const canMovePrev = selectedIndex > 0;
  const canMoveNext = selectedIndex >= 0 && selectedIndex < filtered.length - 1;

  useEffect(() => {
    Object.entries(cardVideoRefs.current).forEach(([id, el]) => {
      if (!el || id === hoverPlayingId) return;
      el.pause();
      if (el.currentTime > 0) el.currentTime = 0;
    });

    if (!hoverPlayingId) return;
    const activeVideo = cardVideoRefs.current[hoverPlayingId];
    if (!activeVideo) return;
    activeVideo.currentTime = 0;
    void activeVideo.play().catch(() => {
      // autoplay can be blocked by browser policy
    });
  }, [hoverPlayingId]);

  useEffect(() => {
    setWatching(false);
    setHoverPlayingId(null);
    setDetailVideoReady(false);
    const detailVideo = detailVideoRef.current;
    if (detailVideo) {
      detailVideo.pause();
      detailVideo.currentTime = 0;
    }
    const watchVideo = watchVideoRef.current;
    if (watchVideo) {
      watchVideo.pause();
      watchVideo.currentTime = 0;
    }
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id || !selectedPreviewUrl || selectedIsImage || watching) return;
    const video = detailVideoRef.current;
    if (!video) return;
    setDetailVideoReady(false);
    video.currentTime = 0;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.load();
    const frameId = window.requestAnimationFrame(() => {
      void video.play().catch(() => {
        // ignore autoplay rejection
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [selected?.id, selectedIsImage, selectedPreviewUrl, watching]);

  useEffect(() => {
    if (!selected?.id) return;
    const frameId = window.requestAnimationFrame(() => {
      centerSelectedCard(selected.id, "smooth");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [selected?.id, filtered.length]);

  useEffect(() => {
    if (!selected?.id || selectedIsImage) return;
    const video = watchVideoRef.current;
    if (!video) return;
    if (!watching) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => {
      // ignore autoplay rejection
    });
  }, [watching, selected?.id, selectedIsImage]);

  const canCloneProcess =
    !!processItem &&
    isAuthenticated &&
    processItem.public_canvas &&
    processItem.status === "PUBLIC";

  const centerSelectedCard = (
    itemId: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const rail = detailRailRef.current;
    const card = detailCardRefs.current[itemId];
    if (!rail || !card) return;

    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    const targetLeft = Math.max(0, cardCenter - rail.clientWidth / 2);
    rail.scrollTo({ left: targetLeft, behavior });
  };

  const moveDetailSelection = (delta: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextItem = filtered[selectedIndex + delta];
    if (!nextItem) return;
    setSelected(nextItem);
  };

  const openProcessModal = (item: CommunityItem) => {
    setWatching(false);
    setSelected(null);
    setProcessItem(item);
  };

  const handleQuickWatch = () => {
    if (!selected || !selected.media_path || !selectedPreviewUrl) return;
    void recordPlay(selected);
    if (selectedIsImage) {
      window.open(selectedPreviewUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setWatching(true);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="px-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <button
              type="button"
              className={cn(
                "pb-2 text-base font-semibold",
                topTab === "works"
                  ? "border-b-2 border-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setTopTab("works")}
            >
              作品
            </button>
            <button
              type="button"
              className={cn(
                "pb-2 text-base font-semibold",
                topTab === "events"
                  ? "border-b-2 border-foreground"
                  : "text-muted-foreground",
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

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
          {topTab === "works" && scope === "public" && (
            <Select
              value={publicSort}
              onValueChange={(v) => setPublicSort(v as PublicSortOption)}
            >
              <SelectTrigger className="h-8 w-[180px] rounded-full">
                <SelectValue placeholder="筛选公开作品" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FEATURED_EDITABLE">编辑精选</SelectItem>
                <SelectItem value="POPULAR">热门推荐</SelectItem>
                <SelectItem value="LATEST">最新发布</SelectItem>
              </SelectContent>
            </Select>
          )}
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
              const coverUrl = item.cover_path
                ? getCommunityImageUrl(item.cover_path)
                : null;
              const mediaUrl = item.media_path
                ? getCommunityPreviewUrl(item.media_path)
                : null;
              const isVideo =
                !!item.media_path && !isLikelyImagePath(item.media_path);
              const isPlaying = hoverPlayingId === item.id;
              const canTakeDown = scope === "mine" && item.status === "PUBLIC";

              return (
                <div key={item.id} className="group">
                  <div className="overflow-hidden rounded-2xl border bg-muted/10">
                    <button
                      type="button"
                      className="relative aspect-video w-full cursor-pointer overflow-hidden bg-muted/20 text-left"
                      onClick={() => setSelected(item)}
                      onMouseEnter={() => {
                        if (isVideo && mediaUrl) setHoverPlayingId(item.id);
                      }}
                      onMouseLeave={() => {
                        if (hoverPlayingId === item.id) setHoverPlayingId(null);
                      }}
                    >
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={item.title}
                          className={cn(
                            "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
                            isVideo && isPlaying ? "opacity-0" : "opacity-100",
                          )}
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                          无封面
                        </div>
                      )}

                      {isVideo && mediaUrl ? (
                        <video
                          ref={(el) => {
                            cardVideoRefs.current[item.id] = el;
                          }}
                          className={cn(
                            "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
                            isPlaying ? "opacity-100" : "opacity-0",
                          )}
                          src={mediaUrl}
                          poster={coverUrl ?? undefined}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : null}

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground">
                        @{item.user_name ?? "匿名"}
                      </div>
                      <div className="mt-1 truncate font-medium">
                        {item.title}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>播放 {formatCount(item.view_count)}</span>
                        <span>点赞 {formatCount(item.like_count)}</span>
                      </div>
                      {scope === "mine" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          状态：{moderationStatusLabel(item.status)}
                          {item.last_review_action && (
                            <span>
                              {" · 最近处理："}
                              {item.last_review_action === "APPROVE"
                                ? "通过"
                                : item.last_review_action === "REJECT"
                                  ? "驳回"
                                  : "下架"}
                            </span>
                          )}
                        </div>
                      )}
                      {scope === "mine" && item.last_review_comment?.trim() && (
                        <div className="mt-1 line-clamp-2 text-xs text-amber-600 dark:text-amber-400">
                          审核意见：{item.last_review_comment}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="group/process inline-flex h-8 items-center rounded-full px-2 text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          openProcessModal(item);
                        }}
                        title="查看创作过程"
                      >
                        <IconComponent
                          name="ArrowUpRight"
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-xs opacity-0 transition-all duration-200 group-hover/process:ml-1 group-hover/process:max-w-[84px] group-hover/process:opacity-100">
                          查看创作过程
                        </span>
                      </button>

                      {canTakeDown && (
                        <button
                          type="button"
                          disabled={takeDownPendingId === item.id}
                          className={cn(
                            "inline-flex h-8 items-center rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-600",
                            takeDownPendingId === item.id &&
                              "cursor-not-allowed opacity-60",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            void hidePublicItem(item);
                          }}
                          title="下架该作品"
                        >
                          {takeDownPendingId === item.id ? "下架中..." : "下架"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setWatching(false);
            setSelected(null);
          }
        }}
      >
        <DialogContent
          className="h-[100dvh] w-screen max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
          closeButtonClassName="hidden"
        >
          {selected ? (
            <div className="relative h-full w-full overflow-hidden bg-black/40">
              <div className="absolute inset-y-5 left-[4vw] right-[4vw] overflow-hidden rounded-[24px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-sm">
                <div className="absolute inset-0">
                  {selectedPreviewUrl ? (
                    selectedIsImage ? (
                      <img
                        className="h-full w-full object-cover opacity-90"
                        src={selectedPreviewUrl}
                        alt={selected.title}
                      />
                    ) : (
                      <video
                        key={`bg-${selected.id}-${selected.media_path ?? ""}`}
                        ref={detailVideoRef}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        controls={false}
                        disablePictureInPicture
                        controlsList="nodownload noplaybackrate nofullscreen"
                        className={cn(
                          "pointer-events-none h-full w-full object-cover transition-opacity duration-200",
                          detailVideoReady ? "opacity-100" : "opacity-0",
                        )}
                        src={selectedPreviewUrl}
                        onLoadedData={() => setDetailVideoReady(true)}
                        onCanPlay={(event) => {
                          const video = event.currentTarget;
                          video.muted = true;
                          void video.play().catch(() => {
                            // ignore autoplay rejection
                          });
                        }}
                      />
                    )
                  ) : selectedCoverUrl ? (
                    <img
                      className="h-full w-full object-cover opacity-90"
                      src={selectedCoverUrl}
                      alt={selected.title}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-white/80">
                      {"\u6682\u65e0\u9884\u89c8\u6587\u4ef6"}
                    </div>
                  )}
                  {!selectedIsImage &&
                    !!selectedPreviewUrl &&
                    !detailVideoReady && (
                      <div className="absolute inset-0 bg-black" />
                    )}
                </div>

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/45" />

                <div
                  className={cn(
                    "absolute inset-0 transition-transform duration-500 ease-out",
                    watching ? "-translate-y-full" : "translate-y-0",
                  )}
                >
                  <div className="absolute left-8 top-8 z-20">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-black/45 px-6 py-3 text-xl font-semibold text-white/95 transition hover:bg-black/70"
                      onClick={() => {
                        setWatching(false);
                        setSelected(null);
                      }}
                    >
                      <IconComponent name="ArrowLeft" className="h-6 w-6" />
                      {"\u8fd4\u56de"}
                    </button>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-20 px-8 pb-6 pt-24">
                    <div className="mb-6 max-w-3xl text-white">
                      <h2 className="text-5xl font-bold leading-tight drop-shadow">
                        {selected.title}
                      </h2>
                      <div className="mt-3 flex items-center gap-4 text-sm text-white/80">
                        <span>@{selected.user_name ?? "\u533f\u540d"}</span>
                        <span>
                          {new Date(selected.created_at).toLocaleDateString()}
                        </span>
                        {selected.status === "PUBLIC" && (
                          <button
                            type="button"
                            disabled={!isAuthenticated || likePendingId === selected.id}
                            onClick={() => isAuthenticated && void likePublicItem(selected)}
                            className={cn(
                              "inline-flex items-center rounded-full border border-white/20 bg-black/30 px-2 py-1 text-xs transition-colors",
                              selectedLiked
                                ? "text-rose-400"
                                : "text-white/80 hover:text-rose-300",
                              (!isAuthenticated || likePendingId === selected.id) &&
                                "cursor-not-allowed opacity-70",
                            )}
                            title={
                              isAuthenticated
                                ? selectedLiked
                                  ? "取消点赞"
                                  : "点赞"
                                : "登录后可点赞"
                            }
                          >
                            <IconComponent name="Heart" className="h-4 w-4" />
                            <span
                              className={cn(
                                "ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300",
                                selectedLiked && "ml-1 max-w-[72px] opacity-100",
                              )}
                            >
                              {formatCount(selected.like_count)}
                            </span>
                          </button>
                        )}
                      </div>
                      <div className="mt-6 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleQuickWatch}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-base font-semibold text-black transition hover:bg-white/90"
                        >
                          <IconComponent name="Play" className="h-4 w-4" />
                          {"\u7acb\u5373\u89c2\u770b"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openProcessModal(selected)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-6 py-2.5 text-base font-semibold text-sky-300 transition hover:bg-black/65 hover:text-sky-200"
                        >
                          <IconComponent
                            name="ArrowUpRight"
                            className="h-4 w-4"
                          />
                          {"\u67e5\u770b\u521b\u4f5c\u8fc7\u7a0b"}
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        className={cn(
                          "absolute left-0 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white transition hover:bg-black/70",
                          !canMovePrev && "cursor-not-allowed opacity-40",
                        )}
                        onClick={() => moveDetailSelection(-1)}
                        disabled={!canMovePrev}
                        aria-label="previous"
                      >
                        <IconComponent name="ArrowLeft" className="h-5 w-5" />
                      </button>

                      <div
                        ref={detailRailRef}
                        className="mx-14 flex gap-3 overflow-x-auto px-[30vw] py-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {filtered.map((item) => {
                          const thumbUrl = item.cover_path
                            ? getCommunityImageUrl(item.cover_path)
                            : item.media_path
                              ? getCommunityPreviewUrl(item.media_path)
                              : null;
                          const active = selected.id === item.id;
                          return (
                            <button
                              key={item.id}
                              ref={(el) => {
                                detailCardRefs.current[item.id] = el;
                              }}
                              type="button"
                              className={cn(
                                "w-56 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/45 text-left text-white transition-all duration-200",
                                active
                                  ? "scale-[1.06] border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.85)]"
                                  : "opacity-80 hover:opacity-100",
                              )}
                              onClick={() => {
                                setWatching(false);
                                setSelected(item);
                              }}
                            >
                              <div className="aspect-video bg-black/40">
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={item.title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
                                    {"\u65e0\u5c01\u9762"}
                                  </div>
                                )}
                              </div>
                              <div className="truncate px-2 py-1.5 text-xs text-white/90">
                                {item.title}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className={cn(
                          "absolute right-0 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white transition hover:bg-black/70",
                          !canMoveNext && "cursor-not-allowed opacity-40",
                        )}
                        onClick={() => moveDetailSelection(1)}
                        disabled={!canMoveNext}
                        aria-label="next"
                      >
                        <IconComponent name="ArrowRight" className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "absolute inset-0 transition-transform duration-500 ease-out",
                    watching ? "translate-y-0" : "translate-y-full",
                  )}
                >
                  {selectedIsImage ? null : (
                    <div className="relative h-full w-full bg-black">
                      <video
                        ref={watchVideoRef}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full bg-black object-contain"
                        poster={selectedCoverUrl ?? undefined}
                        src={selectedPreviewUrl ?? undefined}
                      />
                      <div className="absolute left-8 top-8 z-30">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-sm text-white/90 transition hover:bg-black/65"
                          onClick={() => setWatching(false)}
                        >
                          <IconComponent name="ArrowDown" className="h-4 w-4" />
                          {"\u8fd4\u56de\u8be6\u60c5"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!processItem}
        onOpenChange={(open) => !open && setProcessItem(null)}
      >
        <DialogContent className="w-[min(96vw,1520px)] max-w-[96vw] overflow-hidden p-0">
          {processItem ? (
            <div className="flex h-[88vh] flex-col bg-background">
              <div className="flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setProcessItem(null)}
                  >
                    <IconComponent name="ArrowLeft" className="h-4 w-4" />
                    返回
                  </button>
                  <div className="truncate text-base font-semibold">
                    《{processItem.title}》
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="hidden text-sm text-muted-foreground md:inline">
                    只读模式，如需创建请点击
                  </span>
                  <Button
                    type="button"
                    className="rounded-full"
                    disabled={!canCloneProcess}
                    onClick={() => cloneToWorkspace(processItem.flow_id)}
                    title={
                      !isAuthenticated
                        ? "请先登录"
                        : !processItem.public_canvas
                          ? "作者未公开画布"
                          : processItem.status !== "PUBLIC"
                            ? "未公开"
                            : "克隆项目"
                    }
                  >
                    克隆项目
                    <IconComponent
                      name="ArrowUpRight"
                      className="ml-1 h-4 w-4"
                    />
                  </Button>
                </div>
              </div>

              <div className="flex-1 bg-muted/20">
                <iframe
                  title={`flow-view-${processItem.flow_id}`}
                  src={getFlowViewPath(processItem.flow_id)}
                  className="h-full w-full border-0"
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
