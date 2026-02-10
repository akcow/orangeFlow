import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/utils";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { sanitizePreviewDataUrl, toRenderableImageSource } from "./helpers";

type RatioKey = string;

type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  open: boolean;
  imageSource: string;
  modelOptions: string[];
  resolutionOptions: string[];
  aspectRatioOptions: string[];
  initialModelName: string;
  initialResolution: string;
  initialAspectRatio: string;
  onCancel: () => void;
  onConfirm: (payload: {
    dataUrl: string;
    fileName: string;
    modelName: string;
    aspectRatio: string;
    resolution: string;
  }) => void | Promise<void>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseRatioKey(option: RatioKey): number | null {
  const raw = String(option ?? "").trim();
  const lowered = raw.toLowerCase();
  if (!raw || lowered === "adaptive" || lowered === "auto") return null;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

function enforceRectCoversInner(
  rect: Rect,
  inner: Rect,
): Rect {
  const minW = Math.max(1, inner.w);
  const minH = Math.max(1, inner.h);

  // Never allow shrinking to a rect that doesn't fully cover the source image.
  const w = Math.max(minW, Number.isFinite(rect.w) ? rect.w : minW);
  const h = Math.max(minH, Number.isFinite(rect.h) ? rect.h : minH);

  // X/Y must be such that the inner rect stays inside the outpaint rect.
  const minX = inner.x + inner.w - w;
  const maxX = inner.x;
  const minY = inner.y + inner.h - h;
  const maxY = inner.y;

  const xRaw = Number.isFinite(rect.x) ? rect.x : inner.x;
  const yRaw = Number.isFinite(rect.y) ? rect.y : inner.y;

  const x = clamp(xRaw, minX, maxX);
  const y = clamp(yRaw, minY, maxY);

  return { x, y, w, h };
}

function makeCoveringRectWithRatio(inner: Rect, ratio: number | null): Rect {
  const r = ratio && ratio > 0 ? ratio : inner.w / inner.h;
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  let w = inner.w;
  let h = inner.h;
  if (w / h > r) {
    // Too wide -> expand height.
    h = w / r;
  } else {
    // Too tall -> expand width.
    w = h * r;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

type DragMode =
  | { kind: "move"; start: { x: number; y: number }; rect: Rect }
  | { kind: "resize"; handle: string; start: { x: number; y: number }; rect: Rect }
  | null;

function escapeCss(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

export default function OutpaintOverlay({
  open,
  imageSource,
  modelOptions,
  resolutionOptions,
  aspectRatioOptions,
  initialModelName,
  initialResolution,
  initialAspectRatio,
  onCancel,
  onConfirm,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [renderUrl, setRenderUrl] = useState<string>("");
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [controlsBottomOffsetPx, setControlsBottomOffsetPx] = useState<number>(24);

  const [ratioOption, setRatioOption] = useState<RatioKey>(initialAspectRatio || "1:1");
  const [modelName, setModelName] = useState<string>(initialModelName || modelOptions[0] || "");
  const [resolution, setResolution] = useState<string>(
    initialResolution || resolutionOptions[0] || "",
  );

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [innerRect, setInnerRect] = useState<Rect | null>(null);
  const [outpaintRect, setOutpaintRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<DragMode>(null);
  const pendingRectRef = useRef<Rect | null>(null);
  const rafCommitRef = useRef<number | null>(null);
  const [isConfirming, setConfirming] = useState(false);
  const ratioValue = useMemo(() => parseRatioKey(ratioOption), [ratioOption]);

  useEffect(() => {
    if (!open) return;
    // Reset menus when opening.
    setRatioMenuOpen(false);
    setModelMenuOpen(false);

    // Reset selections to the initial values (so repeated openings are predictable).
    setRatioOption(initialAspectRatio || aspectRatioOptions[0] || "1:1");
    setModelName(initialModelName || modelOptions[0] || "");
    setResolution(initialResolution || resolutionOptions[0] || "");
  }, [
    aspectRatioOptions,
    initialAspectRatio,
    initialModelName,
    initialResolution,
    modelOptions,
    open,
    resolutionOptions,
  ]);

  const getBounds = useCallback(() => {
    const el = rootRef.current;
    if (!el) return { width: 0, height: 0, scaleX: 1, scaleY: 1 };
    const width = el.clientWidth;
    const height = el.clientHeight;
    const rect = el.getBoundingClientRect();
    const scaleX = width ? rect.width / width : 1;
    const scaleY = height ? rect.height / height : 1;
    return { width, height, scaleX: scaleX || 1, scaleY: scaleY || 1 };
  }, []);

  const recomputeInnerRect = useCallback(() => {
    const img = imgRef.current;
    const bounds = getBounds();
    if (!img) return null;
    if (!bounds.width || !bounds.height) return null;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return null;
    // Match the persistent preview: the image is rendered as `object-contain` inside the preview frame.
    // So we should size it against the full workspace bounds (no extra shrink).
    const maxW = bounds.width;
    const maxH = bounds.height;
    const scale = Math.min(maxW / nw, maxH / nh) || 1;
    const dispW = nw * scale;
    const dispH = nh * scale;
    const offsetX = (bounds.width - dispW) / 2;
    const offsetY = (bounds.height - dispH) / 2;
    return { x: offsetX, y: offsetY, w: dispW, h: dispH };
  }, [getBounds]);

  const resetRect = useCallback(() => {
    const inner = recomputeInnerRect();
    if (!inner) return;
    setInnerRect(inner);
    // Default: start by wrapping the source image (no extra expansion).
    const next = makeCoveringRectWithRatio(inner, ratioValue);
    setOutpaintRect(enforceRectCoversInner(next, inner));
  }, [recomputeInnerRect, ratioValue]);

  const scheduleOutpaintRect = useCallback((next: Rect) => {
    pendingRectRef.current = next;
    if (rafCommitRef.current != null) return;
    rafCommitRef.current = window.requestAnimationFrame(() => {
      rafCommitRef.current = null;
      const rect = pendingRectRef.current;
      if (rect) setOutpaintRect(rect);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    // Defer one frame so DOM has correct geometry.
    const id = window.requestAnimationFrame(() => resetRect());
    return () => window.cancelAnimationFrame(id);
  }, [open, resetRect]);

  useEffect(() => {
    return () => {
      if (rafCommitRef.current != null) {
        window.cancelAnimationFrame(rafCommitRef.current);
        rafCommitRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => resetRect());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, resetRect]);

  useEffect(() => {
    if (!open) return;
    // Ratio selection is a preset: it snaps the frame to that ratio, but resizing stays freeform.
    const inner = recomputeInnerRect();
    if (!inner) return;
    setInnerRect(inner);
    const next = makeCoveringRectWithRatio(inner, ratioValue);
    setOutpaintRect(enforceRectCoversInner(next, inner));
  }, [open, ratioValue, recomputeInnerRect]);

  useEffect(() => {
    if (!open) return;
    let revoke: (() => void) | undefined;
    let cancelled = false;
    const normalized = sanitizePreviewDataUrl(imageSource) ?? imageSource;
    const load = async () => {
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
        imgRef.current = img;
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        // Ensure rects are computed after the image is ready.
        window.requestAnimationFrame(() => resetRect());
      };
      img.onerror = () => {
        if (cancelled) return;
        imgRef.current = null;
        setNaturalSize(null);
        setRenderUrl("");
      };
      img.src = url;
    };
    void load();
    return () => {
      cancelled = true;
      revoke?.();
      imgRef.current = null;
      setRenderUrl("");
    };
  }, [imageSource, open, resetRect]);

  const startDrag = useCallback((mode: DragMode) => {
    dragRef.current = mode;
  }, []);

  const onPointerDownMove = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      startDrag({
        kind: "move",
        start: { x: event.clientX, y: event.clientY },
        rect: outpaintRect,
      });
    },
    [outpaintRect, startDrag],
  );

  const onPointerDownHandle = useCallback(
    (handle: string) => (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      startDrag({
        kind: "resize",
        handle,
        start: { x: event.clientX, y: event.clientY },
        rect: outpaintRect,
      });
    },
    [outpaintRect, startDrag],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();

      const bounds = getBounds();
      const inner = innerRect;
      if (!inner) return;

      const dx = (event.clientX - drag.start.x) / (bounds.scaleX || 1);
      const dy = (event.clientY - drag.start.y) / (bounds.scaleY || 1);

      if (drag.kind === "move") {
        const next = { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy };
        scheduleOutpaintRect(enforceRectCoversInner(next, inner));
        return;
      }

      const rect = drag.rect;
      const handle = drag.handle;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      let next: Rect = rect;

      const applyWH = (
        w: number,
        h: number,
        anchorX: "min" | "max" | "center",
        anchorY: "min" | "max" | "center",
      ) => {
        let x = rect.x;
        let y = rect.y;
        if (anchorX === "max") x = rect.x + (rect.w - w);
        if (anchorX === "center") x = cx - w / 2;
        if (anchorY === "max") y = rect.y + (rect.h - h);
        if (anchorY === "center") y = cy - h / 2;
        next = { x, y, w, h };
      };

      const corner = (xDir: -1 | 1, yDir: -1 | 1) => {
        let w = rect.w + xDir * dx;
        let h = rect.h + yDir * dy;
        const anchorX = xDir === 1 ? "min" : "max";
        const anchorY = yDir === 1 ? "min" : "max";
        applyWH(w, h, anchorX, anchorY);
      };

      switch (handle) {
        case "e": {
          const w = rect.w + dx;
          applyWH(w, rect.h, "min", "min");
          break;
        }
        case "w": {
          const w = rect.w - dx;
          applyWH(w, rect.h, "max", "min");
          break;
        }
        case "s": {
          const h = rect.h + dy;
          applyWH(rect.w, h, "min", "min");
          break;
        }
        case "n": {
          const h = rect.h - dy;
          applyWH(rect.w, h, "min", "max");
          break;
        }
        case "se":
          corner(1, 1);
          break;
        case "sw":
          corner(-1, 1);
          break;
        case "ne":
          corner(1, -1);
          break;
        case "nw":
          corner(-1, -1);
          break;
      }

      scheduleOutpaintRect(enforceRectCoversInner(next, inner));
    },
    [getBounds, innerRect, scheduleOutpaintRect],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
  }, []);

  const doConfirm = useCallback(async () => {
    const img = imgRef.current;
    const bounds = getBounds();
    const inner = innerRect;
    if (isConfirming) return;
    if (!img) return;
    if (!inner) return;
    if (!bounds.width || !bounds.height) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;

    // Map from overlay workspace pixels to output pixels based on how we displayed the image.
    const workspaceScale = inner.w / nw || 1;
    let outW = Math.max(1, Math.round(outpaintRect.w / workspaceScale));
    let outH = Math.max(1, Math.round(outpaintRect.h / workspaceScale));

    // No 1K/2K/4K constraint for now. Still keep a browser-safe cap to avoid hard crashes.
    const MAX_CANVAS_SIDE = 16384;
    let outputScale = 1;
    const maxSide = Math.max(outW, outH);
    if (maxSide > MAX_CANVAS_SIDE) {
      outputScale = MAX_CANVAS_SIDE / maxSide;
      outW = Math.max(1, Math.round(outW * outputScale));
      outH = Math.max(1, Math.round(outH * outputScale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use a solid canvas background. This avoids transparency checkerboarding in previews and
    // works better for models that don't preserve alpha channels.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);

    // Draw the original image, positioned relative to the outpaint canvas.
    // Areas not covered by the source image are left blank and can be inferred by the model.
    const drawX = ((inner.x - outpaintRect.x) / workspaceScale) * outputScale;
    const drawY = ((inner.y - outpaintRect.y) / workspaceScale) * outputScale;
    ctx.drawImage(img, drawX, drawY, nw * outputScale, nh * outputScale);

    setConfirming(true);
    try {
      const blob: Blob | null = await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), "image/png");
        } catch {
          resolve(null);
        }
      });
      if (blob) {
        const url = URL.createObjectURL(blob);
        await Promise.resolve(onConfirm({
          dataUrl: url,
          fileName: "outpaint.png",
          modelName,
          aspectRatio: ratioOption,
          resolution,
        }));
        return;
      }
      const dataUrl = canvas.toDataURL("image/png");
      await Promise.resolve(onConfirm({
        dataUrl,
        fileName: "outpaint.png",
        modelName,
        aspectRatio: ratioOption,
        resolution,
      }));
    } finally {
      setConfirming(false);
    }
  }, [
    getBounds,
    innerRect,
    isConfirming,
    modelName,
    onConfirm,
    outpaintRect.h,
    outpaintRect.w,
    outpaintRect.x,
    outpaintRect.y,
    ratioOption,
    resolution,
  ]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown, open]);

  const ratioLabel = useMemo(() => {
    const matched = aspectRatioOptions.find((o) => String(o).trim() === String(ratioOption).trim());
    return matched ?? String(ratioOption || "宽高比");
  }, [aspectRatioOptions, ratioOption]);

  // Outpaint needs painting outside the preview frame. The persistent preview frame uses
  // `overflow-hidden` and (in minimal mode) `contain: paint`, which would clip the outpaint rect.
  // Temporarily disable those styles while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const previewFrame = el.closest('[data-testid="doubao-preview-frame"]') as HTMLElement | null;
    if (!previewFrame) return;
    const prevOverflow = previewFrame.style.overflow;
    const prevContain = previewFrame.style.contain;
    previewFrame.style.overflow = "visible";
    previewFrame.style.contain = "none";
    return () => {
      previewFrame.style.overflow = prevOverflow;
      previewFrame.style.contain = prevContain;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const controls = document.querySelector(
        '[data-testid="main_canvas_controls"]',
      ) as HTMLElement | null;
      if (!controls) {
        setControlsBottomOffsetPx(24);
        return;
      }
      const rect = controls.getBoundingClientRect();
      const bottomOffset = Math.max(16, window.innerHeight - rect.top + 12);
      setControlsBottomOffsetPx(bottomOffset);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  if (!open) return null;

  // Prevent canvas panning/selection while outpainting.
  const overlayId = `doubao-outpaint-overlay-${escapeCss(imageSource).slice(0, 16)}`;
  const hasImage = Boolean(naturalSize?.w && naturalSize?.h && renderUrl);

  const MASK_EXTENT = 6000;
  const maskTopHeight = Math.max(0, outpaintRect.y + MASK_EXTENT);
  const maskLeftWidth = Math.max(0, outpaintRect.x + MASK_EXTENT);
  const maskRightLeft = outpaintRect.x + outpaintRect.w;
  const maskBottomTop = outpaintRect.y + outpaintRect.h;

  const overlay = (
    <div
      // Extend beyond the preview frame so we can fully shield the "+" capture zones on both sides
      // (avoid interference while dragging/resizing the outpaint frame).
      className="pointer-events-auto absolute -left-[240px] -right-[240px] inset-y-0 z-[2500] overflow-visible"
      data-testid="doubao-outpaint-overlay"
      onPointerDown={(event) => {
        // Prevent node selection/dragging and prevent "+" capture zones from seeing events.
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        ref={rootRef}
        id={overlayId}
        // Real workspace stays aligned to the preview frame (exclude the side shields).
        className="nodrag nopan pointer-events-auto absolute inset-y-0 left-[240px] right-[240px]"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {/* Workspace background (extend beyond preview frame to cover overflow area). */}
        <div
          className="pointer-events-none absolute bg-black/30"
          style={{
            left: -MASK_EXTENT,
            right: -MASK_EXTENT,
            top: -MASK_EXTENT,
            bottom: -MASK_EXTENT,
          }}
        />

        {/* Darken outside target rect */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute bg-black/55"
            style={{
              left: -MASK_EXTENT,
              right: -MASK_EXTENT,
              top: -MASK_EXTENT,
              height: maskTopHeight,
            }}
          />
          <div
            className="absolute bg-black/55"
            style={{
              left: -MASK_EXTENT,
              top: outpaintRect.y,
              width: maskLeftWidth,
              height: outpaintRect.h,
            }}
          />
          <div
            className="absolute bg-black/55"
            style={{
              top: outpaintRect.y,
              left: maskRightLeft,
              right: -MASK_EXTENT,
              height: outpaintRect.h,
            }}
          />
          <div
            className="absolute bg-black/55"
            style={{
              left: -MASK_EXTENT,
              right: -MASK_EXTENT,
              top: maskBottomTop,
              bottom: -MASK_EXTENT,
            }}
          />
        </div>

        {/* Canvas area (to-be-generated) inside outpaint rect */}
        <div
          className="pointer-events-none absolute rounded-[2px] bg-white/95 shadow-[0_8px_22px_rgba(0,0,0,0.18)]"
          style={{
            left: outpaintRect.x,
            top: outpaintRect.y,
            width: outpaintRect.w,
            height: outpaintRect.h,
          }}
        />

        {/* Render the source image at the fixed inner rect */}
        {hasImage && innerRect && (
          <>
            <img
              src={renderUrl}
              alt=""
              className="pointer-events-none absolute select-none"
              style={{
                left: innerRect.x,
                top: innerRect.y,
                width: innerRect.w,
                height: innerRect.h,
                objectFit: "contain",
              }}
              draggable={false}
            />
          </>
        )}

        {/* Target rect */}
        <div
          className="absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
          style={{
            left: outpaintRect.x,
            top: outpaintRect.y,
            width: outpaintRect.w,
            height: outpaintRect.h,
          }}
        >
          {/* Grid */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/25" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/25" />
            <div className="absolute top-1/3 left-0 h-px w-full bg-white/25" />
            <div className="absolute top-2/3 left-0 h-px w-full bg-white/25" />
          </div>

          {/* Allow moving the target frame (controls where the added area appears). */}
          <button
            type="button"
            className="absolute inset-0 cursor-move bg-transparent"
            aria-label="移动扩图外框"
            onPointerDown={onPointerDownMove}
          />

          {[
            ["nw", "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"],
            ["ne", "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"],
            ["sw", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"],
            ["se", "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"],
            ["n", "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"],
            ["s", "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"],
            ["w", "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
            ["e", "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
          ].map(([handle, cls]) => (
            <div
              key={handle}
              className={cn(
                "absolute h-3 w-3 rounded-sm border border-white bg-white/10 backdrop-blur",
                cls,
              )}
              onPointerDown={onPointerDownHandle(handle)}
              role="presentation"
            />
          ))}
        </div>

      </div>
    </div>
  );

  const controls = (
    <div
      className="pointer-events-auto fixed left-1/2 z-[2600] -translate-x-1/2"
      style={{ bottom: controlsBottomOffsetPx }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div className="flex w-[720px] max-w-[92vw] items-center justify-between gap-4 rounded-full bg-black/65 px-4 py-3 text-white shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="取消扩图"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            onClick={onCancel}
          >
            <ForwardedIconComponent name="X" className="h-5 w-5" />
          </button>
          <div className="text-sm text-white/85">拖拽外框进行扩图</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm hover:bg-white/15"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setRatioMenuOpen((v) => !v);
                setModelMenuOpen(false);
              }}
                >
                  <span>{ratioLabel}</span>
                  <ForwardedIconComponent
                    name="ChevronDown"
                    className={cn(
                      "h-4 w-4 opacity-90 transition-transform duration-200",
                      ratioMenuOpen && "rotate-180",
                    )}
                  />
                </button>
            {ratioMenuOpen && (
              <div className="absolute bottom-12 left-1/2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-black/75 shadow-lg backdrop-blur">
                {aspectRatioOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-center px-4 py-2 text-sm transition",
                      String(opt) === String(ratioOption) ? "bg-white/15" : "hover:bg-white/10",
                    )}
                    onClick={() => {
                      setRatioOption(opt);
                      setRatioMenuOpen(false);
                    }}
                  >
                    {String(opt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm hover:bg-white/15"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setModelMenuOpen((v) => !v);
                setRatioMenuOpen(false);
              }}
              >
                <span className="max-w-[240px] truncate">{modelName || "模型"}</span>
                <ForwardedIconComponent
                  name="ChevronDown"
                  className={cn(
                    "h-4 w-4 opacity-90 transition-transform duration-200",
                    modelMenuOpen && "rotate-180",
                  )}
                />
              </button>
            {modelMenuOpen && (
              <div className="absolute bottom-12 left-1/2 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-black/75 shadow-lg backdrop-blur">
                <div className="max-h-[280px] overflow-auto">
                  {modelOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-center px-4 py-2 text-sm transition",
                        String(opt) === String(modelName) ? "bg-white/15" : "hover:bg-white/10",
                      )}
                      onClick={() => {
                        setModelName(opt);
                        setModelMenuOpen(false);
                      }}
                    >
                      {String(opt)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black shadow"
            onClick={doConfirm}
            disabled={isConfirming || !hasImage}
          >
            <ForwardedIconComponent name="Sparkles" className="h-4 w-4" />
            {isConfirming ? "生成中..." : "生成"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {overlay}
      {typeof document !== "undefined" ? createPortal(controls, document.body) : null}
    </>
  );
}
