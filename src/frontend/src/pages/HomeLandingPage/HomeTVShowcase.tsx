import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
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

const SECTION_RECOMMEND = "recommend";
const SECTION_FEATURED = "featured";
const SECTION_TV_AD = "tv_ad";
const SECTION_ANIMATION = "animation";
const SECTION_NARRATIVE = "narrative";
const SECTION_MV = "mv";
const SECTION_CREATIVE = "creative";
const SECTION_TUTORIAL = "tutorial";
const SECTION_OTHER = "other";

const SECTIONS = [
  SECTION_RECOMMEND,
  SECTION_FEATURED,
  SECTION_TV_AD,
  SECTION_ANIMATION,
  SECTION_NARRATIVE,
  SECTION_MV,
  SECTION_CREATIVE,
  SECTION_TUTORIAL,
  SECTION_OTHER,
] as const;

const SECTION_LABEL_KEYS: Record<(typeof SECTIONS)[number], string> = {
  [SECTION_RECOMMEND]: "Recommended for you",
  [SECTION_FEATURED]: "Featured canvases",
  [SECTION_TV_AD]: "TV Ads",
  [SECTION_ANIMATION]: "Animation",
  [SECTION_NARRATIVE]: "Narrative Shorts",
  [SECTION_MV]: "MV",
  [SECTION_CREATIVE]: "Creative",
  [SECTION_TUTORIAL]: "Tutorials",
  [SECTION_OTHER]: "Other",
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  [SECTION_FEATURED]: ["精选画布", "精选画面"],
  [SECTION_TV_AD]: ["电视广告", "广告"],
  [SECTION_ANIMATION]: ["动画"],
  [SECTION_NARRATIVE]: ["叙事短片"],
  [SECTION_MV]: ["MV"],
  [SECTION_CREATIVE]: ["创意"],
  [SECTION_TUTORIAL]: ["教程"],
  [SECTION_OTHER]: ["其他"],
};

function getFlowViewPath(flowId: string): string {
  if (typeof window === "undefined") return `/flow-view/${encodeURIComponent(flowId)}/`;
  const path = window.location.pathname;
  const communityIndex = path.indexOf("/community");
  const prefix = communityIndex >= 0 ? path.slice(0, communityIndex) : "";
  return `${prefix}/flow-view/${encodeURIComponent(flowId)}/`;
}

