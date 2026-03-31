import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ReactFlowState, useStore } from "@xyflow/react";
import { BuildStatus } from "@/constants/enums";
import { BASE_URL_API } from "@/constants/constants";
import { createFileUpload } from "@/helpers/create-file-upload";
import useAlertStore from "@/stores/alertStore";
import { useCanvasUiStore } from "@/stores/canvasUiStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import type { NodeDataType } from "@/types/flow";
import type { TypesStoreType } from "@/types/zustand/types";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import DoubaoPreviewPanel from "./DoubaoPreviewPanel";
import type { DoubaoPreviewDescriptor } from "../../hooks/use-doubao-preview";
import type { DoubaoPreviewPanelActions } from "./DoubaoPreviewPanel";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import HandleRenderComponent from "./handleRenderComponent";
import { useTypesStore } from "@/stores/typesStore";

type BaseProps = {
  data: NodeDataType;
  types: TypesStoreType["types"];
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
  onPreviewActionsChange?: (actions: DoubaoPreviewPanelActions) => void;
  onPersistentPreviewMotionStart?: (motion: {
    deltaTopPx: number;
    deltaCenterPx: number;
    durationMs: number;
    easing: string;
  }) => void;
  onPersistentPreviewMotionCommit?: () => void;
};

const FILE_FIELD = "file";

function ReferenceSelectionPreviewGlow({ glowId }: { glowId: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[760] overflow-hidden rounded-[28px]">
      <svg
        className="h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect
          x="1.5"
          y="1.5"
          width="97"
          height="97"
          rx="10"
          ry="10"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.4"
        />
        <rect
          x="1.5"
          y="1.5"
          width="97"
          height="97"
          rx="10"
          ry="10"
          fill="none"
          stroke="rgba(255,255,255,0.96)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="22 240"
          filter={`url(#${glowId})`}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-262"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
    </div>
  );
}

function toStablePreviewUrl(raw: string, kind: "image" | "video" | "audio") {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (/^(data:|blob:|https?:)/i.test(trimmed)) return trimmed;

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("api/v1/files/")) {
    return `/${normalized}`;
  }
  if (normalized.startsWith("files/")) {
    return `${BASE_URL_API}${normalized}`;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [flowId, ...rest] = parts;
  const encodedFlow = encodeURIComponent(flowId);
  const encodedFile = rest.map((p) => encodeURIComponent(p)).join("/");
  const prefix = kind === "image" ? "files/images/" : "files/media/";
  return `${BASE_URL_API}${prefix}${encodedFlow}/${encodedFile}`;
}

function inferExt(fileName: string | undefined) {
  if (!fileName) return undefined;
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return undefined;
  const ext = fileName.slice(idx + 1).toLowerCase();
  return ext || undefined;
}

