import { cloneDeep } from "lodash";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ReactFlowState, useStore } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DoubaoPreviewPanel, {
  type DoubaoPreviewPanelActions,
  type DoubaoReferenceImage,
} from "./DoubaoPreviewPanel";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import useHandleOnNewValue, {
  type handleOnNewValueType,
} from "../../hooks/use-handle-new-value";
import type { InputFieldType } from "@/types/api";
import type { EdgeType, GenericNodeType, NodeDataType } from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { track } from "@/customization/utils/analytics";
import {
  findLastNode,
  getDoubaoVideoModelName,
  getImageRoleLimits,
  getNodeId,
  IMAGE_ROLE_FIELD,
  IMAGE_ROLE_TARGET,
  resolveEdgeImageRole,
  scapeJSONParse,
  scapedJSONStringfy,
  type EdgeImageRole,
} from "@/utils/reactflowUtils";
import HandleRenderComponent from "./handleRenderComponent";
import { getNodeInputColors } from "@/CustomNodes/helpers/get-node-input-colors";
import { getNodeInputColorsName } from "@/CustomNodes/helpers/get-node-input-colors-name";
import { useTypesStore } from "@/stores/typesStore";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import { BASE_URL_API } from "@/constants/constants";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  buildRangeOptions,
  DOUBAO_CONTROL_HINTS,
  DOUBAO_CONFIG_TOOLTIP,
} from "./DoubaoParameterButton";
import type { TypesStoreType } from "@/types/zustand/types";
import { createFileUpload } from "@/helpers/create-file-upload";
import useAlertStore from "@/stores/alertStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import { CONSOLE_ERROR_MSG, INVALID_FILE_ALERT } from "@/constants/alerts_constants";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[230px] grow-[2]" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[150px]" },
  { name: "aspect_ratio", icon: "Square", widthClass: "basis-[110px]" },
  { name: "image_count", icon: "Layers", widthClass: "basis-[90px]" },
] as const;

const PROMPT_NAME = "prompt";
const REFERENCE_FIELD = "reference_images";
const LAST_FRAME_FIELD = "last_frame_image";
const MULTI_TURN_FIELD = "enable_multi_turn";
const ONLINE_SEARCH_FIELD = "enable_google_search";
const MAX_REFERENCE_IMAGES = 14;
const DEFAULT_REFERENCE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tiff",
];
const WAN_REFERENCE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp"];
const SENSITIVE_FIELDS = ["api_key"];
const REFERENCE_FIELD_FALLBACK: InputFieldType = {
  type: "file",
  required: false,
  placeholder: "",
  list: true,
  show: true,
  readonly: false,
  name: "reference_images",
  display_name: "参考图输入",
  input_types: ["Data"],
  file_types: DEFAULT_REFERENCE_EXTENSIONS,
  fileTypes: DEFAULT_REFERENCE_EXTENSIONS,
};

type DoubaoImageCreatorLayoutProps = {
  data: NodeDataType;
  types: TypesStoreType["types"];
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
  onPreviewActionsChange?: (actions: DoubaoPreviewPanelActions) => void;
};

