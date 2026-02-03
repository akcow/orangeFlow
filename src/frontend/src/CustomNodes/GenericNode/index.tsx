import { type ReactFlowState, useStore, useUpdateNodeInternals } from "@xyflow/react";
import { cloneDeep } from "lodash";
import { type CSSProperties, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useShallow } from "zustand/react/shallow";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { usePostValidateComponentCode } from "@/controllers/API/queries/nodes/use-post-validate-component-code";
import { CustomNodeStatus } from "@/customization/components/custom-NodeStatus";
import { t } from "@/i18n/t";
import UpdateComponentModal from "@/modals/updateComponentModal";
import { useAlternate } from "@/shared/hooks/use-alternate";
import type { FlowStoreType } from "@/types/zustand/flow";
import { Button } from "../../components/ui/button";
import { ICON_STROKE_WIDTH } from "../../constants/constants";
import NodeToolbarComponent from "../../pages/FlowPage/components/nodeToolbarComponent";
import { useChangeOnUnfocus } from "../../shared/hooks/use-change-on-unfocus";
import useAlertStore from "../../stores/alertStore";
import useFlowStore from "../../stores/flowStore";
import useFlowsManagerStore from "../../stores/flowsManagerStore";
import { useShortcutsStore } from "../../stores/shortcuts";
import { useTypesStore } from "../../stores/typesStore";
import type { OutputFieldType, VertexBuildTypeAPI } from "../../types/api";
import type { NodeDataType } from "../../types/flow";
import { scapedJSONStringfy } from "../../utils/reactflowUtils";
import { classNames, cn } from "../../utils/utils";
import { processNodeAdvancedFields } from "../helpers/process-node-advanced-fields";
import useUpdateNodeCode from "../hooks/use-update-node-code";
import NodeDescription from "./components/NodeDescription";
import NodeLegacyComponent from "./components/NodeLegacyComponent";
import NodeName from "./components/NodeName";
import NodeOutputs from "./components/NodeOutputParameter/NodeOutputs";
import NodeUpdateComponent from "./components/NodeUpdateComponent";
import { NodeIcon } from "./components/nodeIcon";
import RenderInputParameters from "./components/RenderInputParameters";
import DoubaoPreviewPanel, {
  type DoubaoPreviewPanelActions,
} from "./components/DoubaoPreviewPanel";
import DoubaoImageCreatorLayout from "./components/DoubaoImageCreatorLayout";
import DoubaoVideoGeneratorLayout from "./components/DoubaoVideoGeneratorLayout";
import DoubaoAudioLayout from "./components/DoubaoAudioLayout";
import TextCreationLayout from "./components/TextCreationLayout";
import OutputModal from "./components/outputModal";
import { isDoubaoComponent } from "../hooks/use-doubao-preview";
import { useBuildStatus } from "./hooks/use-get-build-status";