function extractSingleString(value: any): string {
  if (!value && value !== 0) return "";
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

function buildPreviewOverride(args: {
  kind: "image" | "video" | "audio";
  nodeId: string;
  filePath: string;
  fileName: string;
}): DoubaoPreviewDescriptor | null {
  const url = toStablePreviewUrl(args.filePath, args.kind);
  if (!url) return null;
  const generatedAt = new Date().toISOString();
  const token =
    (args.fileName?.trim() ? args.fileName.replace(/\.[^/.]+$/, "") : "") ||
    args.nodeId;

  if (args.kind === "image") {
    return {
      token,
      kind: "image",
      available: true,
      generated_at: generatedAt,
      payload: { image_url: url, file_path: args.filePath, file_name: args.fileName },
    };
  }
  if (args.kind === "video") {
    return {
      token,
      kind: "video",
      available: true,
      generated_at: generatedAt,
      payload: { video_url: url, file_path: args.filePath, file_name: args.fileName },
    };
  }
  const audioType = inferExt(args.fileName) || "mp3";
  return {
    token,
    kind: "audio",
    available: true,
    generated_at: generatedAt,
    payload: { audio_url: url, audio_type: audioType, file_path: args.filePath, file_name: args.fileName },
  };
}

function UserUploadLayout({
  kind,
  appearance,
  accept,
  allowedExtensions,
  data,
  types,
  selected = false,
  onPreviewActionsChange,
  onPersistentPreviewMotionStart,
  onPersistentPreviewMotionCommit,
}: BaseProps & {
  kind: "image" | "video" | "audio";
  appearance: "imageCreator" | "videoGenerator" | "audioCreator";
  accept: string;
  allowedExtensions: string[];
}) {
  const template = data.node?.template ?? {};
  const fileField: any = template?.[FILE_FIELD];
  const filePath = useMemo(
    () => extractSingleString(fileField?.file_path) || extractSingleString(fileField?.value),
    [fileField?.file_path, fileField?.value],
  );
  const fileName = useMemo(() => {
    const v = extractSingleString(fileField?.value);
    if (v) return v;
    const p = filePath.replace(/\\/g, "/");
    return p.includes("/") ? p.split("/").pop() ?? "" : p;
  }, [fileField?.value, filePath]);

  const previewOverride = useMemo(
    () =>
      filePath
        ? buildPreviewOverride({
            kind,
            nodeId: data.id,
            filePath,
            fileName,
          })
        : null,
    [data.id, fileName, filePath, kind],
  );
  const referenceSelection = useCanvasUiStore((s) => s.referenceSelection);
  const showReferenceSelectionPreviewGlow =
    kind === "image" &&
    referenceSelection.active &&
    referenceSelection.targetNodeId !== data.id &&
    referenceSelection.hoveredNodeId === data.id;
  const previewGlowId = useMemo(
    () => `reference-preview-glow-${String(data.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    [data.id],
  );

  const setErrorData = useAlertStore((s) => s.setErrorData);
  const currentFlowId = useFlowsManagerStore((s) => s.currentFlowId);
  const { mutateAsync: uploadFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();
  const [isUploading, setUploading] = useState(false);
  const [isToolEditorOpen, setToolEditorOpen] = useState(false);

  const { handleOnNewValue } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: FILE_FIELD,
  });

  const doUpload = useCallback(async () => {
    if (isUploading) return;
    if (!currentFlowId) {
      setErrorData({
        title: "无法上传资源",
        list: ["请先保存/创建流程后再上传。"],
      });
      return;
    }

    const files = await createFileUpload({ multiple: false, accept });
    const file = files[0];
    if (!file) return;

    try {
      validateFileSize(file);
    } catch (error) {
      if (error instanceof Error) {
        setErrorData({ title: error.message });
      }
      return;
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (allowedExtensions.length && (!ext || !allowedExtensions.includes(ext))) {
      setErrorData({
        title: "文件类型不支持",
        list: [allowedExtensions.map((e) => e.toUpperCase()).join(", ")],
      });
      return;
    }

    setUploading(true);
    try {
      const resp = await uploadFile({ file, id: currentFlowId });
      const serverPath = (resp as any)?.file_path;
      if (!serverPath) {
        throw new Error("缺少文件路径");
      }
      handleOnNewValue({ value: file.name, file_path: serverPath });
    } catch (error: any) {
      setErrorData({
        title: "上传失败",
        list: [error?.response?.data?.detail ?? error?.message ?? "网络异常，请稍后重试。"],
      });
    } finally {
      setUploading(false);
    }
  }, [
    accept,
    allowedExtensions,
    currentFlowId,
    handleOnNewValue,
    isUploading,
    setErrorData,
    uploadFile,
    validateFileSize,
  ]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId?: string }>;
      const requestedNodeId = customEvent?.detail?.nodeId;
      if (requestedNodeId && requestedNodeId !== data.id) return;
      if (!requestedNodeId && !selected) return;
      doUpload();
    };
    window.addEventListener("doubao-preview-upload", listener);
    return () => window.removeEventListener("doubao-preview-upload", listener);
  }, [data.id, doUpload, selected]);

  const setFilterEdge = useFlowStore((s) => s.setFilterEdge);
  const typeData = useTypesStore((s) => s.data);
  // Use the same output handle wiring as Doubao layouts.
  const previewOutputHandles = useMemo(() => {
    const outputs = data.node?.outputs ?? [];
    return outputs
      .filter((output) => !output.hidden)
      .map((output) => {
        const colors = getNodeOutputColors(output, data, types);
        const colorName = getNodeOutputColorsName(output, data, types);
        const resolvedType = output.selected ?? output.types?.[0] ?? "Data";
        return {
          id: {
            output_types: [resolvedType],
            id: data.id,
            dataType: data.type,
            name: output.name,
          },
          colors,
          colorName,
          tooltip:
            output.selected ?? output.types?.[0] ?? output.display_name ?? "输出",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data, types]);

  // Match the Doubao creator layouts: "+" output handle appears on hover in a 212x212 capture zone,
  // and follows the cursor along the preview edge.
  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  type PlusSide = "left" | "right";
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const leaveGraceTimerRef = useRef<number | null>(null);
  const fadeOutTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [activePlusSide, setActivePlusSide] = useState<PlusSide | null>(null);
  const [visiblePlusSide, setVisiblePlusSide] = useState<PlusSide | null>(null);
  const DEFAULT_PLUS_OFFSET: Record<PlusSide, { x: number; y: number }> = useMemo(
    () => ({
      left: { x: -106, y: 0 },
      right: { x: 106, y: 0 },
    }),
    [],
  );
  const [plusOffsetBySide, setPlusOffsetBySide] = useState<
    Record<PlusSide, { x: number; y: number }>
  >(DEFAULT_PLUS_OFFSET);
  const lockedPlusSide: PlusSide | null = null;

  const clearPlusTimers = useCallback(() => {
    if (leaveGraceTimerRef.current) {
      window.clearTimeout(leaveGraceTimerRef.current);
      leaveGraceTimerRef.current = null;
    }
    if (fadeOutTimerRef.current) {
      window.clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
    }
  }, []);

  const isPointerInCaptureZone = useCallback(
    (side: PlusSide, clientX: number, clientY: number, slopNodeSpace = 0) => {
      const rect = previewWrapRef.current?.getBoundingClientRect();
      if (!rect) return false;

      const zoom = canvasZoom || 1;
      const edgeX = side === "left" ? rect.left : rect.right;
      const centerY = rect.top + rect.height / 2;

      const rawX = (clientX - edgeX) / zoom;
      const rawY = (clientY - centerY) / zoom;

      const withinX =
        side === "left"
          ? rawX >= -212 - slopNodeSpace && rawX <= 0 + slopNodeSpace
          : rawX >= 0 - slopNodeSpace && rawX <= 212 + slopNodeSpace;
      const withinY = rawY >= -106 - slopNodeSpace && rawY <= 106 + slopNodeSpace;

      return withinX && withinY;
    },
    [canvasZoom],
  );

  const computePlusOffset = useCallback(
    (side: PlusSide, clientX: number, clientY: number) => {
      const rect = previewWrapRef.current?.getBoundingClientRect();
      if (!rect) return DEFAULT_PLUS_OFFSET[side];

      const zoom = canvasZoom || 1;
      const edgeX = side === "left" ? rect.left : rect.right;
      const centerY = rect.top + rect.height / 2;

      const rawX = (clientX - edgeX) / zoom;
      const clampedX =
        side === "left" ? Math.max(-212, Math.min(0, rawX)) : Math.max(0, Math.min(212, rawX));
      const clampedY = Math.max(-106, Math.min(106, (clientY - centerY) / zoom));

      return { x: clampedX, y: clampedY };
    },
    [DEFAULT_PLUS_OFFSET, canvasZoom],
  );

  const showPlusForSide = useCallback(
    (side: PlusSide, clientX?: number, clientY?: number) => {
      if (isToolEditorOpen) return;
      clearPlusTimers();
      setActivePlusSide(side);
      setVisiblePlusSide(side);
      if (typeof clientX === "number" && typeof clientY === "number") {
        lastPointerRef.current = { x: clientX, y: clientY };
        setPlusOffsetBySide((current) => ({
          ...current,
          [side]: computePlusOffset(side, clientX, clientY),
        }));
      }
    },
    [clearPlusTimers, computePlusOffset, isToolEditorOpen],
  );

  const updatePlusOffset = useCallback(
    (side: PlusSide, clientX: number, clientY: number) => {
      if (isToolEditorOpen) return;
      clearPlusTimers();
      setActivePlusSide(side);
      setVisiblePlusSide(side);
      lastPointerRef.current = { x: clientX, y: clientY };
      setPlusOffsetBySide((current) => ({
        ...current,
        [side]: computePlusOffset(side, clientX, clientY),
      }));
    },
    [clearPlusTimers, computePlusOffset, isToolEditorOpen],
  );

  const startHidePlus = useCallback(
    (side: PlusSide, clientX?: number, clientY?: number) => {
      if (isToolEditorOpen) return;
      if (typeof clientX === "number" && typeof clientY === "number") {
        lastPointerRef.current = { x: clientX, y: clientY };
      }

      clearPlusTimers();
      leaveGraceTimerRef.current = window.setTimeout(() => {
        const lastPointer = lastPointerRef.current;
        if (lastPointer && isPointerInCaptureZone(side, lastPointer.x, lastPointer.y, 6)) {
          return;
        }

        setActivePlusSide((current) => (current === side ? null : current));
        setPlusOffsetBySide((current) => ({
          ...current,
          [side]: DEFAULT_PLUS_OFFSET[side],
        }));

        fadeOutTimerRef.current = window.setTimeout(() => {
          if (!selected) {
            setVisiblePlusSide((current) => (current === side ? null : current));
          }
        }, 200);
      }, 30);
    },
    [DEFAULT_PLUS_OFFSET, clearPlusTimers, isPointerInCaptureZone, isToolEditorOpen, selected],
  );

  useEffect(() => {
    clearPlusTimers();
    setActivePlusSide(null);
    setVisiblePlusSide(null);
    setPlusOffsetBySide(DEFAULT_PLUS_OFFSET);
  }, [DEFAULT_PLUS_OFFSET, clearPlusTimers, selected]);

  useEffect(() => () => clearPlusTimers(), [clearPlusTimers]);

  const handlePreviewActionsChange = useCallback(
    (actions: DoubaoPreviewPanelActions) => {
      const toolOpen = Boolean(
        actions?.isRepaintOpen ||
          actions?.isEraseOpen ||
          actions?.isAnnotateOpen ||
          actions?.isMultiAngleCameraOpen ||
          actions?.isClipOpen,
      );
      setToolEditorOpen(toolOpen);
      onPreviewActionsChange?.(actions);
    },
    [onPreviewActionsChange],
  );

  useEffect(() => {
    if (!isToolEditorOpen) return;
    clearPlusTimers();
    setActivePlusSide(null);
    setVisiblePlusSide(null);
    setPlusOffsetBySide(DEFAULT_PLUS_OFFSET);
  }, [DEFAULT_PLUS_OFFSET, clearPlusTimers, isToolEditorOpen]);

  // Sync the output "+" handle with the persistent preview frame aspect-ratio animation (avoid end-of-animation jumps).
  const rightHandlesMotionRef = useRef<HTMLDivElement | null>(null);
  const previewHandleAnimsRef = useRef<Animation[]>([]);
  const clearPreviewHandleAnims = useCallback(() => {
    previewHandleAnimsRef.current.forEach((anim) => {
      try {
        anim.cancel();
      } catch {
        // ignore
      }
    });
    previewHandleAnimsRef.current = [];
  }, []);

  useEffect(() => clearPreviewHandleAnims, [clearPreviewHandleAnims]);

  const handlePersistentPreviewMotionStart = useCallback(
    (motion: {
      deltaTopPx: number;
      deltaCenterPx: number;
      durationMs: number;
      easing: string;
    }) => {
      clearPreviewHandleAnims();
      const el = rightHandlesMotionRef.current;
      if (!el || typeof (el as any).animate !== "function") {
        onPersistentPreviewMotionStart?.(motion);
        return;
      }

      const anim = (el as any).animate(
        [{ transform: "translateY(0px)" }, { transform: `translateY(${motion.deltaCenterPx}px)` }],
        { duration: motion.durationMs, easing: motion.easing, fill: "both" },
      ) as Animation;
      previewHandleAnimsRef.current.push(anim);
      anim.onfinish = () => {
        el.style.transform = `translateY(${motion.deltaCenterPx}px)`;
        try {
          anim.cancel();
        } catch {
          // ignore
        }
      };

      onPersistentPreviewMotionStart?.(motion);
    },
    [clearPreviewHandleAnims, onPersistentPreviewMotionStart],
  );

  const handlePersistentPreviewMotionCommit = useCallback(() => {
    const el = rightHandlesMotionRef.current;
    if (el) el.style.transform = "";
    clearPreviewHandleAnims();
    onPersistentPreviewMotionCommit?.();
  }, [clearPreviewHandleAnims, onPersistentPreviewMotionCommit]);

  return (
    <div className="relative flex flex-col gap-4 px-4 pb-4 transition-all duration-300 ease-in-out">
      {/* Preview */}
      <div className="relative flex flex-col gap-4 lg:flex-row">
        <div
          ref={previewWrapRef}
          className="relative flex-1"
          data-preview-wrap="doubao"
        >
          {/* Hover/capture zone: a 212x212 square centered on the default "+" center point. */}
          <div
            className="absolute left-full top-1/2 z-[800] hidden h-[212px] w-[212px] -translate-y-1/2 lg:block"
            data-plus-capture-zone="doubao"
            onPointerEnter={(event) =>
              lockedPlusSide || isToolEditorOpen
                ? undefined
                : showPlusForSide("right", event.clientX, event.clientY)
            }
            onPointerMove={(event) =>
              lockedPlusSide || isToolEditorOpen
                ? undefined
                : updatePlusOffset("right", event.clientX, event.clientY)
            }
            onPointerLeave={(event) =>
              lockedPlusSide || isToolEditorOpen
                ? undefined
                : startHidePlus("right", event.clientX, event.clientY)
            }
          />
          {showReferenceSelectionPreviewGlow && (
            <ReferenceSelectionPreviewGlow glowId={previewGlowId} />
          )}

        <DoubaoPreviewPanel
          nodeId={data.id}
          componentName={data.type}
          appearance={appearance}
          onRequestUpload={doUpload}
          onActionsChange={handlePreviewActionsChange}
          previewOverride={previewOverride}
          onPersistentPreviewMotionStart={handlePersistentPreviewMotionStart}
          onPersistentPreviewMotionCommit={handlePersistentPreviewMotionCommit}
        />
        </div>

        {previewOutputHandles.length > 0 && (
          <div className="absolute right-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-start">
            <div ref={rightHandlesMotionRef}>
              {previewOutputHandles.map((handle, index) => (
                <div key={`${handle.id.name ?? kind}-${index}`} className="mb-3 last:mb-0">
                  <HandleRenderComponent
                    left={false}
                    tooltipTitle={handle.tooltip}
                    id={handle.id}
                    title={handle.title}
                    nodeId={data.id}
                    myData={typeData}
                    colors={handle.colors}
                    setFilterEdge={setFilterEdge}
                    showNode={true}
                    testIdComplement={`${data.type?.toLowerCase()}-preview-output`}
                    proxy={handle.proxy}
                    colorName={handle.colorName}
                    uiVariant="plus"
                    disablePointerEvents={isToolEditorOpen}
                    visible={
                      !isToolEditorOpen &&
                      (selected ||
                        visiblePlusSide === "right" ||
                        lockedPlusSide === "right")
                    }
                    isTracking={
                      !isToolEditorOpen &&
                      (activePlusSide === "right" || lockedPlusSide === "right")
                    }
                    clickMode="none"
                    onPlusPointerEnter={(event) =>
                      lockedPlusSide || isToolEditorOpen
                        ? undefined
                        : showPlusForSide("right", event.clientX, event.clientY)
                    }
                    onPlusPointerMove={(event) =>
                      lockedPlusSide || isToolEditorOpen
                        ? undefined
                        : updatePlusOffset("right", event.clientX, event.clientY)
                    }
                    onPlusPointerLeave={(event) =>
                      lockedPlusSide || isToolEditorOpen
                        ? undefined
                        : startHidePlus("right", event.clientX, event.clientY)
                    }
                    // Requirement: gap (preview edge -> "+" outer edge) = 70px.
                    // "+" diameter is 72px (radius 36px), so center offset = 70 + 36 = 106.
                    visualOffset={{
                      x: plusOffsetBySide.right.x,
                      y: plusOffsetBySide.right.y,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UserUploadImageLayout(props: BaseProps) {
  return (
    <UserUploadLayout
      {...props}
      kind="image"
      appearance="imageCreator"
      accept="image/*"
      allowedExtensions={["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"]}
    />
  );
}

export function UserUploadVideoLayout(props: BaseProps) {
  return (
    <UserUploadLayout
      {...props}
      kind="video"
      appearance="videoGenerator"
      accept="video/*"
      allowedExtensions={["mp4", "mov", "webm"]}
    />
  );
}

export function UserUploadAudioLayout(props: BaseProps) {
  return (
    <UserUploadLayout
      {...props}
      kind="audio"
      appearance="audioCreator"
      accept="audio/*"
      allowedExtensions={["mp3", "wav", "m4a", "aac", "ogg", "flac"]}
    />
  );
}
