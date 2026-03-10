import {
  forwardRef,
  lazy,
  Suspense,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  useMemo,
  useCallback,
  useState,
  useLayoutEffect,
  useEffect,
  useRef,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/utils";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import {
  parseDoubaoPreviewData,
  useDoubaoPreview,
} from "../../../hooks/use-doubao-preview";
import type { DoubaoPreviewDescriptor } from "../../../hooks/use-doubao-preview";
import { sanitizePreviewDataUrl } from "./helpers";
import { formatFileSize } from "@/utils/stringManipulation";
import useFlowStore from "@/stores/flowStore";
import useAlertStore from "@/stores/alertStore";
import OutputModal from "../outputModal";
import { BASE_URL_API } from "@/constants/constants";
import CropOverlay from "./CropOverlay";
import OutpaintOverlay from "./OutpaintOverlay";
import MultiAngleCameraOverlay, {
  type MultiAngleCameraView,
} from "./MultiAngleCameraOverlay";
import EnhanceOverlay, { type EnhanceModelOption } from "./EnhanceOverlay";
import RepaintOverlay, { type RepaintOverlayHandle } from "./RepaintOverlay";
import EraseOverlay, { type EraseOverlayHandle } from "./EraseOverlay";
import AnnotateOverlay from "./AnnotateOverlay";
import ZoomableImageOverlay from "./ZoomableImageOverlay";
import VideoClipOverlay from "./VideoClipOverlay";
import { cloneDeep } from "lodash";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useTypesStore } from "@/stores/typesStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import { computeAlignedNodeTopY } from "@/CustomNodes/helpers/previewCenterAlignment";
import { getNodeId, scapedJSONStringfy } from "@/utils/reactflowUtils";
import type { EdgeType, GenericNodeType } from "@/types/flow";
import { getAbsolutePosition, getNodeDimensions } from "@/utils/groupingUtils";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";

const PANEL_BG = {
  // Dark mode: avoid translucent tinted backdrops here, otherwise they override the
  // "card surface" background and let the canvas dots bleed through.
  image: "bg-emerald-50/80 dark:bg-transparent",
  video: "bg-sky-50/80 dark:bg-transparent",
  audio: "bg-rose-50/80 dark:bg-transparent",
};

const DOUBAO_KIND: Record<string, "image" | "video" | "audio"> = {
  DoubaoImageCreator: "image",
  DoubaoVideoGenerator: "video",
  DoubaoTTS: "audio",
  UserUploadImage: "image",
  UserUploadVideo: "video",
  UserUploadAudio: "audio",
};

const OUTPUT_NAME_BY_COMPONENT: Record<string, string> = {
  DoubaoImageCreator: "image",
  DoubaoVideoGenerator: "video",
  DoubaoTTS: "audio",
  UserUploadImage: "image",
  UserUploadVideo: "video",
  UserUploadAudio: "audio",
};

type DoubaoPreviewAppearance =
  | "default"
  | "imageCreator"
  | "videoGenerator"
  | "audioCreator";

const DEFAULT_IMAGE_PADDING_PERCENT = 100; // 1:1
// Keep the same fallback geometry as the existing `aspect-[170/100]` class used for video.
const DEFAULT_VIDEO_PADDING_PERCENT = (100 / 170) * 100; // ~58.82%
const PREVIEW_RATIO_FLIP_MIN_SCALE_Y = 0.2;
const PREVIEW_RATIO_FLIP_MAX_SCALE_Y = 5;

// Some node/template updates can remount this component. Cache the last rendered ratio per node so we
// can still animate from the previous value to the new one after mount.
const lastPersistentPreviewPaddingByKey = new Map<string, number>();

function roundPaddingPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

function parseAspectRatioValue(
  rawAspectRatio: string | undefined,
): { width: number; height: number } | null {
  const raw = String(rawAspectRatio ?? "").trim();
  if (!raw) return null;

  // Supports "W:H" (e.g. "16:9") and "WxH" (e.g. "1024x768"), including labels with suffixes.
  const match = raw.match(/(\d+(?:\.\d+)?)\s*[:xX：]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function shouldBypassRatioFlip(fromPaddingPercent: number, toPaddingPercent: number): boolean {
  const scaleY = toPaddingPercent / fromPaddingPercent;
  if (!Number.isFinite(scaleY) || scaleY <= 0) return true;
  return scaleY < PREVIEW_RATIO_FLIP_MIN_SCALE_Y || scaleY > PREVIEW_RATIO_FLIP_MAX_SCALE_Y;
}

function resolvePersistentPreviewPaddingPercent(
  rawAspectRatio: string | undefined,
  appearance: DoubaoPreviewAppearance,
  adaptivePaddingPercent?: number | null,
): number {
  const fallback =
    appearance === "videoGenerator"
      ? DEFAULT_VIDEO_PADDING_PERCENT
      : DEFAULT_IMAGE_PADDING_PERCENT;

  const raw = String(rawAspectRatio ?? "").trim();
  // Treat empty as "adaptive" for the persistent preview frame.
  if (!raw) {
    return roundPaddingPercent(adaptivePaddingPercent ?? fallback);
  }

  const lowered = raw.toLowerCase();
  if (lowered === "adaptive" || lowered === "auto") {
    return roundPaddingPercent(adaptivePaddingPercent ?? fallback);
  }

  const ratio = parseAspectRatioValue(raw);
  if (!ratio) return fallback;

  const percent = (ratio.height / ratio.width) * 100;
  return roundPaddingPercent(percent);
}

function normalizePublicFilePreviewUrl(
  source: unknown,
  kind: "image" | "video" | "audio",
): string | undefined {
  if (typeof source !== "string") return undefined;
  const trimmed = source.trim();
  if (!trimmed) return undefined;
  if (/^(data:|blob:)/i.test(trimmed)) return trimmed;

  // Some components persist `/api/v1/files/public/{flow_id}/{file}?token=...` links
  // (time-limited). For in-app previews we can use stable endpoints without tokens:
  // - images: `/api/v1/files/images/{flow_id}/{file}`
  // - media (video/audio): `/api/v1/files/media/{flow_id}/{file}`
  const marker = "/api/v1/files/public/";
  const idx = trimmed.indexOf(marker);
  if (idx < 0) return trimmed;

  const rest = trimmed.slice(idx + marker.length);
  const withoutQuery = rest.split("?", 1)[0];
  const prefix = trimmed.slice(0, idx);
  const replacement =
    kind === "image" ? "/api/v1/files/images/" : "/api/v1/files/media/";
  return `${prefix}${replacement}${withoutQuery}`;
}

function toStableInternalFileUrl(
  source: unknown,
  kind: "image" | "video" | "audio",
): string | undefined {
  if (typeof source !== "string") return undefined;
  const trimmed = source.trim();
  if (!trimmed) return undefined;

  const publicNormalized = normalizePublicFilePreviewUrl(trimmed, kind);
  const normalizedCandidate = (publicNormalized ?? trimmed).trim();
  if (/^(data:|blob:|https?:)/i.test(normalizedCandidate)) return normalizedCandidate;

  const normalized = normalizedCandidate.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("api/v1/files/")) {
    return `/${normalized}`;
  }
  if (normalized.startsWith("files/")) {
    return `${BASE_URL_API}${normalized}`;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const [flowId, ...rest] = parts;
  const encodedFlow = encodeURIComponent(flowId);
  const encodedFile = rest.map((p) => encodeURIComponent(p)).join("/");
  const prefix = kind === "image" ? "files/images/" : "files/media/";
  return `${BASE_URL_API}${prefix}${encodedFlow}/${encodedFile}`;
}

async function tryPreloadVideoMetadata(url: string, timeoutMs = 9000): Promise<boolean> {
  if (typeof document === "undefined") return true;
  const src = String(url ?? "").trim();
  if (!src) return false;

  return await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    // Preload enough data for the first frame so the downstream node appears "ready".
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    const onReady = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    const onErr = () => {
      window.clearTimeout(timer);
      finish(false);
    };

    // Prefer first-frame readiness; fall back to metadata if the browser can't decode yet.
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onErr, { once: true });
    video.src = src;
    try {
      video.load();
    } catch {
      // ignore
    }
  });
}

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
  enterAnnotate: () => void;
  canAnnotate: boolean;
  isAnnotateOpen: boolean;
  enterRepaint: () => void;
  runRepaint: () => void;
  canRepaint: boolean;
  isRepaintOpen: boolean;
  enterErase: () => void;
  runErase: () => void;
  canErase: boolean;
  isEraseOpen: boolean;
  runCutout: () => void;
  canCutout: boolean;
  enterCrop: () => void;
  canCrop: boolean;
  enterEnhance: () => void;
  canEnhance: boolean;
  isEnhanceOpen: boolean;
  enterOutpaint: () => void;
  canOutpaint: boolean;
  isOutpaintOpen: boolean;
  enterMultiAngleCamera: () => void;
  canMultiAngleCamera: boolean;
  isMultiAngleCameraOpen: boolean;
  enterClip: () => void;
  canClip: boolean;
  isClipOpen: boolean;
  runVideoUpscale: () => void;
  canVideoUpscale: boolean;
};