export default function DoubaoImageCreatorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
  onPreviewActionsChange,
}: DoubaoImageCreatorLayoutProps) {
  const NODE_OFFSET_X = 950;
  const IMAGE_OUTPUT_NAME = "image";
  const REFERENCE_VIDEO_LABEL = "参考图生视频";
  const BACKGROUND_LABEL = "图片换背景";
  const FIRST_FRAME_VIDEO_LABEL = "首帧图生视频";
  const template = data.node?.template ?? {};
  // Avoid resizing the node while the user is box-selecting; resizing can cause the
  // selection set to oscillate and look like "twitching".
  const userSelectionActive = useStore((s: ReactFlowState) => s.userSelectionActive);
  const showExpanded = Boolean(selected) && !userSelectionActive;
  const customFields = new Set<string>([
    PROMPT_NAME,
    REFERENCE_FIELD,
    MULTI_TURN_FIELD,
    ONLINE_SEARCH_FIELD,
    ...CONTROL_FIELDS.map((item) => item.name),
    ...SENSITIVE_FIELDS,
  ]);
  const hasAdditionalFields = Object.keys(template).some(
    (field) => !customFields.has(field),
  );

  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const edgeImageCountLimit = useMemo(() => {
    if (!edges.length) return null;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const roleEdgesByTarget = new Map<string, EdgeType[]>();
    const getTargetFieldName = (edge: EdgeType) => {
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName ?? targetHandle?.name;
    };

    edges.forEach((edge) => {
      const targetId = edge.target ?? "";
      if (!targetId) return;
      const targetNode = nodeMap.get(targetId);
      if (targetNode?.data?.type !== IMAGE_ROLE_TARGET) return;
      if (getTargetFieldName(edge) !== IMAGE_ROLE_FIELD) return;
      const bucket = roleEdgesByTarget.get(targetId);
      if (bucket) {
        bucket.push(edge as EdgeType);
      } else {
        roleEdgesByTarget.set(targetId, [edge as EdgeType]);
      }
    });

    const limits: number[] = [];
    edges.forEach((edge) => {
      if (edge.source !== data.id) return;
      const targetId = edge.target ?? "";
      if (!targetId) return;
      const targetNode = nodeMap.get(targetId);
      if (targetNode?.data?.type !== IMAGE_ROLE_TARGET) return;
      const fieldName = getTargetFieldName(edge);
      if (fieldName !== IMAGE_ROLE_FIELD && fieldName !== LAST_FRAME_FIELD) return;

      let role: EdgeImageRole | null = null;
      if (fieldName === LAST_FRAME_FIELD) {
        role = "last";
      } else if (
        edge.data?.imageRole === "first" ||
        edge.data?.imageRole === "reference" ||
        edge.data?.imageRole === "last"
      ) {
        role = edge.data.imageRole;
      } else {
        const totalRoleEdges = roleEdgesByTarget.get(targetId)?.length ?? 0;
        role = resolveEdgeImageRole(edge, totalRoleEdges);
      }

      const modelName = getDoubaoVideoModelName(targetNode);
      const roleLimits = getImageRoleLimits(modelName);
      if (role === "reference" && !roleLimits.allowedRoles.includes("reference")) {
        role = "first";
      }
      let limit = 1;
      if (role === "reference") {
        const referenceLimit =
          roleLimits.maxReference ?? Math.max(roleLimits.maxTotal - 1, 1);
        limit = referenceLimit > 0 ? referenceLimit : 1;
      }
      limits.push(limit);
    });

    if (!limits.length) return null;
    return Math.min(...limits);
  }, [edges, nodes, data.id]);
  const hasAnyConnection = useMemo(
    () => edges.some((edge) => edge.source === data.id || edge.target === data.id),
    [edges, data.id],
  );
  const isPromptEmpty = useMemo(() => {
    const value = template[PROMPT_NAME]?.value;
    if (typeof value === "string") return value.trim().length === 0;
    return value === undefined || value === null;
  }, [template]);
  const selectedModelName = String(template.model_name?.value ?? "");
  const isWanModel = selectedModelName.startsWith("wan2.");
  const isNanoBanana = selectedModelName === "Nano Banana";
  const isNanoBananaPro = selectedModelName === "Nano Banana Pro";
  const isGeminiImageModel = isNanoBanana || isNanoBananaPro;
  const supportsGeminiFeatureButtons = isNanoBananaPro;
  const disableRun = !hasAnyConnection && isPromptEmpty;
  const setNodes = useFlowStore((state) => state.setNodes);
  const setEdges = useFlowStore((state) => state.setEdges);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const referenceFieldRaw = template[REFERENCE_FIELD];
  const referenceField = useMemo<InputFieldType>(() => {
    if (!referenceFieldRaw) return REFERENCE_FIELD_FALLBACK;
    const normalizedInputTypes =
      referenceFieldRaw.input_types && referenceFieldRaw.input_types.length > 0
        ? referenceFieldRaw.input_types
        : REFERENCE_FIELD_FALLBACK.input_types;
    const normalizedFileTypes =
      referenceFieldRaw.file_types && referenceFieldRaw.file_types.length > 0
        ? referenceFieldRaw.file_types
        : REFERENCE_FIELD_FALLBACK.file_types;
    const normalizedCamelFileTypes =
      referenceFieldRaw.fileTypes && referenceFieldRaw.fileTypes.length > 0
        ? referenceFieldRaw.fileTypes
        : REFERENCE_FIELD_FALLBACK.fileTypes;

    return {
      ...REFERENCE_FIELD_FALLBACK,
      ...referenceFieldRaw,
      input_types: normalizedInputTypes,
      file_types: normalizedFileTypes,
      fileTypes: normalizedCamelFileTypes,
    };
  }, [referenceFieldRaw]);
  const upstreamReferenceFields = useMemo<InputFieldType[]>(() => {
    const incomingEdges = edges?.filter(
      (edge) => edge.target === data.id && edge.targetHandle,
    );
    const collected: InputFieldType[] = [];

    incomingEdges?.forEach((edge) => {
      try {
        const targetHandle = scapeJSONParse(edge.targetHandle!);
        const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
        if (fieldName !== REFERENCE_FIELD) return;
      } catch {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (sourceNode?.data?.type !== "DoubaoImageCreator") return;

      const sourceTemplateField =
        sourceNode.data?.node?.template?.[REFERENCE_FIELD];

      if (sourceTemplateField) {
        collected.push(sourceTemplateField);
      }
    });

    return collected;
  }, [edges, nodes, data.id]);
  const referencePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildReferencePreviewItems(referenceField),
    [referenceField],
  );
  const upstreamReferencePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildReferencePreviewItemsFromFields(upstreamReferenceFields),
    [upstreamReferenceFields],
  );
  const combinedReferencePreviews = useMemo<DoubaoReferenceImage[]>(
    () =>
      mergeReferencePreviewLists(referencePreviews, upstreamReferencePreviews),
    [referencePreviews, upstreamReferencePreviews],
  );
  const localReferenceCount = referencePreviews.length;
  const selectedReferenceCount = combinedReferencePreviews.length;
  const hasAnyReferenceSelected = selectedReferenceCount > 0;

  const referenceFileTypes =
    referenceField.fileTypes ??
    referenceField.file_types ??
    referenceField.fileTypesList;

  const [isUploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isReferenceUploadPending, setReferenceUploadPending] = useState(false);
  const [managedPreviewIndex, setManagedPreviewIndex] = useState<number | null>(
    null,
  );
  const { handleOnNewValue: handleReferenceChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: REFERENCE_FIELD,
  });
  const { handleOnNewValue: handleAspectRatioChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "aspect_ratio",
  });
  const { handleOnNewValue: handleImageCountChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "image_count",
  });
  const { handleOnNewValue: handleResolutionChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "resolution",
  });
  const { handleOnNewValue: handleMultiTurnChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: MULTI_TURN_FIELD,
  });
  const { handleOnNewValue: handleOnlineSearchChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: ONLINE_SEARCH_FIELD,
  });
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const { mutateAsync: uploadReferenceFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const [isRunHovering, setRunHovering] = useState(false);

  // Image creator "+" handles: hidden when node is not selected; shown when cursor enters
  // the 212x212 capture zone centered on the default "+" position; selected nodes keep them visible.
  type PlusSide = "left" | "right";
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const leaveGraceTimerRef = useRef<number | null>(null);
  const fadeOutTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [activePlusSide, setActivePlusSide] = useState<PlusSide | null>(null);
  const [visiblePlusSide, setVisiblePlusSide] = useState<PlusSide | null>(null);
  const DEFAULT_PLUS_OFFSET: Record<PlusSide, { x: number; y: number }> =
    useMemo(
      () => ({
        left: { x: -106, y: 0 },
        right: { x: 106, y: 0 },
      }),
      [],
    );
  const [plusOffsetBySide, setPlusOffsetBySide] = useState<
    Record<PlusSide, { x: number; y: number }>
  >(DEFAULT_PLUS_OFFSET);

  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  // Keep UI pixel size fixed while zoom >= 57%. Below that, allow it to shrink with the canvas.
  const inverseZoom = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    return 1 / Math.max(zoom, MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

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
    (
      side: PlusSide,
      clientX: number,
      clientY: number,
      slopNodeSpace = 0,
    ) => {
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

  const computePlusOffset = useCallback((
    side: PlusSide,
    clientX: number,
    clientY: number,
  ) => {
    const rect = previewWrapRef.current?.getBoundingClientRect();
    if (!rect) return DEFAULT_PLUS_OFFSET[side];

    // Bubble/zone transforms are inside the ReactFlow viewport and therefore scale with zoom.
    // Convert screen-space pointer delta -> node-space delta so the "+" can truly track the cursor.
    const zoom = canvasZoom || 1;

    // Convert screen-space pointer position -> node-space offset relative to the preview edge,
    // so the bubble center can precisely match the cursor across different zoom levels.
    const edgeX = side === "left" ? rect.left : rect.right;
    const centerY = rect.top + rect.height / 2;

    // Capture zone: 212x212 square centered at the default "+" center point (?106 from center).
    // Left side x-range in node-space is [-212, 0]; right side is [0, 212].
    const rawX = (clientX - edgeX) / zoom;
    const clampedX =
      side === "left"
        ? Math.max(-212, Math.min(0, rawX))
        : Math.max(0, Math.min(212, rawX));
    const clampedY = Math.max(-106, Math.min(106, (clientY - centerY) / zoom));

    return { x: clampedX, y: clampedY };
  }, [DEFAULT_PLUS_OFFSET, canvasZoom]);

  const showPlusForSide = useCallback(
    (side: PlusSide, clientX?: number, clientY?: number) => {
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
    [clearPlusTimers, computePlusOffset],
  );

  const updatePlusOffset = useCallback(
    (side: PlusSide, clientX: number, clientY: number) => {
      // If we moved from the bubble to the capture zone (or we jittered on the edge),
      // cancel any pending rebound/fade so we don't "twitch".
      clearPlusTimers();
      setActivePlusSide(side);
      setVisiblePlusSide(side);
      lastPointerRef.current = { x: clientX, y: clientY };
      setPlusOffsetBySide((current) => ({
        ...current,
        [side]: computePlusOffset(side, clientX, clientY),
      }));
    },
    [clearPlusTimers, computePlusOffset],
  );

  const startHidePlus = useCallback(
    (side: PlusSide, clientX?: number, clientY?: number) => {
      if (typeof clientX === "number" && typeof clientY === "number") {
        lastPointerRef.current = { x: clientX, y: clientY };
      }

      // When moving between adjacent capture zones (edge square -> bubble square),
      // a short grace period prevents flicker/rebound.
      clearPlusTimers();
      leaveGraceTimerRef.current = window.setTimeout(() => {
        const lastPointer = lastPointerRef.current;
        // PointerLeave can fire on the zone edge even if the pointer is still inside due to DOM
        // target changes; re-check with a small slop to avoid boundary "twitching".
        if (
          lastPointer &&
          isPointerInCaptureZone(side, lastPointer.x, lastPointer.y, 6)
        ) {
          return;
        }

        // Rebound to the default position first...
        setActivePlusSide((current) => (current === side ? null : current));
        setPlusOffsetBySide((current) => ({
          ...current,
          [side]: DEFAULT_PLUS_OFFSET[side],
        }));

        // ...then fade out after the rebound animation ends.
        fadeOutTimerRef.current = window.setTimeout(() => {
          if (!selected) {
            setVisiblePlusSide((current) => (current === side ? null : current));
          }
        }, 200);
      }, 30);
    },
    [clearPlusTimers, isPointerInCaptureZone, selected],
  );

  useEffect(() => {
    // Selection drives baseline state:
    // - selected: show both "+" and reset to default positions
    // - unselected: hide both until the cursor enters a capture zone
    clearPlusTimers();
    if (selected) {
      setActivePlusSide(null);
      setVisiblePlusSide(null);
      setPlusOffsetBySide(DEFAULT_PLUS_OFFSET);
    } else {
      setActivePlusSide(null);
      setVisiblePlusSide(null);
      setPlusOffsetBySide(DEFAULT_PLUS_OFFSET);
    }
  }, [DEFAULT_PLUS_OFFSET, clearPlusTimers, selected]);

  useEffect(() => () => clearPlusTimers(), [clearPlusTimers]);
  const buildFlow = useFlowStore((state) => state.buildFlow);
  const isBuilding = useFlowStore((state) => state.isBuilding);
  const stopBuilding = useFlowStore((state) => state.stopBuilding);
  const clearFlowPoolForNodes = useFlowStore(
    (state) => state.clearFlowPoolForNodes,
  );
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const eventDeliveryConfig = useUtilityStore((state) => state.eventDelivery);
  const typeData = useTypesStore((state) => state.data);

  const nodeIdForRun = data.node?.flow?.data
    ? (findLastNode(data.node.flow.data!)?.id ?? data.id)
    : data.id;

  const isBusy = buildStatus === BuildStatus.BUILDING || isBuilding;

  const canonicalTemplate = (templates as any)?.[data.type]?.template as
    | Record<string, any>
    | undefined;
  const canonicalMultiTurnField = canonicalTemplate?.[MULTI_TURN_FIELD];
  const canonicalOnlineSearchField = canonicalTemplate?.[ONLINE_SEARCH_FIELD];

  useEffect(() => {
    if (!supportsGeminiFeatureButtons) return;
    if (!data.node) return;

    const currentTemplate = data.node.template ?? {};
    const patches: Record<string, any> = {};

    if (!currentTemplate[MULTI_TURN_FIELD]) {
      patches[MULTI_TURN_FIELD] = {
        ...(canonicalMultiTurnField ?? {
          _input_type: "BoolInput",
          name: MULTI_TURN_FIELD,
          display_name: "多轮对话",
          type: "bool",
          advanced: true,
          required: false,
          show: true,
        }),
        value: false,
      };
    }

    if (!currentTemplate[ONLINE_SEARCH_FIELD]) {
      patches[ONLINE_SEARCH_FIELD] = {
        ...(canonicalOnlineSearchField ?? {
          _input_type: "BoolInput",
          name: ONLINE_SEARCH_FIELD,
          display_name: "联网搜索",
          type: "bool",
          advanced: true,
          required: false,
          show: true,
        }),
        value: false,
      };
    }

    const keys = Object.keys(patches);
    if (!keys.length) return;

    setNodes((oldNodes) => {
      return oldNodes.map((node) => {
        if (node.id !== data.id) return node;
        if (node.type !== "genericNode") return node;
        const nextNode = { ...node };
        const nextData = { ...(nextNode.data as any) };
        const nextApiNode = { ...(nextData.node as any) };
        const nextTemplate = { ...(nextApiNode.template ?? {}) };
        keys.forEach((key) => {
          if (!nextTemplate[key]) {
            nextTemplate[key] = patches[key];
          }
        });
        nextApiNode.template = nextTemplate;
        nextData.node = nextApiNode;
        nextNode.data = nextData;
        return nextNode;
      });
    });
  }, [
    supportsGeminiFeatureButtons,
    data.id,
    data.node,
    setNodes,
    canonicalMultiTurnField,
    canonicalOnlineSearchField,
  ]);

  useEffect(() => {
    if (!isWanModel) return;
    const current = String(template.aspect_ratio?.value ?? "");
    if (current.toLowerCase() !== "adaptive") return;
    if (hasAnyReferenceSelected) return;
    handleAspectRatioChange({ value: "1:1" }, { skipSnapshot: true });
  }, [
    isWanModel,
    template.aspect_ratio?.value,
    hasAnyReferenceSelected,
    handleAspectRatioChange,
  ]);

  useEffect(() => {
    if (!isGeminiImageModel) return;
    const current = Number(template.image_count?.value ?? 1);
    if (!Number.isFinite(current) || current <= 1) return;
    handleImageCountChange({ value: 1 }, { skipSnapshot: true });
  }, [isGeminiImageModel, template.image_count?.value, handleImageCountChange]);

  useEffect(() => {
    if (!edgeImageCountLimit) return;
    const current = Number(template.image_count?.value ?? 1);
    if (!Number.isFinite(current)) return;
    if (current <= edgeImageCountLimit) return;
    handleImageCountChange({ value: edgeImageCountLimit }, { skipSnapshot: true });
  }, [edgeImageCountLimit, template.image_count?.value, handleImageCountChange]);

  useEffect(() => {
    // Nano Banana 模型不支持 image_size 参数，自动设置为 "Auto"
    // 其他模型不支持 Auto 选项，切换到默认值 "2K（推荐）"
    const current = String(template.resolution?.value ?? "");
    if (isNanoBanana) {
      if (current !== "Auto") {
        handleResolutionChange({ value: "Auto" }, { skipSnapshot: true });
      }
    } else {
      if (current === "Auto") {
        handleResolutionChange({ value: "2K（推荐）" }, { skipSnapshot: true });
      }
    }
  }, [isNanoBanana, template.resolution?.value, handleResolutionChange]);

  const handleRun = () => {
    clearFlowPoolForNodes([nodeIdForRun]);
    if (buildStatus === BuildStatus.BUILDING && isRunHovering) {
      stopBuilding();
      return;
    }
    if (disableRun) return;
    if (isBusy) return;
    buildFlow({
      stopNodeId: data.id,
      eventDelivery: eventDeliveryConfig,
    });
    track("Flow Build - Clicked", { stopNodeId: data.id });
  };

  const runIconName =
    buildStatus === BuildStatus.BUILDING
      ? isRunHovering
        ? "Square"
        : "Loader2"
      : "Play";

  const controlConfigs = useMemo(() => {
    return CONTROL_FIELDS.map((field) => {
      const templateField = template[field.name];
      if (!templateField) return null;
      let options: Array<string | number> = Array.isArray(templateField.options)
        ? templateField.options
        : [];

      if (field.name === "image_count") {
        options = buildRangeOptions(templateField);
      }
      if (field.name === "aspect_ratio") {
        // Nano Banana 系列模型支持额外的宽高比（4:5, 5:4, 21:9）
        // 其他模型不支持这些宽高比，需要过滤掉
        const geminiExclusiveRatios = new Set(["4:5", "5:4", "21:9"]);

        options = options.filter((opt) => {
          const optStr = String(opt);
          // 非 Gemini 模型（Nano Banana 系列）隐藏这些宽高比
          if (!isGeminiImageModel && geminiExclusiveRatios.has(optStr)) {
            return false;
          }
          // 非 wan 模型移除 adaptive 选项
          if (!isWanModel && optStr.toLowerCase() === "adaptive") {
            return false;
          }
          return true;
        });
      }
      if (field.name === "resolution") {
        // Auto 选项只在 Nano Banana 模型时显示
        options = options.filter((opt) => {
          const optStr = String(opt);
          // 如果是 Auto 选项，只在 Nano Banana 模型时显示
          if (optStr === "Auto") {
            return isNanoBanana;
          }
          return true;
        });
      }

      const tooltipText =
        DOUBAO_CONTROL_HINTS[field.name] ?? DOUBAO_CONFIG_TOOLTIP;

      const disabledOptions = (() => {
        if (!isWanModel) return undefined;

        if (field.name === "image_count") {
          return options.filter((opt) => Number(opt) > 4);
        }

        if (field.name === "resolution") {
          const disables: Array<string | number> = [];
          for (const opt of options) {
            const label = String(opt);
            if (label.includes("4K")) {
              disables.push(opt);
              continue;
            }
            if (hasAnyReferenceSelected && label.includes("2K")) {
              disables.push(opt);
            }
          }
          return disables.length ? disables : undefined;
        }

        if (field.name === "aspect_ratio") {
          return hasAnyReferenceSelected ? undefined : ["adaptive"];
        }

        return undefined;
      })();

      const geminiDisabledOptions = (() => {
        if (!isGeminiImageModel) return undefined;

        if (field.name === "image_count") {
          return options.filter((opt) => Number(opt) > 1);
        }

        if (field.name === "resolution") {
          // Nano Banana 不支持 image_size 参数，禁用所有分辨率选项
          // Nano Banana Pro 支持 image_size 参数，不禁用任何选项
          return isNanoBanana ? options : undefined;
        }

        return undefined;
      })();

      const edgeDisabledOptions =
        field.name === "image_count" && edgeImageCountLimit
          ? options.filter((opt) => Number(opt) > edgeImageCountLimit)
          : [];
      const mergedDisabledOptions = [
        ...(disabledOptions ?? []),
        ...(geminiDisabledOptions ?? []),
        ...edgeDisabledOptions,
      ];
      const normalizedDisabledOptions = mergedDisabledOptions.length
        ? Array.from(new Set(mergedDisabledOptions))
        : undefined;

      return {
        ...field,
        template: templateField,
        options,
        value: templateField.value,
        tooltip: tooltipText,
        disabledOptions: normalizedDisabledOptions,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [
    template,
    isWanModel,
    hasAnyReferenceSelected,
    isGeminiImageModel,
    isNanoBanana,
    edgeImageCountLimit,
  ]);

  const multiTurnEnabled = Boolean(template?.[MULTI_TURN_FIELD]?.value);
  const onlineSearchEnabled = Boolean(template?.[ONLINE_SEARCH_FIELD]?.value);

  const toggleMultiTurn = useCallback(() => {
    handleMultiTurnChange({ value: !multiTurnEnabled });
  }, [handleMultiTurnChange, multiTurnEnabled]);

  const toggleOnlineSearch = useCallback(() => {
    handleOnlineSearchChange({ value: !onlineSearchEnabled });
  }, [handleOnlineSearchChange, onlineSearchEnabled]);

  const maxReferenceEntries = useMemo(() => {
    const defaultLimit = isWanModel ? 4 : isNanoBanana ? 3 : MAX_REFERENCE_IMAGES;
    const explicitLimit =
      (typeof referenceField?.max_length === "number" && referenceField?.max_length) ||
      (typeof referenceField?.max_files === "number" && referenceField?.max_files) ||
      (typeof referenceField?.list_max === "number" && referenceField?.list_max);
    if (typeof explicitLimit === "number" && explicitLimit > 0) {
      return edgeImageCountLimit ? Math.min(explicitLimit, edgeImageCountLimit) : explicitLimit;
    }
    return edgeImageCountLimit ? Math.min(defaultLimit, edgeImageCountLimit) : defaultLimit;
  }, [referenceField, isWanModel, isNanoBanana, edgeImageCountLimit]);
  const maxLocalEntries = Math.max(
    maxReferenceEntries - upstreamReferencePreviews.length,
    0,
  );
  const uploadMaxEntries = Math.max(maxLocalEntries, localReferenceCount);
  const canAddMoreReferences =
    localReferenceCount < maxLocalEntries &&
    selectedReferenceCount < maxReferenceEntries;

  useEffect(() => {
    if (!edgeImageCountLimit) return;
    if (localReferenceCount <= maxReferenceEntries) return;
    const entries = collectReferenceEntries(referenceField);
    if (!entries.length) return;
    const trimmed = entries.slice(0, maxReferenceEntries);
    setErrorData({
      title: "上游角色限制",
      list: [`当前连接角色最多允许 ${maxReferenceEntries} 张图片，已自动保留前 ${maxReferenceEntries} 张。`],
    });
    handleReferenceChange({
      value: trimmed.map((entry) => entry.name),
      file_path: trimmed.map((entry) => entry.path),
    });
  }, [
    edgeImageCountLimit,
    localReferenceCount,
    maxReferenceEntries,
    referenceField,
    handleReferenceChange,
    setErrorData,
  ]);

  const allowedExtensions = useMemo(() => {
    if (isWanModel) {
      return WAN_REFERENCE_EXTENSIONS;
    }
    const source = referenceFileTypes && referenceFileTypes.length > 0
      ? referenceFileTypes
      : DEFAULT_REFERENCE_EXTENSIONS;
    return source.map((ext) => ext.replace(/^\./, "").toLowerCase());
  }, [referenceFileTypes, isWanModel]);

  const filePickerAccept = useMemo(
    () => allowedExtensions.map((ext) => `.${ext}`).join(","),
    [allowedExtensions],
  );

  const openUploadDialog = useCallback(() => {
    if (isReferenceUploadPending) return;
    setUploadDialogOpen(true);
  }, [isReferenceUploadPending]);

  const requestUploadDialogForNode = useCallback((nodeId: string) => {
    const uploadEvent = new CustomEvent("doubao-preview-upload", {
      detail: { nodeId },
    });
    window.dispatchEvent(uploadEvent);
  }, []);

  const handleCreateImg2ImgDownstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const existingDownstreamNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoImageCreator") return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== REFERENCE_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== IMAGE_OUTPUT_NAME) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingDownstreamNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingDownstreamNodeId,
        })),
      );
      openUploadDialog();
      return;
    }

    const imageComponentTemplate = templates["DoubaoImageCreator"];
    if (!imageComponentTemplate) return;

    const referenceTemplateField = imageComponentTemplate.template?.[REFERENCE_FIELD];
    if (!referenceTemplateField) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const newImageNode: GenericNodeType = {
      id: newImageNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x + NODE_OFFSET_X,
        y: currentNode.position.y,
      },
      data: {
        node: cloneDeep(imageComponentTemplate),
        showNode: !imageComponentTemplate.minimized,
        type: "DoubaoImageCreator",
        id: newImageNodeId,
      },
      selected: true,
    };

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      newImageNode,
    ]);

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === IMAGE_OUTPUT_NAME) ??
      data.node?.outputs?.find((output) => !output.hidden) ??
      data.node?.outputs?.[0];

    const sourceOutputTypes =
      outputDefinition?.types && outputDefinition.types.length === 1
        ? outputDefinition.types
        : outputDefinition?.selected
          ? [outputDefinition.selected]
          : ["Data"];

    const sourceHandle = {
      output_types: sourceOutputTypes,
      id: data.id,
      dataType: data.type,
      name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: referenceTemplateField.input_types,
      type: referenceTemplateField.type,
      id: newImageNodeId,
      fieldName: REFERENCE_FIELD,
      ...(referenceTemplateField.proxy ? { proxy: referenceTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newImageNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    openUploadDialog();

    track("DoubaoImageCreator - Create Img2Img Node", {
      sourceNodeId: data.id,
      targetNodeId: newImageNodeId,
      targetComponent: "DoubaoImageCreator",
    });
  }, [
    NODE_OFFSET_X,
    IMAGE_OUTPUT_NAME,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    onConnect,
    setNodes,
    setEdges,
    takeSnapshot,
    templates,
    openUploadDialog,
  ]);

  const handleCreateReferenceVideoDownstreamNode = useCallback((imageRole?: EdgeImageRole) => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const videoTemplate = templates["DoubaoVideoGenerator"];
    if (!videoTemplate) return;

    const firstFrameTemplateField = videoTemplate.template?.first_frame_image;
    if (!firstFrameTemplateField) return;

    const existingDownstreamVideoNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoVideoGenerator") return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== "first_frame_image") return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== IMAGE_OUTPUT_NAME) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingDownstreamVideoNodeId) {
      if (imageRole) {
        setEdges((currentEdges) =>
          currentEdges.map((edge) => {
            if (edge.source !== data.id || edge.target !== existingDownstreamVideoNodeId) {
              return edge;
            }
            if (!edge.data) return edge;
            const targetHandle =
              edge.data?.targetHandle ??
              (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
            if (targetHandle?.fieldName !== "first_frame_image") return edge;
            return {
              ...edge,
              data: {
                ...edge.data,
                imageRole,
              },
            };
          }),
        );
      }
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingDownstreamVideoNodeId,
        })),
      );
      openUploadDialog();
      return;
    }

    takeSnapshot();

    const newVideoNodeId = getNodeId("DoubaoVideoGenerator");
    const newVideoNode: GenericNodeType = {
      id: newVideoNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x + NODE_OFFSET_X,
        y: currentNode.position.y,
      },
      data: {
        node: cloneDeep(videoTemplate),
        showNode: !videoTemplate.minimized,
        type: "DoubaoVideoGenerator",
        id: newVideoNodeId,
      },
      selected: true,
    };

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      newVideoNode,
    ]);

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === IMAGE_OUTPUT_NAME) ??
      data.node?.outputs?.find((output) => !output.hidden) ??
      data.node?.outputs?.[0];

    const sourceOutputTypes =
      outputDefinition?.types && outputDefinition.types.length === 1
        ? outputDefinition.types
        : outputDefinition?.selected
          ? [outputDefinition.selected]
          : ["Data"];

    const sourceHandle = {
      output_types: sourceOutputTypes,
      id: data.id,
      dataType: data.type,
      name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: firstFrameTemplateField.input_types,
      type: firstFrameTemplateField.type,
      id: newVideoNodeId,
      fieldName: "first_frame_image",
      ...(firstFrameTemplateField.proxy ? { proxy: firstFrameTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newVideoNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
      ...(imageRole ? { imageRole } : {}),
    } as any);

    openUploadDialog();

    track("DoubaoImageCreator - Create Reference Video Node", {
      sourceNodeId: data.id,
      targetNodeId: newVideoNodeId,
      targetComponent: "DoubaoVideoGenerator",
    });
  }, [
    NODE_OFFSET_X,
    IMAGE_OUTPUT_NAME,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    templates,
    openUploadDialog,
  ]);

  const handleCreateBackgroundUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const referenceTemplateField = template[REFERENCE_FIELD];
    if (!referenceTemplateField) return;

    const existingUpstreamNodeId = edges
      .map((edge) => {
        if (edge.target !== data.id) return null;

        const sourceNode = nodes.find((node) => node.id === edge.source);
        if (sourceNode?.data?.type !== "DoubaoImageCreator") return null;
        if (sourceNode.position.x >= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== REFERENCE_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== IMAGE_OUTPUT_NAME) return null;

        return sourceNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingUpstreamNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingUpstreamNodeId || node.id === data.id,
        })),
      );
      requestUploadDialogForNode(existingUpstreamNodeId);
      return;
    }

    const imageTemplate = templates["DoubaoImageCreator"];
    if (!imageTemplate) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const newImageNode: GenericNodeType = {
      id: newImageNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x - NODE_OFFSET_X,
        y: currentNode.position.y,
      },
      data: {
        node: cloneDeep(imageTemplate),
        showNode: !imageTemplate.minimized,
        type: "DoubaoImageCreator",
        id: newImageNodeId,
      },
      selected: true,
    };

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: node.id === data.id })),
      newImageNode,
    ]);

    const outputDefinition =
      imageTemplate.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
      imageTemplate.outputs?.find((output: any) => !output.hidden) ??
      imageTemplate.outputs?.[0];

    const sourceOutputTypes =
      outputDefinition?.types && outputDefinition.types.length === 1
        ? outputDefinition.types
        : outputDefinition?.selected
          ? [outputDefinition.selected]
          : ["Data"];

    const sourceHandle = {
      output_types: sourceOutputTypes,
      id: newImageNodeId,
      dataType: "DoubaoImageCreator",
      name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: referenceTemplateField.input_types,
      type: referenceTemplateField.type,
      id: data.id,
      fieldName: REFERENCE_FIELD,
      ...(referenceTemplateField.proxy ? { proxy: referenceTemplateField.proxy } : {}),
    };

    onConnect({
      source: newImageNodeId,
      target: data.id,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    queueMicrotask(() => requestUploadDialogForNode(newImageNodeId));

    track("DoubaoImageCreator - Create Background Upstream Node", {
      sourceNodeId: newImageNodeId,
      targetNodeId: data.id,
      targetComponent: "DoubaoImageCreator",
    });
  }, [
    IMAGE_OUTPUT_NAME,
    NODE_OFFSET_X,
    data.id,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    template,
    templates,
    requestUploadDialogForNode,
  ]);

  const handlePreviewSuggestionClickWithVideo = useCallback(
    (label: string) => {
      if (label === "以图生图") {
        handleCreateImg2ImgDownstreamNode();
        return;
      }
      if (label === REFERENCE_VIDEO_LABEL || label === FIRST_FRAME_VIDEO_LABEL) {
        const role = label === FIRST_FRAME_VIDEO_LABEL ? "first" : undefined;
        handleCreateReferenceVideoDownstreamNode(role);
        return;
      }
      if (label === BACKGROUND_LABEL) {
        handleCreateBackgroundUpstreamNode();
      }
    },
    [
      BACKGROUND_LABEL,
      FIRST_FRAME_VIDEO_LABEL,
      REFERENCE_VIDEO_LABEL,
      handleCreateBackgroundUpstreamNode,
      handleCreateImg2ImgDownstreamNode,
      handleCreateReferenceVideoDownstreamNode,
    ],
  );

  const triggerReferenceUpload = useCallback(() => {
    if (isReferenceUploadPending) {
      return;
    }
    if (!canAddMoreReferences) {
      setErrorData({
        title: "已达到参考图上限",
        list: [`最多可保留 ${maxReferenceEntries} 张参考图，请删除后再上传。`],
      });
      return;
    }
    void handleReferenceUpload({
      referenceField,
      accept: filePickerAccept,
      maxEntries: uploadMaxEntries,
      allowedExtensions,
      currentFlowId,
      uploadReferenceFile,
      validateFileSize,
      handleReferenceChange,
      setErrorData,
      setReferenceUploadPending,
    });
  }, [
    referenceField,
    isReferenceUploadPending,
    filePickerAccept,
    maxReferenceEntries,
    uploadMaxEntries,
    allowedExtensions,
    currentFlowId,
    uploadReferenceFile,
    validateFileSize,
    handleReferenceChange,
    setErrorData,
    setReferenceUploadPending,
    canAddMoreReferences,
  ]);

  const handleReferenceRemove = useCallback(
    (index: number) => {
      if (index >= localReferenceCount) return;
      const entries = collectReferenceEntries(referenceField);
      if (!entries.length) return;
      const filtered = entries.filter((_, idx) => idx !== index);
      handleReferenceChange({
        value: filtered.map((entry) => entry.name),
        file_path: filtered.map((entry) => entry.path),
      });
    },
    [referenceField, handleReferenceChange, localReferenceCount],
  );

  const handleReferenceReplace = useCallback(
    async (index: number) => {
      if (index >= localReferenceCount) return;
      if (!currentFlowId) {
        setErrorData({
          title: "无法替换参考图",
          list: ["请先保存或重新打开画布后再试。"],
        });
        return;
      }
      if (isReferenceUploadPending) return;
      const files = await createFileUpload({
        multiple: false,
        accept: filePickerAccept,
      });
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
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (
        allowedExtensions.length &&
        (!extension || !allowedExtensions.includes(extension))
      ) {
        setErrorData({
          title: INVALID_FILE_ALERT,
          list: [allowedExtensions.map((ext) => ext.toUpperCase()).join(", ")],
        });
        return;
      }
      setReferenceUploadPending(true);
      try {
        const response = await uploadReferenceFile({
          file,
          id: currentFlowId,
        });
        const serverPath = response?.file_path;
        if (!serverPath) {
          throw new Error("缺少文件路径");
        }
        const entries = collectReferenceEntries(referenceField);
        if (index >= 0 && index < entries.length) {
          entries[index] = { name: file.name, path: serverPath };
        } else {
          entries.push({ name: file.name, path: serverPath });
        }
        const limitedEntries =
          entries.length > uploadMaxEntries
            ? entries.slice(-uploadMaxEntries)
            : entries;
        handleReferenceChange({
          value: limitedEntries.map((entry) => entry.name),
          file_path: limitedEntries.map((entry) => entry.path),
        });
      } catch (error) {
        console.error(CONSOLE_ERROR_MSG, error);
        setErrorData({
          title: "上传失败",
          list: [
            (error as any)?.response?.data?.detail ??
              "网络异常，稍后再试或检查后端日志。",
          ],
        });
      } finally {
        setReferenceUploadPending(false);
      }
    },
    [
      referenceField,
      setErrorData,
      currentFlowId,
      isReferenceUploadPending,
      filePickerAccept,
      allowedExtensions,
      uploadReferenceFile,
      validateFileSize,
      handleReferenceChange,
      setReferenceUploadPending,
      uploadMaxEntries,
      localReferenceCount,
    ],
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId?: string }>;
      const requestedNodeId = customEvent?.detail?.nodeId;
      if (requestedNodeId && requestedNodeId !== data.id) return;
      if (!requestedNodeId && !selected) return;
      openUploadDialog();
    };
    window.addEventListener("doubao-preview-upload", listener);
    return () => window.removeEventListener("doubao-preview-upload", listener);
  }, [data.id, openUploadDialog, selected]);

  useEffect(() => {
    if (!isUploadDialogOpen) {
      setManagedPreviewIndex(null);
    }
  }, [isUploadDialogOpen]);

  useEffect(() => {
    if (!combinedReferencePreviews.length) {
      setManagedPreviewIndex(null);
      return;
    }
    if (
      managedPreviewIndex !== null &&
      managedPreviewIndex >= combinedReferencePreviews.length
    ) {
      setManagedPreviewIndex(combinedReferencePreviews.length - 1);
    }
  }, [managedPreviewIndex, combinedReferencePreviews]);

  const referenceHandleMeta = useMemo(() => {
    if (!referenceField) return null;
    const colors = getNodeInputColors(
      referenceField.input_types,
      referenceField.type,
      types,
    );
    const colorName = getNodeInputColorsName(
      referenceField.input_types,
      referenceField.type,
      types,
    );
    return {
      id: {
        inputTypes: referenceField.input_types,
        type: referenceField.type,
        id: data.id,
        fieldName: REFERENCE_FIELD,
      },
      colors,
      colorName,
      tooltip:
        referenceField.input_types?.join(", ") ??
        referenceField.type ??
        "图片输入",
      title: referenceField.display_name ?? "参考图输入",
      proxy: referenceField.proxy,
    };
  }, [referenceField, types, data.id]);

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
            output.selected ??
            output.types?.[0] ??
            output.display_name ??
            "图片创作结果",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data.id, data.node?.outputs, data.type, types]);

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Preview */}
      <div className="relative flex flex-col gap-4 lg:flex-row">
        {referenceHandleMeta && (
          <div className="absolute left-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:block">
            <HandleRenderComponent
              left
              tooltipTitle={referenceHandleMeta.tooltip}
              id={referenceHandleMeta.id}
              title={referenceHandleMeta.title}
              nodeId={data.id}
              myData={typeData}
              colors={referenceHandleMeta.colors}
              colorName={referenceHandleMeta.colorName}
              setFilterEdge={setFilterEdge}
              showNode={true}
              testIdComplement={`${data.type?.toLowerCase()}-preview-handle`}
              proxy={referenceHandleMeta.proxy}
              uiVariant="plus"
              visible={selected || visiblePlusSide === "left"}
              isTracking={activePlusSide === "left"}
              onPlusPointerEnter={(event) =>
                showPlusForSide("left", event.clientX, event.clientY)
              }
              onPlusPointerMove={(event) =>
                updatePlusOffset("left", event.clientX, event.clientY)
              }
              onPlusPointerLeave={(event) =>
                startHidePlus("left", event.clientX, event.clientY)
              }
              // Keep the handle anchored on the preview edge (ghost origin),
              // while rendering the visible "+" with the required gap.
              // Requirement: gap (preview edge -> "+" outer edge) = 70px.
              // "+" diameter is 72px (radius 36px), so center offset = 70 + 36 = 106.
              visualOffset={{
                x: plusOffsetBySide.left.x,
                y: plusOffsetBySide.left.y,
              }}
            />
          </div>
        )}
        <div ref={previewWrapRef} className="relative flex-1">
          {/* Hover/capture zones: a 212x212 square centered on the default "+" center point. */}
          <div
            className="absolute left-0 top-1/2 z-[800] hidden h-[212px] w-[212px] -translate-x-full -translate-y-1/2 lg:block"
            onPointerEnter={(event) =>
              showPlusForSide("left", event.clientX, event.clientY)
            }
            onPointerMove={(event) =>
              updatePlusOffset("left", event.clientX, event.clientY)
            }
            onPointerLeave={(event) =>
              startHidePlus("left", event.clientX, event.clientY)
            }
          />
          <div
            className="absolute left-full top-1/2 z-[800] hidden h-[212px] w-[212px] -translate-y-1/2 lg:block"
            onPointerEnter={(event) =>
              showPlusForSide("right", event.clientX, event.clientY)
            }
            onPointerMove={(event) =>
              updatePlusOffset("right", event.clientX, event.clientY)
            }
            onPointerLeave={(event) =>
              startHidePlus("right", event.clientX, event.clientY)
            }
          />
          <DoubaoPreviewPanel
            nodeId={data.id}
            componentName={data.type}
            appearance="imageCreator"
            referenceImages={combinedReferencePreviews}
            onRequestUpload={openUploadDialog}
            onSuggestionClick={handlePreviewSuggestionClickWithVideo}
            onActionsChange={onPreviewActionsChange}
          />
        </div>
        {previewOutputHandles.length > 0 && (
          <div
            className={cn(
              "absolute right-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-start",
            )}
          >
            {previewOutputHandles.map((handle, index) => (
              <div
                key={`${handle.id.name ?? "output"}-${index}`}
                className="mb-3 last:mb-0"
              >
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
                  visible={selected || visiblePlusSide === "right"}
                  isTracking={activePlusSide === "right"}
                  onPlusPointerEnter={(event) =>
                    showPlusForSide("right", event.clientX, event.clientY)
                  }
                  onPlusPointerMove={(event) =>
                    updatePlusOffset("right", event.clientX, event.clientY)
                  }
                  onPlusPointerLeave={(event) =>
                    startHidePlus("right", event.clientX, event.clientY)
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
        )}
      </div>

      {/* Prompt/config container */}
      {showExpanded && (
        <div
          className={cn(
            "rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)]",
            "dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-[0_25px_50px_rgba(0,0,0,0.55)]",
            // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
            "transform-gpu origin-top scale-[var(--inv-zoom)]",
          )}
          style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
        >
          <div className="space-y-3">
            <div
              className={cn(
                "rounded-[12px] p-3",
                "[&_.primary-input]:bg-transparent",
                "[&_.primary-input]:text-[#1C202D]",
                "[&_.primary-input]:text-sm",
                "[&_.primary-input]:placeholder:text-[#9CA3C0]",
                "[&_.text-muted-foreground]:text-[#8D92A8]",
                "dark:[&_.primary-input]:text-white",
                "dark:[&_.primary-input]:placeholder:text-slate-400",
                "dark:[&_.text-muted-foreground]:text-slate-400",
              )}
            >
              <RenderInputParameters
                data={data}
                types={types}
                isToolMode={isToolMode}
                showNode
                shownOutputs={[]}
                showHiddenOutputs={false}
                filterFields={[PROMPT_NAME]}
                filterMode="include"
                fieldOverrides={{
                  [PROMPT_NAME]:
                    {
                      placeholder:
                        "描述你想要生成的内容，并在下方调整生成参数。（按下 Enter 生成，Shift+Enter 换行）",
                      inputTypes: ["Message"],
                    },
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {controlConfigs.map((config) => (
                <DoubaoParameterButton key={config.name} data={data} config={config} />
              ))}

              {supportsGeminiFeatureButtons && (
                <>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={toggleMultiTurn}
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                      multiTurnEnabled
                        ? "border-[#2E7BFF] bg-[#2E7BFF] text-white"
                        : "border-[#E0E5F6] bg-[#F4F6FB] text-[#2E3150] hover:bg-[#E9EEFF] dark:border-white/15 dark:bg-white/10 dark:text-white",
                      isBusy && "cursor-not-allowed opacity-60",
                    )}
                  >
                    多轮对话
                    <span className={cn("text-xs", multiTurnEnabled ? "text-white/90" : "text-[#7D85A8] dark:text-slate-300")}>
                      {multiTurnEnabled ? "开启" : "关闭"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={toggleOnlineSearch}
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                      onlineSearchEnabled
                        ? "border-[#2E7BFF] bg-[#2E7BFF] text-white"
                        : "border-[#E0E5F6] bg-[#F4F6FB] text-[#2E3150] hover:bg-[#E9EEFF] dark:border-white/15 dark:bg-white/10 dark:text-white",
                      isBusy && "cursor-not-allowed opacity-60",
                    )}
                  >
                    联网搜索
                    <span className={cn("text-xs", onlineSearchEnabled ? "text-white/90" : "text-[#7D85A8] dark:text-slate-300")}>
                      {onlineSearchEnabled ? "开启" : "关闭"}
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={disableRun}
                className={cn(
                  "ml-auto flex h-11 w-11 items-center justify-center rounded-full text-white",
                  "shadow-[0_12px_24px_rgba(46,123,255,0.35)] transition",
                  disableRun
                    ? "cursor-not-allowed bg-slate-300 shadow-none hover:bg-slate-300"
                    : "bg-[#2E7BFF] hover:bg-[#0F5CE0]",
                )}
                onClick={handleRun}
                onMouseEnter={() => setRunHovering(true)}
                onMouseLeave={() => setRunHovering(false)}
              >
                <ForwardedIconComponent
                  name={runIconName}
                  className={cn(
                    "h-4 w-4",
                    runIconName === "Loader2" && "animate-spin",
                  )}
                />
              </button>
            </div>
          </div>

          {hasAdditionalFields && (
            <div className="mt-5">
              <RenderInputParameters
                data={data}
                types={types}
                isToolMode={isToolMode}
                showNode
                shownOutputs={[]}
                showHiddenOutputs={false}
                filterFields={Array.from(customFields)}
                filterMode="exclude"
              />
            </div>
          )}
        </div>
      )}

      <Dialog open={isUploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="w-[480px]">
          <DialogHeader>
            <DialogTitle>上传参考图</DialogTitle>
            <DialogDescription>
              支持 JPG/PNG/WebP 等格式，每张不超过 10MB。
            </DialogDescription>
          </DialogHeader>
          {referenceField ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl bg-[#F7F9FF] p-4 dark:border dark:border-white/10 dark:bg-[#111a2b]/80">
                <p className="text-sm font-medium text-foreground">
                  选择要上传的图片（支持多选）
                </p>
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F4F5F9] text-sm font-medium text-[#13141A] dark:bg-white/5 dark:text-white",
                    (isReferenceUploadPending || !canAddMoreReferences) &&
                      "opacity-70",
                  )}
                  onClick={triggerReferenceUpload}
                  disabled={isReferenceUploadPending || !canAddMoreReferences}
                >
                  <ForwardedIconComponent
                    name={isReferenceUploadPending ? "Loader2" : "Upload"}
                    className={cn(
                      "h-4 w-4",
                      isReferenceUploadPending && "animate-spin",
                    )}
                  />
                  <span>{isReferenceUploadPending ? "上传中..." : "从设备上传"}</span>
                </button>
                <p className="text-xs text-muted-foreground">
                  已选择 {selectedReferenceCount} / {maxReferenceEntries} 张参考图
                </p>
                {isNanoBananaPro && selectedReferenceCount > 5 && (
                  <p className="text-xs text-amber-600">
                    Nano Banana Pro 建议高保真输入不超过 5 张，超过后可能影响细节质量。
                  </p>
                )}
                {!canAddMoreReferences && (
                  <p className="text-xs text-amber-600">
                    已达到参考图上限，请删除不需要的图片后再上传。
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-dashed border-[#E0E5F2] bg-white/80 p-3 dark:border-white/15 dark:bg-[#0a1220]/70">
                <div className="flex items-center justify-between text-xs text-[#636A86] dark:text-slate-300">
                  <span>图片上传管理</span>
                  <span className="font-medium text-[#1B66FF]">
                    {selectedReferenceCount} / {maxReferenceEntries}
                  </span>
                </div>

                {selectedReferenceCount > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {combinedReferencePreviews.map((preview, index) => {
                        const isUpstream = index >= localReferenceCount;
                        return (
                          <div
                            key={preview.id ?? `${preview.imageSource}-${index}`}
                            className="group relative flex flex-col overflow-hidden rounded-xl border border-[#E2E7F5] bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
                          >
                            <button
                              type="button"
                              className="h-28 w-full overflow-hidden"
                              onClick={() => setManagedPreviewIndex(index)}
                            >
                              <img
                                src={preview.imageSource}
                                alt={
                                  preview.label ??
                                  preview.fileName ??
                                  `参考图 ${index + 1}`
                                }
                                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                              />
                            </button>
                            <div className="flex items-center justify-between px-3 py-2 text-xs text-[#4B5168] dark:text-slate-200">
                              <span className="line-clamp-1">
                                {preview.label ??
                                  preview.fileName ??
                                  `参考图 ${index + 1}`}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                  onClick={() => handleReferenceReplace(index)}
                                  disabled={isReferenceUploadPending || isUpstream}
                                >
                                  替换
                                </button>
                                <span className="text-[#CDD2E4] dark:text-slate-600">|</span>
                                <button
                                  type="button"
                                  className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                  onClick={() => setManagedPreviewIndex(index)}
                                >
                                  查看
                                </button>
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label="删除参考图"
                              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow transition group-hover:opacity-100"
                              onClick={() => handleReferenceRemove(index)}
                              disabled={isUpstream}
                            >
                              <ForwardedIconComponent
                                name="Trash2"
                                className="h-3.5 w-3.5"
                              />
                            </button>
                            {isUpstream && (
                              <span className="absolute left-2 top-2 rounded-full bg-[#0f172a]/70 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                                上游
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {managedPreviewIndex !== null &&
                      combinedReferencePreviews[managedPreviewIndex] && (
                        <div className="space-y-2 rounded-xl border border-[#E2E7F5] bg-[#F8FAFF] p-3 dark:border-white/10 dark:bg-white/5">
                          <div className="flex items-center justify-between text-xs text-[#4A5168] dark:text-slate-200">
                            <span>
                              预览：
                              {combinedReferencePreviews[managedPreviewIndex].label ??
                                combinedReferencePreviews[managedPreviewIndex].fileName ??
                                `参考图 ${managedPreviewIndex + 1}`}
                            </span>
                            <button
                              type="button"
                              className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                              onClick={() => setManagedPreviewIndex(null)}
                            >
                              收起
                            </button>
                          </div>
                          <div className="h-48 w-full overflow-hidden rounded-lg bg-[#F4F6FB] dark:bg-slate-900/50">
                            <img
                              src={
                                combinedReferencePreviews[managedPreviewIndex].imageSource
                              }
                              alt="参考图预览"
                              className="h-full w-full object-contain"
                            />
                          </div>
                        </div>
                      )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    你还没有上传任何参考图。
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              当前组件不支持参考图上传。
            </p>
          )}
          <DialogFooter>
            <p className="w-full text-center text-xs text-muted-foreground">
              最多可保留 {maxReferenceEntries} 张参考图，支持多选。
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildReferencePreviewItems(
  field: InputFieldType | undefined,
): DoubaoReferenceImage[] {
  if (!field) return [];
  const pathEntries = toArray(field?.file_path);
  const valueEntries = toArray(field?.value);
  const maxLength = Math.max(pathEntries.length, valueEntries.length);
  if (!maxLength) return [];

  const previews: DoubaoReferenceImage[] = [];
  for (let index = 0; index < maxLength; index += 1) {
    const rawSource =
      extractReferenceSource(pathEntries[index]) ??
      extractReferenceSource(valueEntries[index]);
    if (!rawSource) continue;
    const resolved = resolveReferenceSource(rawSource);
    if (!resolved) continue;
    const label =
      extractReferenceLabel(valueEntries[index]) ??
      resolved.fileName ??
      `参考图 ${index + 1}`;
    previews.push({
      id: `${resolved.sourceId}-${index}`,
      imageSource: resolved.url,
      downloadSource: resolved.downloadUrl,
      label,
      fileName: resolved.fileName,
    });
  }

  return previews;
}

function buildReferencePreviewItemsFromFields(
  fields: InputFieldType[],
): DoubaoReferenceImage[] {
  if (!fields.length) return [];
  const previews: DoubaoReferenceImage[] = [];
  fields.forEach((field) => {
    previews.push(...buildReferencePreviewItems(field));
  });
  return dedupePreviews(previews);
}

function mergeReferencePreviewLists(
  base: DoubaoReferenceImage[],
  extras: DoubaoReferenceImage[],
): DoubaoReferenceImage[] {
  return dedupePreviews([...base, ...extras]);
}

function dedupePreviews(
  previews: DoubaoReferenceImage[],
): DoubaoReferenceImage[] {
  const seen = new Set<string>();
  const result: DoubaoReferenceImage[] = [];

  previews.forEach((preview) => {
    const key = preview.imageSource ?? preview.downloadSource ?? preview.id;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    result.push(preview);
  });

  return result;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value && value !== 0) return [];
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null);
  }
  return [value];
}

function extractReferenceSource(entry: unknown): string | null {
  if (!entry && entry !== 0) return null;
  if (typeof entry === "string") {
    return entry.trim() || null;
  }
  if (typeof entry === "object") {
    const record = entry as any;
    const candidates = [
      record.file_path,
      record.path,
      record.value,
      record.url,
      record.image_url,
      record.image_data_url,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  }
  return null;
}

function extractReferenceLabel(entry: unknown): string | undefined {
  if (!entry && entry !== 0) return undefined;
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry === "object") {
    const record = entry as any;
    const candidates = [record.display_name, record.filename, record.name];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

function resolveReferenceSource(raw: string) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (
    /^data:/i.test(trimmed) ||
    /^https?:/i.test(trimmed) ||
    trimmed.startsWith("blob:")
  ) {
    return {
      url: trimmed,
      downloadUrl: trimmed,
      fileName: extractFileName(trimmed),
      sourceId: trimmed,
    };
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  let segments = normalized.split("/").filter(Boolean);
  if (
    segments.length >= 4 &&
    segments[0] === "files" &&
    segments[1] === "images"
  ) {
    segments = segments.slice(2);
  }
  if (segments.length < 2) return null;
  const [flowId, ...rest] = segments;
  if (!flowId || !rest.length) return null;
  const encodedFlow = encodeURIComponent(flowId);
  const encodedFile = rest.map((part) => encodeURIComponent(part)).join("/");
  const fileName = rest[rest.length - 1];
  const url = `${BASE_URL_API}files/images/${encodedFlow}/${encodedFile}`;
  return {
    url,
    downloadUrl: url,
    fileName,
    sourceId: `${flowId}-${fileName}`,
  };
}

function extractFileName(value: string): string | undefined {
  if (!value) return undefined;
  const sanitized = value.replace(/\\/g, "/");
  const parts = sanitized.split("/");
  return parts.pop() || undefined;
}

type ReferenceEntry = { name: string; path: string };

type ReferenceUploadMutation = (
  payload: { file: File; id: string },
  options?: any,
) => Promise<{ file_path?: string }>;

async function handleReferenceUpload({
  referenceField,
  accept,
  maxEntries,
  allowedExtensions,
  currentFlowId,
  uploadReferenceFile,
  validateFileSize,
  handleReferenceChange,
  setErrorData,
  setReferenceUploadPending,
}: {
  referenceField: InputFieldType;
  accept: string;
  maxEntries: number;
  allowedExtensions: string[];
  currentFlowId: string;
  uploadReferenceFile: ReferenceUploadMutation;
  validateFileSize: (file: File) => void;
  handleReferenceChange: handleOnNewValueType;
  setErrorData: (payload: any) => void;
  setReferenceUploadPending: (loading: boolean) => void;
}) {
  if (!currentFlowId) {
    setErrorData({
      title: "无法上传参考图",
      list: ["请先保存或重新打开画布后再试。"],
    });
    return;
  }

  const files = await createFileUpload({
    multiple: true,
    accept,
  });
  if (!files.length) return;

  for (const file of files) {
    try {
      validateFileSize(file);
    } catch (error) {
      if (error instanceof Error) {
        setErrorData({ title: error.message });
      }
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (
      allowedExtensions.length &&
      (!extension || !allowedExtensions.includes(extension))
    ) {
      setErrorData({
        title: INVALID_FILE_ALERT,
        list: [allowedExtensions.map((ext) => ext.toUpperCase()).join(", ")],
      });
      return;
    }
  }

  setReferenceUploadPending(true);
  try {
    const uploadedEntries: ReferenceEntry[] = [];
    for (const file of files) {
      try {
        const response = await uploadReferenceFile({
          file,
          id: currentFlowId,
        });
        const serverPath = response?.file_path;
        if (!serverPath) {
          throw new Error("缺少文件路径");
        }
        uploadedEntries.push({ name: file.name, path: serverPath });
      } catch (error) {
        console.error(CONSOLE_ERROR_MSG, error);
        setErrorData({
          title: "上传失败",
          list: [
            (error as any)?.response?.data?.detail ??
              "网络异常，稍后再试或检查后端日志。",
          ],
        });
        return;
      }
    }

    if (!uploadedEntries.length) return;

    const existingEntries = collectReferenceEntries(referenceField);
    const mergedEntries = [...existingEntries, ...uploadedEntries];
    const limitedEntries =
      mergedEntries.length > maxEntries
        ? mergedEntries.slice(-maxEntries)
        : mergedEntries;

    handleReferenceChange({
      value: limitedEntries.map((entry) => entry.name),
      file_path: limitedEntries.map((entry) => entry.path),
    });
  } finally {
    setReferenceUploadPending(false);
  }
}

function collectReferenceEntries(field: InputFieldType): ReferenceEntry[] {
  const values = toArray(field.value);
  const paths = toArray(field.file_path);
  const length = Math.max(values.length, paths.length);
  const entries: ReferenceEntry[] = [];
  for (let index = 0; index < length; index += 1) {
    const resolvedPath =
      extractReferenceSource(paths[index]) ??
      (typeof paths[index] === "string" ? (paths[index] as string) : null);
    if (!resolvedPath) continue;
    const rawValue = values[index];
    const resolvedName =
      (typeof rawValue === "string" && rawValue.trim()) ||
      (rawValue && typeof rawValue === "object"
        ? extractReferenceLabel(rawValue)
        : undefined) ||
      extractFileName(resolvedPath) ||
      `参考图 ${index + 1}`;
    entries.push({
      name: resolvedName,
      path: resolvedPath,
    });
  }
  return entries;
}