function DoubaoImageCreatorTopBar({
  nodeId,
  isOpen,
  setOpen,
  onOpenPreview,
  onDownload,
  canDownload,
  motionStart,
  motionCommitToken,
}: {
  nodeId: string;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  onOpenPreview: () => void;
  onDownload: () => void;
  canDownload: boolean;
  motionStart?: {
    token: number;
    motion: { deltaTopPx: number; durationMs: number; easing: string };
  } | null;
  motionCommitToken?: number;
}) {
  const motionRef = useRef<HTMLDivElement | null>(null);
  const motionAnimRef = useRef<Animation | null>(null);

  useEffect(() => {
    if (!motionStart?.token) return;
    const el = motionRef.current;
    if (!el) return;

    motionAnimRef.current?.cancel();
    motionAnimRef.current = null;

    const { deltaTopPx, durationMs, easing } = motionStart.motion;
    if (typeof el.animate === "function") {
      const anim = el.animate(
        [{ transform: "translateY(0px)" }, { transform: `translateY(${deltaTopPx}px)` }],
        { duration: durationMs, easing, fill: "both" },
      );
      motionAnimRef.current = anim;
      anim.onfinish = () => {
        el.style.transform = `translateY(${deltaTopPx}px)`;
        try {
          anim.cancel();
        } catch {
          // ignore
        }
        if (motionAnimRef.current === anim) motionAnimRef.current = null;
      };
      anim.oncancel = () => {
        if (motionAnimRef.current === anim) motionAnimRef.current = null;
      };
      return;
    }
  }, [motionStart?.token]);

  useEffect(() => {
    const el = motionRef.current;
    if (!el) return;
    // After the preview layout commits, the node position may jump (bottom-anchored correction).
    // Clear our temporary transform to avoid double-applying the motion.
    motionAnimRef.current?.cancel();
    motionAnimRef.current = null;
    el.style.transform = "";
  }, [motionCommitToken]);

  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  // Keep UI pixel size fixed while zoom >= 57%. Below that, allow it to shrink with the canvas.
  const inverseZoom = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    return 1 / Math.max(zoom, MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

  const handleUpload = useCallback(() => {
    const uploadEvent = new CustomEvent("doubao-preview-upload", {
      detail: { nodeId },
    });
    window.dispatchEvent(uploadEvent);
  }, [nodeId]);

  return (
    <div
      ref={motionRef}
      className="pointer-events-none absolute left-0 right-0 top-0 z-[1500] flex w-full items-center justify-center px-4"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
          "dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
          // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
          "transform-gpu origin-top scale-[var(--inv-zoom)] translate-y-[calc(-100%*var(--inv-zoom))]",
        )}
        style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
      >
        <OutputModal
          open={isOpen}
          setOpen={setOpen}
          disabled={false}
          nodeId={nodeId}
          outputName={"image"}
        >
          <button
            type="button"
            title="Logs"
            aria-label="Logs"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <ForwardedIconComponent name="FileText" className="h-5 w-5" />
          </button>
        </OutputModal>

        <button
          type="button"
          title="上传"
          aria-label="上传"
          onClick={handleUpload}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <ForwardedIconComponent name="Upload" className="h-5 w-5" />
        </button>

        <button
          type="button"
          title="放大"
          aria-label="放大"
          onClick={onOpenPreview}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <ForwardedIconComponent name="Maximize2" className="h-5 w-5" />
        </button>

        <button
          type="button"
          title="下载"
          aria-label="下载"
          disabled={!canDownload}
          onClick={onDownload}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition",
            canDownload
              ? "text-[#3C4258] hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
              : "cursor-not-allowed text-[#A0A6BC] opacity-80 dark:text-slate-500",
          )}
        >
          <ForwardedIconComponent name="Download" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function DoubaoVideoGeneratorTopBar({
  nodeId,
  isOpen,
  setOpen,
  onOpenPreview,
  onDownload,
  canDownload,
  motionStart,
  motionCommitToken,
}: {
  nodeId: string;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  onOpenPreview: () => void;
  onDownload: () => void;
  canDownload: boolean;
  motionStart?: {
    token: number;
    motion: { deltaTopPx: number; durationMs: number; easing: string };
  } | null;
  motionCommitToken?: number;
}) {
  const motionRef = useRef<HTMLDivElement | null>(null);
  const motionAnimRef = useRef<Animation | null>(null);

  useEffect(() => {
    if (!motionStart?.token) return;
    const el = motionRef.current;
    if (!el) return;

    motionAnimRef.current?.cancel();
    motionAnimRef.current = null;

    const { deltaTopPx, durationMs, easing } = motionStart.motion;
    if (typeof el.animate === "function") {
      const anim = el.animate(
        [{ transform: "translateY(0px)" }, { transform: `translateY(${deltaTopPx}px)` }],
        { duration: durationMs, easing, fill: "both" },
      );
      motionAnimRef.current = anim;
      anim.onfinish = () => {
        el.style.transform = `translateY(${deltaTopPx}px)`;
        try {
          anim.cancel();
        } catch {
          // ignore
        }
        if (motionAnimRef.current === anim) motionAnimRef.current = null;
      };
      anim.oncancel = () => {
        if (motionAnimRef.current === anim) motionAnimRef.current = null;
      };
      return;
    }
  }, [motionStart?.token]);

  useEffect(() => {
    const el = motionRef.current;
    if (!el) return;
    motionAnimRef.current?.cancel();
    motionAnimRef.current = null;
    el.style.transform = "";
  }, [motionCommitToken]);

  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  // Keep UI pixel size fixed while zoom >= 57%. Below that, allow it to shrink with the canvas.
  const inverseZoom = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    return 1 / Math.max(zoom, MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

  const handleUpload = useCallback(() => {
    const uploadEvent = new CustomEvent("doubao-preview-upload", {
      detail: { nodeId },
    });
    window.dispatchEvent(uploadEvent);
  }, [nodeId]);

  return (
    <div
      ref={motionRef}
      className="pointer-events-none absolute left-0 right-0 top-0 z-[1500] flex w-full items-center justify-center px-4"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
          "dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
          // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
          "transform-gpu origin-top scale-[var(--inv-zoom)] translate-y-[calc(-100%*var(--inv-zoom))]",
        )}
        style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
      >
        <OutputModal
          open={isOpen}
          setOpen={setOpen}
          disabled={false}
          nodeId={nodeId}
          outputName={"video"}
        >
          <button
            type="button"
            title="Logs"
            aria-label="Logs"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <ForwardedIconComponent name="FileText" className="h-5 w-5" />
          </button>
        </OutputModal>

        <button
          type="button"
          title="上传"
          aria-label="上传"
          onClick={handleUpload}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <ForwardedIconComponent name="Upload" className="h-5 w-5" />
        </button>

        <button
          type="button"
          title="放大"
          aria-label="放大"
          onClick={onOpenPreview}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <ForwardedIconComponent name="Maximize2" className="h-5 w-5" />
        </button>

        <button
          type="button"
          title="下载"
          aria-label="下载"
          disabled={!canDownload}
          onClick={onDownload}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition",
            canDownload
              ? "text-[#3C4258] hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
              : "cursor-not-allowed text-[#A0A6BC] opacity-80 dark:text-slate-500",
          )}
        >
          <ForwardedIconComponent name="Download" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function DoubaoAudioTopBar({
  nodeId,
  isOpen,
  setOpen,
  onOpenPreview,
  onDownload,
  canDownload,
}: {
  nodeId: string;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  onOpenPreview: () => void;
  onDownload: () => void;
  canDownload: boolean;
}) {
  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  // Keep UI pixel size fixed while zoom >= 57%. Below that, allow it to shrink with the canvas.
  const inverseZoom = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    return 1 / Math.max(zoom, MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-[1500] flex w-full items-center justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
          "dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
          // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
          "transform-gpu origin-top scale-[var(--inv-zoom)] translate-y-[calc(-100%*var(--inv-zoom))]",
        )}
        style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
      >
        <OutputModal
          open={isOpen}
          setOpen={setOpen}
          disabled={false}
          nodeId={nodeId}
          outputName={"audio"}
        >
          <button
            type="button"
            title="Logs"
            aria-label="Logs"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <ForwardedIconComponent name="FileText" className="h-5 w-5" />
          </button>
        </OutputModal>

        <button
          type="button"
          title="放大"
          aria-label="放大"
          onClick={onOpenPreview}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <ForwardedIconComponent name="Maximize2" className="h-5 w-5" />
        </button>

        <button
          type="button"
          title="下载"
          aria-label="下载"
          disabled={!canDownload}
          onClick={onDownload}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition",
            canDownload
              ? "text-[#3C4258] hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
              : "cursor-not-allowed text-[#A0A6BC] opacity-80 dark:text-slate-500",
          )}
        >
          <ForwardedIconComponent name="Download" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function TextCreationTopBar({
  nodeId,
  isOpen,
  setOpen,
  onOpenPreview,
}: {
  nodeId: string;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  onOpenPreview: () => void;
}) {
  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  // Keep UI pixel size fixed while zoom >= 57%. Below that, allow it to shrink with the canvas.
  const inverseZoom = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    return 1 / Math.max(zoom, MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-[1500] flex w-full items-center justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
          "dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
          // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
          "transform-gpu origin-top scale-[var(--inv-zoom)] translate-y-[calc(-100%*var(--inv-zoom))]",
        )}
        style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
      >
        <OutputModal
          open={isOpen}
          setOpen={setOpen}
          disabled={false}
          nodeId={nodeId}
          outputName={"text_output"}
        >
          <button
            type="button"
            title="Logs"
            aria-label="Logs"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <ForwardedIconComponent name="FileText" className="h-5 w-5" />
          </button>
        </OutputModal>

        <button
          type="button"
          title="放大"
          aria-label="放大"
          onClick={onOpenPreview}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3C4258] transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
        >
          <ForwardedIconComponent name="Maximize2" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