type Props = {
  nodeId: string;
  componentName?: string;
  appearance?: DoubaoPreviewAppearance;
  referenceImages?: DoubaoReferenceImage[];
  onRequestUpload?: () => void;
  onSuggestionClick?: (label: string) => void;
  onActionsChange?: (actions: DoubaoPreviewPanelActions) => void;
  aspectRatio?: string;
  // Used by "user upload" nodes to preview uploaded assets without requiring a build/run.
  previewOverride?: DoubaoPreviewDescriptor | null;
  // Used by parent layouts to sync UI (e.g. "+" handles) with the persistent preview resize animation.
  onPersistentPreviewMotionStart?: (motion: {
    deltaTopPx: number;
    deltaCenterPx: number;
    durationMs: number;
    easing: string;
  }) => void;
  onPersistentPreviewMotionCommit?: () => void;
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
  role?: "first" | "reference" | "last";
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
      previewOverride = null,
      onPersistentPreviewMotionStart,
      onPersistentPreviewMotionCommit,
    },
    forwardedRef,
  ) => {
    const { preview: hookPreview, isBuilding, rawMessage } = useDoubaoPreview(
      nodeId,
      componentName,
    );
    const preview = previewOverride ?? hookPreview;
    const nodes = useFlowStore((state) => state.nodes);
    const setNode = useFlowStore((state) => state.setNode);
    const setNodes = useFlowStore((state) => state.setNodes);
    const setEdges = useFlowStore((state) => state.setEdges);
    const buildFlow = useFlowStore((state) => state.buildFlow);
    const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
    const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
    const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
    const { mutateAsync: uploadReferenceFile } = usePostUploadFile();
    const setSuccessData = useAlertStore((state) => state.setSuccessData);
    const setErrorData = useAlertStore((state) => state.setErrorData);
    const setNoticeData = useAlertStore((state) => state.setNoticeData);
    const templates = useTypesStore((state) => state.templates);
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
        template?.model_name?.value ?? template?.model_name?.default ?? "";
      return String(value ?? "").trim();
    }, [node]);
    const normalizedSelectedModelName = useMemo(
      () => selectedModelName.toLowerCase(),
      [selectedModelName],
    );
    const isViduUpscaleVideoGenerator =
      appearance === "videoGenerator" &&
      normalizedSelectedModelName === "vidu-upscale";

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
    const failureMessages = useMemo(() => {
      const merged = [
        ...(typeof resolvedPreview?.error === "string" ? [resolvedPreview.error] : []),
        ...extractFailureMessagesFromRawMessage(rawMessage),
      ];
      const normalized = merged
        .map((item) => decodeEscapedUnicodeText(String(item ?? "").trim()))
        .filter(Boolean);
      return Array.from(new Set(normalized));
    }, [rawMessage, resolvedPreview?.error]);
    const primaryFailureReason = failureMessages[0] ?? "";
    const lastFailureAlertKeyRef = useRef<string | null>(null);
    useEffect(() => {
      if (!primaryFailureReason) return;
      const fingerprint = [
        nodeId,
        resolvedPreview?.token ?? "",
        resolvedPreview?.generated_at ?? "",
        primaryFailureReason,
      ].join("|");

      const isInitial = lastFailureAlertKeyRef.current === null;

      if (fingerprint === lastFailureAlertKeyRef.current) return;
      lastFailureAlertKeyRef.current = fingerprint;

      if (isInitial) {
        return;
      }

      setErrorData({
        title: "创作失败，请重试；若多次失败请联系客服",
        list: [primaryFailureReason],
      });
    }, [
      nodeId,
      primaryFailureReason,
      resolvedPreview?.generated_at,
      resolvedPreview?.token,
      setErrorData,
    ]);

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
    const [isPersistentPreviewHovered, setIsPersistentPreviewHovered] =
      useState(false);

    // Hover autoplay starts muted (browser policy-friendly). Users can opt-in to sound per node.
    const [isHoverAutoplayMuted, setIsHoverAutoplayMuted] = useState(true);
    const hoverVideoElementRef = useRef<HTMLVideoElement | null>(null);
    const [previewVideoEl, setPreviewVideoEl] = useState<HTMLVideoElement | null>(
      null,
    );
    const handleHoverVideoElement = useCallback((el: HTMLVideoElement | null) => {
      hoverVideoElementRef.current = el;
      setPreviewVideoEl(el);
    }, []);

    const handleToggleHoverAutoplaySound = useCallback(
      (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        setIsHoverAutoplayMuted((prev) => {
          const next = !prev;
          const video = hoverVideoElementRef.current;
          if (video) {
            try {
              video.muted = next;
              if (!next) video.volume = 1;
            } catch {
              // ignore
            }
          }
          return next;
        });
      },
      [],
    );

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

    // PERF NOTE:
    // We use the padding-bottom percentage technique for geometry. For animation, we *don't* animate
    // padding-bottom (layout animation triggers heavy XYFlow internals updates per frame). Instead we do a
    // FLIP-style transform animation so ReactFlow/XYFlow only sees one size change.
    const isPersistentPreview =
      appearance === "imageCreator" || appearance === "videoGenerator";
    const paddingCacheKey = `${nodeId}:${appearance}`;
    const [adaptivePaddingPercent, setAdaptivePaddingPercent] = useState<number | null>(
      null,
    );
    const handlePreviewMeta = useCallback((meta: any) => {
      const width = Number(meta?.width);
      const height = Number(meta?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (width <= 0 || height <= 0) return;
      const percent = (height / width) * 100;
      const clamped = Math.max(0, Math.round(percent * 100) / 100);
      setAdaptivePaddingPercent(clamped);
    }, []);
    const targetPaddingPercent = useMemo(() => {
      if (!isPersistentPreview) return null;
      return resolvePersistentPreviewPaddingPercent(
        aspectRatio,
        appearance,
        adaptivePaddingPercent,
      );
    }, [appearance, aspectRatio, isPersistentPreview, adaptivePaddingPercent]);

    // Geometry used for layout (padding-bottom). For performance we avoid animating layout; we animate with
    // transforms and only "commit" a single layout size change.
    const [layoutPaddingPercent, setLayoutPaddingPercent] = useState(() => {
      if (!isPersistentPreview || targetPaddingPercent === null) {
        return DEFAULT_IMAGE_PADDING_PERCENT;
      }
      return lastPersistentPreviewPaddingByKey.get(paddingCacheKey) ?? targetPaddingPercent;
    });

    const [isRatioTransitioning, setIsRatioTransitioning] = useState(false);
    const persistentPreviewFrameRef = useRef<HTMLDivElement | null>(null);
    const persistentPreviewScaleShieldRef = useRef<HTMLDivElement | null>(null);
    const persistentPreviewTranslateLayerRef = useRef<HTMLDivElement | null>(null);
    const pendingRatioAnimationRef = useRef<{
      fromScaleY: number;
      toScaleY: number;
      finalizePaddingPercent: number | null;
    } | null>(null);
    const shouldResetTransformsOnNextLayoutRef = useRef(false);
    const ratioAnimSeqRef = useRef(0);
    const [ratioAnimSeq, setRatioAnimSeq] = useState(0);
    const ratioFrameAnimationRef = useRef<Animation | null>(null);
    const transitionEndFallbackRef = useRef<((event: TransitionEvent) => void) | null>(
      null,
    );

    // Decide how to animate when target aspect ratio changes.
    useEffect(() => {
      if (!isPersistentPreview) return;
      if (targetPaddingPercent === null) return;
      if (layoutPaddingPercent === targetPaddingPercent) return;

      // Cancel any in-flight animation.
      ratioFrameAnimationRef.current?.cancel();
      ratioFrameAnimationRef.current = null;
      const el = persistentPreviewFrameRef.current;
      if (el && transitionEndFallbackRef.current) {
        el.removeEventListener("transitionend", transitionEndFallbackRef.current);
        transitionEndFallbackRef.current = null;
      }

      // Animate the frame itself first (compositor), then commit the real layout size at the end.
      // This avoids the "instant resize then animate" jump, while keeping XYFlow work minimal.
      const current = layoutPaddingPercent;
      const next = targetPaddingPercent;
      // Extreme jumps (e.g. 1:8 <-> 8:1) can cause visual artifacts with FLIP scale/shield.
      // Fall back to an immediate layout commit for those cases to keep the preview stable.
      if (shouldBypassRatioFlip(current, next)) {
        pendingRatioAnimationRef.current = null;
        shouldResetTransformsOnNextLayoutRef.current = false;
        const frameEl = persistentPreviewFrameRef.current;
        const shieldEl = persistentPreviewScaleShieldRef.current;
        const translateEl = persistentPreviewTranslateLayerRef.current;
        if (frameEl) {
          frameEl.style.transform = "";
          frameEl.style.transition = "";
          frameEl.style.transformOrigin = "";
          frameEl.style.willChange = "";
        }
        if (shieldEl) {
          shieldEl.style.transform = "";
          shieldEl.style.transition = "";
          shieldEl.style.transformOrigin = "";
          shieldEl.style.willChange = "";
        }
        if (translateEl) {
          translateEl.style.transform = "";
          translateEl.style.transition = "";
          translateEl.style.willChange = "";
        }
        setIsRatioTransitioning(false);
        setLayoutPaddingPercent(next);
        onPersistentPreviewMotionCommit?.();
        return;
      }
      pendingRatioAnimationRef.current = {
        fromScaleY: 1,
        toScaleY: next / current,
        finalizePaddingPercent: next,
      };

      ratioAnimSeqRef.current += 1;
      setRatioAnimSeq(ratioAnimSeqRef.current);
    }, [
      isPersistentPreview,
      layoutPaddingPercent,
      onPersistentPreviewMotionCommit,
      targetPaddingPercent,
    ]);

    useEffect(() => {
      if (!isPersistentPreview) return;
      lastPersistentPreviewPaddingByKey.set(paddingCacheKey, layoutPaddingPercent);
    }, [isPersistentPreview, paddingCacheKey, layoutPaddingPercent]);

    const containerStyle = useMemo(() => {
      if (!isPersistentPreview || targetPaddingPercent === null) return undefined;
      // For extreme ratio jumps we bypass FLIP and render target geometry immediately
      // to avoid a one-frame stale layout flash (e.g. 1:1 briefly shown before 8:1).
      const shouldUseTargetImmediately =
        layoutPaddingPercent !== targetPaddingPercent &&
        shouldBypassRatioFlip(layoutPaddingPercent, targetPaddingPercent);
      const displayPaddingPercent = shouldUseTargetImmediately
        ? targetPaddingPercent
        : layoutPaddingPercent;
      return {
        position: "relative" as const,
        width: "100%",
        height: 0,
        paddingBottom: `${displayPaddingPercent}%`,
      };
    }, [isPersistentPreview, layoutPaddingPercent, targetPaddingPercent]);

    // Start the ratio animation after the DOM has applied any needed layout change.
    useLayoutEffect(() => {
      if (!isPersistentPreview) return;
      if (targetPaddingPercent === null) return;

      const frameEl = persistentPreviewFrameRef.current;
      const shieldEl = persistentPreviewScaleShieldRef.current;
      const translateEl = persistentPreviewTranslateLayerRef.current;
      if (!frameEl) return;
      if (!shieldEl || !translateEl) return;

      // If we just committed a shrink (layout changed after finishing the animation), clear transforms before paint.
      if (shouldResetTransformsOnNextLayoutRef.current) {
        shouldResetTransformsOnNextLayoutRef.current = false;
        frameEl.style.willChange = "";
        frameEl.style.transformOrigin = "";
        frameEl.style.transform = "";
        frameEl.style.transition = "";
        shieldEl.style.willChange = "";
        shieldEl.style.transformOrigin = "";
        shieldEl.style.transform = "";
        shieldEl.style.transition = "";
        translateEl.style.willChange = "";
        translateEl.style.transform = "";
        translateEl.style.transition = "";
        setIsRatioTransitioning(false);
        onPersistentPreviewMotionCommit?.();
        return;
      }

      const request = pendingRatioAnimationRef.current;
      if (!request) return;
      pendingRatioAnimationRef.current = null;

      const { fromScaleY, toScaleY, finalizePaddingPercent } = request;
      if (!Number.isFinite(fromScaleY) || !Number.isFinite(toScaleY)) return;
      if (Math.abs(fromScaleY - toScaleY) < 0.002) return;

      // Cancel any in-flight animation and detach fallback listeners.
      ratioFrameAnimationRef.current?.cancel();
      ratioFrameAnimationRef.current = null;
      if (transitionEndFallbackRef.current) {
        frameEl.removeEventListener("transitionend", transitionEndFallbackRef.current);
        transitionEndFallbackRef.current = null;
      }

      setIsRatioTransitioning(true);
      // Match expected behavior: keep the bottom edge visually anchored while resizing.
      frameEl.style.transformOrigin = "bottom";
      frameEl.style.willChange = "transform";
      shieldEl.style.transformOrigin = "bottom";
      shieldEl.style.willChange = "transform";
      translateEl.style.willChange = "transform";

      const cleanup = () => {
        frameEl.style.willChange = "";
        frameEl.style.transformOrigin = "";
        frameEl.style.transition = "";
        frameEl.style.transform = "";
        shieldEl.style.willChange = "";
        shieldEl.style.transformOrigin = "";
        shieldEl.style.transition = "";
        shieldEl.style.transform = "";
        translateEl.style.willChange = "";
        translateEl.style.transition = "";
        translateEl.style.transform = "";
        setIsRatioTransitioning(false);
      };

      const durationMs = 200;
      const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

      // Use unscaled layout pixels so the animation stays correct under canvas zoom.
      const baseHeightPx = frameEl.offsetHeight || frameEl.getBoundingClientRect().height;
      const deltaTopPx = (1 - toScaleY) * baseHeightPx;
      const deltaCenterPx = deltaTopPx / 2;
      onPersistentPreviewMotionStart?.({
        deltaTopPx,
        deltaCenterPx,
        durationMs,
        easing,
      });

      // Pre-apply starting transforms so we never flash the "final" frame before the animation begins.
      frameEl.style.transform = `scaleY(${fromScaleY})`;
      shieldEl.style.transform = "scaleY(1)";
      translateEl.style.transform = "translateY(0px)";

      if (
        typeof frameEl.animate === "function" &&
        typeof shieldEl.animate === "function" &&
        typeof translateEl.animate === "function"
      ) {
        const frameAnim = frameEl.animate(
          [{ transform: `scaleY(${fromScaleY})` }, { transform: `scaleY(${toScaleY})` }],
          { duration: durationMs, easing, fill: "both" },
        );
        ratioFrameAnimationRef.current = frameAnim;
        const shieldAnim = shieldEl.animate(
          [{ transform: "scaleY(1)" }, { transform: `scaleY(${1 / toScaleY})` }],
          { duration: durationMs, easing, fill: "both" },
        );
        const translateAnim = translateEl.animate(
          // Keep inner content unscaled (via shield) and re-center it within the scaled frame.
          [{ transform: "translateY(0px)" }, { transform: `translateY(${deltaCenterPx}px)` }],
          { duration: durationMs, easing, fill: "both" },
        );

        frameAnim.onfinish = () => {
          // Freeze final transforms as inline styles so we can commit the real layout size without a flash.
          frameEl.style.transform = `scaleY(${toScaleY})`;
          shieldEl.style.transform = `scaleY(${1 / toScaleY})`;
          translateEl.style.transform = `translateY(${deltaCenterPx}px)`;

          // Remove the animation effect stack (now that the final state is captured in inline styles).
          try {
            frameAnim.cancel();
          } catch {
            // ignore
          }
          try {
            shieldAnim.cancel();
          } catch {
            // ignore
          }
          try {
            translateAnim.cancel();
          } catch {
            // ignore
          }
          ratioFrameAnimationRef.current = null;

          // Commit the layout size; transforms will be cleared in the next layout effect (before paint).
          if (finalizePaddingPercent !== null) {
            shouldResetTransformsOnNextLayoutRef.current = true;
            setLayoutPaddingPercent(finalizePaddingPercent);
            return;
          }

          cleanup();
        };
        frameAnim.oncancel = () => {
          ratioFrameAnimationRef.current = null;
          cleanup();
        };
        return;
      }

      // Fallback: CSS transition on transform (frame + content).
      frameEl.style.transition = "none";
      shieldEl.style.transition = "none";
      translateEl.style.transition = "none";
      void frameEl.getBoundingClientRect();
      requestAnimationFrame(() => {
        frameEl.style.transition = `transform ${durationMs}ms ${easing}`;
        shieldEl.style.transition = `transform ${durationMs}ms ${easing}`;
        translateEl.style.transition = `transform ${durationMs}ms ${easing}`;
        frameEl.style.transform = `scaleY(${toScaleY})`;
        shieldEl.style.transform = `scaleY(${1 / toScaleY})`;
        translateEl.style.transform = `translateY(${deltaCenterPx}px)`;
      });

      const onEnd = (event: TransitionEvent) => {
        if (event.target !== frameEl) return;
        if (event.propertyName !== "transform") return;
        frameEl.removeEventListener("transitionend", onEnd);
        transitionEndFallbackRef.current = null;

        if (finalizePaddingPercent !== null) {
          // Capture final transforms for the same reason as the WAAPI branch.
          frameEl.style.transform = `scaleY(${toScaleY})`;
          shieldEl.style.transform = `scaleY(${1 / toScaleY})`;
          translateEl.style.transform = `translateY(${deltaCenterPx}px)`;
          shouldResetTransformsOnNextLayoutRef.current = true;
          setLayoutPaddingPercent(finalizePaddingPercent);
          return;
        }
        cleanup();
      };
      transitionEndFallbackRef.current = onEnd;
      frameEl.addEventListener("transitionend", onEnd);
    }, [isPersistentPreview, layoutPaddingPercent, ratioAnimSeq, targetPaddingPercent]);

    useEffect(() => {
      return () => {
        const el = persistentPreviewFrameRef.current;
        const shieldEl = persistentPreviewScaleShieldRef.current;
        const translateEl = persistentPreviewTranslateLayerRef.current;
        ratioFrameAnimationRef.current?.cancel();
        ratioFrameAnimationRef.current = null;
        if (el && transitionEndFallbackRef.current) {
          el.removeEventListener("transitionend", transitionEndFallbackRef.current);
          transitionEndFallbackRef.current = null;
        }
        // Ensure no stale transforms persist if the node unmounts mid-animation.
        if (el) {
          el.style.transform = "";
          el.style.transition = "";
          el.style.transformOrigin = "";
          el.style.willChange = "";
        }
        if (shieldEl) {
          shieldEl.style.transform = "";
          shieldEl.style.transition = "";
          shieldEl.style.transformOrigin = "";
          shieldEl.style.willChange = "";
        }
        if (translateEl) {
          translateEl.style.transform = "";
          translateEl.style.transition = "";
          translateEl.style.willChange = "";
        }
      };
    }, []);


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
        : "mt-3 rounded-3xl border border-muted-foreground/20 bg-white/80 p-4 shadow-sm transition-colors transition-shadow duration-200 ease-out hover:shadow-md dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:hover:shadow-[0_18px_45px_rgba(0,0,0,0.30)]",
    );

    const previewFrameClassName = cn(
      "relative flex",
      isMinimal
        ? appearance === "imageCreator" || appearance === "videoGenerator"
          ? cn(
            "w-full max-w-full",
            minimalAspectClass,
            // Fallback to aspect-square if no style is applied and no specific ratio class? 
            // Actually, if we remove aspect-square, it might collapse if empty. 
            // We should ensure a default aspect ratio exists if the computed one is missing.
            !containerStyle && "aspect-square",
            // Single preview container for image creator (avoid nested frames inside the renderer).
            cn(
              "overflow-hidden rounded-[16px] border border-[#DDE3F6] bg-[#F7F8FD] p-0 shadow-none transition-all duration-200 ease-in-out [contain:layout_paint] hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:hover:border-white/20 dark:hover:shadow-[0_18px_45px_rgba(0,0,0,0.30)]",
              // backdrop-filter can force repaints during transform/layout changes; disable it only while animating.
              isRatioTransitioning && "dark:backdrop-blur-none",
              // Keep selected shadow/ring visible during the ratio animation so the selection
              // styling tracks the frame as it scales, instead of popping at the end.
              isNodeSelected &&
              "border-violet-500 ring-2 ring-violet-500/20 shadow-[0_0_20px_rgba(139,92,246,0.15)] scale-[1.01] dark:border-violet-500/50 dark:ring-violet-500/30 dark:shadow-[0_0_20px_rgba(139,92,246,0.2)]",
            ),
          )
          : cn(
            "w-full max-w-full",
            minimalAspectClass,
            cn(
              "rounded-[20px] border border-[#E6E9F4] bg-gradient-to-b from-white to-[#F7F8FD] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-all duration-200 ease-in-out dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_15px_40px_rgba(0,0,0,0.30)]",
              isNodeSelected && "border-violet-500 ring-2 ring-violet-500/20 shadow-[0_0_20px_rgba(139,92,246,0.15)] scale-[1.01] dark:border-violet-500/50 dark:ring-violet-500/30 dark:shadow-[0_0_20px_rgba(139,92,246,0.2)]",
            ),
          )
        : "min-h-[320px] overflow-hidden rounded-3xl border border-dashed border-muted-foreground/30 p-3 dark:border-white/10 transition-all duration-200 ease-in-out",
      panelClass,
      !isMinimal && isNodeSelected && "border-violet-500 ring-2 ring-violet-500/20 shadow-[0_0_20px_rgba(139,92,246,0.15)] scale-[1.01] dark:border-violet-500/50 dark:ring-violet-500/30 dark:shadow-[0_0_20px_rgba(139,92,246,0.2)]",
    );

    const previewSurfaceClassName = cn(
      "flex items-center justify-center",
      isMinimal
        ? appearance === "imageCreator" || appearance === "videoGenerator"
          // Use absolute positioning to fill the padding-bottom created space
          ? "absolute inset-0 bg-transparent"
          : "h-full w-full rounded-[16px] bg-[#F9FAFE] dark:bg-neutral-800/80 dark:backdrop-blur-xl"
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
    const [isAnnotateOpen, setAnnotateOpen] = useState(false);
    const [isRepaintOpen, setRepaintOpen] = useState(false);
    const [isEraseOpen, setEraseOpen] = useState(false);
    const [isCropOpen, setCropOpen] = useState(false);
    const [isEnhanceOpen, setEnhanceOpen] = useState(false);
    const [isOutpaintOpen, setOutpaintOpen] = useState(false);
    const [isMultiAngleCameraOpen, setMultiAngleCameraOpen] = useState(false);
    const [isClipOpen, setClipOpen] = useState(false);
    const [isClipTrimming, setClipTrimming] = useState(false);
    const [isAnnotateUploading, setAnnotateUploading] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const repaintOverlayRef = useRef<RepaintOverlayHandle | null>(null);
    const eraseOverlayRef = useRef<EraseOverlayHandle | null>(null);

    const enableHoverAutoplay =
      isMinimal && appearance === "videoGenerator" && !isClipOpen;

    const [clipVideoDurationS, setClipVideoDurationS] = useState(0);
    useEffect(() => {
      if (!isClipOpen) return;
      // Seed from preview payload (if present) to avoid a 0-duration flash.
      const seed = Number((resolvedPreview as any)?.payload?.duration);
      if (Number.isFinite(seed) && seed > 0) {
        setClipVideoDurationS((prev) => (prev > 0 ? prev : seed));
      }
      const video = previewVideoEl;
      if (!video) return;
      const onMeta = () => setClipVideoDurationS(video.duration || 0);
      onMeta();
      video.addEventListener("loadedmetadata", onMeta);
      return () => {
        video.removeEventListener("loadedmetadata", onMeta);
      };
    }, [isClipOpen, previewVideoEl, resolvedPreview]);

    // Entering clip mode disables hover autoplay; ensure video isn't inadvertently started by hover.
    useEffect(() => {
      if (!isClipOpen) return;
      setIsPersistentPreviewHovered(false);
      const video = previewVideoEl;
      if (!video) return;
      try {
        video.pause();
      } catch {
        // ignore
      }
    }, [isClipOpen, previewVideoEl]);

    // While mask editors are open (repaint/erase), completely disable ReactFlow handle pointer events
    // to prevent accidental edge/handle interactions through the overlay.
    useEffect(() => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const cls = "doubao-mask-editor-mode";
      const styleId = "doubao-mask-editor-mode-style";
      const shouldEnable = Boolean(isRepaintOpen || isEraseOpen);
      if (shouldEnable) {
        root.classList.add(cls);
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          // XYFlow/ReactFlow handle class names vary by version; cover both to ensure handles are inert
          // while mask editors are open. Also disable pointer events on the nested plus bubbles.
          style.textContent = `
            .${cls} .react-flow__handle,
            .${cls} .xyflow__handle,
            .${cls} .react-flow__handle .source,
            .${cls} .react-flow__handle .target,
            .${cls} .xyflow__handle .source,
            .${cls} .xyflow__handle .target {
              pointer-events: none !important;
            }
          `;
          document.head.appendChild(style);
        }
      } else {
        root.classList.remove(cls);
      }
    }, [isEraseOpen, isRepaintOpen]);

    // While clip editor is open, hide handles/"+" bubbles to avoid accidental canvas interactions.
    useEffect(() => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const cls = "doubao-clip-editor-mode";
      if (isClipOpen) root.classList.add(cls);
      else root.classList.remove(cls);
      return () => root.classList.remove(cls);
    }, [isClipOpen]);

    // While annotate editor is open, hide handles/"+" bubbles to avoid accidental canvas interactions.
    useEffect(() => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const cls = "doubao-annotate-editor-mode";
      if (isAnnotateOpen) root.classList.add(cls);
      else root.classList.remove(cls);
      return () => root.classList.remove(cls);
    }, [isAnnotateOpen]);

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
          const normalizedRemoteSource = normalizePublicFilePreviewUrl(
            remoteSource,
            "image",
          );
          // Prefer inline/base64 previews for rendering. Upstream `image_url` links can be short-lived
          // (presigned) and may fail after a page reload.
          const resolvedSource =
            inlineSource ?? normalizedRemoteSource ?? entry?.data_url;
          if (!resolvedSource) return;

          galleryItems.push({
            imageSource: sanitizePreviewDataUrl(resolvedSource) ?? resolvedSource,
            // For downloads prefer the original remote URL when available; fallback to inline/data URLs.
            downloadSource:
              normalizedRemoteSource ?? inlineSource ?? resolvedSource,
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
      const normalizedRemoteFallback = normalizePublicFilePreviewUrl(
        remoteFallback,
        "image",
      );

      if (!inlineFallback && !normalizedRemoteFallback) {
        return null;
      }

      return [
        {
          imageSource: inlineFallback ?? normalizedRemoteFallback!,
          downloadSource: normalizedRemoteFallback ?? inlineFallback ?? "",
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
            role: item.role,
          };
        })
        .filter(Boolean) as GalleryItem[];
    }, [kind, referenceImages]);
    const referenceSelectionCount = referenceGallery.length;

    const videoPreview = useMemo(() => {
      if (kind !== "video") return null;

      if (resolvedPreview?.payload) {
        // 优先使用 base64 编码的视频（避免认证问题）
        const videoBase64: string | undefined = resolvedPreview.payload?.video_base64;
        const videoUrl: string | undefined = resolvedPreview.payload?.video_url;
        const finalVideoUrl =
          videoBase64 || normalizePublicFilePreviewUrl(videoUrl, "video") || videoUrl;
        if (finalVideoUrl) {
          return {
            videoUrl: finalVideoUrl,
            poster:
              resolvedPreview.payload?.cover_preview_base64 ||
              normalizePublicFilePreviewUrl(resolvedPreview.payload?.cover_url, "image") ||
              resolvedPreview.payload?.cover_url,
            duration: resolvedPreview.payload?.duration,
            extension: inferExtensionFromSource(finalVideoUrl, "mp4"),
          };
        }
      }

      // 视频创作：如果还没有生成输出，优先预览第一段上传的参考视频。
      if (appearance === "videoGenerator" && referenceImages.length) {
        const candidate = referenceImages.find((item) => {
          const src = item?.imageSource || item?.downloadSource || "";
          return isVideoCandidate(src, item?.fileName);
        });
        if (!candidate) return null;
        const src = candidate.imageSource || candidate.downloadSource || "";
        if (!src) return null;
        return {
          videoUrl: normalizePublicFilePreviewUrl(src, "video") || src,
          poster: undefined,
          duration: undefined,
          extension: inferExtensionFromSource(src, "mp4"),
        };
      }

      return null;
    }, [appearance, kind, referenceImages, resolvedPreview]);

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
      kind === "video" &&
      !isViduUpscaleVideoGenerator &&
      Boolean(videoPreview);
    const hasAudioPreview =
      kind === "audio" && Boolean(resolvedPreview?.available && audioPreview);
    const hasSuccessfulGeneratedPreview =
      hasGeneratedImagePreview || hasVideoPreview || hasAudioPreview;
    const shouldShowFailurePreview =
      Boolean(primaryFailureReason) &&
      !hasSuccessfulGeneratedPreview &&
      !isViduUpscaleVideoGenerator;

    const hasHoverAutoplayVideo = Boolean(
      isPersistentPreview &&
      enableHoverAutoplay &&
      kind === "video" &&
      !isViduUpscaleVideoGenerator &&
      videoPreview?.videoUrl,
    );

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
    const shouldShowWaveLoading = isMinimal && isBuilding;
    const emptyPreviewBuildingState = isBuilding && !shouldShowWaveLoading;
    const handleRetryFailedBuild = useCallback(() => {
      void buildFlow({ stopNodeId: nodeId });
      showTransientBadge("已发起重试");
    }, [buildFlow, nodeId, showTransientBadge]);
    const handleContactSupport = useCallback(() => {
      setErrorData({
        title: "请联系客服并附上失败原因",
        list: [primaryFailureReason || "创作失败，请稍后重试。"],
      });
    }, [primaryFailureReason, setErrorData]);

    const isCapturingFrameRef = useRef(false);
    const handleCaptureHoverVideoFrame = useCallback(
      async (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (isCapturingFrameRef.current) return;
        if (!hasHoverAutoplayVideo) return;

        if (!currentFlowId) {
          showTransientBadge("请先保存画布后再截帧");
          return;
        }

        const template = (templates as any)?.UserUploadImage;
        if (!template) {
          showTransientBadge("未加载到“上传图片（UserUploadImage）”模板");
          return;
        }

        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;

        const video = hoverVideoElementRef.current;
        if (!video) {
          showTransientBadge("视频未就绪");
          return;
        }
        if ((video as any).readyState !== undefined && video.readyState < 2) {
          showTransientBadge("视频加载中，请稍后");
          return;
        }

        // Global notice while generating/uploading the captured frame.
        setNoticeData({ title: "正在生成视频截帧..." });
        isCapturingFrameRef.current = true;
        try {
          const width = Number(video.videoWidth || 0);
          const height = Number(video.videoHeight || 0);
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            showTransientBadge("视频元数据未就绪");
            return;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setErrorData({ title: "视频截帧失败" });
            showTransientBadge("截帧失败");
            return;
          }

          try {
            ctx.drawImage(video, 0, 0, width, height);
          } catch (error) {
            console.error("Failed to draw video frame:", error);
            setErrorData({ title: "视频截帧失败", list: ["跨域视频无法截取"] });
            showTransientBadge("截帧失败（跨域视频无法截取）");
            return;
          }

          const blob = await new Promise<Blob>((resolve, reject) => {
            try {
              canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
                "image/png",
              );
            } catch (e) {
              reject(e);
            }
          });

          const fileName = `video_frame_${Date.now()}.png`;
          let uploadedPath = "";
          try {
            const file = new File([blob], fileName, { type: blob.type || "image/png" });
            const resp: any = await uploadReferenceFile({ file, id: currentFlowId });
            uploadedPath = String(resp?.file_path ?? "").trim();
          } catch (error) {
            console.error("Failed to upload captured frame:", error);
            setErrorData({ title: "视频截帧上传失败" });
            showTransientBadge("上传失败");
            return;
          }
          if (!uploadedPath) {
            setErrorData({ title: "视频截帧上传失败" });
            showTransientBadge("上传失败");
            return;
          }

          // Preload the uploaded image so the new node appears with the frame already rendered.
          const previewUrl = toStableInternalFileUrl(uploadedPath, "image");
          if (previewUrl) {
            try {
              const preload = new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                  // Best-effort decode to reduce the "new node appears then stutters" effect.
                  const decode = (img as any).decode;
                  if (typeof decode === "function") {
                    (decode.call(img) as Promise<void>).then(resolve).catch(resolve);
                    return;
                  }
                  resolve();
                };
                img.onerror = () => reject(new Error("image load failed"));
                img.src = previewUrl;
              });
              await Promise.race([
                preload,
                new Promise<void>((resolve) => window.setTimeout(resolve, 8000)),
              ]);
            } catch {
              // ignore (still create the node even if preload fails)
            }
          }

          takeSnapshot?.();

          const seeded = cloneDeep(template);
          seeded.display_name = "视频截帧";
          if (seeded.template?.file) {
            seeded.template.file.value = fileName;
            seeded.template.file.file_path = uploadedPath;
          }

          const newNodeId = getNodeId("UserUploadImage");
          const NODE_OFFSET_X = 760;
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
          const newNodeX = abs.x + NODE_OFFSET_X;
          const newNodeY = computeAlignedNodeTopY({
            anchorNodeId: nodeId,
            anchorNodeType: currentFlowNode.data?.type,
            targetNodeType: "UserUploadImage",
            targetX: newNodeX,
            fallbackTopY: abs.y + 80,
            avoidOverlap: true,
          });

          const newImageNode: GenericNodeType = {
            id: newNodeId,
            type: "genericNode",
            position: { x: newNodeX, y: newNodeY },
            data: {
              node: seeded as any,
              showNode: !(seeded as any).minimized,
              type: "UserUploadImage",
              id: newNodeId,
            },
            selected: false,
          };

          unstable_batchedUpdates(() => {
            setNodes((currentNodes: any[]) => [...(currentNodes ?? []), newImageNode as any]);
          });

          setSuccessData({ title: "视频截帧已生成" });
          showTransientBadge("已生成“视频截帧”");
        } finally {
          isCapturingFrameRef.current = false;
        }
      },
      [
        currentFlowId,
        hasHoverAutoplayVideo,
        nodeId,
        nodes,
        setNodes,
        setErrorData,
        setNoticeData,
        setSuccessData,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );

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

    // Prime adaptive ratio immediately from known metadata (avoids waiting for <img>/<video> metadata events).
    useEffect(() => {
      if (!isPersistentPreview) return;
      if (kind !== "image") return;
      const width = Number(currentImage?.width);
      const height = Number(currentImage?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (width <= 0 || height <= 0) return;
      const percent = (height / width) * 100;
      setAdaptivePaddingPercent(Math.max(0, Math.round(percent * 100) / 100));
    }, [currentImage?.height, currentImage?.width, isPersistentPreview, kind]);

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



    const [previewFileSizeBytes, setPreviewFileSizeBytes] = useState<number | null>(null);
    useEffect(() => {
      if (!isPreviewModalOpen) {
        setPreviewFileSizeBytes(null);
        return;
      }
      const source = downloadInfo?.source;
      if (!source) {
        setPreviewFileSizeBytes(null);
        return;
      }

      const payload: any = resolvedPreview?.payload ?? null;
      const fromPayload = Number(
        payload?.file_size ?? payload?.fileSize ?? payload?.size_bytes ?? payload?.bytes,
      );
      if (Number.isFinite(fromPayload) && fromPayload > 0) {
        setPreviewFileSizeBytes(fromPayload);
        return;
      }

      const dataBytes = computeDataUrlBytes(source);
      if (dataBytes != null) {
        setPreviewFileSizeBytes(dataBytes);
        return;
      }

      if (typeof fetch === "undefined") {
        setPreviewFileSizeBytes(null);
        return;
      }

      const controller = new AbortController();
      setPreviewFileSizeBytes(null);
      void (async () => {
        const bytes = await tryFetchRemoteSizeBytes(source, {
          signal: controller.signal,
          allowBlobFallback: kind === "image",
        });
        if (controller.signal.aborted) return;
        if (bytes != null) setPreviewFileSizeBytes(bytes);
      })();

      return () => controller.abort();
    }, [downloadInfo?.source, isPreviewModalOpen, kind, resolvedPreview?.payload]);
    const handleDownload = useCallback(async () => {
      if (!downloadInfo) return;
      try {
        await downloadPreviewFile(downloadInfo.source, downloadInfo.fileName);
        setSuccessData({ title: "已开始下载" });
      } catch (error) {
        console.error("Failed to save preview:", error);
        setErrorData({ title: "下载失败" });
      }
    }, [downloadInfo, setErrorData, setSuccessData]);

    const getPreviewCenterFlow = useCallback(
      (targetNodeId: string) => {
        const instance: any = reactFlowInstance as any;
        if (typeof document === "undefined" || !instance?.screenToFlowPosition) return null;
        const esc =
          typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(targetNodeId)
            : targetNodeId.replace(/["\\]/g, "\\$&");
        const wrap = document.querySelector(
          `.react-flow__node[data-id="${esc}"] [data-preview-wrap="doubao"]`,
        ) as HTMLElement | null;
        const rect = wrap?.getBoundingClientRect();
        if (!rect) return null;
        return instance.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      },
      [reactFlowInstance],
    );

    const animateViewportTo = useCallback(
      (to: { x: number; y: number; zoom: number }, durationMs: number) => {
        const instance: any = reactFlowInstance as any;
        if (!instance || typeof instance.setViewport !== "function") return;

        // Prefer native animation if supported (usually smoother than a React-driven RAF loop).
        try {
          if (instance.setViewport.length >= 2) {
            instance.setViewport(to, { duration: durationMs });
            return;
          }
        } catch {
          // fall through
        }

        const start =
          typeof instance.getViewport === "function"
            ? instance.getViewport()
            : { x: 0, y: 0, zoom: 1 };
        const from = {
          x: Number(start?.x ?? 0),
          y: Number(start?.y ?? 0),
          zoom: Number(start?.zoom ?? 1),
        };

        // Prefer smooth motion. XYFlow's internal updates can be heavy, but 60fps generally looks
        // much better than 30fps for viewport animations.
        let lastFrameAt = 0;
        const startedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const step = (now: number) => {
          if (now - lastFrameAt < 16) {
            window.requestAnimationFrame(step);
            return;
          }
          lastFrameAt = now;

          const p = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
          const e = easeOutCubic(p);
          instance.setViewport({
            x: from.x + (to.x - from.x) * e,
            y: from.y + (to.y - from.y) * e,
            zoom: from.zoom + (to.zoom - from.zoom) * e,
          });
          if (p < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
      },
      [reactFlowInstance],
    );

    const isPreviewOnlyNode = Boolean(
      (nodes as any[])?.find((candidate) => candidate?.id === nodeId)?.data?.cropPreviewOnly,
    );

    const canRepaint = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );
    const canErase = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );
    const canCutout = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );
    const canAnnotate = Boolean(
      appearance === "imageCreator" && kind === "image" && currentImage?.imageSource,
    );
    const canCrop = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );
    const canEnhance = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );
    const canOutpaint = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );
    const canMultiAngleCamera = Boolean(
      appearance === "imageCreator" &&
      kind === "image" &&
      currentImage?.imageSource &&
      !isPreviewOnlyNode,
    );

    const clipFilePath = useMemo(() => {
      if (kind !== "video") return null;
      if (!currentFlowId) return null;

      const payload: any = resolvedPreview?.payload ?? null;
      const raw = typeof payload?.file_path === "string" ? payload.file_path : null;
      const derived =
        (raw && raw.trim()) ||
        (videoPreview?.videoUrl
          ? deriveFlowFilePathFromVideoUrl(videoPreview.videoUrl)
          : null);
      if (!derived) return null;
      const normalized = String(derived).replace(/\\/g, "/").replace(/^\/+/, "").trim();
      if (!normalized) return null;
      if (!normalized.startsWith(`${currentFlowId}/`)) return null;
      return normalized;
    }, [currentFlowId, kind, resolvedPreview?.payload, videoPreview?.videoUrl]);

    const canClip = Boolean(
      appearance === "videoGenerator" && kind === "video" && clipFilePath && !isPreviewOnlyNode,
    );
    const canVideoUpscale = Boolean(
      appearance === "videoGenerator" &&
      kind === "video" &&
      videoPreview?.videoUrl &&
      !isPreviewOnlyNode,
    );

    const outpaintWorkspace = useMemo(() => {
      const baseTemplate = (templates as any)?.["DoubaoImageCreator"]?.template ?? {};

      const normalizeOptions = (value: any): string[] => {
        if (!Array.isArray(value)) return [];
        return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
      };

      const modelOptions = normalizeOptions(baseTemplate?.model_name?.options);
      const resolutionOptions = normalizeOptions(baseTemplate?.resolution?.options);
      const aspectRatioOptions = normalizeOptions(baseTemplate?.aspect_ratio?.options);

      const nodeTemplate = (node as any)?.template ?? {};
      const initialModelName = String(
        nodeTemplate?.model_name?.value ??
        baseTemplate?.model_name?.value ??
        modelOptions[0] ??
        "",
      ).trim();
      const initialResolution = String(
        nodeTemplate?.resolution?.value ??
        baseTemplate?.resolution?.value ??
        resolutionOptions[0] ??
        "",
      ).trim();
      const initialAspectRatio = String(
        nodeTemplate?.aspect_ratio?.value ??
        baseTemplate?.aspect_ratio?.value ??
        aspectRatioOptions[0] ??
        "1:1",
      ).trim();

      return {
        modelOptions,
        resolutionOptions,
        aspectRatioOptions,
        initialModelName,
        initialResolution,
        initialAspectRatio,
      };
    }, [node, templates]);

    const enterAnnotate = useCallback(() => {
      if (!canAnnotate) return;
      unstable_batchedUpdates(() => {
        // Exit selection mode: annotate should not rely on node selection state.
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setAnnotateOpen(true);
        setRepaintOpen(false);
        setEraseOpen(false);
        setCropOpen(false);
        setEnhanceOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(false);
        setClipOpen(false);
      });

      // Clip-style zoom + center. Auto-calculate zoom so the preview + annotate toolbar fit on screen.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          try {
            const container =
              (typeof document !== "undefined" &&
                (document.getElementById("react-flow-id") as HTMLElement | null)) ||
              null;
            const rect = container?.getBoundingClientRect();
            const viewW = rect?.width ?? window.innerWidth;
            const viewH = rect?.height ?? window.innerHeight;

            const instance: any = reactFlowInstance as any;
            const currentViewport =
              instance && typeof instance.getViewport === "function"
                ? instance.getViewport()
                : { zoom: 1 };
            const currentZoom = Math.max(1e-3, Number(currentViewport?.zoom ?? 1) || 1);

            const esc =
              typeof CSS !== "undefined" && typeof CSS.escape === "function"
                ? CSS.escape(nodeId)
                : nodeId.replace(/["\\]/g, "\\$&");
            const nodeRoot = document.querySelector(
              `.react-flow__node[data-id="${esc}"]`,
            ) as HTMLElement | null;
            const previewWrap = nodeRoot?.querySelector(
              `[data-preview-wrap="doubao"]`,
            ) as HTMLElement | null;
            const editorWrap = nodeRoot?.querySelector(
              `[data-annotate-editor-wrap="doubao"]`,
            ) as HTMLElement | null;

            let target = getPreviewCenterFlow(nodeId);
            if (!target) {
              const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
              const self: any = nodeById.get(nodeId);
              if (self) {
                const abs = getAbsolutePosition(self, nodeById as any);
                const dim = getNodeDimensions(self);
                target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
              }
            }
            if (!target) return;

            // Fallback: if we can't measure DOM rects, zoom slightly in and center on preview.
            if (!previewWrap || !editorWrap) {
              const fallbackZoom = 1.08;
              const desiredCenterY = Math.max(220, viewH * 0.48);
              const x = viewW / 2 - target.x * fallbackZoom;
              const y = desiredCenterY - target.y * fallbackZoom;
              animateViewportTo({ x, y, zoom: fallbackZoom }, 800);
              return;
            }

            const pre = previewWrap.getBoundingClientRect();
            const ed = editorWrap.getBoundingClientRect();
            const unionLeft = Math.min(pre.left, ed.left);
            const unionRight = Math.max(pre.right, ed.right);
            const unionTop = Math.min(pre.top, ed.top);
            const unionBottom = Math.max(pre.bottom, ed.bottom);
            const unionW = Math.max(1, unionRight - unionLeft);
            const unionH = Math.max(1, unionBottom - unionTop);

            const marginX = Math.max(28, Math.min(120, viewW * 0.06));
            const marginY = Math.max(28, Math.min(160, viewH * 0.09));
            const fitScale = Math.min(
              (viewW - marginX * 2) / unionW,
              (viewH - marginY * 2) / unionH,
            );

            const clampZoom = (z: number) => Math.max(0.35, Math.min(1.8, z));
            const targetZoom = clampZoom(currentZoom * fitScale * 0.98);

            const previewCenterScreen = { x: pre.left + pre.width / 2, y: pre.top + pre.height / 2 };
            const unionCenterScreen = { x: unionLeft + unionW / 2, y: unionTop + unionH / 2 };
            const offsetFlowX = (unionCenterScreen.x - previewCenterScreen.x) / currentZoom;
            const offsetFlowY = (unionCenterScreen.y - previewCenterScreen.y) / currentZoom;

            const desiredCenter = { x: viewW / 2, y: Math.max(220, viewH * 0.48) };
            const x = desiredCenter.x - (target.x + offsetFlowX) * targetZoom;
            const y = desiredCenter.y - (target.y + offsetFlowY) * targetZoom;
            animateViewportTo({ x, y, zoom: targetZoom }, 800);
          } catch (e) {
            console.warn("Failed to animate viewport for annotate mode:", e);
          }
        });
      });
    }, [animateViewportTo, canAnnotate, getPreviewCenterFlow, nodeId, nodes, reactFlowInstance, setNodes]);

    const enterRepaint = useCallback(() => {
      if (!canRepaint) return;
      unstable_batchedUpdates(() => {
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setCropOpen(false);
        setEnhanceOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(false);
        setEraseOpen(false);
        setRepaintOpen(true);
      });

      // Match the multi-angle drawer behavior: zoom + center with extra space below
      // so the repaint drawer can be fully visible.
      try {
        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 0.93;

        let target = getPreviewCenterFlow(nodeId);
        if (!target) {
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const self: any = nodeById.get(nodeId);
          if (self) {
            const abs = getAbsolutePosition(self, nodeById as any);
            const dim = getNodeDimensions(self);
            target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
          }
        }

        if (target) {
          const x = viewW / 2 - target.x * targetZoom;
          // Reserve some bottom space so the drawer below stays visible; keep the node slightly above center.
          const RESERVED_BOTTOM_PX = 280;
          const desiredCenterY = Math.max(120, viewH / 2 - RESERVED_BOTTOM_PX / 2);
          const y = desiredCenterY - target.y * targetZoom;
          animateViewportTo({ x, y, zoom: targetZoom }, 800);
        }
      } catch (e) {
        console.warn("Failed to animate viewport for repaint mode:", e);
      }
    }, [animateViewportTo, canRepaint, getPreviewCenterFlow, nodeId, nodes, setNodes]);

    const runRepaint = useCallback(() => {
      if (!isRepaintOpen) return;
      repaintOverlayRef.current?.confirm?.();
    }, [isRepaintOpen]);

    const enterErase = useCallback(() => {
      if (!canErase) return;
      unstable_batchedUpdates(() => {
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setRepaintOpen(false);
        setCropOpen(false);
        setEnhanceOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(false);
        setEraseOpen(true);
      });

      // Crop-style zoom + center, but reserve bottom space so toolbar + drawer are fully visible.
      try {
        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 1.03;

        let target = getPreviewCenterFlow(nodeId);
        if (!target) {
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const self: any = nodeById.get(nodeId);
          if (self) {
            const abs = getAbsolutePosition(self, nodeById as any);
            const dim = getNodeDimensions(self);
            target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
          }
        }

        if (target) {
          const x = viewW / 2 - target.x * targetZoom;
          // With 103% zoom, if we keep the component too high, the node top bar can be clipped.
          // Move the "above center" target slightly down while still reserving drawer space.
          const RESERVED_BOTTOM_PX = 320;
          const DOWN_SHIFT_PX = 110;
          const desiredCenterY = Math.max(260, viewH / 2 - RESERVED_BOTTOM_PX / 2 + DOWN_SHIFT_PX);
          const y = desiredCenterY - target.y * targetZoom;
          animateViewportTo({ x, y, zoom: targetZoom }, 800);
        }
      } catch (e) {
        console.warn("Failed to animate viewport for erase mode:", e);
      }
    }, [animateViewportTo, canErase, getPreviewCenterFlow, nodeId, nodes, setNodes]);

    const runErase = useCallback(() => {
      if (!isEraseOpen) return;
      eraseOverlayRef.current?.confirm?.();
    }, [isEraseOpen]);

    const isCutoutRunningRef = useRef(false);
    const runCutout = useCallback(async () => {
      if (!canCutout) return;
      if (isCutoutRunningRef.current) return;
      isCutoutRunningRef.current = true;

      try {
        if (!currentFlowId) {
          showTransientBadge("请先保存画布后再生成");
          return;
        }
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;
        const DEFAULT_PROMPT = [
          "请对参考图进行抠图：仅保留主体，移除背景，并将背景设为透明。",
          "输出要求：输出带 alpha 通道的 PNG；不要添加任何新背景或新物体；不要改变主体细节与颜色；边缘尽量干净自然。",
        ].join("\n");

        const baseSource = currentImage?.imageSource;
        if (!baseSource) {
          showTransientBadge("未找到原图");
          return;
        }

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);
        (newTemplate as any).display_name = "抠图结果";
        (newTemplate as any).icon = "Cutout";

        // Force "Nano Banana Pro" model for background removal.
        (newTemplate as any).template = (newTemplate as any).template ?? {};
        const tpl = (newTemplate as any).template;
        if (tpl?.model_name) {
          tpl.model_name.value = "Nano Banana Pro";
        }
        if (tpl?.image_count) {
          tpl.image_count.value = 1;
        }
        if (tpl?.prompt) {
          tpl.prompt.value = DEFAULT_PROMPT;
        }
        if (tpl?.draft_output) {
          delete tpl.draft_output;
        }

        const refField = tpl?.[REFERENCE_FIELD];
        if (refField) {
          const safeBaseName = "cutout-base.png";
          try {
            const baseBlob = await fetch(baseSource).then((r) => r.blob());
            const baseFile = new File([baseBlob], safeBaseName, {
              type: baseBlob.type || "image/png",
            });
            const baseResp = await uploadReferenceFile({ file: baseFile, id: currentFlowId });
            const basePath = baseResp?.file_path ? String(baseResp.file_path) : "";
            if (!basePath.trim()) {
              showTransientBadge("上传失败");
              return;
            }

            refField.value = [safeBaseName];
            refField.file_path = [basePath.trim()];
          } catch (error) {
            console.error("Failed to upload cutout base image:", error);
            showTransientBadge("上传失败");
            return;
          }
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;
        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}-cutout`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
        });

        window.requestAnimationFrame(() => {
          try {
            void buildFlow({ stopNodeId: newImageNodeId });
          } catch (e) {
            console.warn("Failed to start cutout build:", e);
          }
        });

        // After creating the downstream node, zoom out to 48% and center it (match other tool behaviors).
        try {
          const instance: any = reactFlowInstance as any;
          if (!instance || typeof instance.setViewport !== "function") return;

          const container =
            (typeof document !== "undefined" &&
              (document.getElementById("react-flow-id") as HTMLElement | null)) ||
            null;
          const rect = container?.getBoundingClientRect();
          const viewW = rect?.width ?? window.innerWidth;
          const viewH = rect?.height ?? window.innerHeight;
          const targetZoom = 0.48;

          const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
          const anchorDim = getNodeDimensions(currentFlowNode);
          const anchorCenterFallback = {
            x: abs.x + anchorDim.width / 2,
            y: abs.y + anchorDim.height / 2,
          };
          const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;

          const offsetX = anchorCenter.x - abs.x;
          const offsetY = anchorCenter.y - abs.y;
          const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };

          const viewportTo = {
            x: viewW / 2 - targetFlowCenter.x * targetZoom,
            y: viewH / 2 - targetFlowCenter.y * targetZoom,
            zoom: targetZoom,
          };

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              animateViewportTo(viewportTo, 800);
            });
          });
        } catch (e) {
          console.warn("Failed to animate viewport to cutout result node:", e);
        }
      } finally {
        isCutoutRunningRef.current = false;
      }
    }, [
      animateViewportTo,
      buildFlow,
      canCutout,
      currentFlowId,
      currentImage?.imageSource,
      getPreviewCenterFlow,
      node,
      nodeId,
      nodes,
      reactFlowInstance,
      setEdges,
      setNodes,
      showTransientBadge,
      takeSnapshot,
      templates,
      uploadReferenceFile,
    ]);

    const enterCrop = useCallback(() => {
      if (!canCrop) return;
      unstable_batchedUpdates(() => {
        // Exit selection mode: cropping should not rely on node selection state.
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setRepaintOpen(false);
        setEraseOpen(false);
        setCropOpen(true);
        setEnhanceOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(false);
      });

      // Smoothly zoom the canvas to 135% and center the component on screen.
      try {
        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 1.35;

        // Prefer centering on the persistent preview wrap (more visually accurate than node bounding box).
        let target = getPreviewCenterFlow(nodeId);

        if (!target) {
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const self: any = nodeById.get(nodeId);
          if (self) {
            const abs = getAbsolutePosition(self, nodeById as any);
            const dim = getNodeDimensions(self);
            target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
          }
        }

        if (target) {
          const x = viewW / 2 - target.x * targetZoom;
          const y = viewH / 2 - target.y * targetZoom;
          animateViewportTo({ x, y, zoom: targetZoom }, 800);
        }
      } catch (e) {
        // Non-fatal: cropping UI should still work without canvas animation.
        console.warn("Failed to animate viewport for crop mode:", e);
      }
    }, [animateViewportTo, canCrop, getPreviewCenterFlow, nodeId, nodes, setNodes]);

    const runVideoUpscale = useCallback(() => {
      if (!canVideoUpscale) return;

      const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
      if (!currentFlowNode) return;
      const template = templates?.["DoubaoVideoGenerator"];
      if (!template) {
        showTransientBadge("未加载到视频创作模板");
        return;
      }

      takeSnapshot?.();

      const VIDEO_OUTPUT_NAME = "video";
      const TARGET_FIELD = "first_frame_image";
      const NODE_OFFSET_X = 1300;

      const newVideoNodeId = getNodeId("DoubaoVideoGenerator");
      const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
      const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
      const newNodeX = abs.x + NODE_OFFSET_X;
      const newNodeY = computeAlignedNodeTopY({
        anchorNodeId: nodeId,
        anchorNodeType: currentFlowNode.data?.type,
        targetNodeType: "DoubaoVideoGenerator",
        targetX: newNodeX,
        fallbackTopY: abs.y,
        avoidOverlap: false,
      });

      const newTemplate = cloneDeep(template);
      (newTemplate as any).template = (newTemplate as any).template ?? {};
      const nextTpl = (newTemplate as any).template;
      (newTemplate as any).display_name = "视频增强";
      (newTemplate as any).icon = "HD";

      if (nextTpl.model_name) {
        nextTpl.model_name.value = "vidu-upscale";
      }
      if (nextTpl.prompt) {
        nextTpl.prompt.value = "";
      }
      if (nextTpl.first_frame_image) {
        nextTpl.first_frame_image.is_list = false;
        nextTpl.first_frame_image.list = false;
        nextTpl.first_frame_image.file_types = [
          "mp4",
          "flv",
          "m3u8",
          "mxf",
          "mov",
          "ts",
          "webm",
          "mkv",
        ];
        nextTpl.first_frame_image.fileTypes = nextTpl.first_frame_image.file_types;
      }
      if (nextTpl.draft_output) {
        delete nextTpl.draft_output;
      }

      const newVideoNode: GenericNodeType = {
        id: newVideoNodeId,
        type: "genericNode",
        position: { x: newNodeX, y: newNodeY },
        data: {
          node: newTemplate as any,
          showNode: !(newTemplate as any).minimized,
          type: "DoubaoVideoGenerator",
          id: newVideoNodeId,
        },
        selected: false,
      };

      const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;
      const outputDefinition =
        sourceTemplate?.outputs?.find((output: any) => output.name === VIDEO_OUTPUT_NAME) ??
        sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
        sourceTemplate?.outputs?.[0];
      const sourceOutputTypes =
        outputDefinition?.types && outputDefinition.types.length === 1
          ? outputDefinition.types
          : outputDefinition?.selected
            ? [outputDefinition.selected]
            : ["Data"];
      const sourceHandle = {
        output_types: sourceOutputTypes,
        id: nodeId,
        dataType: currentFlowNode.data?.type,
        name: outputDefinition?.name ?? VIDEO_OUTPUT_NAME,
        ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
      };

      const targetTemplateField = nextTpl?.[TARGET_FIELD];
      const targetHandle = {
        inputTypes: targetTemplateField?.input_types ?? ["Data"],
        type: targetTemplateField?.type,
        id: newVideoNodeId,
        fieldName: TARGET_FIELD,
        ...(targetTemplateField?.proxy ? { proxy: targetTemplateField.proxy } : {}),
      };

      const edge: EdgeType = {
        id: `xy-edge__${nodeId}-${sourceHandle.name}-${newVideoNodeId}-${TARGET_FIELD}-upscale`,
        source: nodeId,
        sourceHandle: scapedJSONStringfy(sourceHandle as any),
        target: newVideoNodeId,
        targetHandle: scapedJSONStringfy(targetHandle as any),
        type: "default",
        className: "doubao-tool-edge",
        data: {
          sourceHandle,
          targetHandle,
          videoReferType: "base",
        },
      } as any;

      unstable_batchedUpdates(() => {
        setNodes((currentNodes) => [...currentNodes, newVideoNode]);
        setEdges((currentEdges) => [...currentEdges, edge]);
      });
    }, [
      canVideoUpscale,
      node,
      nodeId,
      nodes,
      setEdges,
      setNodes,
      showTransientBadge,
      takeSnapshot,
      templates,
    ]);

    const enterClip = useCallback(() => {
      if (!canClip) return;
      unstable_batchedUpdates(() => {
        // Exit selection mode: clipping should not rely on node selection state.
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setRepaintOpen(false);
        setEraseOpen(false);
        setCropOpen(false);
        setEnhanceOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(false);
        setClipOpen(true);
      });

      // Crop-style zoom + center. Auto-calculate zoom so the preview + timeline editor fit on screen.
      // (Important for tall ratios like 9:16).
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          try {
            const container =
              (typeof document !== "undefined" &&
                (document.getElementById("react-flow-id") as HTMLElement | null)) ||
              null;
            const rect = container?.getBoundingClientRect();
            const viewW = rect?.width ?? window.innerWidth;
            const viewH = rect?.height ?? window.innerHeight;

            const instance: any = reactFlowInstance as any;
            const currentViewport =
              instance && typeof instance.getViewport === "function"
                ? instance.getViewport()
                : { zoom: 1 };
            const currentZoom = Math.max(1e-3, Number(currentViewport?.zoom ?? 1) || 1);

            const esc =
              typeof CSS !== "undefined" && typeof CSS.escape === "function"
                ? CSS.escape(nodeId)
                : nodeId.replace(/["\\]/g, "\\$&");
            const nodeRoot = document.querySelector(
              `.react-flow__node[data-id="${esc}"]`,
            ) as HTMLElement | null;
            const previewWrap = nodeRoot?.querySelector(
              `[data-preview-wrap="doubao"]`,
            ) as HTMLElement | null;
            const editorWrap = nodeRoot?.querySelector(
              `[data-clip-editor-wrap="doubao"]`,
            ) as HTMLElement | null;

            let target = getPreviewCenterFlow(nodeId);
            if (!target) {
              const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
              const self: any = nodeById.get(nodeId);
              if (self) {
                const abs = getAbsolutePosition(self, nodeById as any);
                const dim = getNodeDimensions(self);
                target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
              }
            }
            if (!target) return;

            // Fallback: if we can't measure DOM rects, zoom slightly in and center on preview.
            if (!previewWrap || !editorWrap) {
              const fallbackZoom = 1.12;
              const desiredCenterY = Math.max(220, viewH * 0.48);
              const x = viewW / 2 - target.x * fallbackZoom;
              const y = desiredCenterY - target.y * fallbackZoom;
              animateViewportTo({ x, y, zoom: fallbackZoom }, 800);
              return;
            }

            const pre = previewWrap.getBoundingClientRect();
            const ed = editorWrap.getBoundingClientRect();
            const unionLeft = Math.min(pre.left, ed.left);
            const unionRight = Math.max(pre.right, ed.right);
            const unionTop = Math.min(pre.top, ed.top);
            const unionBottom = Math.max(pre.bottom, ed.bottom);
            const unionW = Math.max(1, unionRight - unionLeft);
            const unionH = Math.max(1, unionBottom - unionTop);

            const marginX = Math.max(28, Math.min(120, viewW * 0.06));
            const marginY = Math.max(28, Math.min(140, viewH * 0.08));
            const fitScale = Math.min(
              (viewW - marginX * 2) / unionW,
              (viewH - marginY * 2) / unionH,
            );

            const clampZoom = (z: number) => Math.max(0.35, Math.min(1.8, z));
            const targetZoom = clampZoom(currentZoom * fitScale * 0.98);

            const previewCenterScreen = {
              x: pre.left + pre.width / 2,
              y: pre.top + pre.height / 2,
            };
            const unionCenterScreen = {
              x: unionLeft + unionW / 2,
              y: unionTop + unionH / 2,
            };
            const offsetFlowX =
              (unionCenterScreen.x - previewCenterScreen.x) / currentZoom;
            const offsetFlowY =
              (unionCenterScreen.y - previewCenterScreen.y) / currentZoom;

            const desiredCenter = { x: viewW / 2, y: Math.max(220, viewH * 0.48) };
            const x = desiredCenter.x - (target.x + offsetFlowX) * targetZoom;
            const y = desiredCenter.y - (target.y + offsetFlowY) * targetZoom;
            animateViewportTo({ x, y, zoom: targetZoom }, 800);
          } catch (e) {
            console.warn("Failed to animate viewport for clip mode:", e);
          }
        });
      });
    }, [animateViewportTo, canClip, getPreviewCenterFlow, nodeId, nodes, reactFlowInstance, setNodes]);

    const enterEnhance = useCallback(() => {
      if (!canEnhance) return;
      unstable_batchedUpdates(() => {
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setRepaintOpen(false);
        setEraseOpen(false);
        setCropOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(false);
        setEnhanceOpen(true);
      });

      // Match the multi-angle drawer behavior: zoom + center with extra space below.
      try {
        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 0.55;

        let target = getPreviewCenterFlow(nodeId);
        if (!target) {
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const self: any = nodeById.get(nodeId);
          if (self) {
            const abs = getAbsolutePosition(self, nodeById as any);
            const dim = getNodeDimensions(self);
            target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
          }
        }

        if (target) {
          const x = viewW / 2 - target.x * targetZoom;
          const y = viewH * 0.42 - target.y * targetZoom;
          animateViewportTo({ x, y, zoom: targetZoom }, 800);
        }
      } catch (e) {
        console.warn("Failed to animate viewport for enhance mode:", e);
      }
    }, [animateViewportTo, canEnhance, getPreviewCenterFlow, nodeId, nodes, setNodes]);

    const enterOutpaint = useCallback(() => {
      if (!canOutpaint) return;
      unstable_batchedUpdates(() => {
        // Exit selection mode: tool overlays should not rely on node selection state.
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setRepaintOpen(false);
        setEraseOpen(false);
        setCropOpen(false);
        setEnhanceOpen(false);
        setMultiAngleCameraOpen(false);
        setOutpaintOpen(true);
      });

      // Smoothly zoom the canvas to 67% and center the component on screen.
      try {
        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 0.67;

        // Prefer centering on the persistent preview wrap (more visually accurate than node bounding box).
        let target = getPreviewCenterFlow(nodeId);

        if (!target) {
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const self: any = nodeById.get(nodeId);
          if (self) {
            const abs = getAbsolutePosition(self, nodeById as any);
            const dim = getNodeDimensions(self);
            target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
          }
        }

        if (target) {
          const x = viewW / 2 - target.x * targetZoom;
          const y = viewH / 2 - target.y * targetZoom;
          animateViewportTo({ x, y, zoom: targetZoom }, 800);
        }
      } catch (e) {
        // Non-fatal: tool UI should still work without canvas animation.
        console.warn("Failed to animate viewport for outpaint mode:", e);
      }
    }, [animateViewportTo, canOutpaint, getPreviewCenterFlow, nodeId, nodes, setNodes]);

    const enterMultiAngleCamera = useCallback(() => {
      if (!canMultiAngleCamera) return;
      unstable_batchedUpdates(() => {
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setRepaintOpen(false);
        setEraseOpen(false);
        setCropOpen(false);
        setEnhanceOpen(false);
        setOutpaintOpen(false);
        setMultiAngleCameraOpen(true);
      });

      // Match the crop tool behavior: zoom + center to highlight the component.
      // Requirement: zoom canvas to 55% and place the component slightly above center
      // so the multi-angle drawer can be fully visible.
      try {
        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 0.55;

        let target = getPreviewCenterFlow(nodeId);
        if (!target) {
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const self: any = nodeById.get(nodeId);
          if (self) {
            const abs = getAbsolutePosition(self, nodeById as any);
            const dim = getNodeDimensions(self);
            target = { x: abs.x + dim.width / 2, y: abs.y + dim.height / 2 };
          }
        }

        if (target) {
          const x = viewW / 2 - target.x * targetZoom;
          const y = viewH * 0.42 - target.y * targetZoom;
          animateViewportTo({ x, y, zoom: targetZoom }, 800);
        }
      } catch (e) {
        console.warn("Failed to animate viewport for multi-angle mode:", e);
      }
    }, [animateViewportTo, canMultiAngleCamera, getPreviewCenterFlow, nodeId, nodes, setNodes]);

    // When the preview disappears (or switches kind), exit crop mode.
    useEffect(() => {
      if (!isCropOpen) return;
      if (!canCrop) {
        setCropOpen(false);
      }
    }, [canCrop, isCropOpen]);

    // When the preview disappears (or switches kind), exit annotate mode.
    useEffect(() => {
      if (!isAnnotateOpen) return;
      if (!canAnnotate) {
        setAnnotateOpen(false);
      }
    }, [canAnnotate, isAnnotateOpen]);

    // When the preview disappears (or switches kind / file), exit clip mode.
    useEffect(() => {
      if (!isClipOpen) return;
      if (!canClip) {
        setClipOpen(false);
      }
    }, [canClip, isClipOpen]);

    useEffect(() => {
      if (!isRepaintOpen) return;
      if (!canRepaint) {
        setRepaintOpen(false);
      }
    }, [canRepaint, isRepaintOpen]);

    useEffect(() => {
      if (!isEraseOpen) return;
      if (!canErase) {
        setEraseOpen(false);
      }
    }, [canErase, isEraseOpen]);

    // When the preview disappears (or switches kind), exit enhance mode.
    useEffect(() => {
      if (!isEnhanceOpen) return;
      if (!canEnhance) {
        setEnhanceOpen(false);
      }
    }, [canEnhance, isEnhanceOpen]);

    // When the preview disappears (or switches kind), exit outpaint mode.
    useEffect(() => {
      if (!isOutpaintOpen) return;
      if (!canOutpaint) {
        setOutpaintOpen(false);
      }
    }, [canOutpaint, isOutpaintOpen]);

    useEffect(() => {
      if (!isMultiAngleCameraOpen) return;
      if (!canMultiAngleCamera) {
        setMultiAngleCameraOpen(false);
      }
    }, [canMultiAngleCamera, isMultiAngleCameraOpen]);

    useEffect(() => {
      onActionsChange?.({
        openPreview: openModal,
        download: handleDownload,
        canDownload: Boolean(downloadInfo),
        enterAnnotate,
        canAnnotate,
        isAnnotateOpen,
        enterRepaint,
        runRepaint,
        canRepaint,
        isRepaintOpen,
        enterErase,
        runErase,
        canErase,
        isEraseOpen,
        runCutout,
        canCutout,
        enterCrop,
        canCrop,
        enterEnhance,
        canEnhance,
        isEnhanceOpen,
        enterOutpaint,
        canOutpaint,
        isOutpaintOpen,
        enterMultiAngleCamera,
        canMultiAngleCamera,
        isMultiAngleCameraOpen,
        enterClip,
        canClip,
        isClipOpen,
        runVideoUpscale,
        canVideoUpscale,
      });
    }, [
      canAnnotate,
      canRepaint,
      canErase,
      canCutout,
      canCrop,
      canEnhance,
      canOutpaint,
      canMultiAngleCamera,
      canClip,
      canVideoUpscale,
      downloadInfo,
      enterAnnotate,
      enterRepaint,
      runRepaint,
      enterErase,
      runErase,
      runCutout,
      enterCrop,
      enterEnhance,
      enterOutpaint,
      enterMultiAngleCamera,
      enterClip,
      runVideoUpscale,
      handleDownload,
      isAnnotateOpen,
      isRepaintOpen,
      isEraseOpen,
      isEnhanceOpen,
      isOutpaintOpen,
      isMultiAngleCameraOpen,
      isClipOpen,
      onActionsChange,
      openModal,
    ]);

    const enhanceModelOptions = useMemo<EnhanceModelOption[]>(
      () => [{ id: "jimeng-smart-hd", label: "即梦智能超清" }],
      [],
    );

    const buildMultiAnglePrompt = useCallback((_items: MultiAngleCameraView[]) => {
      // Important: avoid instructing the model to "output multiple images" in one response,
      // otherwise it may generate a single collage/montage image.
      // We always ask for exactly 1 image per call; multi-view generation is handled by the backend
      // by iterating over `tool_multi_angle_views`.
      const lines = [
        "你是一个多角度相机控制的图像编辑系统。",
        "目标：只改变相机视角/机位（水平旋转/俯仰/缩放/广角），其他内容保持与参考图一致。",
        "严格约束：不要改变主体身份、服饰、表情、发型、材质、光照风格与背景元素；不要新增或删除物体；不要改变文字内容。",
        "尺寸要求：输出图像的宽高比与分辨率保持与参考图一致（在模型限制范围内）。",
        "输出要求：只输出 1 张图片，且仅包含一个角度的完整画面；严禁拼接、分屏、九宫格、对比图或多视角合成。",
        "系统会附带相机参数标签（<sks> ...）与数值参数（yaw/pitch/zoom/wideAngle），两者一致且无冲突；请严格按参数生成。",
      ];
      return lines.join("\n").trim();
    }, []);

    const handleConfirmMultiAngleCamera = useCallback(
      async ({
        imageSource,
        fileName,
        views,
      }: {
        imageSource: string;
        fileName: string;
        views: Array<{
          yaw: number;
          pitch: number;
          zoom: number;
          wideAngle: boolean;
          label?: string;
        }>;
      }) => {
        if (!currentFlowId) {
          showTransientBadge("请先保存画布后再生成");
          return;
        }
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;
        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);

        // Make the downstream node look like a lightweight "result" component (preview only),
        // while still using the DoubaoImageCreator engine underneath.
        (newTemplate as any).display_name = "多角度结果";
        (newTemplate as any).icon = "Axis3d";

        let uploadedReferenceBlob: Blob | null = null;

        // Upload the reference image so the downstream node has a stable file_path.
        const refField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        if (refField) {
          const safeName = (fileName && String(fileName).trim()) || "multi-angle.png";
          try {
            const blob = await fetch(imageSource).then((r) => r.blob());
            uploadedReferenceBlob = blob;
            const file = new File([blob], safeName, { type: blob.type || "image/png" });
            const response = await uploadReferenceFile({ file, id: currentFlowId });
            const uploadedPath = response?.file_path ? String(response.file_path) : "";
            if (!uploadedPath.trim()) {
              showTransientBadge("上传失败");
              return;
            }
            // Prefer storing the StorageService-style path in `value` too, so the backend can
            // still resolve the reference even if a merge/sanitize step drops `file_path`.
            refField.value = [uploadedPath.trim()];
            refField.file_path = [uploadedPath.trim()];
          } catch (error) {
            console.error("Failed to upload multi-angle reference image:", error);
            showTransientBadge("上传失败");
            return;
          }
        }

        const safeViews = (views ?? []).slice(0, 6);
        const imageCount = Math.max(1, Math.min(6, safeViews.length || 1));

        // Prefer keeping Qwen-Image-Edit output resolution/aspect consistent with the input image.
        const inputWidth = Number((currentImage as any)?.width);
        const inputHeight = Number((currentImage as any)?.height);
        let sizeOverride =
          Number.isFinite(inputWidth) &&
            Number.isFinite(inputHeight) &&
            inputWidth > 0 &&
            inputHeight > 0
            ? `${Math.round(inputWidth)}*${Math.round(inputHeight)}`
            : "";

        // If the preview metadata doesn't include width/height, derive it from the uploaded reference image.
        if (!sizeOverride && uploadedReferenceBlob) {
          try {
            const bitmap = await createImageBitmap(uploadedReferenceBlob);
            const w = Number(bitmap?.width);
            const h = Number(bitmap?.height);
            bitmap?.close?.();
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
              sizeOverride = `${Math.round(w)}*${Math.round(h)}`;
            }
          } catch {
            // ignore
          }
        }

        // Preserve user-selected resolution/aspect ratio from the source node when possible.
        const sourceResolution = String(sourceTemplate?.template?.resolution?.value ?? "").trim();
        const sourceAspectRatio = String(sourceTemplate?.template?.aspect_ratio?.value ?? "").trim();
        if (sourceResolution && (newTemplate as any)?.template?.resolution) {
          (newTemplate as any).template.resolution.value = sourceResolution;
        }
        if (sourceAspectRatio && (newTemplate as any)?.template?.aspect_ratio) {
          (newTemplate as any).template.aspect_ratio.value = sourceAspectRatio;
        }
        if ((newTemplate as any)?.template?.image_count) {
          (newTemplate as any).template.image_count.value = imageCount;
        }

        // Force qwen-image-edit-max in the backend via hidden tool override fields.
        // Always set them (create if missing) so the backend reliably receives camera params/size.
        (newTemplate as any).template = (newTemplate as any).template ?? {};
        const toolTpl = (newTemplate as any).template;
        toolTpl.tool_model_override = toolTpl.tool_model_override ?? { value: "" };
        toolTpl.tool_model_override.value = "qwen-image-edit-max";
        toolTpl.tool_multi_angle_views = toolTpl.tool_multi_angle_views ?? { value: "" };
        toolTpl.tool_multi_angle_views.value = JSON.stringify(safeViews);
        if (sizeOverride) {
          toolTpl.tool_size_override = toolTpl.tool_size_override ?? { value: "" };
          toolTpl.tool_size_override.value = sizeOverride;
        }

        // Prefer adaptive aspect ratio for Qwen tool runs; final size is driven by tool_size_override.
        if ((newTemplate as any)?.template?.aspect_ratio) {
          (newTemplate as any).template.aspect_ratio.value = "adaptive";
        }
        // Prefer a first-class model option to avoid relying on hidden tool overrides being present.
        // (Backend: DoubaoImageCreator MODEL_CATALOG key)
        if ((newTemplate as any)?.template?.model_name) {
          (newTemplate as any).template.model_name.value = "千问-图像编辑 · Max";
        }

        const prompt = buildMultiAnglePrompt(
          safeViews.map((v, idx) => ({
            id: String(idx),
            label: v.label || `机位 ${idx + 1}`,
            yaw: Number(v.yaw),
            pitch: Number(v.pitch),
            zoom: Number(v.zoom),
            wideAngle: Boolean(v.wideAngle),
          })),
        );
        if ((newTemplate as any)?.template?.prompt) {
          (newTemplate as any).template.prompt.value = prompt;
        }

        // Ensure the new node doesn't show any cached/generated output from template defaults.
        if ((newTemplate as any)?.template?.draft_output) {
          delete (newTemplate as any).template.draft_output;
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}-multi-angle`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
          setMultiAngleCameraOpen(false);
        });

        window.requestAnimationFrame(() => {
          try {
            void buildFlow({ stopNodeId: newImageNodeId });
          } catch (e) {
            console.warn("Failed to start multi-angle build:", e);
          }
        });
      },
      [
        buildFlow,
        buildMultiAnglePrompt,
        currentFlowId,
        node,
        nodeId,
        nodes,
        setEdges,
        setNodes,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );

    const handleConfirmEnhance = useCallback(
      async ({
        imageSource,
        fileName,
        modelId,
        resolution,
        scale,
      }: {
        imageSource: string;
        fileName: string;
        modelId: string;
        resolution: "4k" | "8k";
        scale: number;
      }) => {
        if (!currentFlowId) {
          showTransientBadge("请先保存画布后再生成");
          return;
        }
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);
        (newTemplate as any).display_name = "增强结果";
        (newTemplate as any).icon = "HD";

        const refField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        if (refField) {
          const safeName = (fileName && String(fileName).trim()) || "enhance.png";
          try {
            const blob = await fetch(imageSource).then((r) => r.blob());
            const file = new File([blob], safeName, { type: blob.type || "image/png" });
            const response = await uploadReferenceFile({ file, id: currentFlowId });
            const uploadedPath = response?.file_path ? String(response.file_path) : "";
            if (!uploadedPath.trim()) {
              showTransientBadge("上传失败");
              return;
            }
            refField.value = [uploadedPath.trim()];
            refField.file_path = [uploadedPath.trim()];
          } catch (error) {
            console.error("Failed to upload enhance reference image:", error);
            showTransientBadge("上传失败");
            return;
          }
        }

        (newTemplate as any).template = (newTemplate as any).template ?? {};
        const toolTpl = (newTemplate as any).template;
        toolTpl.tool_model_override = toolTpl.tool_model_override ?? { value: "" };
        toolTpl.tool_model_override.value = String(modelId || "").trim();
        toolTpl.tool_enhance_resolution = toolTpl.tool_enhance_resolution ?? { value: "4k" };
        toolTpl.tool_enhance_resolution.value = resolution;
        toolTpl.tool_enhance_scale = toolTpl.tool_enhance_scale ?? { value: 50 };
        toolTpl.tool_enhance_scale.value = Number(scale);

        if ((newTemplate as any)?.template?.prompt) {
          (newTemplate as any).template.prompt.value = "";
        }

        if ((newTemplate as any)?.template?.draft_output) {
          delete (newTemplate as any).template.draft_output;
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;
        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}-enhance`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
          setEnhanceOpen(false);
        });

        window.requestAnimationFrame(() => {
          try {
            void buildFlow({ stopNodeId: newImageNodeId });
          } catch (e) {
            console.warn("Failed to start enhance build:", e);
          }
        });
      },
      [
        buildFlow,
        currentFlowId,
        node,
        nodeId,
        nodes,
        setEdges,
        setNodes,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );

    const handleConfirmCrop = useCallback(
      ({ dataUrl, fileName }: { dataUrl: string; fileName: string }) => {
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);
        (newTemplate as any).display_name = "裁剪结果";
        (newTemplate as any).template = (newTemplate as any).template ?? {};
        const refField =
          (newTemplate as any).template?.[REFERENCE_FIELD] ??
          ((newTemplate as any).template[REFERENCE_FIELD] = {
            name: REFERENCE_FIELD,
            display_name: "参考图",
            type: "str",
            input_types: ["Data"],
            file_types: [".jpg", ".jpeg", ".png", ".webp"],
            file_path: [],
            value: [],
          });
        const safeName = (fileName && String(fileName).trim()) || "crop.png";
        refField.value = [safeName];
        refField.file_path = [dataUrl];
        // Ensure the new node doesn't show any cached/generated output from template defaults.
        if ((newTemplate as any)?.template?.draft_output) {
          delete (newTemplate as any).template.draft_output;
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;
        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            // Mark as a crop-derived connection so preview aggregation can ignore upstream refs.
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
          setCropOpen(false);
        });

        // After creating the downstream node, zoom out to 48% and center it.
        try {
          const instance: any = reactFlowInstance as any;
          if (!instance || typeof instance.setViewport !== "function") return;

          const container =
            (typeof document !== "undefined" &&
              (document.getElementById("react-flow-id") as HTMLElement | null)) ||
            null;
          const rect = container?.getBoundingClientRect();
          const viewW = rect?.width ?? window.innerWidth;
          const viewH = rect?.height ?? window.innerHeight;
          const targetZoom = 0.48;

          // Use the anchor preview center as a stable reference (avoid polling the new node DOM).
          const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
          const anchorDim = getNodeDimensions(currentFlowNode);
          const anchorCenterFallback = {
            x: abs.x + anchorDim.width / 2,
            y: abs.y + anchorDim.height / 2,
          };
          const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;

          // Compute "preview center offset" relative to the anchor's top-left; reuse for the new node.
          const offsetX = anchorCenter.x - abs.x;
          const offsetY = anchorCenter.y - abs.y;
          const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };

          const viewportTo = {
            x: viewW / 2 - targetFlowCenter.x * targetZoom,
            y: viewH / 2 - targetFlowCenter.y * targetZoom,
            zoom: targetZoom,
          };

          // Let the node/edge commit first; then animate (reduces jank during XYFlow updates).
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              animateViewportTo(viewportTo, 800);
            });
          });
        } catch (e) {
          console.warn("Failed to animate viewport to crop result node:", e);
        }
      },
      [animateViewportTo, getPreviewCenterFlow, node, nodeId, nodes, reactFlowInstance, setEdges, setNodes, takeSnapshot, templates],
    );

    const handleConfirmAnnotate = useCallback(
      async ({ dataUrl, fileName }: { dataUrl: string; fileName: string }) => {
        if (isAnnotateUploading) return;
        if (!currentFlowId) {
          showTransientBadge("\u8BF7\u5148\u4FDD\u5B58\u753B\u5E03\u540E\u518D\u6807\u6CE8");
          return;
        }

        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["UserUploadImage"];
        if (!template) {
          showTransientBadge(
            "\u672A\u52A0\u8F7D\u5230\u201C\u4E0A\u4F20\u56FE\u7247\uFF08UserUploadImage\uFF09\u201D\u6A21\u677F",
          );
          return;
        }

        setAnnotateUploading(true);
        setNoticeData({ title: "\u6B63\u5728\u4E0A\u4F20\u6807\u6CE8\u7ED3\u679C..." });
        try {
          const safeName = (fileName && String(fileName).trim()) || "annotated.png";
          const blob = await fetch(dataUrl).then((r) => r.blob());
          const file = new File([blob], safeName, { type: blob.type || "image/png" });
          const resp = await uploadReferenceFile({ file, id: currentFlowId });
          const serverPath = String((resp as any)?.file_path ?? "").trim();
          if (!serverPath) {
            throw new Error("Missing file_path");
          }
          const safePath = serverPath.replace(/\\/g, "/").replace(/^\/+/, "");

          // Preload the uploaded image so the new node appears with the annotation already rendered.
          const previewUrl = toStableInternalFileUrl(safePath, "image");
          if (previewUrl) {
            try {
              const preload = new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("image load failed"));
                img.src = previewUrl;
              });
              await Promise.race([
                preload,
                new Promise<void>((resolve) => window.setTimeout(resolve, 8000)),
              ]);
            } catch {
              // ignore (still create the node even if preload fails)
            }
          }

          takeSnapshot?.();

          const FILE_FIELD = "file";
          const NODE_OFFSET_X = 1300;

          const newNodeId = getNodeId("UserUploadImage");
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
          const newNodeX = abs.x + NODE_OFFSET_X;
          const newNodeY = computeAlignedNodeTopY({
            anchorNodeId: nodeId,
            anchorNodeType: currentFlowNode.data?.type,
            targetNodeType: "UserUploadImage",
            targetX: newNodeX,
            fallbackTopY: abs.y,
            avoidOverlap: true,
          });

          const newTemplate = cloneDeep(template);
          try {
            (newTemplate as any).display_name = "\u6807\u6CE8\u7ED3\u679C";
          } catch {
            // ignore
          }
          const fileField = (newTemplate as any)?.template?.[FILE_FIELD];
          if (fileField) {
            fileField.value = safeName;
            fileField.file_path = safePath;
          }
          if ((newTemplate as any)?.template?.draft_output) {
            delete (newTemplate as any).template.draft_output;
          }

          const newImageNode: GenericNodeType = {
            id: newNodeId,
            type: "genericNode",
            position: { x: newNodeX, y: newNodeY },
            data: {
              node: newTemplate as any,
              showNode: !(newTemplate as any).minimized,
              type: "UserUploadImage",
              id: newNodeId,
            },
            selected: false,
          };

          unstable_batchedUpdates(() => {
            setNodes((currentNodes) => [...currentNodes, newImageNode]);
            setAnnotateOpen(false);
          });

          // Zoom out and center the new node, similar to clip result behavior.
          try {
            const container =
              (typeof document !== "undefined" &&
                (document.getElementById("react-flow-id") as HTMLElement | null)) ||
              null;
            const rect = container?.getBoundingClientRect();
            const viewW = rect?.width ?? window.innerWidth;
            const viewH = rect?.height ?? window.innerHeight;
            const targetZoom = 0.6;

            const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
            const anchorDim = getNodeDimensions(currentFlowNode);
            const anchorCenterFallback = {
              x: abs.x + anchorDim.width / 2,
              y: abs.y + anchorDim.height / 2,
            };
            const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;

            const offsetX = anchorCenter.x - abs.x;
            const offsetY = anchorCenter.y - abs.y;
            const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };
            const viewportTo = {
              x: viewW / 2 - targetFlowCenter.x * targetZoom,
              y: viewH / 2 - targetFlowCenter.y * targetZoom,
              zoom: targetZoom,
            };
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                animateViewportTo(viewportTo, 800);
              });
            });
          } catch (e) {
            console.warn("Failed to animate viewport to annotate result node:", e);
          }

          setSuccessData({ title: "\u6807\u6CE8\u5B8C\u6210" });
        } catch (e: any) {
          setErrorData({
            title: "\u6807\u6CE8\u5931\u8D25",
            list: [e?.response?.data?.detail ?? e?.message ?? "\u7F51\u7EDC\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"],
          });
        } finally {
          setAnnotateUploading(false);
          if (typeof dataUrl === "string" && dataUrl.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(dataUrl);
            } catch {
              // ignore
            }
          }
        }
      },
      [
        animateViewportTo,
        currentFlowId,
        getPreviewCenterFlow,
        isAnnotateUploading,
        nodeId,
        nodes,
        setAnnotateOpen,
        setAnnotateUploading,
        setErrorData,
        setNoticeData,
        setNodes,
        setSuccessData,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );

    const handleConfirmClip = useCallback(
      async ({ startS, endS }: { startS: number; endS: number }) => {
        if (isClipTrimming) return;
        if (!currentFlowId) {
          showTransientBadge(
            "\u8BF7\u5148\u4FDD\u5B58\u753B\u5E03\u540E\u518D\u8FDB\u884C\u526A\u8F91",
          );
          return;
        }
        if (!clipFilePath) {
          showTransientBadge("\u5F53\u524D\u89C6\u9891\u4E0D\u652F\u6301\u526A\u8F91");
          return;
        }

        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["UserUploadVideo"];
        if (!template) {
          showTransientBadge(
            "\u672A\u52A0\u8F7D\u5230\u201C\u4E0A\u4F20\u89C6\u9891\uFF08UserUploadVideo\uFF09\u201D\u6A21\u677F",
          );
          return;
        }

        setClipTrimming(true);
        setNoticeData({ title: "\u6B63\u5728\u526A\u8F91\u89C6\u9891..." });
        try {
          const res = await api.post(`${getURL("FILES")}/trim-video/${currentFlowId}`, {
            file_path: clipFilePath,
            start_s: startS,
            end_s: endS,
          });

          const serverPath = String((res as any)?.data?.file_path ?? "");
          if (!serverPath) {
            throw new Error("Missing file_path");
          }
          const safePath = serverPath.replace(/\\/g, "/").replace(/^\/+/, "");
          const fileName = safePath.split("/").pop() || "trim.mp4";

          takeSnapshot?.();

          const FILE_FIELD = "file";
          const VIDEO_OUTPUT_NAME = "video";
          const NODE_OFFSET_X = 1300;

          const newNodeId = getNodeId("UserUploadVideo");
          const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
          const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
          const newNodeX = abs.x + NODE_OFFSET_X;
          const newNodeY = computeAlignedNodeTopY({
            anchorNodeId: nodeId,
            anchorNodeType: currentFlowNode.data?.type,
            targetNodeType: "UserUploadVideo",
            targetX: newNodeX,
            fallbackTopY: abs.y,
            avoidOverlap: true,
          });

          const newTemplate = cloneDeep(template);
          // Ensure the node title communicates it's a derived asset.
          try {
            (newTemplate as any).display_name = "\u526A\u8F91\u7ED3\u679C";
          } catch {
            // ignore
          }

          const fileField = (newTemplate as any)?.template?.[FILE_FIELD];
          if (fileField) {
            fileField.value = fileName;
            fileField.file_path = safePath;
          }
          if ((newTemplate as any)?.template?.draft_output) {
            delete (newTemplate as any).template.draft_output;
          }

          const newVideoNode: GenericNodeType = {
            id: newNodeId,
            type: "genericNode",
            position: { x: newNodeX, y: newNodeY },
            data: {
              node: newTemplate as any,
              showNode: !(newTemplate as any).minimized,
              type: "UserUploadVideo",
              id: newNodeId,
            },
            selected: false,
          };

          // Best-effort warmup so the new node can render the trimmed video immediately.
          const stablePreviewUrl = toStableInternalFileUrl(safePath, "video");
          if (stablePreviewUrl) {
            setNoticeData({ title: "\u6B63\u5728\u52A0\u8F7D\u526A\u8F91\u7ED3\u679C..." });
            await tryPreloadVideoMetadata(stablePreviewUrl);
          }

          unstable_batchedUpdates(() => {
            setNodes((currentNodes) => [...currentNodes, newVideoNode]);
            setClipOpen(false);
          });

          // Zoom out and center the new node, similar to crop result behavior.
          try {
            const container =
              (typeof document !== "undefined" &&
                (document.getElementById("react-flow-id") as HTMLElement | null)) ||
              null;
            const rect = container?.getBoundingClientRect();
            const viewW = rect?.width ?? window.innerWidth;
            const viewH = rect?.height ?? window.innerHeight;
            const targetZoom = 0.6;

            const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
            const anchorDim = getNodeDimensions(currentFlowNode);
            const anchorCenterFallback = {
              x: abs.x + anchorDim.width / 2,
              y: abs.y + anchorDim.height / 2,
            };
            const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;
            const offsetX = anchorCenter.x - abs.x;
            const offsetY = anchorCenter.y - abs.y;
            const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };
            const viewportTo = {
              x: viewW / 2 - targetFlowCenter.x * targetZoom,
              y: viewH / 2 - targetFlowCenter.y * targetZoom,
              zoom: targetZoom,
            };
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                animateViewportTo(viewportTo, 800);
              });
            });
          } catch (e) {
            console.warn("Failed to animate viewport to clip result node:", e);
          }

          setSuccessData({ title: "\u526A\u8F91\u5B8C\u6210" });
        } catch (e: any) {
          setErrorData({
            title: "\u526A\u8F91\u5931\u8D25",
            list: [
              e?.response?.data?.detail ??
              e?.message ??
              "\u7F51\u7EDC\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
            ],
          });
        } finally {
          setClipTrimming(false);
        }
      },
      [
        animateViewportTo,
        clipFilePath,
        currentFlowId,
        getPreviewCenterFlow,
        isClipTrimming,
        node,
        nodeId,
        nodes,
        setErrorData,
        setNoticeData,
        setNodes,
        setSuccessData,
        showTransientBadge,
        takeSnapshot,
        templates,
      ],
    );

    const handleConfirmOutpaint = useCallback(
      async ({
        dataUrl,
        fileName,
        modelName,
        aspectRatio,
        resolution,
      }: {
        dataUrl: string;
        fileName: string;
        modelName: string;
        aspectRatio: string;
        resolution: string;
      }) => {
        if (!currentFlowId) {
          showTransientBadge("请先保存画布后再生成");
          return;
        }
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;
        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);
        const refField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        if (refField) {
          const safeName = (fileName && String(fileName).trim()) || "outpaint.png";
          try {
            const blob = await fetch(dataUrl).then((r) => r.blob());
            const file = new File([blob], safeName, { type: blob.type || "image/png" });
            const response = await uploadReferenceFile({ file, id: currentFlowId });
            const uploadedPath = response?.file_path ? String(response.file_path) : "";
            if (!uploadedPath.trim()) {
              showTransientBadge("上传失败");
              return;
            }
            refField.value = [safeName];
            refField.file_path = [uploadedPath.trim()];

            // Release the temporary object URL we created in the overlay (if any).
            if (typeof dataUrl === "string" && dataUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(dataUrl);
              } catch {
                // ignore
              }
            }
          } catch (error) {
            console.error("Failed to upload outpaint reference image:", error);
            showTransientBadge("上传失败");
            return;
          }
        }

        // Apply outpaint workspace selections (only if provided; otherwise keep template defaults).
        const safeModelName = String(modelName ?? "").trim();
        const safeAspectRatio = String(aspectRatio ?? "").trim();
        const safeResolution = String(resolution ?? "").trim();
        if (safeModelName && (newTemplate as any)?.template?.model_name) {
          (newTemplate as any).template.model_name.value = safeModelName;
        }
        if (safeAspectRatio && (newTemplate as any)?.template?.aspect_ratio) {
          (newTemplate as any).template.aspect_ratio.value = safeAspectRatio;
        }
        if (safeResolution && (newTemplate as any)?.template?.resolution) {
          (newTemplate as any).template.resolution.value = safeResolution;
        }

        // Ensure we actually request an AI outpaint from the selected model:
        // - carry over the user's prompt if present
        // - otherwise provide a safe default instruction for seamless outpainting.
        const sourcePrompt = String(sourceTemplate?.template?.prompt?.value ?? "").trim();
        const fallbackOutpaintPrompt =
          "请保持原图主体不变，对画布空白区域进行自然扩图补全，风格一致，避免出现明显接缝或重复元素。";
        if ((newTemplate as any)?.template?.prompt) {
          (newTemplate as any).template.prompt.value = sourcePrompt || fallbackOutpaintPrompt;
        }

        // Ensure the new node doesn't show any cached/generated output from template defaults.
        if ((newTemplate as any)?.template?.draft_output) {
          delete (newTemplate as any).template.draft_output;
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            // Reuse crop-preview behavior: show only the local tool-produced image in the preview panel.
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}-outpaint`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            // Mark as a tool-derived connection so preview aggregation can ignore upstream refs.
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
          setOutpaintOpen(false);
        });

        // Fire the actual model request automatically (outpaint "生成").
        // Edges marked with `cropLink` are ignored during build (see flowStore), so this does not
        // pull in upstream nodes and will use the locally prepared reference image.
        window.requestAnimationFrame(() => {
          try {
            void buildFlow({ stopNodeId: newImageNodeId });
          } catch (e) {
            console.warn("Failed to start outpaint build:", e);
          }
        });

        // After creating the downstream node, zoom out to 48% and center it (match crop behavior).
        try {
          const instance: any = reactFlowInstance as any;
          if (!instance || typeof instance.setViewport !== "function") return;

          const container =
            (typeof document !== "undefined" &&
              (document.getElementById("react-flow-id") as HTMLElement | null)) ||
            null;
          const rect = container?.getBoundingClientRect();
          const viewW = rect?.width ?? window.innerWidth;
          const viewH = rect?.height ?? window.innerHeight;
          const targetZoom = 0.48;

          // Use the anchor preview center as a stable reference (avoid polling the new node DOM).
          const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
          const anchorDim = getNodeDimensions(currentFlowNode);
          const anchorCenterFallback = {
            x: abs.x + anchorDim.width / 2,
            y: abs.y + anchorDim.height / 2,
          };
          const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;

          // Compute "preview center offset" relative to the anchor's top-left; reuse for the new node.
          const offsetX = anchorCenter.x - abs.x;
          const offsetY = anchorCenter.y - abs.y;
          const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };

          const viewportTo = {
            x: viewW / 2 - targetFlowCenter.x * targetZoom,
            y: viewH / 2 - targetFlowCenter.y * targetZoom,
            zoom: targetZoom,
          };

          // Let the node/edge commit first; then animate (reduces jank during XYFlow updates).
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              animateViewportTo(viewportTo, 800);
            });
          });
        } catch (e) {
          console.warn("Failed to animate viewport to outpaint result node:", e);
        }
      },
      [
        animateViewportTo,
        buildFlow,
        currentFlowId,
        getPreviewCenterFlow,
        node,
        nodeId,
        nodes,
        reactFlowInstance,
        setEdges,
        setNodes,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );

    const handleConfirmRepaint = useCallback(
      async ({
        maskDataUrl,
        fileName,
        prompt,
      }: {
        maskDataUrl: string;
        fileName: string;
        prompt: string;
      }) => {
        if (!currentFlowId) {
          showTransientBadge("请先保存画布后再生成");
          return;
        }
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;
        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);
        (newTemplate as any).display_name = "重绘结果";
        (newTemplate as any).icon = "Paintbrush";

        const refField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        if (refField) {
          const safeBaseName = "repaint-base.png";
          const safeMaskName = (fileName && String(fileName).trim()) || "repaint-mask.png";
          try {
            const baseSource = currentImage?.imageSource;
            if (!baseSource) {
              showTransientBadge("未找到原图");
              return;
            }
            const baseBlob = await fetch(baseSource).then((r) => r.blob());
            const baseFile = new File([baseBlob], safeBaseName, {
              type: baseBlob.type || "image/png",
            });
            const baseResp = await uploadReferenceFile({ file: baseFile, id: currentFlowId });
            const basePath = baseResp?.file_path ? String(baseResp.file_path) : "";
            if (!basePath.trim()) {
              showTransientBadge("上传失败");
              return;
            }

            const maskBlob = await fetch(maskDataUrl).then((r) => r.blob());
            const maskFile = new File([maskBlob], safeMaskName, {
              type: maskBlob.type || "image/png",
            });
            const maskResp = await uploadReferenceFile({ file: maskFile, id: currentFlowId });
            const maskPath = maskResp?.file_path ? String(maskResp.file_path) : "";
            if (!maskPath.trim()) {
              showTransientBadge("上传失败");
              return;
            }

            // Keep both value/file_path in sync; the backend will read from file_path.
            const paths = [basePath.trim(), maskPath.trim()];
            // Match the regular upload shape: `value` as filenames, `file_path` as server paths.
            // The backend reads from file_path; we also set explicit tool fields below as a fallback.
            refField.value = [safeBaseName, safeMaskName];
            refField.file_path = paths;

            // Extra safety: store explicit base/mask paths for wanx tool runs so the backend
            // can always pick them up even if reference_images is merged/overridden.
            (newTemplate as any).template = (newTemplate as any).template ?? {};
            const toolTpl = (newTemplate as any).template;
            toolTpl.tool_wan_base_image_path = toolTpl.tool_wan_base_image_path ?? { value: "" };
            toolTpl.tool_wan_mask_image_path = toolTpl.tool_wan_mask_image_path ?? { value: "" };
            toolTpl.tool_wan_base_image_path.value = basePath.trim();
            toolTpl.tool_wan_mask_image_path.value = maskPath.trim();
          } catch (error) {
            console.error("Failed to upload repaint base/mask images:", error);
            showTransientBadge("上传失败");
            return;
          }
        }

        (newTemplate as any).template = (newTemplate as any).template ?? {};
        const toolTpl = (newTemplate as any).template;
        toolTpl.tool_model_override = toolTpl.tool_model_override ?? { value: "" };
        toolTpl.tool_model_override.value = "wanx2.1-imageedit";
        toolTpl.tool_wan_imageedit_function = toolTpl.tool_wan_imageedit_function ?? { value: "" };
        toolTpl.tool_wan_imageedit_function.value = "description_edit_with_mask";

        if ((newTemplate as any)?.template?.prompt) {
          (newTemplate as any).template.prompt.value = String(prompt ?? "").trim();
        }

        if ((newTemplate as any)?.template?.draft_output) {
          delete (newTemplate as any).template.draft_output;
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}-repaint`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
          setRepaintOpen(false);
        });

        window.requestAnimationFrame(() => {
          try {
            void buildFlow({ stopNodeId: newImageNodeId });
          } catch (e) {
            console.warn("Failed to start repaint build:", e);
          }
        });

        // After creating the downstream node, zoom out to 48% and center it (match other tool behaviors).
        try {
          const instance: any = reactFlowInstance as any;
          if (!instance || typeof instance.setViewport !== "function") return;

          const container =
            (typeof document !== "undefined" &&
              (document.getElementById("react-flow-id") as HTMLElement | null)) ||
            null;
          const rect = container?.getBoundingClientRect();
          const viewW = rect?.width ?? window.innerWidth;
          const viewH = rect?.height ?? window.innerHeight;
          const targetZoom = 0.48;

          const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
          const anchorDim = getNodeDimensions(currentFlowNode);
          const anchorCenterFallback = {
            x: abs.x + anchorDim.width / 2,
            y: abs.y + anchorDim.height / 2,
          };
          const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;

          const offsetX = anchorCenter.x - abs.x;
          const offsetY = anchorCenter.y - abs.y;
          const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };

          const viewportTo = {
            x: viewW / 2 - targetFlowCenter.x * targetZoom,
            y: viewH / 2 - targetFlowCenter.y * targetZoom,
            zoom: targetZoom,
          };

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              animateViewportTo(viewportTo, 800);
            });
          });
        } catch (e) {
          console.warn("Failed to animate viewport to repaint result node:", e);
        }
      },
      [
        animateViewportTo,
        buildFlow,
        currentFlowId,
        currentImage?.imageSource,
        getPreviewCenterFlow,
        node,
        nodeId,
        nodes,
        reactFlowInstance,
        setEdges,
        setNodes,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );


    const handleConfirmErase = useCallback(
      async ({
        maskDataUrl,
        fileName,
        prompt,
      }: {
        maskDataUrl: string;
        fileName: string;
        prompt: string;
      }) => {
        if (!currentFlowId) {
          showTransientBadge("\u8bf7\u5148\u4fdd\u5b58\u753b\u5e03\u540e\u518d\u751f\u6210");
          return;
        }
        const currentFlowNode = nodes.find((candidate) => candidate.id === nodeId) as any;
        if (!currentFlowNode) return;
        const template = templates?.["DoubaoImageCreator"];
        if (!template) return;

        takeSnapshot?.();

        const REFERENCE_FIELD = "reference_images";
        const IMAGE_OUTPUT_NAME = "image";
        const NODE_OFFSET_X = 1300;
        const DEFAULT_PROMPT = "移除涂抹区域内容并自然补全背景";
        const safePrompt = String(prompt ?? "").trim() || DEFAULT_PROMPT;
        const MASK_GUIDE_PROMPT =
          "参考图包含两张：第1张为原图，第2张为遮罩图（黑底白色区域）。请仅在遮罩白色区域内进行擦除/修复，其他区域保持不变；尽量保持原有透视、光照与细节一致。";
        const finalPrompt = `${MASK_GUIDE_PROMPT}\n${safePrompt}`.trim();
        const sourceTemplate = (currentFlowNode.data?.node ?? node) as any;

        const newImageNodeId = getNodeId("DoubaoImageCreator");
        const nodeById = new Map((nodes as any[]).map((n) => [n.id, n]));
        const abs = getAbsolutePosition(currentFlowNode, nodeById as any);
        const newNodeX = abs.x + NODE_OFFSET_X;
        const newNodeY = computeAlignedNodeTopY({
          anchorNodeId: nodeId,
          anchorNodeType: currentFlowNode.data?.type,
          targetNodeType: "DoubaoImageCreator",
          targetX: newNodeX,
          fallbackTopY: abs.y,
          avoidOverlap: false,
        });

        const newTemplate = cloneDeep(template);
        (newTemplate as any).display_name = "\u64e6\u9664\u7ed3\u679c";
        (newTemplate as any).icon = "Eraser";

        const refField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        if (refField) {
          const safeBaseName = "erase-base.png";
          const safeMaskName = (fileName && String(fileName).trim()) || "erase-mask.png";
          try {
            const baseSource = currentImage?.imageSource;
            if (!baseSource) {
              showTransientBadge("\u672a\u627e\u5230\u539f\u56fe");
              return;
            }
            const baseBlob = await fetch(baseSource).then((r) => r.blob());
            const baseFile = new File([baseBlob], safeBaseName, {
              type: baseBlob.type || "image/png",
            });
            const baseResp = await uploadReferenceFile({ file: baseFile, id: currentFlowId });
            const basePath = baseResp?.file_path ? String(baseResp.file_path) : "";
            if (!basePath.trim()) {
              showTransientBadge("\u4e0a\u4f20\u5931\u8d25");
              return;
            }

            const maskBlob = await fetch(maskDataUrl).then((r) => r.blob());
            const maskFile = new File([maskBlob], safeMaskName, {
              type: maskBlob.type || "image/png",
            });
            const maskResp = await uploadReferenceFile({ file: maskFile, id: currentFlowId });
            const maskPath = maskResp?.file_path ? String(maskResp.file_path) : "";
            if (!maskPath.trim()) {
              showTransientBadge("\u4e0a\u4f20\u5931\u8d25");
              return;
            }

            const paths = [basePath.trim(), maskPath.trim()];
            // Match the regular upload shape: `value` as filenames, `file_path` as server paths.
            // The backend reads from file_path; we also set explicit tool fields below as a fallback.
            refField.value = [safeBaseName, safeMaskName];
            refField.file_path = paths;

            // Extra safety: store explicit base/mask paths for wanx tool runs so the backend
            // can always pick them up even if reference_images is merged/overridden.
            (newTemplate as any).template = (newTemplate as any).template ?? {};
            const toolTpl = (newTemplate as any).template;
            toolTpl.tool_wan_base_image_path = toolTpl.tool_wan_base_image_path ?? { value: "" };
            toolTpl.tool_wan_mask_image_path = toolTpl.tool_wan_mask_image_path ?? { value: "" };
            toolTpl.tool_wan_base_image_path.value = basePath.trim();
            toolTpl.tool_wan_mask_image_path.value = maskPath.trim();
          } catch (error) {
            console.error("Failed to upload erase base/mask images:", error);
            showTransientBadge("\u4e0a\u4f20\u5931\u8d25");
            return;
          }
        }

        // Force Nano Banana Pro (Gemini) for erase tool runs.
        if ((newTemplate as any)?.template?.model_name) {
          (newTemplate as any).template.model_name.value = "Nano Banana Pro";
        }

        // Clear any tool override so we use the model dropdown/provider path (gemini).
        (newTemplate as any).template = (newTemplate as any).template ?? {};
        const toolTpl = (newTemplate as any).template;
        if (toolTpl.tool_model_override) {
          toolTpl.tool_model_override.value = "";
        }

        if ((newTemplate as any)?.template?.prompt) {
          (newTemplate as any).template.prompt.value = finalPrompt;
        }

        if ((newTemplate as any)?.template?.draft_output) {
          delete (newTemplate as any).template.draft_output;
        }

        const newImageNode: GenericNodeType = {
          id: newImageNodeId,
          type: "genericNode",
          position: { x: newNodeX, y: newNodeY },
          data: {
            node: newTemplate as any,
            showNode: !(newTemplate as any).minimized,
            type: "DoubaoImageCreator",
            id: newImageNodeId,
            cropPreviewOnly: true,
          },
          selected: false,
        };

        const outputDefinition =
          sourceTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
          sourceTemplate?.outputs?.find((output: any) => !output.hidden) ??
          sourceTemplate?.outputs?.[0];
        const sourceOutputTypes =
          outputDefinition?.types && outputDefinition.types.length === 1
            ? outputDefinition.types
            : outputDefinition?.selected
              ? [outputDefinition.selected]
              : ["Data"];
        const sourceHandle = {
          output_types: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          dataType: currentFlowNode.data?.type,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
          ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
        };

        const referenceTemplateField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        const targetHandle = {
          inputTypes: referenceTemplateField?.input_types ?? ["Data"],
          type: referenceTemplateField?.type,
          id: newImageNodeId,
          fieldName: REFERENCE_FIELD,
          ...(referenceTemplateField?.proxy ? { proxy: referenceTemplateField.proxy } : {}),
        };

        const edge: EdgeType = {
          id: `xy-edge__${nodeId}-${sourceHandle.name}-${newImageNodeId}-${REFERENCE_FIELD}-erase`,
          source: nodeId,
          sourceHandle: scapedJSONStringfy(sourceHandle as any),
          target: newImageNodeId,
          targetHandle: scapedJSONStringfy(targetHandle as any),
          type: "default",
          className: "doubao-tool-edge",
          data: {
            sourceHandle,
            targetHandle,
            cropLink: true,
          },
        } as any;

        unstable_batchedUpdates(() => {
          setNodes((currentNodes) => [...currentNodes, newImageNode]);
          setEdges((currentEdges) => [...currentEdges, edge]);
          setEraseOpen(false);
        });

        window.requestAnimationFrame(() => {
          try {
            void buildFlow({ stopNodeId: newImageNodeId });
          } catch (e) {
            console.warn("Failed to start erase build:", e);
          }
        });

        // After creating the downstream node, zoom out to 48% and center it (match other tool behaviors).
        try {
          const instance: any = reactFlowInstance as any;
          if (!instance || typeof instance.setViewport !== "function") return;

          const container =
            (typeof document !== "undefined" &&
              (document.getElementById("react-flow-id") as HTMLElement | null)) ||
            null;
          const rect = container?.getBoundingClientRect();
          const viewW = rect?.width ?? window.innerWidth;
          const viewH = rect?.height ?? window.innerHeight;
          const targetZoom = 0.48;

          const anchorPreviewCenter = getPreviewCenterFlow(nodeId);
          const anchorDim = getNodeDimensions(currentFlowNode);
          const anchorCenterFallback = {
            x: abs.x + anchorDim.width / 2,
            y: abs.y + anchorDim.height / 2,
          };
          const anchorCenter = anchorPreviewCenter ?? anchorCenterFallback;

          const offsetX = anchorCenter.x - abs.x;
          const offsetY = anchorCenter.y - abs.y;
          const targetFlowCenter = { x: newNodeX + offsetX, y: newNodeY + offsetY };

          const viewportTo = {
            x: viewW / 2 - targetFlowCenter.x * targetZoom,
            y: viewH / 2 - targetFlowCenter.y * targetZoom,
            zoom: targetZoom,
          };

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              animateViewportTo(viewportTo, 800);
            });
          });
        } catch (e) {
          console.warn("Failed to animate viewport to erase result node:", e);
        }
      },
      [
        animateViewportTo,
        buildFlow,
        currentFlowId,
        currentImage?.imageSource,
        getPreviewCenterFlow,
        node,
        nodeId,
        nodes,
        reactFlowInstance,
        setEdges,
        setNodes,
        showTransientBadge,
        takeSnapshot,
        templates,
        uploadReferenceFile,
      ],
    );

    const hasError = Boolean(primaryFailureReason);
    const shouldShowImageUploadOverlay =
      appearance === "imageCreator" &&
      kind === "image" &&
      (galleryForRenderer?.length || referenceGallery.length);
    const shouldShowVideoUploadOverlay =
      appearance === "videoGenerator" && kind === "video";
    const showUploadOverlay = Boolean(
      onRequestUpload &&
      (shouldShowImageUploadOverlay || shouldShowVideoUploadOverlay),
    );
    // Upload button is now in the node top bar for persistent previews; keep the overlay only for non-persistent panels.
    const showUploadOverlayInFrame = showUploadOverlay && !isPersistentPreview;
    const uploadButtonLabel = "上传";
    const showReferenceSelectionBadge = false;

    const inlinePreview = shouldShowFailurePreview && !shouldShowWaveLoading ? (
      <FailedPreview
        reason={primaryFailureReason}
        onRetryClick={handleRetryFailedBuild}
        onContactClick={handleContactSupport}
      />
    ) : hasRenderablePreview ? (
      <Suspense
        fallback={
          <EmptyPreview
            isBuilding={emptyPreviewBuildingState}
            kind={kind}
            appearance={appearance}
            modelName={selectedModelName}
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
            autoPlay={enableHoverAutoplay ? isPersistentPreviewHovered : undefined}
            muted={enableHoverAutoplay ? isHoverAutoplayMuted : undefined}
            onVideoElement={handleHoverVideoElement}
            onMeta={handlePreviewMeta}
            hideControls={shouldShowWaveLoading}
          />
        ) : kind === "audio" && audioPreview ? (
          <AudioPreview
            audioUrl={audioPreview.audioUrl}
            hideControls={shouldShowWaveLoading}
          />
        ) : kind === "image" && galleryForRenderer?.length ? (
          <ImagePreview
            gallery={galleryForRenderer}
            currentIndex={activeImageIndex}
            onNavigate={handleNavigateImages}
            onSelect={handleSelectImage}
            onError={handleModalError}
            onMeta={handlePreviewMeta}
            appearance={appearance}
            hideControls={shouldShowWaveLoading}
          />
        ) : (
          <EmptyPreview
            isBuilding={emptyPreviewBuildingState}
            kind={kind}
            appearance={appearance}
            modelName={selectedModelName}
            onUploadClick={onRequestUpload}
            onSuggestionClick={handleSuggestionClick}
            disabledSuggestions={disabledSuggestions}
          />
        )}
      </Suspense>
    ) : (
      shouldShowWaveLoading ? (
        <div className="h-full w-full" />
      ) : (
        <EmptyPreview
          isBuilding={hasError ? false : emptyPreviewBuildingState}
          kind={kind}
          appearance={appearance}
          modelName={selectedModelName}
          onUploadClick={onRequestUpload}
          onSuggestionClick={handleSuggestionClick}
          disabledSuggestions={disabledSuggestions}
        />
      )
    );

    const timestampLabel = (() => {
      if (galleryKind === "reference" && referenceGallery.length) {
        return `已上传 ${referenceGallery.length} 张参考图`;
      }
      if (hasRenderablePreview && resolvedPreview?.generated_at) {
        return `最近更新：${formatTimestamp(resolvedPreview.generated_at)}`;
      }
      if (primaryFailureReason) {
        return "最近一次生成失败，请重试";
      }
      if (isBuilding) {
        return "生成中……完成后将自动刷新";
      }
      return "生成完成后将在此显示结果";
    })();

    const [isInspectOpen, setInspectOpen] = useState(false);
    useEffect(() => {
      if (!isPreviewModalOpen) {
        setInspectOpen(false);
      }
    }, [isPreviewModalOpen]);
    useEffect(() => {
      setInspectOpen(false);
    }, [activeImageIndex, resolvedPreview?.token]);

    const previewPrompt = useMemo(() => {
      const payloadPrompt = resolvedPreview?.payload?.prompt;
      if (typeof payloadPrompt === "string" && payloadPrompt.trim()) {
        return decodeEscapedUnicodeText(payloadPrompt.trim());
      }
      // Fallback to the node's prompt field (stable for both image/video creators).
      const fromTemplate =
        (node as any)?.template?.prompt?.value ??
        (node as any)?.template?.prompt?.default ??
        "";
      return decodeEscapedUnicodeText(String(fromTemplate ?? "").trim());
    }, [node, resolvedPreview?.payload?.prompt]);

    const handleCopyPrompt = useCallback(() => {
      const text = String(previewPrompt ?? "").trim();
      if (!text) return;

      const onSuccess = () => {
        setSuccessData({ title: "已复制" });
      };
      const onFail = () => {
        setErrorData({ title: "复制失败" });
      };

      const clipboard = (navigator as any)?.clipboard;
      if (clipboard?.writeText) {
        clipboard.writeText(text).then(onSuccess).catch(onFail);
        return;
      }

      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        onSuccess();
      } catch {
        onFail();
      }
    }, [previewPrompt, setErrorData, setSuccessData]);

    const modalMedia = (() => {
      if (!hasRenderablePreview) {
        return (
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">暂无可预览内容</p>
            {primaryFailureReason ? (
              <p className="whitespace-pre-wrap break-words text-xs text-red-600 dark:text-red-300">
                失败原因：{primaryFailureReason}
              </p>
            ) : null}
          </div>
        );
      }
      switch (kind) {
        case "video":
          return videoPreview ? (
            <Suspense
              fallback={<EmptyPreview isBuilding={false} kind={kind} modelName={selectedModelName} />}
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
              fallback={<EmptyPreview isBuilding={false} kind={kind} modelName={selectedModelName} />}
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
            <div className="flex h-full flex-col gap-3">
              <button
                type="button"
                className="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-muted/30"
                onClick={() => setInspectOpen(true)}
              >
                <img
                  src={
                    sanitizePreviewDataUrl(currentImage.imageSource) ??
                    currentImage.imageSource
                  }
                  alt={currentImage.label ?? "preview"}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
                <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                  点击放大查看
                </div>
              </button>
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

    const modalInfoRows = useMemo(() => {
      const rows: Array<{ label: string; value: string }> = [];
      const push = (label: string, value: unknown) => {
        const str = String(value ?? "").trim();
        if (!str) return;
        rows.push({ label, value: str });
      };

      const payload: any = resolvedPreview?.payload ?? null;

      push(
        "类型",
        kind === "image"
          ? "图片"
          : kind === "video"
            ? "视频"
            : kind === "audio"
              ? "音频"
              : kind,
      );
      push("模型", formatModelNameForInfo(selectedModelName || payload?.model?.name || payload?.model));
      push("模型ID", payload?.model?.model_id || payload?.model_id);
      push("Token", resolvedPreview?.token);
      push(
        "生成时间",
        resolvedPreview?.generated_at ? formatTimestamp(resolvedPreview.generated_at) : "",
      );
      if (resolvedPreview) {
        push("可用", resolvedPreview.available ? "是" : "否");
      }

      if (kind === "image") {
        push(
          "图片数量",
          payload?.image_count || payload?.count || (galleryForRenderer?.length ?? ""),
        );
        push(
          "规格",
          payload?.size?.label || payload?.size?.size_value || payload?.resolution,
        );
      }

      if (kind === "image" && currentImage) {
        push(
          "来源",
          galleryKind === "reference" ? "参考图" : "生成结果",
        );
        const total = galleryForRenderer?.length ?? 0;
        push("序号", total ? `${activeImageIndex + 1} / ${total}` : "");
        push(
          "角色",
          currentImage.role === "first"
            ? "首帧"
            : currentImage.role === "last"
              ? "尾帧"
              : currentImage.role === "reference"
                ? "参考"
                : "",
        );
        push(
          "尺寸",
          currentImage.size ??
          (currentImage.width && currentImage.height
            ? `${currentImage.width}x${currentImage.height}`
            : ""),
        );
        push("\u5bbd", currentImage.width);
        push("\u9ad8", currentImage.height);
        push("\u6587\u4ef6\u5927\u5c0f", previewFileSizeBytes != null ? formatFileSize(previewFileSizeBytes) : "");
      }

      if (kind === "video") {
        push("Provider", payload?.provider);
        push("Task ID", payload?.task_id || payload?.id);
        push("模式", payload?.mode);
        push("分辨率", payload?.resolution);
        push("宽高比", payload?.aspect_ratio || aspectRatio);
      }

      if (kind === "audio") {
        push("音频类型", payload?.audio_type);
        push("采样率", payload?.sample_rate);
      }

      if (primaryFailureReason) {
        push("错误", primaryFailureReason);
      }

      return rows;
    }, [
      activeImageIndex,
      previewFileSizeBytes,
      aspectRatio,
      currentImage,
      galleryForRenderer?.length,
      galleryKind,
      kind,
      referenceGallery.length,
      referenceImages.length,
      primaryFailureReason,
      resolvedPreview?.available,
      resolvedPreview?.generated_at,
      resolvedPreview?.payload,
      resolvedPreview?.token,
      selectedModelName,
      videoPreview?.duration,
    ]);

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
                {transientBadge && (
                  <Badge variant="secondary" className="text-xs">
                    {transientBadge}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="relative overflow-visible">
            <div
              ref={persistentPreviewFrameRef}
              className={previewFrameClassName}
              style={appliedContainerStyle}
              data-testid="doubao-preview-frame"
              onMouseEnter={
                enableHoverAutoplay
                  ? () => setIsPersistentPreviewHovered(true)
                  : undefined
              }
              onMouseLeave={
                enableHoverAutoplay
                  ? () => setIsPersistentPreviewHovered(false)
                  : undefined
              }
            >
              {isPersistentPreview ? (
                <div className="absolute inset-0">
                  <div ref={persistentPreviewScaleShieldRef} className="absolute inset-0">
                    <div
                      ref={persistentPreviewTranslateLayerRef}
                      className="absolute inset-0"
                    >
                      <div className={previewSurfaceClassName}>
                        <div className="relative h-full w-full">
                          <div
                            className={cn(
                              "h-full w-full",
                              shouldShowWaveLoading && "pointer-events-none select-none",
                            )}
                          >
                            {inlinePreview}
                          </div>
                          <BuildingWaveOverlay
                            tonedByPreview={Boolean(hasRenderablePreview)}
                            active={Boolean(shouldShowWaveLoading)}
                          />
                          {hasHoverAutoplayVideo && !shouldShowWaveLoading && (
                            <button
                              type="button"
                              aria-label={isHoverAutoplayMuted ? "开启声音" : "关闭声音"}
                              title={isHoverAutoplayMuted ? "开启声音" : "静音"}
                              onClick={handleToggleHoverAutoplaySound}
                              className={cn(
                                "absolute left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow transition hover:bg-black/60",
                                showReferenceSelectionBadge ? "top-14" : "top-4",
                              )}
                            >
                              {isHoverAutoplayMuted ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                  <line x1="22" y1="9" x2="16" y2="15" />
                                  <line x1="16" y1="9" x2="22" y2="15" />
                                </svg>
                              ) : (
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      {showReferenceSelectionBadge && (
                        <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white shadow">
                          已选择 {referenceSelectionCount}
                        </div>
                      )}

                      {isMinimal ? (
                        !shouldShowWaveLoading &&
                        (showUploadOverlayInFrame ||
                          hasRenderablePreview ||
                          (isAudioMinimal && downloadInfo)) && (
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                            {showUploadOverlayInFrame && (
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
                          </div>
                        )
                      ) : (
                        (appearance === "default" || appearance === "audioCreator") &&
                        hasRenderablePreview && (
                          <button
                            type="button"
                            aria-label="放大预览"
                            onClick={openModal}
                            className="group absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-muted-foreground/40 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md transition-colors duration-200 hover:border-muted-foreground/60 hover:bg-white dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            <ForwardedIconComponent
                              name="Maximize2"
                              className="h-4 w-4 text-current"
                            />
                            <span>放大预览</span>
                          </button>
                        )
                      )}

                      {!shouldShowWaveLoading &&
                        appearance !== "imageCreator" &&
                        hasHoverAutoplayVideo &&
                        !isAudioMinimal && (
                          <button
                            type="button"
                            aria-label="截帧"
                            title="截帧"
                            onClick={handleCaptureHoverVideoFrame}
                            className={cn(
                              "absolute bottom-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow transition",
                              isMinimal
                                ? "bg-black/55 text-white hover:bg-black/70"
                                : "bg-white/90 text-gray-800 shadow-lg transition-colors duration-200 hover:bg-white dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800",
                            )}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                              <circle cx="12" cy="13" r="3" />
                            </svg>
                          </button>
                        )}

                      {!shouldShowWaveLoading &&
                        appearance !== "imageCreator" &&
                        false &&
                        !isAudioMinimal && (
                          <button
                            onClick={handleDownload}
                            className={cn(
                              "absolute flex items-center gap-1 text-xs font-medium transition",
                              isMinimal
                                ? cn(
                                  "bottom-4 rounded-full bg-white px-3 py-1.5 text-[#3B4154] shadow",
                                  hasHoverAutoplayVideo ? "right-16" : "right-4",
                                )
                                : cn(
                                  "bottom-4 rounded-full bg-white/90 px-3 py-1.5 text-gray-800 shadow-lg transition-colors duration-200 hover:bg-white dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800",
                                  hasHoverAutoplayVideo ? "right-16" : "right-4",
                                ),
                            )}
                          >
                            <ForwardedIconComponent name="Download" className="h-4 w-4" />
                            <span>下载结果</span>
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                          日志
                        </Button>
                      </OutputModal>
                    </div>
                  )}

                  <div className={previewSurfaceClassName}>
                    <div className="relative h-full w-full">
                      <div
                        className={cn(
                          "h-full w-full",
                          shouldShowWaveLoading && "pointer-events-none select-none",
                        )}
                      >
                        {inlinePreview}
                      </div>
                      <BuildingWaveOverlay
                        tonedByPreview={Boolean(hasRenderablePreview)}
                        active={Boolean(shouldShowWaveLoading)}
                      />
                    </div>
                  </div>
                  {showReferenceSelectionBadge && (
                    <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white shadow">
                      已选择 {referenceSelectionCount}
                    </div>
                  )}

                  {isMinimal ? (
                    !shouldShowWaveLoading &&
                    (showUploadOverlayInFrame ||
                      hasRenderablePreview ||
                      (isAudioMinimal && downloadInfo)) && (
                      <div className="absolute top-4 right-4 flex items-center gap-2">
                        {showUploadOverlayInFrame && (
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
                        {!shouldShowWaveLoading && !isAudioMinimal && downloadInfo && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleDownload();
                            }}
                            className="flex h-8 items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-3 text-xs font-medium text-[#3B4154] shadow"
                          >
                            <ForwardedIconComponent
                              name="Download"
                              className="h-4 w-4 text-current"
                            />
                            <span>下载</span>
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
                    (appearance === "default" || appearance === "audioCreator") &&
                    hasRenderablePreview && (
                      <button
                        type="button"
                        aria-label="放大预览"
                        onClick={openModal}
                        className="group absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-muted-foreground/40 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md transition-colors duration-200 hover:border-muted-foreground/60 hover:bg-white dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800"
                      >
                        <ForwardedIconComponent
                          name="Maximize2"
                          className="h-4 w-4 text-current"
                        />
                        <span>放大预览</span>
                      </button>
                    )
                  )}

                  {!shouldShowWaveLoading && downloadInfo && !isAudioMinimal && !isMinimal && (
                    <button
                      onClick={handleDownload}
                      className={cn(
                        "absolute flex items-center gap-1 text-xs font-medium transition",
                        isMinimal
                          ? "bottom-4 right-4 rounded-full bg-white px-3 py-1.5 text-[#3B4154] shadow"
                          : "bottom-4 right-4 rounded-full bg-white/90 px-3 py-1.5 text-gray-800 shadow-lg transition-colors duration-200 hover:bg-white dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800",
                      )}
                    >
                      <ForwardedIconComponent name="Download" className="h-4 w-4" />
                      <span>下载结果</span>
                    </button>
                  )}
                </>
              )}
            </div>
            {appearance === "imageCreator" && canAnnotate && currentImage?.imageSource && (
              <AnnotateOverlay
                open={isAnnotateOpen}
                imageSource={currentImage.imageSource}
                imageFileName={currentImage.fileName ?? currentImage.label}
                onCancel={() => setAnnotateOpen(false)}
                onConfirm={handleConfirmAnnotate}
              />
            )}
            {appearance === "imageCreator" && canRepaint && currentImage?.imageSource && (
              <RepaintOverlay
                ref={repaintOverlayRef}
                open={isRepaintOpen}
                imageSource={currentImage.imageSource}
                onCancel={() => setRepaintOpen(false)}
                onConfirm={handleConfirmRepaint}
                onRequestUpload={onRequestUpload}
              />
            )}
            {appearance === "imageCreator" && canErase && currentImage?.imageSource && (
              <EraseOverlay
                ref={eraseOverlayRef}
                open={isEraseOpen}
                imageSource={currentImage.imageSource}
                onCancel={() => setEraseOpen(false)}
                onConfirm={handleConfirmErase}
                onRequestUpload={onRequestUpload}
              />
            )}
            {appearance === "imageCreator" && canCrop && currentImage?.imageSource && (
              <CropOverlay
                open={isCropOpen}
                imageSource={currentImage.imageSource}
                onCancel={() => setCropOpen(false)}
                onConfirm={handleConfirmCrop}
              />
            )}
            {appearance === "imageCreator" && canOutpaint && currentImage?.imageSource && (
              <OutpaintOverlay
                open={isOutpaintOpen}
                imageSource={currentImage.imageSource}
                modelOptions={outpaintWorkspace.modelOptions}
                resolutionOptions={outpaintWorkspace.resolutionOptions}
                aspectRatioOptions={outpaintWorkspace.aspectRatioOptions}
                initialModelName={outpaintWorkspace.initialModelName}
                initialResolution={outpaintWorkspace.initialResolution}
                initialAspectRatio={outpaintWorkspace.initialAspectRatio}
                onCancel={() => setOutpaintOpen(false)}
                onConfirm={handleConfirmOutpaint}
              />
            )}
            {appearance === "imageCreator" && canEnhance && currentImage?.imageSource && (
              <div className="pointer-events-none absolute left-0 right-0 top-full z-[1500] mt-3">
                <div className="pointer-events-auto">
                  <EnhanceOverlay
                    open={isEnhanceOpen}
                    imageSource={currentImage.imageSource}
                    modelOptions={enhanceModelOptions}
                    initialModelId={enhanceModelOptions[0]?.id}
                    initialResolution={"4k"}
                    initialScale={50}
                    onCancel={() => setEnhanceOpen(false)}
                    onConfirm={handleConfirmEnhance}
                  />
                </div>
              </div>
            )}
            {appearance === "imageCreator" && canMultiAngleCamera && currentImage?.imageSource && (
              <div className="pointer-events-none absolute left-0 right-0 top-full z-[1500] mt-3">
                <div className="pointer-events-auto">
                  <MultiAngleCameraOverlay
                    open={isMultiAngleCameraOpen}
                    imageSource={currentImage.imageSource}
                    onCancel={() => setMultiAngleCameraOpen(false)}
                    onConfirm={handleConfirmMultiAngleCamera}
                  />
                </div>
              </div>
            )}

            {appearance === "videoGenerator" && canClip && videoPreview?.videoUrl && (
              <VideoClipOverlay
                open={isClipOpen}
                durationS={Math.max(
                  0,
                  clipVideoDurationS ||
                  Number((resolvedPreview as any)?.payload?.duration) ||
                  0,
                )}
                currentTimeS={0}
                videoSource={videoPreview.videoUrl}
                videoEl={previewVideoEl}
                onCancel={() => setClipOpen(false)}
                onConfirm={({ startS, endS }) => void handleConfirmClip({ startS, endS })}
                onSeek={(timeS) => {
                  const video = previewVideoEl ?? hoverVideoElementRef.current;
                  if (!video) return;
                  try {
                    video.currentTime = Math.max(0, timeS);
                  } catch {
                    // ignore
                  }
                }}
                onTogglePlayback={() => {
                  const video = previewVideoEl ?? hoverVideoElementRef.current;
                  if (!video) return;
                  try {
                    if (video.paused) {
                      void video.play();
                    } else {
                      video.pause();
                    }
                  } catch {
                    // ignore
                  }
                }}
                isBusy={isClipTrimming}
              />
            )}
          </div>
        </div>

        <Dialog open={isPreviewModalOpen} onOpenChange={setPreviewModalOpen}>
          <DialogContent
            className="h-[86vh] w-[96vw] max-w-6xl p-0"
            closeButtonClassName={isInspectOpen ? "hidden" : undefined}
            onEscapeKeyDown={(event) => {
              if (!isInspectOpen) return;
              event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!isInspectOpen) return;
              event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (!isInspectOpen) return;
              event.preventDefault();
            }}
          >
            {hasRenderablePreview && downloadInfo && (
              <button
                type="button"
                className="absolute right-12 top-2 flex h-8 w-8 items-center justify-center rounded-sm ring-offset-background transition-opacity hover:bg-secondary-hover hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="下载"
                title="下载"
                onClick={handleDownload}
              >
                <ForwardedIconComponent name="Download" className="h-4 w-4" />
                <span className="sr-only">下载</span>
              </button>
            )}
            <div className="flex h-full flex-col">
              <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
                <DialogTitle className="text-base">{"\u751f\u6210\u8be6\u60c5"}</DialogTitle>
              </DialogHeader>

              <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4 lg:flex-row">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-muted/40 p-4">
                  {modalMedia ?? (
                    <p className="text-center text-sm text-muted-foreground">{"\u6682\u65e0\u53ef\u9884\u89c8\u5185\u5bb9"}</p>
                  )}
                </div>

                <div className="flex w-full flex-col overflow-hidden rounded-2xl bg-muted/40 p-4 lg:w-[380px] lg:shrink-0">
                  <div className="flex flex-1 flex-col gap-4 overflow-auto pr-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">{"\u63d0\u793a\u8bcd"}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3"
                        onClick={handleCopyPrompt}
                        disabled={!previewPrompt}
                      >
                        <ForwardedIconComponent name="Copy" className="mr-2 h-4 w-4" />
                        {"\u590d\u5236"}
                      </Button>
                    </div>

                    <textarea
                      className="min-h-[140px] w-full resize-none rounded-xl border bg-background/60 p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      readOnly
                      value={previewPrompt || ""}
                      placeholder="\u6682\u65e0\u63d0\u793a\u8bcd"
                    />

                    <div className="text-sm font-medium text-foreground">{"\u4fe1\u606f"}</div>
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      {modalInfoRows.length ? (
                        modalInfoRows.map((row, idx) => (
                          <div
                            key={`${row.label}:${row.value}:${idx}`}
                            className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2"
                          >
                            <div className="shrink-0 text-xs text-muted-foreground">{row.label}</div>
                            <div className="min-w-0 break-words text-right text-sm text-foreground">{row.value}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">{"\u6682\u65e0\u4fe1\u606f"}</div>
                      )}
                    </div>

                    {kind === "image" && referenceGallery.length > 0 && (
                      <div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground">{"\u53c2\u8003\u56fe"}</div>
                          <div className="text-xs text-muted-foreground">{referenceGallery.length} {"\u5f20"}</div>
                        </div>
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                          {referenceGallery.map((item, idx) => (
                            <div
                              key={`ref:${item.imageSource}:${idx}`}
                              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-background/60"
                              title={item.label ?? `\u53c2\u8003\u56fe ${idx + 1}`}
                            >
                              <img
                                src={sanitizePreviewDataUrl(item.imageSource) ?? item.imageSource}
                                alt={item.label ?? `\u53c2\u8003\u56fe ${idx + 1}`}
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                              {item.role && (
                                <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  {item.role === "first"
                                    ? "\u9996\u5e27"
                                    : item.role === "last"
                                      ? "\u5c3e\u5e27"
                                      : "\u53c2\u8003"}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {kind === "image" && currentImage?.imageSource && (
              <ZoomableImageOverlay
                open={isInspectOpen}
                imageSource={currentImage.imageSource}
                title={currentImage.label ?? `\u56fe\u7247 ${activeImageIndex + 1}`}
                onOpenChange={setInspectOpen}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

DoubaoPreviewPanel.displayName = "DoubaoPreviewPanel";


export default DoubaoPreviewPanel;

function formatModelNameForInfo(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Seedream models: keep only the version (matches the model selector label).
  const seedream = /seedream\s*(\d+(?:\.\d+)?)/i.exec(raw);
  if (seedream?.[1]) return `Seedream ${seedream[1]}`;

  return raw;
}

function extractFailureMessagesFromRawMessage(rawMessage: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const normalized = decodeEscapedUnicodeText(String(value ?? "").trim());
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    found.push(normalized);
  };
  const collectFromMessagePayload = (payload: unknown) => {
    if (!payload) return;
    if (typeof payload === "string") {
      add(payload);
      return;
    }
    if (typeof payload !== "object") return;
    const candidate = payload as any;
    add(candidate.errorMessage);
    add(candidate.error);
    add(candidate.detail);
    if (typeof candidate.message === "string") {
      add(candidate.message);
    }
    const previewError = candidate?.doubao_preview?.error;
    add(previewError);
  };

  if (!rawMessage || typeof rawMessage !== "object") return found;
  const root = rawMessage as any;

  if ("message" in root) {
    collectFromMessagePayload(root.message);
  }
  collectFromMessagePayload(root.error);

  const outputs = root?.data?.outputs;
  if (outputs && typeof outputs === "object") {
    for (const output of Object.values(outputs as Record<string, any>)) {
      if (Array.isArray(output)) {
        output.forEach((item) => collectFromMessagePayload(item?.message));
      } else {
        collectFromMessagePayload((output as any)?.message);
      }
    }
  }

  const logs = root?.data?.logs;
  if (logs && typeof logs === "object") {
    for (const item of Object.values(logs as Record<string, any>)) {
      collectFromMessagePayload((item as any)?.message);
    }
  }

  return found;
}

function decodeEscapedUnicodeText(input: string): string {
  const raw = String(input ?? "");
  if (!raw) return raw;

  // Only attempt decoding when it clearly looks like escaped text.
  if (!/\\u[0-9a-fA-F]{4}|\\n|\\t|\\r|\\"/.test(raw)) return raw;

  // Normalize double-escaped sequences first (e.g. "\\\\u4f60" -> "\\u4f60").
  let text = raw
    .replace(/\\\\u/g, "\\u")
    .replace(/\\\\n/g, "\\n")
    .replace(/\\\\t/g, "\\t")
    .replace(/\\\\r/g, "\\r")
    .replace(/\\\\\\"/g, "\\\"")
    .replace(/\\\\\\\\/g, "\\\\");

  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, `"`)
    .replace(/\\\\/g, "\\");
}