function formatCount(value?: number): string {
  const parsed = Number(value ?? 0);
  const n = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

export default function HomeTVShowcase() {
  const { t } = useTranslation();
  const navigate = useCustomNavigate();
  const addFlow = useAddFlow();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);

  const [selected, setSelected] = useState<CommunityItem | null>(null);
  const [detailItems, setDetailItems] = useState<CommunityItem[]>([]);
  const [processItem, setProcessItem] = useState<CommunityItem | null>(null);
  const [watching, setWatching] = useState(false);
  const [hoverPlayingId, setHoverPlayingId] = useState<string | null>(null);

  const cardVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const watchVideoRef = useRef<HTMLVideoElement | null>(null);

  const listPublic = useQuery({
    queryKey: ["home", "tv", "public"],
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(`${getURL("COMMUNITY")}/items/public`, {
        params: { type: "TV", limit: 240 },
      });
      return r.data ?? [];
    },
  });

  const items = useMemo(() => listPublic.data ?? [], [listPublic.data]);
  const recommended = useMemo(
    () =>
      [...items].sort((a, b) => {
        const scoreA = (a.like_count ?? 0) * 2 + (a.view_count ?? 0);
        const scoreB = (b.like_count ?? 0) * 2 + (b.view_count ?? 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [items],
  );

  const sectionItemsMap = useMemo(() => {
    const map = new Map<string, CommunityItem[]>();
    const byCategory = (labels: string[]) =>
      items.filter((item) => labels.includes((item.category ?? "").trim()));

    SECTIONS.forEach((section, idx) => {
      let next: CommunityItem[] = [];
      if (section === SECTION_RECOMMEND) {
        next = recommended;
      } else if (section === SECTION_FEATURED) {
        next = items.filter(
          (item) =>
            item.public_canvas ||
            CATEGORY_ALIASES[SECTION_FEATURED].includes((item.category ?? "").trim()),
        );
      } else {
        next = byCategory(CATEGORY_ALIASES[section] ?? [section]);
      }
      if (!next.length) {
        // Backfill with recommended items when historical data has no category.
        next = recommended.slice(idx * 10, idx * 10 + 24);
      }
      map.set(section, next);
    });

    return map;
  }, [items, recommended]);

  const selectedPreviewUrl = selected?.media_path ? getCommunityPreviewUrl(selected.media_path) : null;
  const selectedCoverUrl = selected?.cover_path ? getCommunityImageUrl(selected.cover_path) : null;
  const selectedIsImage = selected?.media_path ? isLikelyImagePath(selected.media_path) : false;
  useEffect(() => {
    Object.entries(cardVideoRefs.current).forEach(([id, el]) => {
      if (!el || id === hoverPlayingId) return;
      el.pause();
      if (el.currentTime > 0) el.currentTime = 0;
    });
    if (!hoverPlayingId) return;
    const active = cardVideoRefs.current[hoverPlayingId];
    if (!active) return;
    active.currentTime = 0;
    void active.play().catch(() => {});
  }, [hoverPlayingId]);

  const openDetail = (item: CommunityItem, sectionItems: CommunityItem[]) => {
    setDetailItems(sectionItems);
    setSelected(item);
  };

  if (listPublic.isLoading) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        {t("Loading TapTV...")}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        {t("No TapTV content yet")}
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {SECTIONS.map((section) => {
        const sectionItems = sectionItemsMap.get(section) ?? [];
        const previewItems = sectionItems.slice(0, 10);
        return (
          <section key={section}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">
                {t(SECTION_LABEL_KEYS[section] ?? section)}
              </h3>
              <button type="button" className="inline-flex items-center text-sm text-white/70 hover:text-white" onClick={() => navigate("/community/tv")}>
                {t("View all")}
                <IconComponent name="ArrowRight" className="ml-1 h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {previewItems.map((item) => {
                const coverUrl = item.cover_path ? getCommunityImageUrl(item.cover_path) : null;
                const mediaUrl = item.media_path ? getCommunityPreviewUrl(item.media_path) : null;
                const isVideo = !!item.media_path && !isLikelyImagePath(item.media_path);
                const isPlaying = hoverPlayingId === item.id;
                return (
                  <article key={item.id}>
                    <button type="button" className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left" onClick={() => openDetail(item, sectionItems)} onMouseEnter={() => isVideo && mediaUrl && setHoverPlayingId(item.id)} onMouseLeave={() => hoverPlayingId === item.id && setHoverPlayingId(null)}>
                      <div className="relative aspect-video w-full">
                        {coverUrl ? <img src={coverUrl} alt={item.title} className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-200", isVideo && isPlaying ? "opacity-0" : "opacity-100")} /> : <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">{t("No cover")}</div>}
                        {isVideo && mediaUrl ? <video ref={(el) => { cardVideoRefs.current[item.id] = el; }} className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-200", isPlaying ? "opacity-100" : "opacity-0")} src={mediaUrl} muted loop playsInline preload="metadata" /> : null}
                      </div>
                    </button>
                    <div className="mt-2 min-w-0">
                      <div className="truncate text-xs text-white/55">@{item.user_name ?? t("Anonymous")}</div>
                      <div className="truncate text-lg font-semibold text-white">{item.title}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-white/55">
                        <span>{t("Plays")} {formatCount(item.view_count)}</span>
                        <span>{t("Likes")} {formatCount(item.like_count)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="h-[100dvh] w-screen max-w-none rounded-none border-0 bg-transparent p-0 shadow-none" closeButtonClassName="hidden">
          {selected ? (
            <div className="absolute inset-y-5 left-[4vw] right-[4vw] overflow-hidden rounded-[24px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-sm">
              <div className="absolute inset-0">{selectedPreviewUrl ? (selectedIsImage ? <img className="h-full w-full object-cover opacity-90" src={selectedPreviewUrl} alt={selected.title} /> : <video autoPlay muted={!watching} loop={!watching} controls={watching} playsInline className="h-full w-full object-cover" src={selectedPreviewUrl} ref={watchVideoRef} />) : selectedCoverUrl ? <img className="h-full w-full object-cover opacity-90" src={selectedCoverUrl} alt={selected.title} /> : null}</div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/45" />
              <div className="absolute left-8 top-8 z-20">
                <button type="button" className="inline-flex items-center gap-2 rounded-full bg-black/45 px-6 py-3 text-xl font-semibold text-white/95" onClick={() => setSelected(null)}>
                  <IconComponent name="ArrowLeft" className="h-6 w-6" />
                  {t("Back")}
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!processItem} onOpenChange={(open) => !open && setProcessItem(null)}>
        <DialogContent className="w-[min(96vw,1520px)] max-w-[96vw] overflow-hidden p-0">
          {processItem ? (
            <div className="flex h-[88vh] flex-col bg-background">
              <div className="flex items-center justify-between border-b bg-background/95 px-4 py-3">
                <div className="truncate text-base font-semibold">《{processItem.title}》</div>
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={!isAuthenticated || !processItem.public_canvas || processItem.status !== "PUBLIC"}
                  onClick={async () => {
                    try {
                      const r = await api.get<Record<string, unknown>>(getURL("PUBLIC_FLOW", { flowId: processItem.flow_id }));
                      const flow = r.data as any;
                      const newId = await addFlow({ flow });
                      if (typeof newId === "string" && newId) {
                        setSuccessData({ title: t("Cloned to workspace") });
                        navigate(`/flow/${newId}/`);
                      }
                    } catch (error: any) {
                      setErrorData({
                        title: t("Clone failed"),
                        list: [error?.message ?? t("Unknown error")],
                      });
                    }
                  }}
                >
                  {t("Clone project")}
                  <IconComponent name="ArrowUpRight" className="ml-1 h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 bg-muted/20">
                <iframe title={`flow-view-${processItem.flow_id}`} src={getFlowViewPath(processItem.flow_id)} className="h-full w-full border-0" />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
