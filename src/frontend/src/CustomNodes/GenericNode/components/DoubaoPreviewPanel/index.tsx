import {
  forwardRef,
  lazy,
  Suspense,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ImageViewer from "@/components/common/ImageViewer";
import { cn } from "@/utils/utils";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import { useDoubaoPreview } from "../../../hooks/use-doubao-preview";

const PANEL_BG = {
  image: "bg-emerald-50/80 dark:bg-emerald-950/30",
  video: "bg-sky-50/80 dark:bg-sky-950/30",
  audio: "bg-rose-50/80 dark:bg-rose-950/20",
};

const DOUBAO_KIND: Record<string, "image" | "video" | "audio"> = {
  DoubaoImageCreator: "image",
  DoubaoVideoGenerator: "video",
  DoubaoTTS: "audio",
};

type Props = {
  nodeId: string;
  componentName?: string;
};

type GalleryItem = {
  imageSource: string;
  downloadSource: string;
  size?: string;
  width?: number;
  height?: number;
  label?: string;
};

const ImagePreview = lazy(() => import("./ImageRenderer"));
const VideoPreview = lazy(() => import("./VideoRenderer"));
const AudioPreview = lazy(() => import("./AudioRenderer"));

type DownloadInfo = {
  source: string;
  fileName: string;
};

const DoubaoPreviewPanel = forwardRef<HTMLDivElement, Props>(
  ({ nodeId, componentName }, forwardedRef) => {
    const { preview, isBuilding } = useDoubaoPreview(nodeId, componentName);

    const kind = useMemo(() => {
      if (preview?.kind) return preview.kind;
      if (componentName && DOUBAO_KIND[componentName]) {
        return DOUBAO_KIND[componentName];
      }
      return "image";
    }, [preview?.kind, componentName]);

    const panelClass = useMemo(() => PANEL_BG[kind], [kind]);

    const [transientBadge, setTransientBadge] = useState<string | null>(null);
    const showTransientBadge = useCallback((label: string) => {
      setTransientBadge(label);
      const timer = window.setTimeout(() => setTransientBadge(null), 2500);
      return () => window.clearTimeout(timer);
    }, []);

    const handleModalError = useCallback(
      (error: Error) => {
        console.error("Modal error:", error);
        showTransientBadge("加载失败");
      },
      [showTransientBadge],
    );

    const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    const imageGallery = useMemo<GalleryItem[] | null>(() => {
      if (kind !== "image" || !preview?.payload) return null;
      const payload: any = preview.payload;
      const galleryItems: GalleryItem[] = [];

      if (Array.isArray(payload.images)) {
        payload.images.forEach((entry: any, idx: number) => {
          const inlineSource = sanitizePreviewDataUrl(
            entry?.image_data_url ??
              entry?.preview_base64 ??
              entry?.preview_data_url ??
              entry?.data_url,
          );
          const remoteSource =
            entry?.image_url ??
            entry?.url ??
            entry?.edited_image_url ??
            entry?.original_image_url;
          const resolvedSource = inlineSource ?? remoteSource;
          if (!resolvedSource) return;

          galleryItems.push({
            imageSource: resolvedSource,
            downloadSource: remoteSource ?? inlineSource ?? resolvedSource,
            size:
              entry?.size ??
              (entry?.width && entry?.height
                ? `${entry.width}×${entry.height}`
                : undefined),
            width: entry?.width,
            height: entry?.height,
            label: entry?.label ?? `第 ${idx + 1} 张`,
          });
        });
      }

      if (galleryItems.length) {
        return galleryItems;
      }

      const inlineFallback = sanitizePreviewDataUrl(
        payload.image_data_url ??
          payload.preview_base64 ??
          payload.preview_data_url,
      );
      const remoteFallback =
        payload.image_url ??
        payload.edited_image_url ??
        payload.original_image_url ??
        null;

      if (!inlineFallback && !remoteFallback) {
        return null;
      }

      return [
        {
          imageSource: inlineFallback ?? remoteFallback!,
          downloadSource: remoteFallback ?? inlineFallback ?? "",
          size:
            payload.width && payload.height
              ? `${payload.width}×${payload.height}`
              : undefined,
          width: payload.width,
          height: payload.height,
          label: "第 1 张",
        },
      ];
    }, [kind, preview]);

    const videoPreview = useMemo(() => {
      if (kind !== "video" || !preview?.payload) return null;
      const videoUrl: string | undefined = preview.payload?.video_url;
      if (!videoUrl) return null;
      return {
        videoUrl,
        poster:
          preview.payload?.cover_preview_base64 || preview.payload?.cover_url,
        duration: preview.payload?.duration,
        extension: inferExtensionFromSource(videoUrl, "mp4"),
      };
    }, [kind, preview]);

    const audioPreview = useMemo(() => {
      if (kind !== "audio" || !preview?.payload) return null;
      const audioType: string = preview.payload?.audio_type || "mp3";
      const base64Content = preview.payload?.audio_base64;
      const fallbackUrl =
        preview.payload?.audio_data_url || preview.payload?.audio_url;
      const audioUrl = base64Content
        ? `data:audio/${audioType};base64,${base64Content}`
        : fallbackUrl;
      if (!audioUrl) return null;
      return {
        audioUrl,
        audioType,
      };
    }, [kind, preview]);

    const currentImage = imageGallery?.length
      ? imageGallery[Math.min(activeImageIndex, imageGallery.length - 1)]
      : null;

    const handleNavigateImages = useCallback(
      (delta: number) => {
        if (!imageGallery?.length) return;
        const total = imageGallery.length;
        const next = (activeImageIndex + delta + total) % total;
        setActiveImageIndex(next);
      },
      [imageGallery, activeImageIndex],
    );

    const handleSelectImage = useCallback(
      (index: number) => {
        if (!imageGallery?.length) return;
        const total = imageGallery.length;
        const normalized = ((index % total) + total) % total;
        setActiveImageIndex(normalized);
      },
      [imageGallery],
    );

    const hasRenderablePreview = Boolean(
      preview?.available &&
        ((kind === "image" && imageGallery?.length) ||
          (kind === "video" && videoPreview) ||
          (kind === "audio" && audioPreview)),
    );

    const openModal = useCallback(() => {
      if (!hasRenderablePreview) return;
      setPreviewModalOpen(true);
    }, [hasRenderablePreview]);

    useEffect(() => {
      if (!hasRenderablePreview) {
        setPreviewModalOpen(false);
      }
    }, [hasRenderablePreview]);

    useEffect(() => {
      setPreviewModalOpen(false);
      setActiveImageIndex(0);
    }, [preview?.token]);

    useEffect(() => {
      if (!imageGallery?.length) {
        if (activeImageIndex !== 0) {
          setActiveImageIndex(0);
        }
        return;
      }
      if (activeImageIndex >= imageGallery.length) {
        setActiveImageIndex(0);
      }
    }, [imageGallery, activeImageIndex]);

    const downloadInfo = useMemo<DownloadInfo | null>(() => {
      if (!preview?.available) return null;
      switch (kind) {
        case "image":
          if (!currentImage) return null;
          return {
            source: currentImage.downloadSource || currentImage.imageSource,
            fileName: buildFileName(
              preview.token,
              inferExtensionFromSource(
                currentImage.downloadSource || currentImage.imageSource,
                "png",
              ),
            ),
          };
        case "video":
          if (!videoPreview) return null;
          return {
            source: videoPreview.videoUrl,
            fileName: buildFileName(preview.token, videoPreview.extension),
          };
        case "audio":
          if (!audioPreview) return null;
          return {
            source: audioPreview.audioUrl,
            fileName: buildFileName(
              preview.token,
              audioPreview.audioType || "mp3",
            ),
          };
        default:
          return null;
      }
    }, [preview, kind, currentImage, videoPreview, audioPreview]);

    const handleDownload = useCallback(async () => {
      if (!downloadInfo) return;
      try {
        await downloadPreviewFile(downloadInfo.source, downloadInfo.fileName);
        showTransientBadge("已保存");
      } catch (error) {
        console.error("Failed to save preview:", error);
        showTransientBadge("保存失败");
      }
    }, [downloadInfo, showTransientBadge]);

    const hasError = preview?.error;

    const inlinePreview = hasRenderablePreview ? (
      <Suspense
        fallback={<EmptyPreview isBuilding={isBuilding} kind={kind} />}
      >
        {kind === "video" && videoPreview ? (
          <VideoPreview
            videoUrl={videoPreview.videoUrl}
            poster={videoPreview.poster}
            duration={videoPreview.duration}
          />
        ) : kind === "audio" && audioPreview ? (
          <AudioPreview audioUrl={audioPreview.audioUrl} />
        ) : kind === "image" && imageGallery?.length ? (
          <ImagePreview
            gallery={imageGallery}
            currentIndex={activeImageIndex}
            onNavigate={handleNavigateImages}
            onSelect={handleSelectImage}
            onError={handleModalError}
          />
        ) : (
          <EmptyPreview isBuilding={isBuilding} kind={kind} />
        )}
      </Suspense>
    ) : (
      <EmptyPreview isBuilding={hasError ? false : isBuilding} kind={kind} />
    );

    const timestampLabel =
      hasRenderablePreview && preview?.generated_at
        ? `最近更新：${formatTimestamp(preview.generated_at)}`
        : isBuilding
          ? "生成中，完成后自动更新"
          : "结果生成后将在此展示";

    const modalContent = (() => {
      if (!hasRenderablePreview) {
        return (
          <p className="text-center text-sm text-muted-foreground">
            暂无可放大的内容
          </p>
        );
      }
      switch (kind) {
        case "video":
          return videoPreview ? (
            <Suspense
              fallback={<EmptyPreview isBuilding={false} kind={kind} />}
            >
              <VideoPreview
                videoUrl={videoPreview.videoUrl}
                poster={videoPreview.poster}
                duration={videoPreview.duration}
                variant="modal"
                showSpeedControl
                onDownloadClick={handleDownload}
              />
            </Suspense>
          ) : null;
        case "audio":
          return audioPreview ? (
            <Suspense
              fallback={<EmptyPreview isBuilding={false} kind={kind} />}
            >
              <AudioPreview
                audioUrl={audioPreview.audioUrl}
                variant="modal"
                showSpeedControl
                onDownloadClick={handleDownload}
              />
            </Suspense>
          ) : null;
        case "image":
        default:
          if (!imageGallery?.length || !currentImage) {
            return null;
          }
          return (
            <div className="flex flex-col gap-4">
              <div className="h-[65vh] w-full">
                <ImageViewer image={currentImage.imageSource} />
              </div>
              {imageGallery.length > 1 && (
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3"
                    onClick={() => handleNavigateImages(-1)}
                  >
                    <ForwardedIconComponent
                      name="ChevronLeft"
                      className="h-4 w-4"
                    />
                    上一张
                  </Button>
                  <span>
                    第 {activeImageIndex + 1} / {imageGallery.length} 张
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3"
                    onClick={() => handleNavigateImages(1)}
                  >
                    下一张
                    <ForwardedIconComponent
                      name="ChevronRight"
                      className="h-4 w-4"
                    />
                  </Button>
                </div>
              )}
            </div>
          );
      }
    })();

    return (
      <>
        <div
          ref={forwardedRef}
          className="mt-3 rounded-3xl border border-muted-foreground/20 bg-white/80 p-4 text-sm shadow-sm dark:bg-slate-900/60"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ForwardedIconComponent
                  name={
                    kind === "audio"
                      ? "Waveform"
                      : kind === "video"
                        ? "Clapperboard"
                        : "Image"
                  }
                  className="h-4 w-4"
                />
                <span>实时预览</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {timestampLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasError && (
                <Badge variant="destructive" className="text-xs">
                  预览失败
                </Badge>
              )}
              {transientBadge && (
                <Badge variant="secondary" className="text-xs">
                  {transientBadge}
                </Badge>
              )}
            </div>
          </div>

          <div
            className={cn(
              "relative overflow-hidden rounded-3xl border border-dashed border-muted-foreground/30 p-3",
              panelClass,
            )}
          >
            {inlinePreview}

            {hasRenderablePreview && (
              <button
                type="button"
                aria-label="放大预览"
                onClick={openModal}
                className="group absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-muted-foreground/40 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md transition hover:border-muted-foreground/60 hover:bg-white dark:bg-slate-900"
              >
                <ForwardedIconComponent
                  name="Maximize2"
                  className="h-4 w-4 text-current"
                />
                <span>放大预览</span>
              </button>
            )}

            {downloadInfo && (
              <button
                onClick={handleDownload}
                className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-800 shadow-lg transition hover:bg-white dark:bg-slate-900 dark:text-slate-100"
              >
                <ForwardedIconComponent name="Download" className="h-4 w-4" />
                <span>下载结果</span>
              </button>
            )}
          </div>
        </div>

        <Dialog open={isPreviewModalOpen} onOpenChange={setPreviewModalOpen}>
          <DialogContent
            className="w-[92vw] max-w-4xl"
            aria-describedby={undefined}
          >
            <DialogHeader className="flex flex-row items-center justify-between gap-4">
              <DialogTitle className="text-base">生成结果详情</DialogTitle>
              {hasRenderablePreview && downloadInfo && (
                <Button
                  variant="secondary"
                  size="sm"
                  ignoreTitleCase
                  className="h-9 px-4"
                  onClick={handleDownload}
                >
                  <ForwardedIconComponent
                    name="Download"
                    className="h-4 w-4"
                  />
                  <span>下载结果</span>
                </Button>
              )}
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto rounded-2xl bg-muted/50 p-4">
              {modalContent ?? (
                <p className="text-center text-sm text-muted-foreground">
                  暂无可放大的内容
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

DoubaoPreviewPanel.displayName = "DoubaoPreviewPanel";

export default DoubaoPreviewPanel;

function sanitizePreviewDataUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image")) return undefined;
  return trimmed.replace(/\s+/g, "");
}

function inferExtensionFromSource(source: string, fallback: string): string {
  if (!source) return fallback;
  if (source.startsWith("data:")) {
    const match = /^data:(?<mime>[^;]+)/.exec(source);
    const mimeType = match?.groups?.mime;
    if (mimeType) {
      const ext = mimeType.split("/").pop();
      if (ext) return ext.split("+")[0];
    }
    return fallback;
  }

  try {
    const url = new URL(source);
    const pathExt = url.pathname.split(".").pop();
    if (pathExt && pathExt.length <= 5) {
      return pathExt.toLowerCase();
    }
  } catch {
    const match = /\.([a-z0-9]+)(?:[\?#]|$)/i.exec(source);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return fallback;
}

async function downloadPreviewFile(source: string, fileName: string) {
  if (!source) throw new Error("Missing preview source");
  let objectUrl = source;
  let shouldRevoke = false;

  const convertToBlobUrl = async (target: string) => {
    const response = await fetch(target);
    if (!response.ok) {
      throw new Error(`Failed to fetch preview: ${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  };

  try {
    if (source.startsWith("data:") || source.startsWith("blob:")) {
      objectUrl = await convertToBlobUrl(source);
      shouldRevoke = true;
    } else {
      objectUrl = await convertToBlobUrl(source);
      shouldRevoke = true;
    }
  } catch (error) {
    const link = document.createElement("a");
    link.href = source;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const downloadLink = document.createElement("a");
  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  if (shouldRevoke) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }
}

function buildFileName(token?: string, extension?: string) {
  const safeExt = extension?.replace(/[^a-z0-9]/gi, "") || "dat";
  const safeToken = token || "doubao_preview";
  return `${safeToken}.${safeExt}`;
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function EmptyPreview({
  isBuilding,
  kind,
}: {
  isBuilding: boolean;
  kind: "image" | "video" | "audio";
}) {
  return (
    <div
      className={cn(
        "flex aspect-[16/9] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground",
        PANEL_BG[kind],
        isBuilding && "opacity-70",
      )}
    >
      {isBuilding ? (
        <div className="flex flex-col items-center gap-2">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">
            构建中，稍后自动更新
          </span>
        </div>
      ) : (
        <span>暂无生成结果</span>
      )}
    </div>
  );
}
