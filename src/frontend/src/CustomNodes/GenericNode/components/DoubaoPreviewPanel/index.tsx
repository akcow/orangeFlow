import {
  forwardRef,
  lazy,
  Suspense,
  type ChangeEvent,
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
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
import {
  parseDoubaoPreviewData,
  useDoubaoPreview,
} from "../../../hooks/use-doubao-preview";
import { sanitizePreviewDataUrl } from "./helpers";
import useFlowStore from "@/stores/flowStore";
import OutputModal from "../outputModal";

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

const OUTPUT_NAME_BY_COMPONENT: Record<string, string> = {
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
  role?: "first" | "reference" | "last";
};

export type DoubaoPreviewPanelActions = {
  openPreview: () => void;
  download: () => void;
  canDownload: boolean;
};

type Props = {
  nodeId: string;
  componentName?: string;
  appearance?: "default" | "imageCreator" | "videoGenerator" | "audioCreator";
  referenceImages?: DoubaoReferenceImage[];
  onRequestUpload?: () => void;
  onSuggestionClick?: (label: string) => void;
  onActionsChange?: (actions: DoubaoPreviewPanelActions) => void;
  aspectRatio?: string;
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
      onSuggestionClick,
      onActionsChange,
      aspectRatio,
    },
    forwardedRef,
  ) => {
    const { preview, isBuilding, rawMessage } = useDoubaoPreview(
      nodeId,
      componentName,
    );
    const nodes = useFlowStore((state) => state.nodes);
    const setNode = useFlowStore((state) => state.setNode);
    const node = useMemo(
      () => (nodes.find((candidate) => candidate.id === nodeId)?.data as any)?.node,
      [nodes, nodeId],
    );
    const isNodeSelected = useMemo(
      () => Boolean(nodes.find((candidate) => candidate.id === nodeId)?.selected),
      [nodes, nodeId],
    );
    const selectedModelName = useMemo(() => {
      const template = (node as any)?.template ?? {};
      const value =
        template?.model_name?.value ??
        template?.model_name?.default ??
        template?.model_name?.options?.[0] ??
        "";
      return String(value ?? "").trim();
    }, [node]);

    const disabledSuggestions = useMemo(() => {
      if (appearance !== "videoGenerator") return [];
      if (selectedModelName !== "sora-2" && selectedModelName !== "sora-2-pro") {
        return [];
      }
      return ["首帧生成视频", "首尾帧生成视频"];
    }, [appearance, selectedModelName]);

    const draftPreview = useMemo(() => {
      const draftValue = (node as any)?.template?.draft_output?.value;
      if (!draftValue || typeof draftValue !== "object") return null;
      return parseDoubaoPreviewData(componentName, draftValue);
    }, [componentName, node]);

    const resolvedPreview =
      appearance === "audioCreator"
        ? preview && preview.kind === "audio" && preview.available
          ? preview
          : draftPreview ?? preview
        : preview && (preview.available || preview.error)
          ? preview
          : draftPreview ?? preview;

    // Persist latest output payload into a hidden field so the component can act as a bridge
    // (prompt empty -> passthrough cached preview to downstream) and survive reloads.
    const lastAppliedRawMessageRef = useRef<any>(null);
    useEffect(() => {
      if (!node) return;
      if (!(node as any)?.template?.draft_output) return;

      const payload =
        rawMessage && "message" in rawMessage ? (rawMessage as any).message : null;
      if (!payload || typeof payload !== "object") return;
      if (rawMessage === lastAppliedRawMessageRef.current) return;

      const candidatePreview = parseDoubaoPreviewData(componentName, payload);
      if (!candidatePreview) return;
      if (appearance === "audioCreator" && candidatePreview.kind !== "audio") {
        return;
      }
      if (appearance === "audioCreator" && !candidatePreview.available) {
        return;
      }
      if (appearance !== "audioCreator" && !candidatePreview.available && !candidatePreview.error) {
        return;
      }

      lastAppliedRawMessageRef.current = rawMessage;
      setNode(
        nodeId,
        (oldNode) => {
          const newData = { ...(oldNode.data as any) };
          const newNode = { ...(newData.node as any) };
          const newTemplate = { ...(newNode.template ?? {}) };
          const draftField = { ...(newTemplate.draft_output ?? {}) };
          draftField.value = payload;
          newTemplate.draft_output = draftField;
          newNode.template = newTemplate;
          newData.node = newNode;
          return { ...oldNode, data: newData };
        },
        false,
      );
    }, [rawMessage, node, nodeId, setNode]);
    const isAudioMinimal = appearance === "audioCreator";
    const isMinimal =
      appearance === "imageCreator" ||
      appearance === "videoGenerator" ||
      isAudioMinimal;

    const kind = useMemo(() => {
      if (resolvedPreview?.kind) return resolvedPreview.kind;
      if (componentName && DOUBAO_KIND[componentName]) {
        return DOUBAO_KIND[componentName];
      }
      return "image";
    }, [resolvedPreview?.kind, componentName]);

    const panelClass = useMemo(
      () => (isMinimal ? "" : PANEL_BG[kind]),
      [kind, isMinimal],
    );

    // Track aspectRatio changes to enable transition animation only when ratio changes.
    const prevAspectRatioRef = useRef<string | undefined>(aspectRatio);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
      const prevRatio = prevAspectRatioRef.current;
      if (prevRatio !== aspectRatio && prevRatio !== undefined) {
        // Ratio changed, enable animation
        setIsAnimating(true);
        // Disable animation after transition ends (500ms to ensure smooth completion)
        const timer = window.setTimeout(() => {
          setIsAnimating(false);
        }, 500);
        return () => window.clearTimeout(timer);
      }
      prevAspectRatioRef.current = aspectRatio;
    }, [aspectRatio]);

    // Update ref when aspectRatio changes (must be after the effect)
    useEffect(() => {
      prevAspectRatioRef.current = aspectRatio;
    }, [aspectRatio]);



    // Calculate aspect ratio style for persistent preview frames (image/video creators).
    // Using padding-bottom percentage technique for smooth transition (aspect-ratio CSS property doesn't support transition).
    const containerStyle = useMemo(() => {
      if (
        (appearance !== "imageCreator" && appearance !== "videoGenerator") ||
        !aspectRatio
      ) {
        return undefined;
      }

      // padding-bottom = (height / width) * 100%
      const paddingMap: Record<string, number> = {
        "1:1": 100,        // 1/1 = 100%
        "16:9": 56.25,     // 9/16 = 56.25%
        "9:16": 177.78,    // 16/9 = 177.78%
        "4:3": 75,         // 3/4 = 75%
        "3:4": 133.33,     // 4/3 = 133.33%
        "2:3": 150,        // 3/2 = 150%
        "3:2": 66.67,      // 2/3 = 66.67%
        "21:9": 42.86,     // 9/21 = 42.86%
        "4:5": 125,        // 5/4 = 125%
        "5:4": 80,         // 4/5 = 80%
      };

      let paddingPercent = paddingMap[aspectRatio];

      // If "Adaptive" or "Auto", use defaults
      if (aspectRatio.toLowerCase() === "adaptive" || aspectRatio.toLowerCase() === "auto") {
        paddingPercent = appearance === "videoGenerator" ? 56.25 : 100; // 16:9 or 1:1
      }

      if (paddingPercent === undefined) {
        paddingPercent = 100; // Default to 1:1
      }

      return {
        position: "relative" as const,
        width: "100%",
        height: 0,
        paddingBottom: `${paddingPercent}%`,
        transition: isAnimating ? "padding-bottom 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none",
      };
    }, [appearance, aspectRatio, isAnimating]);



    const minimalAspectClass = useMemo(() => {
      if (!isMinimal) return "";
      if (appearance === "videoGenerator") {
        // Prefer the configured aspect ratio via inline style; fallback keeps a stable frame.
        return containerStyle ? "" : "aspect-[170/100]";
      }
      if (isAudioMinimal) {
        return "aspect-[170/100]";
      }
      // For image creator, we dynamically handle aspect ratio via style if empty, or let it be flexible.
      // If we use style for aspect-ratio, we should remove conflicting tailwind classes like aspect-square.
      // We'll return a default if no aspect ratio is provided or if we want a fallback.
      if (appearance === "imageCreator") {
        // If we have a computed container style, we don't want 'aspect-square' forcing it.
        // We will rely on the inline style or a default class.
        return "";
      }
      return "aspect-square";
    }, [appearance, isMinimal, isAudioMinimal]);

    const containerClassName = cn(
      "text-sm",
      isMinimal
        ? "h-full text-foreground"
        : "mt-3 rounded-3xl border border-muted-foreground/20 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60",
    );

    const isUltraWide21x9 =
      appearance === "imageCreator" && String(aspectRatio ?? "").trim() === "21:9";

    const previewFrameClassName = cn(
      "relative flex",
      isMinimal
        ? appearance === "imageCreator" || appearance === "videoGenerator"
          ? cn(
            "w-full max-w-full",
            minimalAspectClass,
            // 21:9 looks too short in the persistent preview; increase minimum visible area only for this ratio.
            isUltraWide21x9 && "min-h-[320px]",
            // Fallback to aspect-square if no style is applied and no specific ratio class? 
            // Actually, if we remove aspect-square, it might collapse if empty. 
            // We should ensure a default aspect ratio exists if the computed one is missing.
            !containerStyle && "aspect-square",
            // Single preview container for image creator (avoid nested frames inside the renderer).
            cn(
              "overflow-hidden rounded-[16px] border border-[#DDE3F6] bg-[#F7F8FD] p-0 shadow-none transition-shadow dark:border-white/15 dark:bg-white/5",
              isNodeSelected &&
              "ring-2 ring-node-selected/25 shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:shadow-[0_20px_55px_rgba(2,6,23,0.60)]",
            ),
          )
          : cn(
            "w-full max-w-full",
            minimalAspectClass,
            cn(
              "rounded-[20px] bg-gradient-to-b from-white to-[#F7F8FD] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-shadow dark:from-slate-900/85 dark:to-slate-950/85 dark:shadow-[0_15px_40px_rgba(2,6,23,0.65)]",
              isNodeSelected && "ring-2 ring-node-selected/25",
            ),
          )
        : "min-h-[320px] overflow-hidden rounded-3xl border border-dashed border-muted-foreground/30 p-3 dark:border-white/10",
      panelClass,
      !isMinimal && isNodeSelected && "ring-2 ring-node-selected/25",
    );

    const previewSurfaceClassName = cn(
      "flex items-center justify-center",
      isMinimal
        ? appearance === "imageCreator" || appearance === "videoGenerator"
          // Use absolute positioning to fill the padding-bottom created space
          ? "absolute inset-0 bg-transparent"
          : "h-full w-full rounded-[16px] bg-[#F9FAFE] dark:bg-slate-900/70"
        : "h-full w-full min-h-[320px]",
    );

    const outputName = useMemo(() => {
      if (componentName && OUTPUT_NAME_BY_COMPONENT[componentName]) {
        return OUTPUT_NAME_BY_COMPONENT[componentName];
      }
      return "output";
    }, [componentName]);
    const [isLogsOpen, setLogsOpen] = useState(false);

    const [transientBadge, setTransientBadge] = useState<string | null>(null);
    const showTransientBadge = useCallback((label: string) => {
      setTransientBadge(label);
      const timer = window.setTimeout(() => setTransientBadge(null), 2500);
      return () => window.clearTimeout(timer);
    }, []);

    const audioFileInputRef = useRef<HTMLInputElement>(null);
    const handlePickLocalAudio = useCallback(() => {
      audioFileInputRef.current?.click();
    }, []);

    const handleLocalAudioSelected = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        try {
          const dataUrl = await readFileAsDataUrl(file);
          const base64 = extractBase64FromDataUrl(dataUrl);
          const audioType =
            inferAudioTypeFromMime(file.type) ||
            inferExtensionFromFileName(file.name) ||
            "mp3";

          const payload = {
            doubao_preview: {
              token: `local_audio_${Date.now()}`,
              kind: "audio",
              available: true,
              generated_at: new Date().toISOString(),
              payload: {
                audio_base64: base64,
                audio_type: audioType,
              },
            },
          };

          setNode(
            nodeId,
            (oldNode) => {
              const newData = { ...(oldNode.data as any) };
              const newNode = { ...(newData.node as any) };
              const newTemplate = { ...(newNode.template ?? {}) };
              if (newTemplate.text) {
                newTemplate.text = { ...newTemplate.text, required: false };
              }
              const draftField = { ...(newTemplate.draft_output ?? {}) };
              draftField.value = payload;
              newTemplate.draft_output = draftField;
              newNode.template = newTemplate;
              newData.node = newNode;
              return { ...oldNode, data: newData };
            },
            false,
          );

          showTransientBadge("已上传");
        } catch (error) {
          console.error("Failed to load local audio:", error);
          showTransientBadge("上传失败");
        }
      },
      [nodeId, setNode, showTransientBadge],
    );

    const handleSuggestionClick = useCallback(
      (label: string) => {
        if (appearance === "audioCreator") {
          if (label === "上传本地音频") {
            handlePickLocalAudio();
            return;
          }
          if (label === "音频转视频") {
            onSuggestionClick?.(label);
            handlePickLocalAudio();
            return;
          }
        }
        onSuggestionClick?.(label);
      },
      [appearance, handlePickLocalAudio, onSuggestionClick],
    );

    const handleModalError = useCallback(
      (error: Error) => {
        console.error("Modal error:", error);
        showTransientBadge("Load failed");
      },
      [showTransientBadge],
    );

    const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    const imageGallery = useMemo<GalleryItem[] | null>(() => {
      if (kind !== "image" || !resolvedPreview?.payload) return null;
      const payload: any = resolvedPreview.payload;
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
          const resolvedSource = remoteSource ?? inlineSource ?? entry?.data_url;
          if (!resolvedSource) return;

          galleryItems.push({
            imageSource: sanitizePreviewDataUrl(resolvedSource) ?? resolvedSource,
            downloadSource: remoteSource ?? inlineSource ?? resolvedSource,
            size:
              entry?.size ??
              (entry?.width && entry?.height
                ? `${entry.width}x${entry.height}`
                : undefined),
            width: entry?.width,
            height: entry?.height,
            label: entry?.label ?? `Image ${idx + 1}`,
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
              ? `${payload.width}x${payload.height}`
              : undefined,
          width: payload.width,
          height: payload.height,
          label: "Image 1",
          origin: "generated",
          fileName: payload.filename ?? payload.file_name,
        },
      ];
    }, [kind, resolvedPreview]);

    const referenceGallery = useMemo<GalleryItem[]>(() => {
      if (kind !== "image" || !referenceImages.length) return [];
      return referenceImages
        .map((item, index) => {
          if (!item?.imageSource) return null;
          const fallbackSize =
            item.width && item.height
              ? `${item.width}x${item.height}`
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
      if (kind !== "video" || !resolvedPreview?.payload) return null;
      // 优先使用 base64 编码的视频（避免认证问题）
      const videoBase64: string | undefined = resolvedPreview.payload?.video_base64;
      const videoUrl: string | undefined = resolvedPreview.payload?.video_url;
      const finalVideoUrl = videoBase64 || videoUrl;
      if (!finalVideoUrl) return null;
      return {
        videoUrl: finalVideoUrl,
        poster:
          resolvedPreview.payload?.cover_preview_base64 ||
          resolvedPreview.payload?.cover_url,
        duration: resolvedPreview.payload?.duration,
        extension: inferExtensionFromSource(finalVideoUrl, "mp4"),
      };
    }, [kind, resolvedPreview]);

    const audioPreview = useMemo(() => {
      if (kind !== "audio" || !resolvedPreview?.payload) return null;
      const audioType: string = resolvedPreview.payload?.audio_type || "mp3";
      const base64Content = resolvedPreview.payload?.audio_base64;
      const fallbackUrl =
        resolvedPreview.payload?.audio_data_url ||
        resolvedPreview.payload?.audio_url;
      const audioUrl = base64Content
        ? `data:audio/${audioType};base64,${base64Content}`
        : fallbackUrl;
      if (!audioUrl) return null;
      return {
        audioUrl,
        audioType,
      };
    }, [kind, resolvedPreview]);

    const hasGeneratedImagePreview =
      kind === "image" &&
      Boolean(resolvedPreview?.available && imageGallery?.length);
    const hasReferencePreview =
      kind === "image" && !hasGeneratedImagePreview && referenceGallery.length;
    const hasVideoPreview =
      kind === "video" && Boolean(resolvedPreview?.available && videoPreview);
    const hasAudioPreview =
      kind === "audio" && Boolean(resolvedPreview?.available && audioPreview);

    const galleryForRenderer = hasGeneratedImagePreview
      ? imageGallery
      : hasReferencePreview
        ? referenceGallery
        : null;

    const hasRenderablePreview =
      hasGeneratedImagePreview ||
      hasReferencePreview ||
      hasVideoPreview ||
      hasAudioPreview;

    // Image creator and video generator should always use containerStyle for smooth aspect ratio transitions.
    const appliedContainerStyle =
      appearance === "videoGenerator" || appearance === "imageCreator"
        ? containerStyle
        : !hasRenderablePreview
          ? containerStyle
          : undefined;

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
    }, [resolvedPreview?.token]);

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
            : resolvedPreview?.token);
        return {
          source,
          fileName: buildFileName(baseToken, extension),
        };
      }
      if (!resolvedPreview?.available) return null;
      switch (kind) {
        case "video":
          if (!videoPreview) return null;
          return {
            source: videoPreview.videoUrl,
            fileName: buildFileName(resolvedPreview.token, videoPreview.extension),
          };
        case "audio":
          if (!audioPreview) return null;
          return {
            source: audioPreview.audioUrl,
            fileName: buildFileName(
              resolvedPreview.token,
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
      resolvedPreview?.token,
      resolvedPreview?.available,
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

    useEffect(() => {
      onActionsChange?.({
        openPreview: openModal,
        download: handleDownload,
        canDownload: Boolean(downloadInfo),
      });
    }, [downloadInfo, handleDownload, onActionsChange, openModal]);

    const hasError = resolvedPreview?.error;
    const shouldShowImageUploadOverlay =
      appearance === "imageCreator" &&
      kind === "image" &&
      (galleryForRenderer?.length || referenceGallery.length);
    // Video creator: no persistent upload button in the preview frame (upload lives in the empty state UX).
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
            onSuggestionClick={handleSuggestionClick}
            disabledSuggestions={disabledSuggestions}
          />
        }
      >
        {kind === "video" && videoPreview ? (
          <VideoPreview
            videoUrl={videoPreview.videoUrl}
            poster={videoPreview.poster}
            duration={videoPreview.duration}
            frameless={appearance === "videoGenerator"}
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
            appearance={appearance}
          />
        ) : (
          <EmptyPreview
            isBuilding={isBuilding}
            kind={kind}
            appearance={appearance}
            onUploadClick={onRequestUpload}
            onSuggestionClick={handleSuggestionClick}
            disabledSuggestions={disabledSuggestions}
          />
        )}
      </Suspense>
    ) : (
      <EmptyPreview
        isBuilding={hasError ? false : isBuilding}
        kind={kind}
        appearance={appearance}
        onUploadClick={onRequestUpload}
        onSuggestionClick={handleSuggestionClick}
        disabledSuggestions={disabledSuggestions}
      />
    );

    const timestampLabel = (() => {
      if (galleryKind === "reference" && referenceGallery.length) {
        return `已上传 ${referenceGallery.length} 张参考图`;
      }
      if (hasRenderablePreview && resolvedPreview?.generated_at) {
        return `最近更新：${formatTimestamp(resolvedPreview.generated_at)}`;
      }
      if (isBuilding) {
        return "生成中……完成后将自动刷新";
      }
      return "生成完成后将在此显示结果";
    })();

    const modalContent = (() => {
      if (!hasRenderablePreview) {
        return (
          <p className="text-center text-sm text-muted-foreground">
            暂无可预览内容
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
                    图片 {activeImageIndex + 1} / {galleryForRenderer.length}
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
          {appearance === "audioCreator" && (
            <input
              ref={audioFileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleLocalAudioSelected}
            />
          )}
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

          <div
            className={previewFrameClassName}
            style={appliedContainerStyle}
          >
            {appearance === "default" && (
              <div className="absolute bottom-4 left-4 z-10">
                <OutputModal
                  open={isLogsOpen}
                  setOpen={setLogsOpen}
                  disabled={false}
                  nodeId={nodeId}
                  outputName={outputName}
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-full px-2 text-[11px]"
                  >
                    <ForwardedIconComponent
                      name="FileText"
                      className="mr-1 h-3 w-3"
                    />
                    Logs
                  </Button>
                </OutputModal>
              </div>
            )}
            <div className={previewSurfaceClassName}>
              {inlinePreview}
            </div>
            {showReferenceSelectionBadge && (
              <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white shadow">
                已选择 {referenceSelectionCount}
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
                  {isAudioMinimal && hasAudioPreview && (
                    <button
                      type="button"
                      className="h-8 rounded-full border border-[#E3E8F5] bg-white/95 px-3 text-xs font-medium text-[#1B66FF] shadow transition hover:border-[#C7D2F4] hover:bg-white"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handlePickLocalAudio();
                      }}
                    >
                      上传
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
                  {appearance !== "imageCreator" && hasRenderablePreview && (
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

            {appearance !== "imageCreator" && downloadInfo && !isAudioMinimal && (
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
          >
            <DialogHeader className="flex flex-row items-center justify-between gap-4">
              <DialogTitle className="text-base">生成详情</DialogTitle>
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
                  暂无可预览内容
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
    const match = /^data:([^;]+)/.exec(source);
    const mimeType = match?.[1];
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function extractBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function inferAudioTypeFromMime(mime: string): string | null {
  const normalized = String(mime || "").toLowerCase();
  if (!normalized) return null;

  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "mp3";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return "wav";
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/flac") return "flac";
  if (normalized === "audio/webm") return "webm";
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") return "m4a";

  const subtype = normalized.split("/")[1];
  return subtype ? subtype.split("+")[0] : null;
}

function inferExtensionFromFileName(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name || "");
  return match?.[1]?.toLowerCase() ?? null;
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
  onSuggestionClick,
  disabledSuggestions,
}: {
  isBuilding: boolean;
  kind: "image" | "video" | "audio";
  appearance?: "default" | "imageCreator" | "videoGenerator" | "audioCreator";
  onUploadClick?: () => void;
  onSuggestionClick?: (label: string) => void;
  disabledSuggestions?: string[];
}) {
  const renderSuggestionButtons = (
    items: Array<{ label: string; icon: string; disabled?: boolean }>,
  ) => (
    <div className="w-full max-w-[520px] space-y-2 text-left">
      <div className="text-xs font-semibold text-[#444A63] dark:text-slate-200">
        尝试：
      </div>
      <div className="grid w-full gap-2 text-xs sm:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={Boolean(isBuilding || item.disabled)}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-[#3C4258] shadow-sm transition dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
              isBuilding || item.disabled
                ? "cursor-not-allowed opacity-60"
                : "hover:border-slate-300 hover:bg-white dark:hover:border-white/20",
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isBuilding || item.disabled) return;
              onSuggestionClick?.(item.label);
            }}
          >
            <ForwardedIconComponent
              name={item.icon}
              className="h-4 w-4 text-muted-foreground"
            />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const isMinimal =
    appearance === "imageCreator" ||
    appearance === "videoGenerator" ||
    appearance === "audioCreator";
  const uploadLinkLabel =
    appearance === "videoGenerator"
      ? disabledSuggestions?.length
        ? "暂无结果，上传参考图"
        : "暂无结果，上传图片作为视频封面"
      : "暂无结果，请上传图片";

  if (isMinimal) {
    if (appearance === "videoGenerator") {
      const suggestions = [
        {
          label: "首帧生成视频",
          icon: "Clapperboard",
          disabled: disabledSuggestions?.includes("首帧生成视频"),
        },
        {
          label: "首尾帧生成视频",
          icon: "Clapperboard",
          disabled: disabledSuggestions?.includes("首尾帧生成视频"),
        },
      ];
      return (
        // The persistent preview frame (outer container) already provides border/radius/bg.
        // Keep this empty state frameless to avoid a nested square/rounded container.
        <div className="flex h-full min-h-[220px] w-full flex-col justify-center p-5 text-center text-sm text-[#646B81] dark:text-slate-300">
          <div className="flex w-full justify-center">
            {renderSuggestionButtons(suggestions)}
          </div>
          <div className="mt-5">
            {isBuilding ? (
              <p className="text-base font-medium text-[#4B5168] dark:text-slate-100">
                生成中，将自动刷新
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
        { label: "音频转视频", icon: "Music" as const },
      ];
      return (
        <div className="flex h-full min-h-[220px] w-full flex-col justify-center rounded-[16px] border border-dashed border-[#DDE3F6] bg-[#F7F8FD] p-5 text-center text-sm text-[#646B81] dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
          <div className="flex w-full justify-center">
            {renderSuggestionButtons(suggestions)}
          </div>
          <p className="mt-4 text-base font-medium text-[#4B5168] dark:text-slate-100">
            {isBuilding ? "生成中，将自动刷新" : "暂无生成结果"}
          </p>
        </div>
      );
    }

    const suggestions = [
      { label: "以图生图", icon: "Wand2" },
      { label: "参考图生视频", icon: "Clapperboard" },
      { label: "首帧图生视频", icon: "Clapperboard" },
      { label: "图片换背景", icon: "Eraser" },
    ];
    return (
      <div className="flex h-full w-full flex-col justify-center p-5 text-center text-sm text-[#646B81] dark:text-slate-300">
        <div className="flex w-full justify-center">
          {renderSuggestionButtons(suggestions)}
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
          {isBuilding ? "生成中，将自动刷新" : uploadLinkLabel}
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
            生成中，将自动刷新
          </span>
        </div>
      ) : (
        <span>暂无生成结果</span>
      )}
    </div>
  );
}