const MemoizedRenderInputParameters = memo(RenderInputParameters);
const MemoizedNodeIcon = memo(NodeIcon);
const MemoizedNodeName = memo(NodeName);
const MemoizedNodeStatus = memo(CustomNodeStatus);
const MemoizedNodeDescription = memo(NodeDescription);
const MemoizedNodeOutputs = memo(NodeOutputs);

const DOUBAO_DEFAULT_DESCRIPTIONS: Record<string, Array<string>> = {
  DoubaoImageCreator: [
    "基于多种图片创作模型，提供文本生成图片、参考图编辑与组图能力，支持实时预览、多图上传、分辨率与比例一体化配置。",
  ],
  DoubaoVideoGenerator: [
    "视频创作：支持文生视频和图生视频，可自定义模型、提示词与分辨率等参数。",
  ],
  DoubaoTTS: [
    "音频合成：调用双向流式接口，将文本转换为语音。",
  ],
};

const _HiddenOutputsButton = memo(
  ({
    showHiddenOutputs,
    onClick,
  }: {
    showHiddenOutputs: boolean;
    onClick: () => void;
  }) => (
    <Button
      unstyled
      className="group flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-full border bg-muted hover:text-foreground"
      onClick={onClick}
    >
      <ForwardedIconComponent
        name={showHiddenOutputs ? "ChevronsDownUp" : "ChevronsUpDown"}
        className="h-3 w-3 text-placeholder-foreground group-hover:text-foreground"
      />
    </Button>
  ),
);

