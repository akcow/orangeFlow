import { cn } from "@/utils/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { toRenderableImageSource } from "./helpers";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";

type Transform = { x: number; y: number; scale: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type ZoomableImageOverlayProps = {
  open: boolean;
  imageSource: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
};

/**
 * A lightweight "inspect" overlay for images:
 * - wheel zoom
 * - drag pan
 * - ESC / X to close
 *
 * Kept self-contained (no nested Radix dialog) to avoid focus-trap issues inside the existing preview modal.
 */
export default function ZoomableImageOverlay({
  open,
  imageSource,
  title,
  onOpenChange,
}: ZoomableImageOverlayProps) {
  // Keep user-facing strings ASCII in source to avoid Windows terminal encoding issues.
  const UI = useMemo(
    () => ({
      titleFallback: "图片预览", // ????
      hint: "拖拽移动 / 滚轮缩放 / 双击复位",
      close: "关闭",
      loading: "加载中…",
      alt: "预览图",
    }),
    [],
  );

  const [renderSource, setRenderSource] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const revokeRef = useRef<(() => void) | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const [transformState, setTransformState] = useState<Transform>(
    transformRef.current,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    pointerId: number | null;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: null,
  });

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const resetTransform = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    setTransformState(transformRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;

    setIsLoading(true);
    setRenderSource("");
    resetTransform();

    let cancelled = false;
    void (async () => {
      try {
        revokeRef.current?.();
        revokeRef.current = undefined;

        const { url, revoke } = await toRenderableImageSource(imageSource);
        if (cancelled) {
          revoke?.();
          return;
        }
        revokeRef.current = revoke;
        setRenderSource(url);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageSource, open, resetTransform]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      revokeRef.current?.();
      revokeRef.current = undefined;
    };
  }, [close, open]);

  const applyTransform = useCallback((next: Transform) => {
    transformRef.current = next;
    setTransformState(next);
  }, []);

  const onWheel = useCallback(
    (event: ReactWheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY;
      const factor = delta < 0 ? 1.12 : 0.88;
      const current = transformRef.current;
      const nextScale = clamp(current.scale * factor, 1, 8);
      applyTransform({ ...current, scale: nextScale });
    },
    [applyTransform],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    // Only left button for mouse; touch/pen are fine.
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const el = containerRef.current;
    if (!el) return;

    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const current = transformRef.current;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
      pointerId: event.pointerId,
    };
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      const current = transformRef.current;
      applyTransform({
        ...current,
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    },
    [applyTransform],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragRef.current.active) return;

      const el = containerRef.current;
      if (el && dragRef.current.pointerId != null) {
        try {
          el.releasePointerCapture(dragRef.current.pointerId);
        } catch {
          // ignore
        }
      }

      dragRef.current.active = false;
      dragRef.current.pointerId = null;
      setIsDragging(false);
    },
    [],
  );

  const overlay = useMemo(() => {
    if (!open) return null;

    return (
      <div
        className="fixed inset-0 z-[3000] pointer-events-auto bg-black/75 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute inset-4 md:inset-8">
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {title || UI.titleFallback}
                </div>
                <div className="mt-0.5 text-xs text-white/60">{UI.hint}</div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                onClick={close}
                aria-label={UI.close}
              >
                <ForwardedIconComponent name="X" className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden">
              <div
                ref={containerRef}
                className={cn(
                  "relative h-full w-full touch-none",
                  isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  resetTransform();
                }}
              >
                {isLoading && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                    {UI.loading}
                  </div>
                )}
                {renderSource && (
                  <img
                    src={renderSource}
                    alt={title || UI.alt}
                    draggable={false}
                    className="absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
                    style={{
                      transform: `translate(-50%, -50%) translate(${transformState.x}px, ${transformState.y}px) scale(${transformState.scale})`,
                      transformOrigin: "center",
                      willChange: "transform",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    UI,
    close,
    isDragging,
    isLoading,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    open,
    renderSource,
    resetTransform,
    title,
    transformState.x,
    transformState.y,
    transformState.scale,
  ]);

  return overlay;
}
