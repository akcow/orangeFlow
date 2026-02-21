import {
  type PointerEvent as ReactPointerEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";
import { sanitizePreviewDataUrl, toRenderableImageSource } from "./helpers";

type ToolMode = "select" | "brush" | "eraser";

type Props = {
  open: boolean;
  imageSource: string;
  onCancel: () => void;
  onConfirm: (payload: { maskDataUrl: string; fileName: string; prompt: string }) =>
    | void
    | Promise<void>;
  onRequestUpload?: () => void;
};

type InnerRect = { x: number; y: number; w: number; h: number };

export type EraseOverlayHandle = {
  confirm: () => void;
};

const DEFAULT_ERASE_PROMPT = "移除涂抹区域内容并自然补全背景";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeContainRect(
  bounds: { width: number; height: number },
  natural: { w: number; h: number },
): InnerRect | null {
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);
  const nw = Math.max(1, natural.w);
  const nh = Math.max(1, natural.h);
  const scale = Math.min(bw / nw, bh / nh) || 1;
  const w = nw * scale;
  const h = nh * scale;
  const x = (bw - w) / 2;
  const y = (bh - h) / 2;
  return { x, y, w, h };
}

const EraseOverlay = forwardRef<EraseOverlayHandle, Props>(function EraseOverlay(
  { open, imageSource, onCancel, onConfirm, onRequestUpload }: Props,
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(false);

  const [renderUrl, setRenderUrl] = useState<string>("");
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [innerRect, setInnerRect] = useState<InnerRect | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [brushSize, setBrushSize] = useState<number>(28);
  const [prompt, setPrompt] = useState<string>("");
  const [isConfirming, setConfirming] = useState(false);

  const historyRef = useRef<{ stack: ImageData[]; index: number }>({
    stack: [],
    index: -1,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateUndoState = useCallback(() => {
    const { stack, index } = historyRef.current;
    setCanUndo(index > 0);
    setCanRedo(index >= 0 && index < stack.length - 1);
  }, []);

  const getBounds = useCallback(() => {
    const el = rootRef.current;
    if (!el) return { width: 0, height: 0 };
    return { width: el.clientWidth, height: el.clientHeight };
  }, []);

  const checkerPatternRef = useRef<CanvasPattern | null>(null);
  const getCheckerPattern = useCallback((ctx: CanvasRenderingContext2D) => {
    if (checkerPatternRef.current) return checkerPatternRef.current;
    const tile = document.createElement("canvas");
    tile.width = 16;
    tile.height = 16;
    const tctx = tile.getContext("2d");
    if (!tctx) return null;
    // Bake transparency into the pattern itself (instead of relying on ctx.globalAlpha),
    // so the very first stroke matches the rebuilt mask display.
    tctx.fillStyle = "rgba(215,219,231,0.5)";
    tctx.fillRect(0, 0, 16, 16);
    tctx.fillStyle = "rgba(191,197,216,0.5)";
    tctx.fillRect(0, 0, 8, 8);
    tctx.fillRect(8, 8, 8, 8);
    const pattern = ctx.createPattern(tile, "repeat");
    checkerPatternRef.current = pattern;
    return pattern;
  }, []);

  const rebuildDisplayFromMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const display = displayCanvasRef.current;
    if (!mask || !display) return;
    const dctx = display.getContext("2d");
    if (!dctx) return;
    dctx.clearRect(0, 0, display.width, display.height);
    dctx.drawImage(mask, 0, 0);
    // Fill masked area with a checkerboard pattern (like "transparent mask" UI).
    dctx.globalCompositeOperation = "source-in";
    const pattern = getCheckerPattern(dctx);
    if (pattern) {
      dctx.fillStyle = pattern;
      dctx.fillRect(0, 0, display.width, display.height);
    } else {
      dctx.fillStyle = "rgba(185, 190, 210, 0.5)";
      dctx.fillRect(0, 0, display.width, display.height);
    }
    dctx.globalCompositeOperation = "source-over";
  }, [getCheckerPattern]);

  const resetMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const display = displayCanvasRef.current;
    if (!mask || !display) return;
    const mctx = mask.getContext("2d");
    const dctx = display.getContext("2d");
    if (!mctx || !dctx) return;
    mctx.clearRect(0, 0, mask.width, mask.height);
    dctx.clearRect(0, 0, display.width, display.height);
    // Commit the initial blank snapshot.
    const snap = mctx.getImageData(0, 0, mask.width, mask.height);
    historyRef.current = { stack: [snap], index: 0 };
    updateUndoState();
  }, [updateUndoState]);

  useEffect(() => {
    if (!open) return;
    setToolMode("brush");
    setBrushSize(28);
    setPrompt("");
    setConfirming(false);
    setCanUndo(false);
    setCanRedo(false);
    historyRef.current = { stack: [], index: -1 };
    setNaturalSize(null);
    setInnerRect(null);
    setRenderUrl("");
    dragRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let revoke: (() => void) | undefined;
    const normalized = sanitizePreviewDataUrl(imageSource) ?? imageSource;

    const run = async () => {
      try {
        const { url, revoke: revokeFn } = await toRenderableImageSource(normalized);
        if (cancelled) {
          revokeFn?.();
          return;
        }
        revoke = revokeFn;
        setRenderUrl(url);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (cancelled) return;
          setNaturalSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        };
        img.onerror = () => {
          if (cancelled) return;
          setNaturalSize(null);
        };
        img.src = url;
      } catch {
        if (cancelled) return;
        setNaturalSize(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [imageSource, open]);

  const initCanvases = useCallback(() => {
    if (!open) return;
    const bounds = getBounds();
    const natural = naturalSize;
    if (!bounds.width || !bounds.height || !natural) return;

    const rect = computeContainRect(bounds, natural);
    if (!rect) return;
    setInnerRect(rect);

    const mask = maskCanvasRef.current;
    const display = displayCanvasRef.current;
    if (!mask || !display) return;
    if (mask.width !== natural.w || mask.height !== natural.h) {
      mask.width = natural.w;
      mask.height = natural.h;
    }
    if (display.width !== natural.w || display.height !== natural.h) {
      display.width = natural.w;
      display.height = natural.h;
    }

    resetMask();
  }, [getBounds, naturalSize, open, resetMask]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => initCanvases());
    return () => window.cancelAnimationFrame(id);
  }, [initCanvases, open, renderUrl]);

  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => initCanvases());
    ro.observe(el);
    return () => ro.disconnect();
  }, [initCanvases, open]);

  const canvasCssStyle = useMemo(() => {
    if (!innerRect) return undefined;
    return {
      left: `${innerRect.x}px`,
      top: `${innerRect.y}px`,
      width: `${innerRect.w}px`,
      height: `${innerRect.h}px`,
    } as any;
  }, [innerRect]);

  const rebuildRafRef = useRef<number | null>(null);
  const scheduleRebuild = useCallback(() => {
    if (rebuildRafRef.current != null) return;
    rebuildRafRef.current = window.requestAnimationFrame(() => {
      rebuildRafRef.current = null;
      rebuildDisplayFromMask();
    });
  }, [rebuildDisplayFromMask]);

  useEffect(() => {
    return () => {
      if (rebuildRafRef.current != null) {
        window.cancelAnimationFrame(rebuildRafRef.current);
        rebuildRafRef.current = null;
      }
    };
  }, []);

  const drawStroke = useCallback(
    (
      from: { x: number; y: number } | null,
      to: { x: number; y: number },
      mode: Exclude<ToolMode, "select">,
    ) => {
      const mask = maskCanvasRef.current;
      const display = displayCanvasRef.current;
      if (!mask || !display) return;
      const mctx = mask.getContext("2d");
      if (!mctx) return;

      const rect = display.getBoundingClientRect();
      const scale = rect.width ? display.width / rect.width : 1;
      const lw = clamp(brushSize * scale, 2, 320);

      const line = (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalCompositeOperation =
          mode === "eraser" ? "destination-out" : "source-over";
        ctx.strokeStyle =
          mode === "eraser"
            ? ("rgba(0,0,0,1)" as any)
            : ("rgba(255,255,255,1)" as any);
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        if (from) ctx.moveTo(from.x, from.y);
        else ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      };

      // White pixels represent the masked area. Eraser uses destination-out to clear the mask.
      line(mctx);
      scheduleRebuild();
    },
    [brushSize, scheduleRebuild],
  );

  const eventToCanvasPoint = useCallback((event: ReactPointerEvent) => {
    const display = displayCanvasRef.current;
    if (!display) return null;
    const rect = display.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const cx = (x / rect.width) * display.width;
    const cy = (y / rect.height) * display.height;
    return {
      x: clamp(cx, 0, display.width),
      y: clamp(cy, 0, display.height),
    };
  }, []);

  const commitSnapshot = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d");
    if (!mctx) return;
    const { stack, index } = historyRef.current;

    const snap = mctx.getImageData(0, 0, mask.width, mask.height);
    const nextStack = stack.slice(0, index + 1);
    nextStack.push(snap);

    // Cap history to avoid large memory spikes.
    const MAX = 10;
    const trimmed =
      nextStack.length > MAX ? nextStack.slice(nextStack.length - MAX) : nextStack;
    const nextIndex = trimmed.length - 1;
    historyRef.current = { stack: trimmed, index: nextIndex };
    updateUndoState();
  }, [updateUndoState]);

  const restoreSnapshot = useCallback(
    (nextIndex: number) => {
      const mask = maskCanvasRef.current;
      if (!mask) return;
      const mctx = mask.getContext("2d");
      if (!mctx) return;
      const { stack } = historyRef.current;
      const snap = stack[nextIndex];
      if (!snap) return;
      mctx.putImageData(snap, 0, 0);
      historyRef.current.index = nextIndex;
      rebuildDisplayFromMask();
      updateUndoState();
    },
    [rebuildDisplayFromMask, updateUndoState],
  );

  const handleUndo = useCallback(() => {
    const { index } = historyRef.current;
    if (index <= 0) return;
    restoreSnapshot(index - 1);
  }, [restoreSnapshot]);

  const handleRedo = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index < 0 || index >= stack.length - 1) return;
    restoreSnapshot(index + 1);
  }, [restoreSnapshot]);

  const handleClear = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d");
    if (!mctx) return;
    mctx.clearRect(0, 0, mask.width, mask.height);
    rebuildDisplayFromMask();
    commitSnapshot();
  }, [commitSnapshot, rebuildDisplayFromMask]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (toolMode !== "brush" && toolMode !== "eraser") return;
      const pt = eventToCanvasPoint(event);
      if (!pt) return;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      dragRef.current = {
        active: true,
        lastX: pt.x,
        lastY: pt.y,
        pointerId: event.pointerId,
      };
      drawStroke(null, pt, toolMode);
    },
    [drawStroke, eventToCanvasPoint, toolMode],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) return;
      event.preventDefault();
      event.stopPropagation();
      const pt = eventToCanvasPoint(event);
      if (!pt) return;
      // ToolMode is fixed per gesture: dragRef is only created for brush/eraser.
      drawStroke(
        { x: drag.lastX, y: drag.lastY },
        pt,
        toolMode === "eraser" ? "eraser" : "brush",
      );
      drag.lastX = pt.x;
      drag.lastY = pt.y;
    },
    [drawStroke, eventToCanvasPoint, toolMode],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) return;
      if (event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      commitSnapshot();
    },
    [commitSnapshot],
  );

  const exportMaskDataUrl = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return "";
    // Convert transparent mask to black background + white strokes.
    const out = document.createElement("canvas");
    out.width = mask.width;
    out.height = mask.height;
    const ctx = out.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(mask, 0, 0);
    try {
      return out.toDataURL("image/png");
    } catch {
      return "";
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setConfirming(true);
    try {
      const maskDataUrl = exportMaskDataUrl();
      if (!maskDataUrl) return;
      // Prompt is optional; the caller will fall back to a default prompt if empty.
      await onConfirm({
        maskDataUrl,
        fileName: "erase-mask.png",
        prompt: String(prompt || "").trim(),
      });
    } finally {
      if (mountedRef.current) setConfirming(false);
    }
  }, [exportMaskDataUrl, isConfirming, onConfirm, prompt]);

  useImperativeHandle(
    ref,
    () => ({
      confirm: () => {
        void handleConfirm();
      },
    }),
    [handleConfirm],
  );

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2500] overflow-visible">
      <div
        ref={rootRef}
        className="nodrag nopan pointer-events-auto absolute inset-0"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {/* Paint canvases positioned over the contained image area */}
        {innerRect && (
          <div
            className="absolute"
            style={canvasCssStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <canvas
              ref={displayCanvasRef}
              className="h-full w-full touch-none select-none"
            />
            <canvas ref={maskCanvasRef} className="hidden" />
          </div>
        )}

        {/* Top toolbar (outside the persistent preview frame) */}
        <div className="pointer-events-auto absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full pb-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
              "dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
            )}
            aria-label="擦除工具栏"
          >
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "select"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              aria-label="选取工具"
              onClick={() => setToolMode("select")}
            >
              <ForwardedIconComponent name="MousePointer2" className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "brush"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              aria-label="画笔"
              onClick={() => setToolMode("brush")}
            >
              <ForwardedIconComponent name="Brush" className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "eraser"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              aria-label="橡皮擦"
              onClick={() => setToolMode("eraser")}
            >
              <ForwardedIconComponent name="Eraser" className="h-5 w-5" />
            </button>

            <div className="mx-1 h-6 w-px bg-[#E3E8F5] dark:bg-white/15" />

            <div className="flex items-center gap-2">
              <ForwardedIconComponent
                name="Minus"
                className="h-4 w-4 text-[#3C4258] opacity-70 dark:text-white/85"
              />
              <input
                type="range"
                min={6}
                max={96}
                step={2}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-28 accent-[#2E7BFF]"
                aria-label="画笔粗细"
                disabled={toolMode === "select"}
              />
              <ForwardedIconComponent
                name="Plus"
                className="h-4 w-4 text-[#3C4258] opacity-70 dark:text-white/85"
              />
            </div>

            <div className="mx-1 h-6 w-px bg-[#E3E8F5] dark:bg-white/15" />

            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                canUndo
                  ? "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                  : "cursor-not-allowed text-[#A0A6BC] opacity-60 dark:text-slate-500",
              )}
              aria-label="撤回"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              <ForwardedIconComponent name="Undo2" className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                canRedo
                  ? "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                  : "cursor-not-allowed text-[#A0A6BC] opacity-60 dark:text-slate-500",
              )}
              aria-label="重做"
              onClick={handleRedo}
              disabled={!canRedo}
            >
              <ForwardedIconComponent name="Redo2" className="h-5 w-5" />
            </button>

            <button
              type="button"
              className="ml-1 flex h-10 items-center gap-2 rounded-full px-3 text-sm transition text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
              aria-label="清空涂抹"
              onClick={handleClear}
            >
              <ForwardedIconComponent name="Trash2" className="h-4 w-4" />
              <span className="whitespace-nowrap">清空</span>
            </button>

            <button
              type="button"
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
              aria-label="关闭擦除"
              onClick={onCancel}
            >
              <ForwardedIconComponent name="X" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Drawer below preview */}
        <div className="pointer-events-auto absolute left-0 right-0 top-full z-10 mt-4">
          <div
            className={cn(
              "nodrag nopan",
              "w-full overflow-hidden rounded-2xl border bg-background/95 shadow-lg backdrop-blur",
            )}
            role="region"
            aria-label="擦除抽屉"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-3 p-4">
              <div className="text-xs text-muted-foreground">
                {"涂抹要擦除的区域；提示词可不填（将使用默认效果）。"}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[110px] w-full resize-none rounded-xl border bg-background/60 p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={`可选：例如“去掉涂抹的文字/水印，补全背景”。留空将使用：${DEFAULT_ERASE_PROMPT}`}
              />
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-medium transition",
                    onRequestUpload
                      ? "border-[#E0E5F6] bg-[#F4F6FB] text-[#2E3150] hover:bg-[#E9EEFF] dark:border-white/15 dark:bg-white/10 dark:text-white"
                      : "cursor-not-allowed border-[#E0E5F6] bg-[#F4F6FB] text-[#A0A6BC] opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-slate-500",
                  )}
                  onClick={() => onRequestUpload?.()}
                  disabled={!onRequestUpload}
                  aria-label="资源上传"
                >
                  <ForwardedIconComponent name="Paperclip" className="h-5 w-5" />
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isConfirming}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full text-white",
                      "shadow-[0_12px_24px_rgba(46,123,255,0.35)] transition",
                      isConfirming
                        ? "cursor-not-allowed bg-slate-300 shadow-none hover:bg-slate-300"
                        : "bg-[#2E7BFF] hover:bg-[#0F5CE0]",
                    )}
                    onClick={handleConfirm}
                    aria-label="生成"
                  >
                    <ForwardedIconComponent
                      name={isConfirming ? "Loader2" : "ArrowUp"}
                      className={cn("h-4 w-4", isConfirming && "animate-spin")}
                    />
                  </button>
                </div>
              </div>
              {/* renderUrl kept to ensure image is preloaded for accurate natural size; not directly rendered */}
              <div className="hidden" aria-hidden="true">
                {renderUrl}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EraseOverlay;
