import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/utils";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { sanitizePreviewDataUrl, toRenderableImageSource } from "./helpers";

export type ImageGalleryItem = {
  imageSource: string;
  size?: string;
  label?: string;
};

type ImageRendererProps = {
  gallery: ImageGalleryItem[] | null;
  currentIndex: number;
  onNavigate: (delta: number) => void;
  onSelect?: (index: number) => void;
  onError?: (error: Error) => void;
  onMeta?: (meta: any) => void;
};

const ImageRenderer = ({
  gallery,
  currentIndex,
  onNavigate,
  onSelect,
  onError,
  onMeta,
}: ImageRendererProps) => {
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const total = gallery?.length ?? 0;
  const safeIndex = total ? Math.min(Math.max(currentIndex, 0), total - 1) : 0;
  const current = total ? gallery![safeIndex] : null;
  const sanitizedSource =
    current?.imageSource &&
    (sanitizePreviewDataUrl(current.imageSource) ?? current.imageSource);
  const [renderSource, setRenderSource] = useState<string | undefined>(
    sanitizedSource ?? current?.imageSource,
  );

  useEffect(() => {
    // Reset error state when switching to a new image source so new previews can render.
    setImageError(false);
  }, [sanitizedSource]);

  useEffect(() => {
    let revoke: (() => void) | undefined;
    let cancelled = false;
    const updateSource = async () => {
      const { url, revoke: revokeFn } = await toRenderableImageSource(
        sanitizedSource ?? current?.imageSource,
      );
      if (!cancelled) {
        setRenderSource(url);
        revoke = revokeFn;
      } else if (revokeFn) {
        revokeFn();
      }
    };
    void updateSource();
    return () => {
      cancelled = true;
      if (revoke) revoke();
    };
  }, [sanitizedSource, current?.imageSource]);

  const handleImageError = useCallback(
    (error: React.SyntheticEvent<HTMLImageElement>) => {
      console.error("Image load error:", error);
      setImageError(true);
      onError?.(new Error("Failed to load image"));
    },
    [onError],
  );

  const handleImageLoad = useCallback(() => {
    setImageError(false);
    if (imgRef.current && onMeta) {
      onMeta({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
        aspectRatio:
          imgRef.current.naturalWidth / imgRef.current.naturalHeight || 1,
      });
    }
  }, [onMeta]);

  if (!total) {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center rounded-2xl border border-dashed border-emerald-200/70 bg-emerald-50/70 text-xs text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-200">
        暂无图片可预览
      </div>
    );
  }

  if (imageError || !current) {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40">
        <div className="text-center">
          <ForwardedIconComponent name="ImageOff" className="mx-auto h-7 w-7" />
          <p className="mt-2 text-xs">图片加载失败</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-2xl border border-emerald-200/60 bg-white/95 shadow-inner dark:border-emerald-500/40 dark:bg-emerald-950/30">
      <img
        ref={imgRef}
        src={renderSource}
        alt={current.label ?? "生成结果预览"}
        className="h-full w-full flex-1 rounded-2xl object-contain"
        onError={handleImageError}
        onLoad={handleImageLoad}
        loading="lazy"
      />

      {current.size && (
        <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white shadow">
          {current.size}
        </div>
      )}

      {total > 1 && (
        <>
          <div className="absolute top-3 left-3 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-emerald-700 shadow dark:bg-slate-900/80 dark:text-emerald-100">
            第 {safeIndex + 1} / {total} 张
          </div>
          <button
            type="button"
            aria-label="上一张"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-emerald-700 shadow transition hover:bg-white dark:bg-slate-900"
            onClick={() => onNavigate(-1)}
          >
            <ForwardedIconComponent name="ChevronLeft" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-emerald-700 shadow transition hover:bg-white dark:bg-slate-900"
            onClick={() => onNavigate(1)}
          >
            <ForwardedIconComponent name="ChevronRight" className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-black/30 px-3 py-1">
            {gallery!.map((item, idx) => (
              <button
                key={`dot-${idx}`}
                type="button"
                aria-label={`查看第 ${idx + 1} 张`}
                className={cn(
                  "h-2.5 w-2.5 rounded-full border border-white/60 transition",
                  idx === safeIndex
                    ? "bg-emerald-400"
                    : "bg-white/40 hover:bg-white/70",
                )}
                onClick={() => onSelect?.(idx)}
              >
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ImageRenderer;