function computeDataUrlBytes(dataUrl: string): number | null {
  const str = String(dataUrl ?? "");
  if (!str.startsWith("data:")) return null;
  const base64Index = str.indexOf("base64,");
  if (base64Index == -1) return null;
  const b64 = str.slice(base64Index + "base64,".length).trim();
  if (!b64) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

async function tryFetchRemoteSizeBytes(
  source: string,
  opts: { signal?: AbortSignal; allowBlobFallback?: boolean },
): Promise<number | null> {
  try {
    const head = await fetch(source, { method: "HEAD", signal: opts.signal });
    if (head?.ok) {
      const len = head.headers?.get?.("content-length");
      const parsed = len ? Number(len) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // ignore
  }

  try {
    const ranged = await fetch(source, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: opts.signal,
    });
    if (ranged?.ok) {
      const contentRange = ranged.headers?.get?.("content-range");
      const match = contentRange ? /\/(\d+)\s*$/.exec(contentRange) : null;
      const parsed = match?.[1] ? Number(match[1]) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // ignore
  }

  if (opts.allowBlobFallback) {
    try {
      const res = await fetch(source, { method: "GET", signal: opts.signal });
      if (res?.ok && typeof res.blob === "function") {
        const blob = await res.blob();
        const size = Number(blob?.size);
        if (Number.isFinite(size) && size >= 0) return size;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function inferExtensionFromSource(source: string, fallback: string): string {
  if (!source) return fallback;
  const normalizeExt = (ext: string) => {
    const normalized = ext.split("+")[0].toLowerCase();
    // Backend may persist some media with a masked extension (e.g. ".mp_") even though the bytes are MP4.
    if (normalized === "mp_") return "mp4";
    if (normalized === "mov_") return "mov";
    return normalized;
  };
  if (source.startsWith("data:")) {
    const match = /^data:([^;]+)/.exec(source);
    const mimeType = match?.[1];
    if (mimeType) {
      const ext = mimeType.split("/").pop();
      if (ext) return normalizeExt(ext);
    }
    return fallback;
  }

  try {
    const url = new URL(source);
    const pathExt = url.pathname.split(".").pop();
    if (pathExt && pathExt.length <= 5) {
      return normalizeExt(pathExt);
    }
  } catch {
    const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(source);
    if (match?.[1]) {
      return normalizeExt(match[1]);
    }
  }

  return fallback;
}

function isVideoCandidate(source: string | undefined, fileName?: string) {
  const combined = `${fileName ?? ""} ${source ?? ""}`.toLowerCase();
  return (
    combined.includes(".mp4") ||
    combined.includes(".mov") ||
    combined.includes(".webm") ||
    // Some uploads get stored with a "masked" extension (e.g. ".mp_") but are still MP4 content.
    combined.includes(".mp_")
  );
}

function deriveFlowFilePathFromVideoUrl(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  // Supports both absolute and relative URLs.
  const markers = [
    "/api/v1/files/media/",
    "/api/v1/files/public/",
    "/files/media/",
    "/files/public/",
  ];
  const marker = markers.find((m) => raw.includes(m));
  if (!marker) return null;
  const idx = raw.indexOf(marker);
  if (idx < 0) return null;
  const rest = raw.slice(idx + marker.length).split("?", 1)[0].split("#", 1)[0];
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const flowId = parts[0];
  const fileName = parts.slice(1).join("/");
  try {
    return `${decodeURIComponent(flowId)}/${decodeURIComponent(fileName)}`;
  } catch {
    // If it's not valid URI encoding, keep the raw.
    return `${flowId}/${fileName}`;
  }
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

function BuildingWaveOverlay({
  tonedByPreview,
  active,
}: {
  tonedByPreview: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "doubao-building-wave absolute inset-0 z-30 overflow-hidden",
        tonedByPreview
          ? "doubao-building-wave--toned"
          : "doubao-building-wave--theme",
        active ? "doubao-building-wave--active" : "doubao-building-wave--inactive",
      )}
      aria-hidden="true"
      data-testid="doubao-building-wave-overlay"
    >
      <div className="doubao-building-wave__progress">
        <div className="doubao-building-wave__base" />
        <div className="doubao-building-wave__texture" />
        <div className="doubao-building-wave__front" />
        <div className="doubao-building-wave__loop" />
        <div className="doubao-building-wave__loop doubao-building-wave__loop2" />
        <div className="doubao-building-wave__gloss" />
      </div>
    </div>
  );
}

function EmptyPreview({
  isBuilding,
  kind,
  appearance = "default",
  onUploadClick,
  onSuggestionClick,
  disabledSuggestions,
  modelName,
}: {
  isBuilding: boolean;
  kind: "image" | "video" | "audio";
  appearance?: "default" | "imageCreator" | "videoGenerator" | "audioCreator";
  onUploadClick?: () => void;
  onSuggestionClick?: (label: string) => void;
  disabledSuggestions?: string[];
  modelName?: string;
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
              "flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-[#3C4258] shadow-sm transition dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
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
      const normalizedModel = String(modelName ?? "").trim().toLowerCase();
      if (normalizedModel === "vidu-upscale") {
        return (
          <div className="flex h-full min-h-[220px] w-full items-center justify-center p-5 text-center text-sm text-[#646B81] dark:text-slate-300">
            <p className="text-base font-medium text-[#4B5168] dark:text-slate-100">
              配置参数以生成高清视频
            </p>
          </div>
        );
      }
      const isViduModel = normalizedModel.startsWith("vidu");
      const hideStartEndSuggestion = normalizedModel === "viduq3-pro";
      const suggestions = [
        {
          label: "首帧生成视频",
          icon: "Clapperboard",
          disabled: disabledSuggestions?.includes("首帧生成视频"),
        },
        // Vidu q3-pro does not support start-end2video; hide the action entirely (q2-pro supports it).
        ...(!isViduModel || !hideStartEndSuggestion
          ? [
            {
              label: "首尾帧生成视频",
              icon: "Clapperboard",
              disabled: disabledSuggestions?.includes("首尾帧生成视频"),
            },
          ]
          : []),
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
        <div className="flex h-full min-h-[220px] w-full flex-col justify-center rounded-[16px] border border-dashed border-[#DDE3F6] bg-[#F7F8FD] p-5 text-center text-sm text-[#646B81] transition-colors duration-200 dark:border-white/20 dark:bg-neutral-800/80 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:text-slate-300">
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

function FailedPreview({
  reason,
  onRetryClick,
  onContactClick,
}: {
  reason: string;
  onRetryClick?: () => void;
  onContactClick?: () => void;
}) {
  const parsedReason = decodeEscapedUnicodeText(String(reason ?? "").trim());
  const fallbackReason = "未返回详细失败原因，请稍后重试。";
  const detail = parsedReason || fallbackReason;

  return (
    <div className="flex h-full w-full items-center justify-center p-5">
      <div className="flex w-full max-w-[560px] items-start gap-2 text-left">
        <ForwardedIconComponent
          name="AlertTriangle"
          className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-300"
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-red-700 dark:text-red-200">
            生成失败
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-700/90 dark:text-red-100/90">
            {detail}
          </p>
          <p className="mt-2 text-sm text-red-700/90 dark:text-red-100/90">
            请先
            <button
              type="button"
              className="mx-1 inline cursor-pointer border-none bg-transparent p-0 align-baseline text-sm text-[#1B66FF] underline underline-offset-2 transition-colors duration-200 ease-out hover:text-[#1757d8] dark:text-[#8ab4ff] dark:hover:text-[#b0ccff]"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRetryClick?.();
              }}
            >
              重试
            </button>
            ；若多次失败，请
            <button
              type="button"
              className="mx-1 inline cursor-pointer border-none bg-transparent p-0 align-baseline text-sm text-[#1B66FF] underline underline-offset-2 transition-colors duration-200 ease-out hover:text-[#1757d8] dark:text-[#8ab4ff] dark:hover:text-[#b0ccff]"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onContactClick?.();
              }}
            >
              联系客服
            </button>
            并附上失败原因。
          </p>
        </div>
      </div>
    </div>
  );
}