function GenericNode({
  data,
  selected,
}: {
  data: NodeDataType;
  selected?: boolean;
  xPos?: number;
  yPos?: number;
}): JSX.Element {
  const [borderColor, setBorderColor] = useState<string>("");
  const [loadingUpdate, setLoadingUpdate] = useState(false);
  const [showHiddenOutputs, setShowHiddenOutputs] = useState(false);
  const [_validationStatus, setValidationStatus] =
    useState<VertexBuildTypeAPI | null>(null);
  const [openUpdateModal, setOpenUpdateModal] = useState(false);
  const [isImageCreatorLogsOpen, setImageCreatorLogsOpen] = useState(false);
  const [imageCreatorPreviewActions, setImageCreatorPreviewActions] =
    useState<DoubaoPreviewPanelActions | null>(null);
  const [isVideoGeneratorLogsOpen, setVideoGeneratorLogsOpen] = useState(false);
  const [videoGeneratorPreviewActions, setVideoGeneratorPreviewActions] =
    useState<DoubaoPreviewPanelActions | null>(null);
  const [isAudioCreatorLogsOpen, setAudioCreatorLogsOpen] = useState(false);
  const [audioCreatorPreviewActions, setAudioCreatorPreviewActions] =
    useState<DoubaoPreviewPanelActions | null>(null);
  const [isTextCreationLogsOpen, setTextCreationLogsOpen] = useState(false);
  const [textCreationPreviewActions, setTextCreationPreviewActions] =
    useState<DoubaoPreviewPanelActions | null>(null);

  // Used to sync the floating top bar with the persistent preview frame resize animation
  // (the node is bottom-anchored via ResizeObserver, so without this the top bar "jumps" at the end).
  const persistentPreviewMotionTokenRef = useRef(0);
  const [persistentPreviewMotionStart, setPersistentPreviewMotionStart] = useState<{
    token: number;
    motion: { deltaTopPx: number; durationMs: number; easing: string };
  } | null>(null);
  const [persistentPreviewMotionCommitToken, setPersistentPreviewMotionCommitToken] =
    useState(0);

  // Sync the in-node title row (e.g. "视频创作") with the persistent preview resize animation.
  // The node is bottom-anchored, so the final layout commit adjusts the node y-position; without this
  // the title visually "jumps" only at the end.
  const titleMotionRef = useRef<HTMLDivElement | null>(null);
  const titleMotionAnimRef = useRef<Animation | null>(null);
  useEffect(() => {
    if (!persistentPreviewMotionStart?.token) return;
    const el = titleMotionRef.current;
    if (!el) return;

    titleMotionAnimRef.current?.cancel();
    titleMotionAnimRef.current = null;

    const { deltaTopPx, durationMs, easing } = persistentPreviewMotionStart.motion;
    if (typeof el.animate !== "function") return;
    const anim = el.animate(
      [{ transform: "translateY(0px)" }, { transform: `translateY(${deltaTopPx}px)` }],
      { duration: durationMs, easing, fill: "both" },
    );
    titleMotionAnimRef.current = anim;
    anim.onfinish = () => {
      el.style.transform = `translateY(${deltaTopPx}px)`;
      try {
        anim.cancel();
      } catch {
        // ignore
      }
      if (titleMotionAnimRef.current === anim) titleMotionAnimRef.current = null;
    };
    anim.oncancel = () => {
      if (titleMotionAnimRef.current === anim) titleMotionAnimRef.current = null;
    };
  }, [persistentPreviewMotionStart?.token]);

  useEffect(() => {
    const el = titleMotionRef.current;
    if (!el) return;
    titleMotionAnimRef.current?.cancel();
    titleMotionAnimRef.current = null;
    el.style.transform = "";
  }, [persistentPreviewMotionCommitToken]);

  const handlePersistentPreviewMotionStart = useCallback(
    // Layouts may include extra fields (e.g. deltaCenterPx) for syncing other UI; we only need deltaTopPx here.
    (motion: { deltaTopPx: number; deltaCenterPx?: number; durationMs: number; easing: string }) => {
      persistentPreviewMotionTokenRef.current += 1;
      setPersistentPreviewMotionStart({
        token: persistentPreviewMotionTokenRef.current,
        motion,
      });
    },
    [],
  );
  const handlePersistentPreviewMotionCommit = useCallback(() => {
    setPersistentPreviewMotionCommitToken((token) => token + 1);
    setPersistentPreviewMotionStart(null);
  }, []);

  const types = useTypesStore((state) => state.types);
  const templates = useTypesStore((state) => state.templates);
  const deleteNode = useFlowStore((state) => state.deleteNode);
  const setNode = useFlowStore((state) => state.setNode);
  const updateNodeInternals = useUpdateNodeInternals();
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const edges = useFlowStore((state) => state.edges);
  const setEdges = useFlowStore((state) => state.setEdges);
  const shortcuts = useShortcutsStore((state) => state.shortcuts);
  const buildStatus = useBuildStatus(data, data.id);
  const dismissedNodes = useFlowStore((state) => state.dismissedNodes);
  const addDismissedNodes = useFlowStore((state) => state.addDismissedNodes);
  const removeDismissedNodes = useFlowStore(
    (state) => state.removeDismissedNodes,
  );

  const dismissedNodesLegacy = useFlowStore(
    (state) => state.dismissedNodesLegacy,
  );
  const addDismissedNodesLegacy = useFlowStore(
    (state) => state.addDismissedNodesLegacy,
  );

  const dismissAll = useMemo(
    () => dismissedNodes.includes(data.id),
    [dismissedNodes, data.id],
  );
  const dismissAllLegacy = useMemo(
    () => dismissedNodesLegacy.includes(data.id),
    [dismissedNodesLegacy, data.id],
  );

  const showNode = data.showNode ?? true;
  const isDoubaoImageCreator = data.type === "DoubaoImageCreator";
  const isDoubaoVideoGenerator = data.type === "DoubaoVideoGenerator";
  const isDoubaoAudioGenerator = data.type === "DoubaoTTS";
  const isTextCreation = data.type === "TextCreation";
  const usesWideDoubaoLayout =
    isDoubaoImageCreator ||
    isDoubaoVideoGenerator ||
    isDoubaoAudioGenerator ||
    isTextCreation;
  const nodeWidthClass = useMemo(() => {
    if (!showNode) return "w-48";
    if (isTextCreation) return "w-[520px]";
    if (usesWideDoubaoLayout) return "w-[760px]";
    return "w-80";
  }, [showNode, usesWideDoubaoLayout, isTextCreation]);

  const getValidationStatus = useCallback((data) => {
    setValidationStatus(data);
    return null;
  }, []);

  const { mutate: validateComponentCode } = usePostValidateComponentCode();

  const [editNameDescription, toggleEditNameDescription, set] =
    useAlternate(false);

  const componentUpdate = useFlowStore(
    useShallow((state: FlowStoreType) =>
      state.componentsToUpdate.find((component) => component.id === data.id),
    ),
  );

  const {
    outdated: isOutdated,
    breakingChange: hasBreakingChange,
    userEdited: isUserEdited,
  } = componentUpdate ?? {
    outdated: false,
    breakingChange: false,
    userEdited: false,
  };

  const updateNodeCode = useUpdateNodeCode(
    data?.id,
    data.node!,
    setNode,
    updateNodeInternals,
  );

  useEffect(() => {
    updateNodeInternals(data.id);
  }, [data.node.template]);

  if (!data.node!.template) {
    setErrorData({
      title: t("Error in component {{name}}", { name: data.node!.display_name }),
      list: [
        t("The component {{name}} has no template.", {
          name: data.node!.display_name,
        }),
        t("Please contact the developer of the component to fix this issue."),
      ],
    });
    takeSnapshot();
    deleteNode(data.id);
  }

  const handleUpdateCode = useCallback(
    (confirmed: boolean = false) => {
      if (!confirmed && hasBreakingChange) {
        setOpenUpdateModal(true);
        return;
      }
      setLoadingUpdate(true);
      takeSnapshot();

      const thisNodeTemplate = templates[data.type]?.template;
      if (!thisNodeTemplate?.code) return;

      const currentCode = thisNodeTemplate.code.value;
      if (data.node) {
        validateComponentCode(
          { code: currentCode, frontend_node: data.node },
          {
            onSuccess: ({ data: resData, type }) => {
              if (resData && type && updateNodeCode) {
                const newNode = processNodeAdvancedFields(
                  resData,
                  edges,
                  data.id,
                );
                updateNodeCode(newNode, currentCode, "code", type);
                removeDismissedNodes([data.id]);
                setLoadingUpdate(false);
              }
            },
            onError: (error) => {
              setErrorData({
                title: "Error updating Component code",
                list: [
                  "There was an error updating the Component.",
                  "If the error persists, please report it on our Discord or GitHub.",
                ],
              });
              console.error(error);
              setLoadingUpdate(false);
            },
          },
        );
      }
    },
    [
      data,
      templates,
      hasBreakingChange,
      edges,
      updateNodeCode,
      validateComponentCode,
      setErrorData,
      takeSnapshot,
    ],
  );

  const handleUpdateCodeWShortcut = useCallback(() => {
    if (isOutdated && selected) {
      handleUpdateCode();
    }
  }, [isOutdated, selected, handleUpdateCode]);

  const update = useShortcutsStore((state) => state.update);
  useHotkeys(update, handleUpdateCodeWShortcut, { preventDefault: true });

  const isToolMode = useMemo(
    () =>
      data.node?.outputs?.some(
        (output) => output.name === "component_as_tool",
      ) ??
      data.node?.tool_mode ??
      false,
    [data.node?.outputs, data.node?.tool_mode],
  );

  const hasOutputs = useMemo(
    () => data.node?.outputs && data.node.outputs.length > 0,
    [data.node?.outputs],
  );

  const nodeRef = useRef<HTMLDivElement>(null);

  useChangeOnUnfocus({
    selected,
    value: editNameDescription,
    onChange: set,
    defaultValue: false,
    shouldChangeValue: (value) => value === true,
    nodeRef,
    callback: toggleEditNameDescription,
  });

  const { shownOutputs, hiddenOutputs } = useMemo(() => {
    const shownOutputs: typeof data.node.outputs = [];
    const hiddenOutputs: typeof data.node.outputs = [];
    (data.node?.outputs ?? []).forEach((output) => {
      if (output.hidden) {
        hiddenOutputs.push(output);
      } else {
        shownOutputs.push(output);
      }
    });
    return { shownOutputs, hiddenOutputs };
  }, [data.node?.outputs]);

  const [selectedOutput, setSelectedOutput] = useState<OutputFieldType | null>(
    () =>
      data.node?.outputs?.find(
        (output) => output.name === data?.selected_output,
      ) || null,
  );

  const handleSelectOutput = useCallback(
    (output) => {
      setSelectedOutput(output);

      setEdges((eds) => {
        return eds.map((edge) => {
          if (edge.source === data.id && edge.data?.sourceHandle) {
            const sourceHandle = edge.data.sourceHandle;
            if (sourceHandle.name === output.name) {
              const newSourceHandle = {
                ...sourceHandle,
                output_types: [output.selected ?? output.types[0]],
              };
              const newSourceHandleId = scapedJSONStringfy(newSourceHandle);

              return {
                ...edge,
                sourceHandle: newSourceHandleId,
                data: {
                  ...edge.data,
                  sourceHandle: newSourceHandle,
                },
              };
            }
          }
          return edge;
        });
      });

      setNode(data.id, (oldNode) => {
        const newNode = cloneDeep(oldNode);
        if (newNode.data.node?.outputs) {
          newNode.data.node.outputs.forEach((out) => {
            if (out.selected) {
              out.selected = undefined;
            }
          });

          const outputIndex = newNode.data.node.outputs.findIndex(
            (o) => o.name === output.name,
          );
          if (outputIndex !== -1) {
            const outputTypes = output.types || [];
            const defaultType =
              outputTypes.length > 0 ? outputTypes[0] : undefined;
            newNode.data.node.outputs[outputIndex].selected =
              output.selected ?? defaultType;
          }

          const selectedOutput = newNode.data.node.outputs[outputIndex]?.name;
          (newNode.data as NodeDataType).selected_output = selectedOutput;
        }

        return newNode;
      });
      updateNodeInternals(data.id);
    },
    [data.id, setNode, setEdges, updateNodeInternals],
  );

  useEffect(() => {
    if (
      data?.selected_output ||
      (data?.node?.outputs?.filter((output) => !output.group_outputs)?.length ??
        0) <= 1
    )
      return;
    handleSelectOutput(
      data.node?.outputs?.find((output) => output.selected) || null,
    );
  }, [data.node?.outputs, data?.selected_output, handleSelectOutput]);

  const [hasChangedNodeDescription, setHasChangedNodeDescription] =
    useState(false);

  const editedNameDescription =
    editNameDescription && hasChangedNodeDescription;

  const rawDescription = data.node?.description ?? "";
  const sanitizedDescription = rawDescription.trim();
  const isDoubaoType = isDoubaoComponent(data.type);

  const isLegacyDoubaoDescription = useMemo(() => {
    if (!isDoubaoType || sanitizedDescription === "") return false;
    const defaults = DOUBAO_DEFAULT_DESCRIPTIONS[data.type] ?? [];
    return defaults.includes(sanitizedDescription);
  }, [data.type, isDoubaoType, sanitizedDescription]);

  const effectiveDescription = isTextCreation
    ? ""
    : isLegacyDoubaoDescription
      ? ""
      : rawDescription;

  const hasDescription = useMemo(() => {
    if (effectiveDescription.trim() === "") return false;
    return true;
  }, [effectiveDescription]);

  const selectedNodesCount = useMemo(() => {
    return useFlowStore.getState().nodes.filter((node) => node.selected).length;
  }, [selected]);

  const rightClickedNodeId = useFlowStore((state) => state.rightClickedNodeId);

  const shouldShowUpdateComponent = useMemo(
    () => (isOutdated || hasBreakingChange) && !isUserEdited && !dismissAll,
    [isOutdated, hasBreakingChange, isUserEdited, dismissAll],
  );

  const shouldShowLegacyComponent = useMemo(
    () => (data.node?.legacy || data.node?.replacement) && !dismissAllLegacy,
    [data.node?.legacy, data.node?.replacement, dismissAllLegacy],
  );

  const memoizedNodeToolbarComponent = useMemo(() => {
    const isRightClicked = rightClickedNodeId === data.id;
    const isSelectedSingle = selected && selectedNodesCount === 1;
    // Creator nodes use a cursor-anchored context menu instead of a fixed "more actions" button.
    const shouldShowToolbar =
      !(isDoubaoImageCreator || isDoubaoVideoGenerator || isDoubaoAudioGenerator || isTextCreation) &&
      (isSelectedSingle || isRightClicked);

    return shouldShowToolbar ? (
      <>
        <div
          className={cn(
            "absolute -top-12 left-1/2 z-50 -translate-x-1/2",
            "transform transition-all duration-300 ease-out",
          )}
        >
          <NodeToolbarComponent
            data={data}
            deleteNode={(id) => {
              takeSnapshot();
              deleteNode(id);
            }}
            setShowNode={(show) => {
              setNode(data.id, (old) => ({
                ...old,
                data: { ...old.data, showNode: show },
              }));
            }}
            numberOfOutputHandles={shownOutputs.length ?? 0}
            showNode={showNode}
            openAdvancedModal={false}
            onCloseAdvancedModal={() => {}}
            updateNode={() => handleUpdateCode()}
            isOutdated={isOutdated && (dismissAll || isUserEdited)}
            isUserEdited={isUserEdited}
            hasBreakingChange={hasBreakingChange}
            openDropdownOnRightClick={isRightClicked}
          />
        </div>
        {!(isDoubaoImageCreator || isDoubaoVideoGenerator || isDoubaoAudioGenerator || isTextCreation) && (
          <div>
            <Button
              unstyled
              onClick={() => {
                toggleEditNameDescription();
                setHasChangedNodeDescription(false);
              }}
              className={cn(
                "nodrag absolute z-50 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md",
                !usesWideDoubaoLayout && "left-1/2",
                "transform transition-all duration-300 ease-out",
                showNode
                  ? usesWideDoubaoLayout
                    ? "top-2 right-6"
                    : "top-2 left-1/2 translate-x-[10.4rem]"
                  : usesWideDoubaoLayout
                    ? "top-0 right-6"
                    : "top-0 left-1/2 translate-x-[6.4rem]",
                editedNameDescription
                  ? "bg-accent-emerald"
                  : "bg-zinc-foreground",
              )}
              data-testid={
                editedNameDescription
                  ? "save-name-description-button"
                  : "edit-name-description-button"
              }
            >
              <ForwardedIconComponent
                name={editedNameDescription ? "Check" : "PencilLine"}
                strokeWidth={ICON_STROKE_WIDTH}
                className={cn(
                  editedNameDescription
                    ? "text-accent-emerald-foreground"
                    : "text-muted-foreground",
                  "icon-size",
                )}
              />
            </Button>
          </div>
        )}
      </>
    ) : (
      <></>
    );
  }, [
    data,
    deleteNode,
    takeSnapshot,
    setNode,
    showNode,
    updateNodeCode,
    isOutdated,
    isUserEdited,
    isDoubaoImageCreator,
    isDoubaoAudioGenerator,
    isTextCreation,
    selected,
    shortcuts,
    editNameDescription,
    hasChangedNodeDescription,
    toggleEditNameDescription,
    selectedNodesCount,
    rightClickedNodeId,
    usesWideDoubaoLayout,
  ]);
  useEffect(() => {
    if (hiddenOutputs && hiddenOutputs.length === 0) {
      setShowHiddenOutputs(false);
    }
  }, [hiddenOutputs]);

  const memoizedOnUpdateNode = useCallback(
    () => handleUpdateCode(true),
    [handleUpdateCode],
  );
  const memoizedSetDismissAll = useCallback(
    () => addDismissedNodes([data.id]),
    [addDismissedNodes, data.id],
  );

  const memoizedSetDismissAllLegacy = useCallback(
    () => addDismissedNodesLegacy([data.id]),
    [addDismissedNodesLegacy, data.id],
  );

  return (
    <div className={cn(shouldShowUpdateComponent ? "relative -mt-10" : "")}>
      <div
        className={cn(
          !(
            (isDoubaoImageCreator ||
              isDoubaoVideoGenerator ||
              isDoubaoAudioGenerator ||
              isTextCreation) &&
            showNode
          ) &&
            borderColor,
          nodeWidthClass,
          "generic-node-div group/node relative",
          (isDoubaoImageCreator ||
            isDoubaoVideoGenerator ||
            isDoubaoAudioGenerator ||
            isTextCreation) &&
            showNode
            ? "rounded-none border-0 bg-transparent shadow-none"
            : "rounded-xl border shadow-sm hover:shadow-md",
          !hasOutputs && "pb-4",
          usesWideDoubaoLayout && "overflow-visible",
        )}
      >
        {openUpdateModal && (
          <UpdateComponentModal
            open={openUpdateModal}
            setOpen={setOpenUpdateModal}
            onUpdateNode={memoizedOnUpdateNode}
            components={componentUpdate ? [componentUpdate] : []}
          />
        )}
        {memoizedNodeToolbarComponent}
        {shouldShowUpdateComponent ? (
          <NodeUpdateComponent
            hasBreakingChange={hasBreakingChange}
            showNode={showNode}
            handleUpdateCode={() => handleUpdateCode()}
            loadingUpdate={loadingUpdate}
            setDismissAll={memoizedSetDismissAll}
          />
        ) : shouldShowLegacyComponent ? (
          <NodeLegacyComponent
            legacy={data.node?.legacy}
            replacement={data.node?.replacement}
            setDismissAll={memoizedSetDismissAllLegacy}
          />
        ) : (
          <></>
        )}

        <div
          data-testid={`${data.id}-main-node`}
          className={cn(
            "relative grid text-wrap leading-5",
            showNode
              ? usesWideDoubaoLayout
                ? ""
                : "border-b"
              : "relative",
          )}
        >
          {showNode && usesWideDoubaoLayout && isDoubaoImageCreator && selected && (
            <div className="absolute left-0 right-0 top-0 z-[1700] -translate-y-full">
              <DoubaoImageCreatorTopBar
                nodeId={data.id}
                isOpen={isImageCreatorLogsOpen}
                setOpen={setImageCreatorLogsOpen}
                onOpenPreview={() => imageCreatorPreviewActions?.openPreview()}
                onDownload={() => imageCreatorPreviewActions?.download()}
                canDownload={Boolean(imageCreatorPreviewActions?.canDownload)}
                motionStart={persistentPreviewMotionStart}
                motionCommitToken={persistentPreviewMotionCommitToken}
              />
            </div>
          )}
          {showNode && usesWideDoubaoLayout && isDoubaoVideoGenerator && selected && (
            <div className="absolute left-0 right-0 top-0 z-[1700] -translate-y-full">
              <DoubaoVideoGeneratorTopBar
                nodeId={data.id}
                isOpen={isVideoGeneratorLogsOpen}
                setOpen={setVideoGeneratorLogsOpen}
                onOpenPreview={() => videoGeneratorPreviewActions?.openPreview()}
                onDownload={() => videoGeneratorPreviewActions?.download()}
                canDownload={Boolean(videoGeneratorPreviewActions?.canDownload)}
                motionStart={persistentPreviewMotionStart}
                motionCommitToken={persistentPreviewMotionCommitToken}
              />
            </div>
          )}
          {showNode && usesWideDoubaoLayout && isDoubaoAudioGenerator && selected && (
            <div className="absolute left-0 right-0 top-0 z-[1700] -translate-y-full">
              <DoubaoAudioTopBar
                nodeId={data.id}
                isOpen={isAudioCreatorLogsOpen}
                setOpen={setAudioCreatorLogsOpen}
                onOpenPreview={() => audioCreatorPreviewActions?.openPreview()}
                onDownload={() => audioCreatorPreviewActions?.download()}
                canDownload={Boolean(audioCreatorPreviewActions?.canDownload)}
              />
            </div>
          )}
          {showNode && usesWideDoubaoLayout && isTextCreation && selected && (
            <div className="absolute left-0 right-0 top-0 z-[1700] -translate-y-full">
              <TextCreationTopBar
                nodeId={data.id}
                isOpen={isTextCreationLogsOpen}
                setOpen={setTextCreationLogsOpen}
                onOpenPreview={() => textCreationPreviewActions?.openPreview()}
              />
            </div>
          )}
          <div
            data-testid={"div-generic-node"}
            ref={titleMotionRef}
            className={cn(
              "flex w-full flex-1 items-center justify-between gap-2 overflow-hidden px-4 py-3",
            )}
          >
            <div
              className="flex-max-width items-center overflow-hidden"
              data-testid="generic-node-title-arrangement"
            >
              {!isTextCreation &&
                !isDoubaoImageCreator &&
                !isDoubaoVideoGenerator &&
                !isDoubaoAudioGenerator && (
                <MemoizedNodeIcon
                  dataType={data.type}
                  icon={data.node?.icon}
                  isGroup={!!data.node?.flow}
                />
              )}
              <div
                className={cn(
                  "ml-3 flex flex-1 overflow-hidden",
                  (isTextCreation ||
                    isDoubaoImageCreator ||
                    isDoubaoVideoGenerator ||
                    isDoubaoAudioGenerator) &&
                    "ml-0",
                )}
              >
                <MemoizedNodeName
                  display_name={data.node?.display_name}
                  nodeId={data.id}
                  selected={selected}
                  showNode={showNode}
                  beta={data.node?.beta || false}
                  legacy={
                    data.node?.legacy ||
                    (data.node?.replacement?.length ?? 0) > 0
                  }
                  editNameDescription={editNameDescription}
                  toggleEditNameDescription={toggleEditNameDescription}
                  setHasChangedNodeDescription={setHasChangedNodeDescription}
                  // Doubao creator titles should feel more prominent.
                  textClassName={
                    isDoubaoImageCreator ||
                    isDoubaoVideoGenerator ||
                    isDoubaoAudioGenerator ||
                    isTextCreation
                      ? "text-xl"
                      : undefined
                  }
                />
              </div>
            </div>
            {!showNode && (
              <>
                <div data-testid={`${showNode ? "show" : "hide"}-node-content`}>
                  <MemoizedRenderInputParameters
                    data={data}
                    types={types}
                    isToolMode={isToolMode}
                    showNode={showNode}
                    shownOutputs={shownOutputs}
                    showHiddenOutputs={showHiddenOutputs}
                  />
                  <MemoizedNodeOutputs
                    outputs={shownOutputs ?? []}
                    keyPrefix="render-outputs"
                    data={data}
                    types={types}
                    selected={selected ?? false}
                    showNode={showNode}
                    isToolMode={isToolMode}
                    showHiddenOutputs={showHiddenOutputs}
                    selectedOutput={selectedOutput}
                    handleSelectOutput={handleSelectOutput}
                  />
                </div>
              </>
            )}
            <MemoizedNodeStatus
              data={data}
              frozen={data.node?.frozen}
              showNode={showNode}
              display_name={data.node?.display_name!}
              nodeId={data.id}
              selected={selected}
              setBorderColor={setBorderColor}
              buildStatus={buildStatus}
              dismissAll={dismissAll}
              isOutdated={isOutdated}
              isUserEdited={isUserEdited}
              isBreakingChange={hasBreakingChange}
              getValidationStatus={getValidationStatus}
              hideRunButton={usesWideDoubaoLayout}
            />
          </div>
          {showNode && (hasDescription || editNameDescription) && (
            <div className={cn("px-4 pb-3", usesWideDoubaoLayout && "px-6")}>
              <MemoizedNodeDescription
                description={effectiveDescription}
                charLimit={1000}
                mdClassName={"dark:prose-invert"}
                nodeId={data.id}
                selected={selected}
                editNameDescription={editNameDescription}
                setEditNameDescription={set}
                setHasChangedNodeDescription={setHasChangedNodeDescription}
              />
            </div>
          )}
          {/* 豆包组件预览面板 */}
          {showNode &&
            isDoubaoComponent(data.type) &&
            !usesWideDoubaoLayout && (
              <div className="px-4 pb-3">
                <DoubaoPreviewPanel nodeId={data.id} componentName={data.type} />
              </div>
            )}
        </div>
        {showNode && (
          <div className="nopan nodelete noflow relative cursor-auto">
            {usesWideDoubaoLayout ? (
              isDoubaoImageCreator ? (
                <DoubaoImageCreatorLayout
                  data={data}
                  types={types}
                  isToolMode={isToolMode}
                  buildStatus={buildStatus}
                  selected={selected ?? false}
                  onPreviewActionsChange={setImageCreatorPreviewActions}
                  onPersistentPreviewMotionStart={({ deltaTopPx, durationMs, easing }) =>
                    handlePersistentPreviewMotionStart({ deltaTopPx, durationMs, easing })
                  }
                  onPersistentPreviewMotionCommit={handlePersistentPreviewMotionCommit}
                />
              ) : isDoubaoVideoGenerator ? (
                <DoubaoVideoGeneratorLayout
                  data={data}
                  types={types}
                  isToolMode={isToolMode}
                  buildStatus={buildStatus}
                  selected={selected ?? false}
                  onPreviewActionsChange={setVideoGeneratorPreviewActions}
                  onPersistentPreviewMotionStart={({ deltaTopPx, durationMs, easing }) =>
                    handlePersistentPreviewMotionStart({ deltaTopPx, durationMs, easing })
                  }
                  onPersistentPreviewMotionCommit={handlePersistentPreviewMotionCommit}
                />
              ) : isDoubaoAudioGenerator ? (
                <DoubaoAudioLayout
                  data={data}
                  types={types}
                  isToolMode={isToolMode}
                  buildStatus={buildStatus}
                  selected={selected ?? false}
                  onPreviewActionsChange={setAudioCreatorPreviewActions}
                />
              ) : (
                <TextCreationLayout
                  data={data}
                  types={types}
                  isToolMode={isToolMode}
                  buildStatus={buildStatus}
                  selected={selected ?? false}
                  onPreviewActionsChange={setTextCreationPreviewActions}
                />
              )
            ) : (
              <>
                <MemoizedRenderInputParameters
                  data={data}
                  types={types}
                  isToolMode={isToolMode}
                  showNode={showNode}
                  shownOutputs={shownOutputs}
                  showHiddenOutputs={showHiddenOutputs}
                />
                <div
                  className={classNames(
                    Object.keys(data.node!.template).length < 1 ? "hidden" : "",
                    "flex-max-width justify-center",
                  )}
                >
                  {" "}
                </div>
                <MemoizedNodeOutputs
                  outputs={shownOutputs}
                  keyPrefix={"shown"}
                  data={data}
                  types={types}
                  selected={selected ?? false}
                  showNode={showNode}
                  isToolMode={isToolMode}
                  showHiddenOutputs={showHiddenOutputs}
                  selectedOutput={selectedOutput}
                  handleSelectOutput={handleSelectOutput}
                  hasExistingHiddenOutputs={
                    !!hiddenOutputs && hiddenOutputs.length > 0
                  }
                />
                <MemoizedNodeOutputs
                  outputs={hiddenOutputs}
                  keyPrefix="hidden"
                  data={data}
                  types={types}
                  selected={selected ?? false}
                  showNode={showNode}
                  isToolMode={isToolMode}
                  showHiddenOutputs={true}
                  selectedOutput={selectedOutput}
                  handleSelectOutput={handleSelectOutput}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(GenericNode);
