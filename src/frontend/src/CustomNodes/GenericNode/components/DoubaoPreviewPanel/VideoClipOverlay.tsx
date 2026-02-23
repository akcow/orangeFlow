import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/utils";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import VideoClipShortcutDialog from "./VideoClipShortcutDialog";

type Props = {
  open: boolean;
  durationS: number;
  currentTimeS: number;
  videoSource: string;
  videoEl?: HTMLVideoElement | null;
  onCancel: () => void;
  onConfirm: (payload: { startS: number; endS: number }) => void;
  onSeek: (timeS: number) => void;
  onTogglePlayback: () => void;
  isBusy?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatSeconds(value: number) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "0.00s";
  return `${v.toFixed(2)}s`;
}

async function captureVideoFrame(
  video: HTMLVideoElement,
  t: number,
  width: number,
) {
  const safeT = clamp(t, 0, Math.max(0, (video.duration || 0) - 1e-3));
  const wasPaused = video.paused;
  try {
    video.pause();
    video.currentTime = safeT;
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => resolve(), 1500);
      video.addEventListener(
        "seeked",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

    const vw = Number(video.videoWidth || 0);
    const vh = Number(video.videoHeight || 0);
    if (!vw || !vh) return null;
    const scale = width / vw;
    const h = Math.max(1, Math.round(vh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    if (!wasPaused) {
      void video.play().catch(() => undefined);
    }
  }
}

const HINTS: Array<{ keys: string; label: string }> = [
  { keys: "I / O", label: "设置入点/出点" },
  { keys: "Space", label: "播放/暂停预览" },
  { keys: "Left / Right", label: "移动选区" },
  { keys: "Enter", label: "完成剪辑" },
];

export default function VideoClipOverlay({
  open,
  durationS,
  currentTimeS,
  videoSource,
  videoEl = null,
  onCancel,
  onConfirm,
  onSeek,
  onTogglePlayback,
  isBusy = false,
}: Props) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);
  const [metaDurationS, setMetaDurationS] = useState(0);
  const [playheadS, setPlayheadS] = useState(0);
  const [hintIndex, setHintIndex] = useState(0);
  const seededRef = useRef(false);

  const [dragMode, setDragMode] = useState<
    | null
    | {
        kind: "in" | "out" | "move";
        startX: number;
        startIn: number;
        startOut: number;
      }
  >(null);

  const [thumbs, setThumbs] = useState<string[]>([]);
  const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const thumbAbortRef = useRef({ aborted: false });

  const effectiveDurationS = useMemo(() => {
    const v = Number(durationS);
    if (Number.isFinite(v) && v > 0) return v;
    const m = Number(metaDurationS);
    if (Number.isFinite(m) && m > 0) return m;
    return 0;
  }, [durationS, metaDurationS]);
  const hasDuration =
    Number.isFinite(effectiveDurationS) && effectiveDurationS > 0;

  // Smooth playhead updates without re-rendering the whole preview panel.
  useEffect(() => {
    if (!open) return;
    const video = videoEl;
    if (!video) {
      setPlayheadS(Number(currentTimeS) || 0);
      return;
    }

    let rafId: number | null = null;
    let rvfcId: number | null = null;
    const anyVideo = video as any;
    const cancelTicker = () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (rvfcId != null && typeof anyVideo.cancelVideoFrameCallback === "function") {
        try {
          anyVideo.cancelVideoFrameCallback(rvfcId);
        } catch {
          // ignore
        }
        rvfcId = null;
      }
    };

    const tick = () => {
      setPlayheadS(video.currentTime || 0);
      if (video.paused || video.ended) return;
      if (typeof anyVideo.requestVideoFrameCallback === "function") {
        rvfcId = anyVideo.requestVideoFrameCallback(() => tick());
      } else {
        rafId = window.requestAnimationFrame(() => tick());
      }
    };
    const ensureTicker = () => {
      if (video.paused || video.ended) return;
      if (rafId != null || rvfcId != null) return;
      tick();
    };

    const syncOnce = () => setPlayheadS(video.currentTime || 0);
    const onPlay = () => {
      cancelTicker();
      tick();
    };
    const onPause = () => {
      cancelTicker();
      syncOnce();
    };
    const onSeeking = () => {
      cancelTicker();
      syncOnce();
    };
    const onSeeked = () => {
      syncOnce();
      ensureTicker();
    };
    const onTimeUpdate = () => {
      // When paused, timeupdate/seeked are the only sources of truth.
      if (video.paused) syncOnce();
      else ensureTicker();
    };

    // Prime.
    syncOnce();
    setMetaDurationS((prev) => (prev > 0 ? prev : Number(video.duration || 0)));
    if (!video.paused && !video.ended) {
      tick();
    }

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      cancelTicker();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [currentTimeS, open, videoEl]);

  useEffect(() => {
    if (!open) return;
    seededRef.current = false;
    setHintIndex(0);
  }, [open, videoSource]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setHintIndex((prev) => (prev + 1) % HINTS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!hasDuration) return;
    if (seededRef.current && outPoint > inPoint + 1e-3) return;

    // Defer one frame so the underlying <video> has a chance to sync its currentTime,
    // otherwise we may incorrectly seed from 0 and start the selection at the beginning.
    let cancelled = false;
    const id = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const DEFAULT_SELECTION_S = 3;
      const sel = Math.min(DEFAULT_SELECTION_S, effectiveDurationS);

      // Default selection should be visually centered (not starting from 0s).
      // We intentionally seed from duration center instead of the current playhead.
      const rawCenter = effectiveDurationS / 2;

      const center = clamp(rawCenter, 0, effectiveDurationS);
      const start = clamp(
        center - sel / 2,
        0,
        Math.max(0, effectiveDurationS - sel),
      );
      seededRef.current = true;
      setInPoint(start);
      setOutPoint(clamp(start + sel, 0, effectiveDurationS));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [effectiveDurationS, hasDuration, inPoint, open, outPoint]);

  const selectionDuration = useMemo(
    () => Math.max(0, outPoint - inPoint),
    [inPoint, outPoint],
  );
  const canConfirm = Boolean(!isBusy && hasDuration && selectionDuration > 1e-3);

  const timeToX = useCallback(
    (t: number) => {
      const el = timelineRef.current;
      const w = el?.clientWidth ?? 0;
      if (!w || !hasDuration) return 0;
      return clamp(
        (clamp(t, 0, effectiveDurationS) / effectiveDurationS) * w,
        0,
        w,
      );
    },
    [effectiveDurationS, hasDuration],
  );

  const xToTime = useCallback(
    (x: number) => {
      const el = timelineRef.current;
      const w = el?.clientWidth ?? 0;
      if (!w || !hasDuration) return 0;
      return clamp(
        (clamp(x, 0, w) / w) * effectiveDurationS,
        0,
        effectiveDurationS,
      );
    },
    [effectiveDurationS, hasDuration],
  );

  const applyMoveSelection = useCallback(
    (deltaS: number) => {
      if (!hasDuration) return;
      const dur = Math.max(0, outPoint - inPoint);
      if (dur <= 0) return;
      let nextIn = inPoint + deltaS;
      let nextOut = outPoint + deltaS;
      if (nextIn < 0) {
        nextOut += -nextIn;
        nextIn = 0;
      }
      if (nextOut > effectiveDurationS) {
        const overflow = nextOut - effectiveDurationS;
        nextIn -= overflow;
        nextOut = effectiveDurationS;
      }
      nextIn = clamp(nextIn, 0, effectiveDurationS);
      nextOut = clamp(nextOut, 0, effectiveDurationS);
      setInPoint(nextIn);
      setOutPoint(Math.max(nextOut, nextIn));
    },
    [effectiveDurationS, hasDuration, inPoint, outPoint],
  );

  const applyResizeSelection = useCallback(
    (deltaS: number) => {
      if (!hasDuration) return;
      const center = (inPoint + outPoint) / 2;
      const half = Math.max(0, (outPoint - inPoint) / 2 + deltaS);
      const nextIn = clamp(center - half, 0, effectiveDurationS);
      const nextOut = clamp(center + half, 0, effectiveDurationS);
      if (nextOut <= nextIn + 1e-3) return;
      setInPoint(nextIn);
      setOutPoint(nextOut);
    },
    [effectiveDurationS, hasDuration, inPoint, outPoint],
  );

  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (target as any)?.isContentEditable
      ) {
        return;
      }

      const key = event.key;
      const step = event.ctrlKey || event.metaKey ? 1 : event.shiftKey ? 0.01 : 0.1;

      if (key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        if (canConfirm) onConfirm({ startS: inPoint, endS: outPoint });
        return;
      }
      if (key === " " || key === "Spacebar") {
        event.preventDefault();
        onTogglePlayback();
        return;
      }
      if (key === "ArrowLeft") {
        event.preventDefault();
        applyMoveSelection(-step);
        return;
      }
      if (key === "ArrowRight") {
        event.preventDefault();
        applyMoveSelection(step);
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        applyResizeSelection(step);
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        applyResizeSelection(-step);
        return;
      }
      if (key === "i" || key === "I") {
        event.preventDefault();
        const next = clamp(playheadS, 0, Math.max(0, outPoint - 1e-3));
        setInPoint(next);
        return;
      }
      if (key === "o" || key === "O") {
        event.preventDefault();
        const next = clamp(
          playheadS,
          Math.min(effectiveDurationS, inPoint + 1e-3),
          effectiveDurationS,
        );
        setOutPoint(next);
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [
    applyMoveSelection,
    applyResizeSelection,
    canConfirm,
    effectiveDurationS,
    inPoint,
    isBusy,
    onCancel,
    onConfirm,
    onTogglePlayback,
    open,
    outPoint,
    playheadS,
  ]);

  const onPointerDownHandle = useCallback(
    (kind: "in" | "out") => (event: React.PointerEvent) => {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setDragMode({
        kind,
        startX: event.clientX,
        startIn: inPoint,
        startOut: outPoint,
      });
    },
    [inPoint, open, outPoint],
  );

  const onPointerDownMove = useCallback(
    (event: React.PointerEvent) => {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setDragMode({
        kind: "move",
        startX: event.clientX,
        startIn: inPoint,
        startOut: outPoint,
      });
    },
    [inPoint, open, outPoint],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragMode) return;
      event.preventDefault();
      event.stopPropagation();
      const el = timelineRef.current;
      const w = el?.clientWidth ?? 0;
      if (!w || !hasDuration) return;
      const dx = event.clientX - dragMode.startX;
      const deltaS = (dx / w) * effectiveDurationS;

      if (dragMode.kind === "move") {
        const dur = dragMode.startOut - dragMode.startIn;
        let nextIn = dragMode.startIn + deltaS;
        let nextOut = nextIn + dur;
        if (nextIn < 0) {
          nextOut += -nextIn;
          nextIn = 0;
        }
        if (nextOut > effectiveDurationS) {
          const overflow = nextOut - effectiveDurationS;
          nextIn -= overflow;
          nextOut = effectiveDurationS;
        }
        setInPoint(clamp(nextIn, 0, effectiveDurationS));
        setOutPoint(clamp(nextOut, 0, effectiveDurationS));
        return;
      }

      if (dragMode.kind === "in") {
        const nextIn = clamp(
          dragMode.startIn + deltaS,
          0,
          Math.max(0, outPoint - 1e-3),
        );
        setInPoint(nextIn);
        return;
      }

      const nextOut = clamp(
        dragMode.startOut + deltaS,
        Math.min(effectiveDurationS, inPoint + 1e-3),
        effectiveDurationS,
      );
      setOutPoint(nextOut);
    },
    [dragMode, effectiveDurationS, hasDuration, inPoint, outPoint],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!dragMode) return;
      event.preventDefault();
      event.stopPropagation();
      setDragMode(null);
    },
    [dragMode],
  );

  const handleTimelineClick = useCallback(
    (event: React.MouseEvent) => {
      if (!hasDuration) return;
      const el = timelineRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      onSeek(xToTime(x));
    },
    [hasDuration, onSeek, xToTime],
  );

  // Build thumbnails from an offscreen video element to avoid interfering with playback.
  useEffect(() => {
    if (!open) return;
    if (!videoSource) return;

    thumbAbortRef.current.aborted = false;
    setThumbs([]);
    setMetaDurationS(0);

    let cancelled = false;
    const video = document.createElement("video");
    thumbVideoRef.current = video;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = videoSource;

    const run = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("thumb video error")), {
            once: true,
          });
        });

        const d = Number(video.duration || 0);
        if (!Number.isFinite(d) || d <= 0) return;
        setMetaDurationS(d);

        const count = 16;
        const items: string[] = [];
        for (let i = 0; i < count; i += 1) {
          if (cancelled || thumbAbortRef.current.aborted) return;
          const t = (i / Math.max(1, count - 1)) * d;
          const url = await captureVideoFrame(video, t, 74);
          if (url) items.push(url);
        }
        if (cancelled || thumbAbortRef.current.aborted) return;
        setThumbs(items);
      } catch {
        // ignore
      }
    };
    void run();

    return () => {
      cancelled = true;
      thumbAbortRef.current.aborted = true;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore
      }
      if (thumbVideoRef.current === video) thumbVideoRef.current = null;
    };
  }, [open, videoSource]);

  if (!open) return null;

  const inX = timeToX(inPoint);
  const outX = timeToX(outPoint);
  const headX = timeToX(playheadS);
  const leftShadeW = Math.max(0, Math.min(inX, outX));
  const rightShadeLeft = Math.max(inX, outX);
  const selectionLeft = Math.min(inX, outX);
  const selectionW = Math.max(0, Math.abs(outX - inX));

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[1400]">
        <div
          data-clip-editor-wrap="doubao"
          className="pointer-events-auto absolute left-1/2 top-full z-10 mt-4 -translate-x-1/2"
        >
          <div className="w-[min(1010px,calc(100vw-36px))]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="取消"
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur",
                  "border-border/60 bg-background/60 text-foreground hover:bg-muted/70",
                  "dark:bg-background/35",
                  isBusy && "opacity-70",
                )}
                onClick={onCancel}
                disabled={isBusy}
              >
                <ForwardedIconComponent name="X" className="h-5 w-5" />
              </button>

              <div
                ref={timelineRef}
                className={cn(
                  "relative h-[92px] flex-1 overflow-hidden rounded-2xl border shadow-lg backdrop-blur",
                  "border-border/80 bg-background/70",
                  "dark:bg-background/35",
                )}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={handleTimelineClick}
                role="presentation"
              >
              <div className="flex h-full w-full">
                {(thumbs.length ? thumbs : new Array(16).fill(null)).map(
                  (src, idx) => (
                    <div key={idx} className="h-full flex-1 overflow-hidden">
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          draggable={false}
                          className="h-full w-full select-none object-cover opacity-95"
                        />
                      ) : (
                        <div className="h-full w-full animate-pulse bg-muted/50" />
                      )}
                    </div>
                  ),
                )}
              </div>

              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-black/40 dark:bg-black/55"
                style={{ width: leftShadeW }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-black/40 dark:bg-black/55"
                style={{ left: rightShadeLeft }}
              />

              <div
                className={cn(
                  "pointer-events-none absolute inset-y-0 rounded-xl",
                  "bg-white/10 dark:bg-white/10",
                  "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]",
                )}
                style={{ left: selectionLeft, width: selectionW }}
              />

              <div
                className="absolute inset-y-0"
                style={{ left: selectionLeft, width: selectionW }}
              >
                <div
                  className="absolute inset-0 cursor-grab active:cursor-grabbing"
                  onPointerDown={onPointerDownMove}
                  role="presentation"
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-1 text-sm font-medium text-white shadow">
                  {formatSeconds(selectionDuration)}
                </div>
              </div>

              <div
                className="pointer-events-none absolute bottom-0 top-0 w-[2px] bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                style={{ left: headX }}
              />

              <div
                className="absolute bottom-2 top-2 w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                style={{ left: inX }}
              >
                <div
                  className="absolute inset-y-0 -left-3 w-6 cursor-ew-resize"
                  onPointerDown={onPointerDownHandle("in")}
                  role="presentation"
                />
              </div>
              <div
                className="absolute bottom-2 top-2 w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                style={{ left: outX }}
              >
                <div
                  className="absolute inset-y-0 -left-3 w-6 cursor-ew-resize"
                  onPointerDown={onPointerDownHandle("out")}
                  role="presentation"
                />
              </div>
              </div>

              <button
                type="button"
                aria-label="完成编辑"
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition",
                  "bg-foreground text-background hover:opacity-95",
                  (!canConfirm || isBusy) && "opacity-70",
                )}
                onClick={() => onConfirm({ startS: inPoint, endS: outPoint })}
                disabled={!canConfirm}
              >
                <ForwardedIconComponent name="Check" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <button
                type="button"
                className={cn(
                  "rounded-full border px-4 py-2 text-[11px] shadow-sm backdrop-blur",
                  "border-border/80 bg-background/55 text-muted-foreground hover:bg-muted/60",
                  "dark:bg-background/35",
                )}
                onClick={() => setShortcutsOpen(true)}
              >
                <div
                  key={hintIndex}
                  className="doubao-clip-hint-snap flex items-center justify-center gap-2"
                >
                  <div className="rounded-md border bg-background/50 px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                    {HINTS[hintIndex]?.keys ?? "I / O"}
                  </div>
                  <span className="whitespace-nowrap">
                    {HINTS[hintIndex]?.label ?? "设置入点/出点"}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <VideoClipShortcutDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </>
  );
}
