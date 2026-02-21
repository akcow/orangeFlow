import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";
import KlingElementCreateDialog from "@/components/kling/KlingElementCreateDialog";
import { useKlingElementsStore } from "@/stores/klingElementsStore";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";

export default function KlingElementsPanel({
  onRequestClose,
}: {
  onRequestClose?: () => void;
}) {
  const hydrate = useKlingElementsStore((s) => s.hydrate);
  const refreshCustom = useKlingElementsStore((s) => s.refreshCustom);
  const refreshPresets = useKlingElementsStore((s) => s.refreshPresets);
  const del = useKlingElementsStore((s) => s.deleteCustom);
  const loading = useKlingElementsStore((s) => s.loading);
  const error = useKlingElementsStore((s) => s.error);
  const custom = useKlingElementsStore((s) => s.custom);
  const presets = useKlingElementsStore((s) => s.presets);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"custom" | "presets">("custom");
  const [createOpen, setCreateOpen] = useState(false);
  const [_tick, setTick] = useState(0);

  const fileUrlCache = useRef(new Map<string, string>());
  const resolveFileUrl = (fileId: string) => fileUrlCache.current.get(fileId) ?? "";

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = Array.from(new Set(custom.map((x) => String(x.preview_file_id || "")).filter(Boolean)));
      for (const id of ids) {
        if (cancelled) return;
        if (fileUrlCache.current.has(id)) continue;
        try {
          const res = await api.get(`${getURL("FILES", {}, true)}/${id}`, { responseType: "blob" });
          const url = URL.createObjectURL(res.data as Blob);
          fileUrlCache.current.set(id, url);
        } catch {
          // ignore (we'll show blank)
        }
      }
      if (!cancelled) setTick((x) => x + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [custom]);

  useEffect(() => {
    return () => {
      for (const url of Array.from(fileUrlCache.current.values())) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      fileUrlCache.current.clear();
    };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = tab === "custom" ? custom : presets;
    if (!query) return list;
    return list.filter((el: any) => String(el.element_name ?? "").toLowerCase().includes(query));
  }, [custom, presets, q, tab]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="text-base font-semibold">可灵主体库</div>
        </div>
        <div className="flex items-center gap-2">
          {tab === "custom" && (
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              <ForwardedIconComponent name="Plus" className="mr-2 h-4 w-4" />
              新建
            </Button>
          )}
          <Button variant="outline" onClick={onRequestClose}>
            关闭
          </Button>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="flex items-center gap-2">
          <Button
            variant={tab === "custom" ? "secondary" : "outline"}
            className="h-11 px-5"
            onClick={() => setTab("custom")}
          >
            我的主体
          </Button>
          <Button
            variant={tab === "presets" ? "secondary" : "outline"}
            className="h-11 px-5"
            onClick={() => {
              setTab("presets");
              void refreshPresets();
            }}
          >
            官方主体
          </Button>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索主体名称"
          className="h-11 flex-1 rounded-full"
        />
        <Button
          variant="secondary"
          className="h-11 px-5"
          onClick={() => void (tab === "custom" ? refreshCustom() : refreshPresets())}
        >
          刷新
        </Button>
      </div>

      {error && (
        <div className="px-6 pb-2 text-sm text-red-600">{String(error)}</div>
      )}

      {/* list */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {loading ? "加载中..." : "暂无主体"}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {tab === "custom"
              ? (filtered as any[]).map((el) => (
                  <div
                    key={el.asset_id}
                    className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/10 transition hover:shadow-md"
                  >
                    <div className="aspect-square w-full bg-muted/10">
                      {String(el.reference_type || "") === "video_refer" ? (
                        <video
                          src={resolveFileUrl(el.preview_file_id)}
                          className="h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                          autoPlay
                        />
                      ) : (
                        <img src={resolveFileUrl(el.preview_file_id)} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="p-2">
                      <div className="truncate text-sm font-medium">{el.element_name}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {el.element_description}
                      </div>
                    </div>

                    <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-7 w-7 rounded-md shadow-sm"
                        onClick={() => void del(el.asset_id)}
                        title="删除"
                      >
                        <ForwardedIconComponent name="Trash2" className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* subtle badge for applied id */}
                    <div
                      className={cn(
                        "absolute left-2 top-2 rounded-md bg-black/50 px-2 py-1 text-xs text-white",
                        "opacity-0 transition group-hover:opacity-100",
                      )}
                    >
                      element_id: {el.element_id}
                    </div>
                  </div>
                ))
              : (filtered as any[]).map((el) => (
                  <div
                    key={el.element_id}
                    className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/10 transition hover:shadow-md"
                  >
                    <div className="aspect-square w-full bg-muted/10">
                      <img src={String(el.frontal_image || "")} className="h-full w-full object-cover" />
                    </div>
                    <div className="p-2">
                      <div className="truncate text-sm font-medium">{el.element_name}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {el.element_description}
                      </div>
                    </div>

                    <div
                      className={cn(
                        "absolute left-2 top-2 rounded-md bg-black/50 px-2 py-1 text-xs text-white",
                        "opacity-0 transition group-hover:opacity-100",
                      )}
                    >
                      element_id: {el.element_id}
                    </div>
                  </div>
                ))}
          </div>
        )}
      </div>

      <KlingElementCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refreshCustom()}
      />
    </div>
  );
}
