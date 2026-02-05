import {
  forwardRef,
  lazy,
  Suspense,
  type ChangeEvent,
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
import ImageViewer from "@/components/common/ImageViewer";
import { cn } from "@/utils/utils";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import {
  parseDoubaoPreviewData,
  useDoubaoPreview,
} from "../../../hooks/use-doubao-preview";
import type { DoubaoPreviewDescriptor } from "../../../hooks/use-doubao-preview";
import { sanitizePreviewDataUrl } from "./helpers";
import useFlowStore from "@/stores/flowStore";
import OutputModal from "../outputModal";
import CropOverlay from "./CropOverlay";
import { cloneDeep } from "lodash";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useTypesStore } from "@/stores/typesStore";
import { computeAlignedNodeTopY } from "@/CustomNodes/helpers/previewCenterAlignment";
import { getNodeId, scapedJSONStringfy } from "@/utils/reactflowUtils";
import type { EdgeType, GenericNodeType } from "@/types/flow";
import { getAbsolutePosition, getNodeDimensions } from "@/utils/groupingUtils";

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

// Some node/template updates can remount this component. Cache the last rendered ratio per node so we
// can still animate from the previous value to the new one after mount.
const lastPersistentPreviewPaddingByKey = new Map<string, number>();

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
    return adaptivePaddingPercent ?? fallback;
  }

  const lowered = raw.toLowerCase();
  if (lowered === "adaptive" || lowered === "auto") {
    return adaptivePaddingPercent ?? fallback;
  }

  // Supports "W:H" (e.g. "16:9") and "WxH" (e.g. "1024x768"), including labels like "16:9 横屏".
  const match = raw.match(/(\d+(?:\.\d+)?)\s*[:xX]\s*(\d+(?:\.\d+)?)/);
  if (!match) return fallback;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }

  const percent = (height / width) * 100;
  return Math.max(0, Math.round(percent * 100) / 100);
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
  enterCrop: () => void;
  canCrop: boolean;
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
    const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
    const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
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
    const [isPersistentPreviewHovered, setIsPersistentPreviewHovered] =
      useState(false);
    const enableHoverAutoplay = isMinimal && appearance === "videoGenerator";

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
      pendingRatioAnimationRef.current = {
        fromScaleY: 1,
        toScaleY: next / current,
        finalizePaddingPercent: next,
      };

      ratioAnimSeqRef.current += 1;
      setRatioAnimSeq(ratioAnimSeqRef.current);
    }, [isPersistentPreview, layoutPaddingPercent, targetPaddingPercent]);

    useEffect(() => {
      if (!isPersistentPreview) return;
      lastPersistentPreviewPaddingByKey.set(paddingCacheKey, layoutPaddingPercent);
    }, [isPersistentPreview, paddingCacheKey, layoutPaddingPercent]);

    const containerStyle = useMemo(() => {
      if (!isPersistentPreview || targetPaddingPercent === null) return undefined;
      return {
        position: "relative" as const,
        width: "100%",
        height: 0,
        paddingBottom: `${layoutPaddingPercent}%`,
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
                "overflow-hidden rounded-[16px] border border-[#DDE3F6] bg-[#F7F8FD] p-0 shadow-none transition-colors transition-shadow duration-200 ease-out [contain:layout_paint] hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:hover:border-white/20 dark:hover:shadow-[0_18px_45px_rgba(0,0,0,0.30)]",
              // backdrop-filter can force repaints during transform/layout changes; disable it only while animating.
              isRatioTransitioning && "dark:backdrop-blur-none",
              // Keep selected shadow/ring visible during the ratio animation so the selection
              // styling tracks the frame as it scales, instead of popping at the end.
              isNodeSelected &&
                "ring-2 ring-node-selected/25 shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:shadow-[0_20px_55px_rgba(2,6,23,0.60)]",
             ),
            )
           : cn(
             "w-full max-w-full",
             minimalAspectClass,
              cn(
                "rounded-[20px] border border-[#E6E9F4] bg-gradient-to-b from-white to-[#F7F8FD] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition-colors transition-shadow duration-200 ease-out dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_15px_40px_rgba(0,0,0,0.30)]",
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
    const [isCropOpen, setCropOpen] = useState(false);
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
    const hasVideoPreview = kind === "video" && Boolean(videoPreview);
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

        // Throttle to ~30fps to reduce XYFlow work during heavy updates.
        let lastFrameAt = 0;
        const startedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const step = (now: number) => {
          if (now - lastFrameAt < 33) {
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

    const canCrop = Boolean(appearance === "imageCreator" && kind === "image" && currentImage?.imageSource);
    const enterCrop = useCallback(() => {
      if (!canCrop) return;
      unstable_batchedUpdates(() => {
        // Exit selection mode: cropping should not rely on node selection state.
        setNodes((currentNodes) =>
          currentNodes.map((candidate) =>
            candidate.id === nodeId ? { ...candidate, selected: false } : candidate,
          ),
        );
        setCropOpen(true);
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

    // When the preview disappears (or switches kind), exit crop mode.
    useEffect(() => {
      if (!isCropOpen) return;
      if (!canCrop) {
        setCropOpen(false);
      }
    }, [canCrop, isCropOpen]);

    useEffect(() => {
      onActionsChange?.({
        openPreview: openModal,
        download: handleDownload,
        canDownload: Boolean(downloadInfo),
        enterCrop,
        canCrop,
      });
    }, [canCrop, downloadInfo, enterCrop, handleDownload, onActionsChange, openModal]);

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
        const refField = (newTemplate as any)?.template?.[REFERENCE_FIELD];
        if (refField) {
          const safeName = (fileName && String(fileName).trim()) || "crop.png";
          refField.value = [safeName];
          refField.file_path = [dataUrl];
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
          outputTypes: sourceOutputTypes,
          type: outputDefinition?.type,
          id: nodeId,
          name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
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

    const hasError = resolvedPreview?.error;
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
            autoPlay={enableHoverAutoplay ? isPersistentPreviewHovered : undefined}
            onMeta={handlePreviewMeta}
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
            onMeta={handlePreviewMeta}
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
                <div className={previewSurfaceClassName}>{inlinePreview}</div>
                {showReferenceSelectionBadge && (
                  <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white shadow">
                    已选择 {referenceSelectionCount}
                  </div>
                )}

                {isMinimal ? (
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

                {appearance !== "imageCreator" && downloadInfo && !isAudioMinimal && (
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
                        Logs
                      </Button>
                    </OutputModal>
                  </div>
                )}

                <div className={previewSurfaceClassName}>{inlinePreview}</div>
                {showReferenceSelectionBadge && (
                  <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white shadow">
                    已选择 {referenceSelectionCount}
                  </div>
                )}

                {isMinimal ? (
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

                {downloadInfo && !isAudioMinimal && (
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
            {appearance === "imageCreator" && canCrop && currentImage?.imageSource && (
              <CropOverlay
                open={isCropOpen}
                imageSource={currentImage.imageSource}
                onCancel={() => setCropOpen(false)}
                onConfirm={handleConfirmCrop}
              />
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
    const match = /\.([a-z0-9]+)(?:[\?#]|$)/i.exec(source);
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
