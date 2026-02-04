import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/utils";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { sanitizePreviewDataUrl, toRenderableImageSource } from "./helpers";

type RatioOption =
  | "original"
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16";

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
  open: boolean;
  imageSource: string;
  onCancel: () => void;
  onConfirm: (payload: { dataUrl: string; fileName: string }) => void;
};

const RATIO_OPTIONS: { label: string; value: RatioOption }[] = [
  { label: "原图比例", value: "original" },
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseRatio(option: RatioOption, originalRatio: number): number | null {
  if (option === "original") return Number.isFinite(originalRatio) ? originalRatio : null;
  const parts = option.split(":");
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

function fitCenteredRect(bounds: { width: number; height: number }, ratio: number | null): CropRect {
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);
  const r = ratio && ratio > 0 ? ratio : bw / bh;

  // Start from 70% of the available area.
  let w = bw * 0.7;
  let h = w / r;
  if (h > bh * 0.7) {
    h = bh * 0.7;
    w = h * r;
  }
  w = clamp(w, 32, bw);
  h = clamp(h, 32, bh);
  const x = (bw - w) / 2;
  const y = (bh - h) / 2;
  return { x, y, w, h };
}

function clampRectToBounds(rect: CropRect, bounds: { width: number; height: number }): CropRect {
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);
  const w = clamp(rect.w, 1, bw);
  const h = clamp(rect.h, 1, bh);
  const x = clamp(rect.x, 0, bw - w);
  const y = clamp(rect.y, 0, bh - h);
  return { x, y, w, h };
}

type DragMode =
  | { kind: "move"; start: { x: number; y: number }; rect: CropRect }
  | { kind: "resize"; handle: string; start: { x: number; y: number }; rect: CropRect }
  | null;

