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
import { sanitizePreviewDataUrl } from "./helpers";

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

export type DoubaoReferenceImage = {
  id: string;
  imageSource: string;
  downloadSource?: string;
  size?: string;
  width?: number;
  height?: number;
  label?: string;
  fileName?: string;
};

type Props = {
  nodeId: string;
  componentName?: string;
  appearance?: "default" | "imageCreator" | "videoGenerator" | "audioCreator";
  referenceImages?: DoubaoReferenceImage[];
  onRequestUpload?: () => void;
};

type GalleryItem = {
  imageSource: string;
  downloadSource: string;
  size?: string;
  width?: number;
  height?: number;
  label?: string;
  origin?: "generated" | "reference";
  fileName?: string;
};

const ImagePreview = lazy(() => import("./ImageRenderer"));
const VideoPreview = lazy(() => import("./VideoRenderer"));
const AudioPreview = lazy(() => import("./AudioRenderer"));

type DownloadInfo = {
  source: string;
  fileName: string;
};

const DoubaoPreviewPanel = forwardRef<HTMLDivElement, Props>(
  (
    {
      nodeId,
      componentName,
      appearance = "default",
      referenceImages = [],
      onRequestUpload,
    },
    forwardedRef,
  ) => {
    const { preview, isBuilding } = useDoubaoPreview(nodeId, componentName);
    const isAudioMinimal = appearance === "audioCreator";
    const isMinimal =
      appearance === "imageCreator" ||
      appearance === "videoGenerator" ||
      isAudioMinimal;

    const kind = useMemo(() => {
      if (preview?.kind) return preview.kind;
      if (componentName && DOUBAO_KIND[componentName]) {
        return DOUBAO_KIND[componentName];
      }
      return "image";
    }, [preview?.kind, componentName]);

    const panelClass = useMemo(
      () => (isMinimal ? "" : PANEL_BG[kind]),
      [kind, isMinimal],
    );
    const minimalAspectClass = useMemo(() => {
      if (!isMinimal) return "";
      if (appearance === "videoGenerator" || isAudioMinimal) {
        return "aspect-[170/100]";
      }
      return "aspect-square";
    }, [appearance, isMinimal, isAudioMinimal]);

    const containerClassName = cn(
      "text-sm",
      isMinimal
        ? "h-full text-foreground"
        : "mt-3 rounded-3xl border border-muted-foreground/20 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60",
    );

    const previewFrameClassName = cn(
      "relative flex",
      isMinimal
        ? cn(
            "w-full max-w-full",
            minimalAspectClass,
            "rounded-[20px] bg-gradient-to-b from-white to-[#F7F8FD] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:from-slate-900/85 dark:to-slate-950/85 dark:shadow-[0_15px_40px_rgba(2,6,23,0.65)]",
          )
        : "min-h-[320px] overflow-hidden rounded-3xl border border-dashed border-muted-foreground/30 p-3 dark:border-white/10",
      panelClass,
    );

    const previewSurfaceClassName = cn(
      "flex h-full w-full items-center justify-center",
      isMinimal
        ? "rounded-[16px] bg-[#F9FAFE] dark:bg-slate-900/70"
        : "min-h-[320px]",
    );

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
            imageSource: sanitizePreviewDataUrl(resolvedSource) ?? resolvedSource,
            downloadSource: remoteSource ?? inlineSource ?? resolvedSource,
            size:
              entry?.size ??
              (entry?.width && entry?.height
                ? `${entry.width}×${entry.height}`
                : undefined),
            width: entry?.width,
            height: entry?.height,
            label: entry?.label ?? `第 ${idx + 1} 张`,
            origin: "generated",
            fileName: entry?.filename ?? entry?.file_name,
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
          origin: "generated",
          fileName: payload.filename ?? payload.file_name,
        },
      ];
    }, [kind, preview]);

    const referenceGallery = useMemo<GalleryItem[]>(() => {
      if (kind !== "image" || !referenceImages.length) return [];
      return referenceImages
        .map((item, index) => {
          if (!item?.imageSource) return null;
          const fallbackSize =
            item.width && item.height
              ? `${item.width}×${item.height}`
              : undefined;
          return {
            imageSource: item.imageSource,
            downloadSource: item.downloadSource ?? item.imageSource,
            size: item.size ?? fallbackSize,
            width: item.width,
            height: item.height,
            label: item.label ?? `参考图 ${index + 1}`,
            origin: "reference" as const,
            fileName: item.fileName,
          };
        })
        .filter(Boolean) as GalleryItem[];
    }, [kind, referenceImages]);
    const referenceSelectionCount = referenceGallery.length;

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

    const hasGeneratedImagePreview =
      kind === "image" && Boolean(preview?.available && imageGallery?.length);
    const hasReferencePreview =
      kind === "image" && !hasGeneratedImagePreview && referenceGallery.length;
    const hasVideoPreview =
      kind === "video" && Boolean(preview?.available && videoPreview);
    const hasAudioPreview =
      kind === "audio" && Boolean(preview?.available && audioPreview);

    const galleryForRenderer = hasGeneratedImagePreview
      ? imageGallery
      : hasReferencePreview
        ? referenceGallery
        : null;

    const galleryKind = hasGeneratedImagePreview
      ? "generated"
      : hasReferencePreview
        ? "reference"
        : null;

    const currentImage = galleryForRenderer?.length
      ? galleryForRenderer[
          Math.min(activeImageIndex, galleryForRenderer.length - 1)
        ]
      : null;

    const handleNavigateImages = useCallback(
      (delta: number) => {
        if (!galleryForRenderer?.length) return;
        const total = galleryForRenderer.length;
        const next = (activeImageIndex + delta + total) % total;
        setActiveImageIndex(next);
      },
      [galleryForRenderer, activeImageIndex],
    );

    const handleSelectImage = useCallback(
      (index: number) => {
        if (!galleryForRenderer?.length) return;
        const total = galleryForRenderer.length;
        const normalized = ((index % total) + total) % total;
        setActiveImageIndex(normalized);
      },
      [galleryForRenderer],
    );

    const hasRenderablePreview =
      hasGeneratedImagePreview ||
      hasReferencePreview ||
      hasVideoPreview ||
      hasAudioPreview;

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
      if (!galleryForRenderer?.length) {
        if (activeImageIndex !== 0) {
          setActiveImageIndex(0);
        }
        return;
      }
      if (activeImageIndex >= galleryForRenderer.length) {
        setActiveImageIndex(0);
      }
    }, [galleryForRenderer, activeImageIndex]);

    const downloadInfo = useMemo<DownloadInfo | null>(() => {
      if (kind === "image") {
        if (!currentImage) return null;
        const source = currentImage.downloadSource || currentImage.imageSource;
        const extension = inferExtensionFromSource(source, "png");
        const baseToken =
          currentImage.fileName ||
          (galleryKind === "reference"
            ? `reference_image_${activeImageIndex + 1}`
            : preview?.token);
        return {
          source,
          fileName: buildFileName(baseToken, extension),
        };
      }
      if (!preview?.available) return null;
      switch (kind) {
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
    }, [
      kind,
      currentImage,
      galleryKind,
      preview?.token,
      preview?.available,
      videoPreview,
      audioPreview,
      activeImageIndex,
    ]);

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
    const shouldShowImageUploadOverlay =
      appearance === "imageCreator" &&
      kind === "image" &&
      (galleryForRenderer?.length || referenceGallery.length);
    const shouldShowVideoUploadOverlay = false;
    const showUploadOverlay = Boolean(
      onRequestUpload &&
        (shouldShowImageUploadOverlay || shouldShowVideoUploadOverlay),
    );
    const uploadButtonLabel = "上传";
    const showReferenceSelectionBadge =
      appearance === "imageCreator" &&
      referenceSelectionCount > 0 &&
      !hasGeneratedImagePreview;

    const inlinePreview = hasRenderablePreview ? (
      <Suspense
        fallback={
          <EmptyPreview
            isBuilding={isBuilding}
            kind={kind}
            appearance={appearance}
            onUploadClick={onRequestUpload}
          />
        }
      >
        {kind === "video" && videoPreview ? (
          <VideoPreview
            videoUrl={videoPreview.videoUrl}
            poster={videoPreview.poster}
            duration={videoPreview.duration}
          />
        ) : kind === "audio" && audioPreview ? (
          <AudioPreview audioUrl={audioPreview.audioUrl} />
        ) : kind === "image" && galleryForRenderer?.length ? (
          <ImagePreview
            gallery={galleryForRenderer}
            currentIndex={activeImageIndex}
            onNavigate={handleNavigateImages}
            onSelect={handleSelectImage}
            onError={handleModalError}
          />
        ) : (
          <EmptyPreview
            isBuilding={isBuilding}
            kind={kind}
            appearance={appearance}
            onUploadClick={onRequestUpload}
          />
        )}
      </Suspense>
    ) : (
      <EmptyPreview
        isBuilding={hasError ? false : isBuilding}
        kind={kind}
        appearance={appearance}
        onUploadClick={onRequestUpload}
      />
    );

    const timestampLabel = (() => {
      if (galleryKind === "reference" && referenceGallery.length) {
        return `已上传 ${referenceGallery.length} 张参考图`;
      }
      if (hasRenderablePreview && preview?.generated_at) {
        return `最近更新：${formatTimestamp(preview.generated_at)}`;
      }
      if (isBuilding) {
        return "生成中，完成后自动更新";
      }
      return "结果生成后将在此展示";
    })();

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
          if (!galleryForRenderer?.length || !currentImage) {
            return null;
          }
          return (
            <div className="flex flex-col gap-4">
              <div className="h-[65vh] w-full">
                <ImageViewer image={currentImage.imageSource} />
              </div>
              {galleryForRenderer.length > 1 && (
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
                    第 {activeImageIndex + 1} / {galleryForRenderer.length} 张
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
        <div ref={forwardedRef} className={containerClassName}>
          {!isMinimal && (
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
          )}

          <div className={previewFrameClassName}>
            <div className={previewSurfaceClassName}>
              {inlinePreview}
            </div>
            {showReferenceSelectionBadge && (
              <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white shadow">
                已选 {referenceSelectionCount}
              </div>
            )}

            {isMinimal ? (
              (showUploadOverlay || hasRenderablePreview || (isAudioMinimal && downloadInfo)) && (
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  {showUploadOverlay && (
                    <button
                      type="button"
                      className="h-8 rounded-full border border-[#E3E8F5] bg-white/95 px-3 text-xs font-medium text-[#1B66FF] shadow transition hover:border-[#C7D2F4] hover:bg-white"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRequestUpload?.();
                      }}
                    >
                      {uploadButtonLabel}
                    </button>
                  )}
                  {isAudioMinimal && downloadInfo && (
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex h-8 items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-3 text-xs font-medium text-[#3B4154] shadow"
                    >
                      <ForwardedIconComponent
                        name="Download"
                        className="h-4 w-4 text-current"
                      />
                      <span>保存</span>
                    </button>
                  )}
                  {hasRenderablePreview && (
                    <button
                      type="button"
                      aria-label="放大预览"
                      onClick={openModal}
                      className="group flex h-8 items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-3 text-xs font-medium text-[#3C4258] shadow"
                    >
                      <ForwardedIconComponent
                        name="Maximize2"
                        className="h-4 w-4 text-current"
                      />
                    </button>
                  )}
                </div>
              )
            ) : (
              hasRenderablePreview && (
                <button
                  type="button"
                  aria-label="放大预览"
                  onClick={openModal}
                  className="group absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-muted-foreground/40 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md hover:border-muted-foreground/60 hover:bg-white dark:bg-slate-900"
                >
                  <ForwardedIconComponent
                    name="Maximize2"
                    className="h-4 w-4 text-current"
                  />
                  <span>放大预览</span>
                </button>
              )
            )}

            {downloadInfo && !isAudioMinimal && (
              <button
                onClick={handleDownload}
                className={cn(
                  "absolute flex items-center gap-1 text-xs font-medium transition",
                  isMinimal
                    ? "bottom-4 right-4 rounded-full bg-white px-3 py-1.5 text-[#3B4154] shadow"
                    : "bottom-4 right-4 rounded-full bg-white/90 px-3 py-1.5 text-gray-800 shadow-lg hover:bg-white dark:bg-slate-900 dark:text-slate-100",
                )}
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
                  <span>{isAudioMinimal ? "保存" : "下载结果"}</span>
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
  appearance = "default",
  onUploadClick,
}: {
  isBuilding: boolean;
  kind: "image" | "video" | "audio";
  appearance?: "default" | "imageCreator" | "videoGenerator" | "audioCreator";
  onUploadClick?: () => void;
}) {
  const isMinimal =
    appearance === "imageCreator" ||
    appearance === "videoGenerator" ||
    appearance === "audioCreator";
  const uploadLinkLabel =
    appearance === "videoGenerator"
      ? "暂无生成结果，可上传图片作为视频首帧"
      : "暂无生成结果，请上传图片";
  if (isMinimal) {
    if (appearance === "videoGenerator") {
      const suggestions = ["图生图", "图生视频", "图片换背景", "首帧图生视频"];
      return (
        <div className="flex h-full min-h-[220px] w-full flex-col justify-center rounded-[16px] border border-dashed border-[#DDE3F6] bg-[#F7F8FD] p-5 text-center text-sm text-[#646B81] dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
          <div className="flex flex-col items-center gap-2 text-xs text-[#8E95AF] dark:text-slate-400">
            <span className="font-medium text-[#444A63] dark:text-slate-200">尝试：</span>
            <div className="grid gap-1 text-sm text-[#4B526B] dark:text-slate-200">
              {suggestions.map((item) => (
                <div key={item} className="flex items-center justify-center gap-2">
                  <ForwardedIconComponent
                    name="ChevronRight"
                    className="h-3 w-3 text-[#A4AAC6] dark:text-slate-400"
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5">
            {isBuilding ? (
              <p className="text-base font-medium text-[#4B5168] dark:text-slate-100">
                构建中，稍后自动更新
              </p>
            ) : (
              onUploadClick && (
                <button
                  type="button"
                  className="text-base font-medium text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onUploadClick();
                  }}
                >
                  {uploadLinkLabel}
                </button>
              )
            )}
          </div>
        </div>
      );
    }
    if (appearance === "audioCreator") {
      const suggestions = [
        { label: "上传本地音频", icon: "Upload" as const },
        { label: "音频生视频", icon: "Music" as const },
      ];
      return (
        <div className="flex h-full min-h-[220px] w-full flex-col justify-center rounded-[16px] border border-dashed border-[#DDE3F6] bg-[#F7F8FD] p-5 text-center text-sm text-[#646B81] dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
          <div className="flex flex-col items-center gap-2 text-xs text-[#8E95AF] dark:text-slate-400">
            <span className="font-medium text-[#444A63] dark:text-slate-200">尝试：</span>
            <div className="grid gap-1 text-sm text-[#4B526B] dark:text-slate-200">
              {suggestions.map((item) => (
                <div key={item.label} className="flex items-center justify-center gap-2">
                  <ForwardedIconComponent
                    name={item.icon}
                    className="h-3 w-3 text-[#A4AAC6] dark:text-slate-400"
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-base font-medium text-[#4B5168] dark:text-slate-100">
            {isBuilding ? "构建中，稍后自动更新" : "暂无生成结果"}
          </p>
        </div>
      );
    }

    const suggestions = [
      "图生图",
      "图生视频",
      "图片换背景",
      "首帧图生视频",
    ];
    return (
      <div className="flex h-full min-h-[220px] w-full flex-col justify-center rounded-[16px] border border-dashed border-[#DDE3F6] bg-[#F7F8FD] p-5 text-center text-sm text-[#646B81] dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
        <div className="flex flex-col items-center gap-2 text-xs text-[#8E95AF] dark:text-slate-400">
          <span className="font-medium text-[#444A63] dark:text-slate-200">尝试：</span>
          <div className="grid gap-1 text-sm text-[#4B526B] dark:text-slate-200">
            {suggestions.map((item) => (
              <div key={item} className="flex items-center justify-center gap-2">
                <ForwardedIconComponent
                  name="ChevronRight"
                  className="h-3 w-3 text-[#A4AAC6] dark:text-slate-400"
                />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="mt-4 text-base font-medium text-[#1B66FF] hover:underline dark:text-[#7da6ff] dark:hover:text-[#a6c4ff]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (onUploadClick) {
              onUploadClick();
              return;
            }
            const uploadEvent = new CustomEvent("doubao-preview-upload");
            window.dispatchEvent(uploadEvent);
          }}
        >
          {isBuilding ? "构建中，稍后自动更新" : uploadLinkLabel}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-[320px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground",
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