function escapeCss(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

export default function CropOverlay({ open, imageSource, onCancel, onConfirm }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
  const [ratioOption, setRatioOption] = useState<RatioOption>("original");
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<DragMode>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const originalRatio = useMemo(() => {
    const w = Number(naturalSize?.w);
    const h = Number(naturalSize?.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
    return w / h;
  }, [naturalSize?.h, naturalSize?.w]);

  const targetRatio = useMemo(
    () => parseRatio(ratioOption, originalRatio),
    [originalRatio, ratioOption],
  );

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

  const resetCrop = useCallback(() => {
    const bounds = getBounds();
    if (!bounds.width || !bounds.height) return;
    setCropRect(fitCenteredRect(bounds, targetRatio));
  }, [getBounds, targetRatio]);

  useEffect(() => {
    if (!open) return;
    setRatioMenuOpen(false);
    // Defer one frame so DOM has the correct geometry.
    const id = window.requestAnimationFrame(() => resetCrop());
    return () => window.cancelAnimationFrame(id);
  }, [open, resetCrop]);

  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => resetCrop());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, resetCrop]);

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
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        imgRef.current = img;
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => {
        // Keep the UI responsive even if loading fails.
        if (cancelled) return;
        imgRef.current = null;
        setNaturalSize(null);
      };
      img.src = url;
    };
    void load();
    return () => {
      cancelled = true;
      revoke?.();
      imgRef.current = null;
    };
  }, [imageSource, open]);

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
        rect: cropRect,
      });
    },
    [cropRect, startDrag],
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
        rect: cropRect,
      });
    },
    [cropRect, startDrag],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();

      const bounds = getBounds();
      const dx = (event.clientX - drag.start.x) / (bounds.scaleX || 1);
      const dy = (event.clientY - drag.start.y) / (bounds.scaleY || 1);
      const ratio = targetRatio;
      const minSize = 32;

      if (drag.kind === "move") {
        setCropRect(
          clampRectToBounds(
            { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy },
            bounds,
          ),
        );
        return;
      }

      const { rect } = drag;
      const handle = drag.handle;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      let next: CropRect = rect;

      const applyWH = (w: number, h: number, anchorX: "min" | "max" | "center", anchorY: "min" | "max" | "center") => {
        const ww = Math.max(minSize, w);
        const hh = Math.max(minSize, h);
        let x = rect.x;
        let y = rect.y;
        if (anchorX === "max") x = rect.x + (rect.w - ww);
        if (anchorX === "center") x = cx - ww / 2;
        if (anchorY === "max") y = rect.y + (rect.h - hh);
        if (anchorY === "center") y = cy - hh / 2;
        next = { x, y, w: ww, h: hh };
      };

      const corner = (xDir: -1 | 1, yDir: -1 | 1) => {
        let w = rect.w + xDir * dx;
        let h = rect.h + yDir * dy;
        if (ratio) {
          // choose dominant axis motion
          const wFromH = h * ratio;
          const useDx = Math.abs(w - rect.w) >= Math.abs(wFromH - rect.w);
          if (useDx) h = w / ratio;
          else w = h * ratio;
        }
        const anchorX = xDir === 1 ? "min" : "max";
        const anchorY = yDir === 1 ? "min" : "max";
        applyWH(w, h, anchorX, anchorY);
      };

      switch (handle) {
        case "e": {
          const w = rect.w + dx;
          if (ratio) applyWH(w, w / ratio, "min", "center");
          else applyWH(w, rect.h, "min", "min");
          break;
        }
        case "w": {
          const w = rect.w - dx;
          if (ratio) applyWH(w, w / ratio, "max", "center");
          else applyWH(w, rect.h, "max", "min");
          break;
        }
        case "s": {
          const h = rect.h + dy;
          if (ratio) applyWH(h * ratio, h, "center", "min");
          else applyWH(rect.w, h, "min", "min");
          break;
        }
        case "n": {
          const h = rect.h - dy;
          if (ratio) applyWH(h * ratio, h, "center", "max");
          else applyWH(rect.w, h, "min", "max");
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

      setCropRect(clampRectToBounds(next, bounds));
    },
    [getBounds, targetRatio],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
  }, []);

  const doConfirm = useCallback(() => {
    const img = imgRef.current;
    const bounds = getBounds();
    if (!img) return;
    if (!bounds.width || !bounds.height) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;

    // Map the crop rect from "persistent preview frame" space to original pixels.
    // Underlying preview uses `object-contain` and centers the image in the frame.
    const scale = Math.min(bounds.width / nw, bounds.height / nh) || 1;
    const dispW = nw * scale;
    const dispH = nh * scale;
    const offsetX = (bounds.width - dispW) / 2;
    const offsetY = (bounds.height - dispH) / 2;

    // Produce a natural-resolution crop (so output isn't limited by the on-screen size).
    const outW = Math.max(1, Math.round(cropRect.w / scale));
    const outH = Math.max(1, Math.round(cropRect.h / scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw the original image at natural scale into the output canvas,
    // positioned so that the visible frame region matches the crop box.
    const drawX = (offsetX - cropRect.x) / scale;
    const drawY = (offsetY - cropRect.y) / scale;
    ctx.drawImage(img, drawX, drawY, nw, nh);

    const dataUrl = canvas.toDataURL("image/png");
    onConfirm({ dataUrl, fileName: "crop.png" });
  }, [cropRect.h, cropRect.w, cropRect.x, cropRect.y, getBounds, onConfirm]);

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

  const ratioLabel = useMemo(
    () => RATIO_OPTIONS.find((o) => o.value === ratioOption)?.label ?? "原图比例",
    [ratioOption],
  );

  if (!open) return null;

  // Prevent canvas panning/selection while cropping.
  const overlayId = `doubao-crop-overlay-${escapeCss(imageSource).slice(0, 16)}`;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2500] overflow-visible">
      <div
        ref={rootRef}
        id={overlayId}
        className="nodrag nopan pointer-events-auto absolute inset-0"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={(event) => {
          // Prevent node selection/dragging while interacting with the crop UI.
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {/* Clear crop window */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 right-0 top-0 bg-black/55" style={{ height: cropRect.y }} />
          <div className="absolute left-0 bg-black/55" style={{ top: cropRect.y, width: cropRect.x, height: cropRect.h }} />
          <div
            className="absolute right-0 bg-black/55"
            style={{ top: cropRect.y, left: cropRect.x + cropRect.w, height: cropRect.h }}
          />
          <div className="absolute left-0 right-0 bottom-0 bg-black/55" style={{ top: cropRect.y + cropRect.h }} />
        </div>

        {/* Crop rect */}
        <div
          className="absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
          style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-move bg-transparent"
            aria-label="移动裁剪框"
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
              className={cn("absolute h-3 w-3 rounded-sm border border-white bg-white/10 backdrop-blur", cls)}
              onPointerDown={onPointerDownHandle(handle)}
              role="presentation"
            />
          ))}
        </div>

        {/* Controls outside (below persistent preview frame) */}
        <div className="pointer-events-auto absolute left-1/2 top-full z-10 mt-4 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur">
            <button
              type="button"
              aria-label="取消裁剪"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              onClick={onCancel}
            >
              <ForwardedIconComponent name="X" className="h-5 w-5" />
            </button>

            <div className="relative">
              <button
                type="button"
                className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm hover:bg-white/15"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setRatioMenuOpen((v) => !v);
                }}
              >
                <span>{ratioLabel}</span>
                <ForwardedIconComponent name="ChevronDown" className="h-4 w-4 opacity-90" />
              </button>
              {ratioMenuOpen && (
                <div className="absolute bottom-12 left-1/2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-black/75 shadow-lg backdrop-blur">
                  {RATIO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-center px-4 py-2 text-sm transition",
                        opt.value === ratioOption ? "bg-white/15" : "hover:bg-white/10",
                      )}
                      onClick={() => {
                        setRatioOption(opt.value);
                        setRatioMenuOpen(false);
                        window.requestAnimationFrame(() => resetCrop());
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black shadow"
              onClick={doConfirm}
            >
              <ForwardedIconComponent name="Check" className="h-4 w-4" />
              确认裁剪
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
