import { cloneDeep } from "lodash";
import { type CSSProperties, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import ShortUniqueId from "short-unique-id";
import { type ReactFlowState, useStore, addEdge } from "@xyflow/react";
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
import PromptModal from "@/modals/promptModal";
import DoubaoQuickAddMenu from "./DoubaoQuickAddMenu";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import useHandleOnNewValue, {
  type handleOnNewValueType,
} from "../../hooks/use-handle-new-value";
import useHandleNodeClass from "@/CustomNodes/hooks/use-handle-node-class";
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
import { computeAlignedNodeTopY } from "@/CustomNodes/helpers/previewCenterAlignment";
import { useTypesStore } from "@/stores/typesStore";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import { BASE_URL_API } from "@/constants/constants";
import DoubaoImageCreatorResolutionAspectButton from "./DoubaoImageCreatorResolutionAspectButton";
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
import KlingElementPickerButton from "@/components/kling/KlingElementPickerButton";
import type { KlingElement } from "@/stores/klingElementsStore";
import { generationPromptInputBusyClass } from "./promptGenerationStyles";

const CONTROL_FIELDS = [
  // Requirement: model selector button width -100px.
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[170px] grow-[2]" },
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

const SLASH_QUICK_FEATURES = [
  {
    id: "multi_cam_grid",
    title: "多机位九宫格",
    description: "自动生成多个机位的九宫格分镜参考。",
    icon: "LayoutGrid",
  },
  {
    id: "cinematic_lighting",
    title: "电影级光影校正",
    description: "修正物理光照与色温逻辑，呈现专业电影质感。",
    icon: "Clapperboard",
  },
  {
    id: "character_turnaround",
    title: "角色三视图生成",
    description: "一键生成角色三视图(正面/侧面/背面)。",
    icon: "User",
  },
  {
    id: "simulate_3s_after",
    title: "画面推演 - 3秒后",
    description: "基于物理逻辑，生成3秒后的动作结果。",
    icon: "FastForward",
  },
  {
    id: "simulate_5s_before",
    title: "画面推演 - 5秒前",
    description: "基于物理逻辑，反推5秒前的动作起因。",
    icon: "Rewind",
  },
] as const;

const SLASH_QUICK_FEATURES_DISABLED_TIP = "🚫 请先上传图片才能使用该功能";
type SlashQuickFeatureId = (typeof SLASH_QUICK_FEATURES)[number]["id"];

const SLASH_QUICK_FEATURE_ALIASES: Record<SlashQuickFeatureId, string[]> = {
  multi_cam_grid: ["multi_cam_grid", "多机位九宫格", "九宫格", "分镜"],
  cinematic_lighting: ["cinematic_lighting", "电影级光影校正", "光影校正", "电影级光影"],
  character_turnaround: ["character_turnaround", "角色三视图生成", "角色三视图", "三视图"],
  simulate_3s_after: ["simulate_3s_after", "画面推演 - 3秒后", "画面推演3秒后", "3秒后"],
  simulate_5s_before: ["simulate_5s_before", "画面推演 - 5秒前", "画面推演5秒前", "5秒前"],
};

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitLeadingSlashPrompt(prompt: string): {
  slashPayload: string;
  remainingPrompt: string;
} {
  const raw = String(prompt ?? "");
  const lines = raw.split(/\r?\n/);
  const firstContentLineIndex = lines.findIndex(
    (line) => line.trim().length > 0,
  );
  if (firstContentLineIndex < 0) {
    return { slashPayload: "", remainingPrompt: "" };
  }

  const firstContentLine = lines[firstContentLineIndex].trimStart();
  if (!firstContentLine.startsWith("/")) {
    return { slashPayload: "", remainingPrompt: raw.trim() };
  }

  const slashPayload = firstContentLine.slice(1).trim();
  const remainingLines = [
    ...lines.slice(0, firstContentLineIndex),
    ...lines.slice(firstContentLineIndex + 1),
  ];
  return {
    slashPayload,
    remainingPrompt: remainingLines.join("\n").trim(),
  };
}

function normalizeSlashQuickFeatureTopic(
  payload: string,
  featureId: SlashQuickFeatureId,
): string {
  let next = String(payload ?? "").trim();
  if (!next) return "";

  const aliases = [...(SLASH_QUICK_FEATURE_ALIASES[featureId] ?? [])].sort(
    (a, b) => b.length - a.length,
  );
  aliases.forEach((alias) => {
    const escapedAlias = escapeRegExp(alias.trim());
    if (!escapedAlias) return;
    const prefixPattern = new RegExp(
      `^${escapedAlias}(?:\\s*[:：\\-—]\\s*|\\s+)?`,
      "i",
    );
    next = next.replace(prefixPattern, "").trim();
  });

  return next;
}

function buildSlashQuickFeaturePrompt(
  featureId: SlashQuickFeatureId,
  topic: string,
): string {
  const subjectLine = topic
    ? `主体/主题：${topic}`
    : "主体/主题：保持参考图主体一致";

  switch (featureId) {
    case "multi_cam_grid":
      return [
        "请基于参考图生成“多机位九宫格分镜参考”。",
        subjectLine,
        "要求：九宫格九个画面都保持同一主体与场景连续性，覆盖远景/全景/中景/近景/特写与俯仰角变化；统一色调与光影，构图清晰。",
      ].join("\n");
    case "cinematic_lighting":
      return [
        "请对参考图执行“电影级光影校正”。",
        subjectLine,
        "要求：保持主体与构图不变，重点优化主辅光关系、阴影层次、色温一致性和电影感对比，输出自然真实的电影级质感。",
      ].join("\n");
    case "character_turnaround":
      return [
        "请基于参考图生成“角色三视图”。",
        subjectLine,
        "要求：输出正面/侧面/背面三视图，角色服装与关键细节保持一致，中性背景、均匀光照、比例准确，便于设计与建模参考。",
      ].join("\n");
    case "simulate_3s_after":
      return [
        "请基于参考图进行“画面推演 - 3秒后”。",
        subjectLine,
        "要求：保持主体身份与场景连续，按照物理逻辑推演3秒后的动作结果，给出明确的运动方向、姿态变化和环境反馈。",
      ].join("\n");
    case "simulate_5s_before":
      return [
        "请基于参考图进行“画面推演 - 5秒前”。",
        subjectLine,
        "要求：保持主体身份与场景连续，按物理与叙事逻辑反推5秒前的动作起因，呈现合理的前置动作和状态线索。",
      ].join("\n");
    default:
      return topic;
  }
}

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
  onPersistentPreviewMotionStart?: (motion: {
    deltaTopPx: number;
    deltaCenterPx: number;
    durationMs: number;
    easing: string;
  }) => void;
  onPersistentPreviewMotionCommit?: () => void;
};

export default function DoubaoImageCreatorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
  onPreviewActionsChange,
  onPersistentPreviewMotionStart,
  onPersistentPreviewMotionCommit,
}: DoubaoImageCreatorLayoutProps) {
  const NODE_OFFSET_X = 1300;
  const uid = new ShortUniqueId({ length: 10 });
  const IMAGE_OUTPUT_NAME = "image";
  const TEXT_COMPONENT_NAME = "TextCreation";
  const TEXT_OUTPUT_NAME = "text_output";
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
  const isSeedreamImageModel = selectedModelName.toLowerCase().includes("seedream");
  const isKlingImageModel = selectedModelName.toLowerCase().includes("kling");
  const klingElementIdsValue = String(template.kling_element_ids?.value ?? "").trim();
  const selectedKlingElementIds = useMemo(() => {
    const raw = String(klingElementIdsValue || "");
    const hits = raw.match(/\d+/g) ?? [];
    const ids = hits
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(ids));
  }, [klingElementIdsValue]);
  const klingElementApplied = isKlingImageModel && selectedKlingElementIds.length > 0;
  const supportsGeminiFeatureButtons = isNanoBananaPro;
  const disableRun = !hasAnyConnection && isPromptEmpty;
  const setNodes = useFlowStore((state) => state.setNodes);
  const setEdges = useFlowStore((state) => state.setEdges);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const { handleNodeClass } = useHandleNodeClass(data.id);
  const promptSnapshotTakenRef = useRef(false);
  const [isPromptFocused, setPromptFocused] = useState(false);
  const [isPromptComposing, setIsPromptComposing] = useState(false);
  const [promptCompositionValue, setPromptCompositionValue] = useState<string | null>(null);
  const promptValue = String(template[PROMPT_NAME]?.value ?? "");
  const [promptDraftValue, setPromptDraftValue] = useState(promptValue);

  useEffect(() => {
    if (!showExpanded) {
      promptSnapshotTakenRef.current = false;
    }
  }, [showExpanded]);

  useEffect(() => {
    if (isPromptFocused || isPromptComposing) return;
    setPromptDraftValue(promptValue);
  }, [isPromptComposing, isPromptFocused, promptValue]);

  const resolvedPromptValue = isPromptComposing
    ? (promptCompositionValue ?? promptDraftValue)
    : promptDraftValue;
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
    // Crop-result nodes should only preview their local crop image.
    if ((data as any)?.cropPreviewOnly) return [];
    const incomingEdges = edges?.filter(
      (edge) => edge.target === data.id && edge.targetHandle,
    );
    const collected: InputFieldType[] = [];

    incomingEdges?.forEach((edge) => {
      // Crop tool creates a visual connection that should not contribute additional preview images.
      if ((edge as any)?.data?.cropLink) return;
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
  const promptReferencePreviews = combinedReferencePreviews;
  const visiblePromptReferencePreviews = useMemo<DoubaoReferenceImage[]>(
    () => promptReferencePreviews.slice(0, 6),
    [promptReferencePreviews],
  );
  const localReferenceCount = referencePreviews.length;
  const selectedReferenceCount = combinedReferencePreviews.length;
  const hasAnyReferenceSelected = selectedReferenceCount > 0;
  const disableSlashQuickFeatures = !hasAnyReferenceSelected;

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
  const { handleOnNewValue: handlePromptChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: PROMPT_NAME,
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

  const promptStartsWithSlash = useMemo(() => {
    const raw = String(resolvedPromptValue ?? "");
    return raw.trimStart().startsWith("/");
  }, [resolvedPromptValue]);
  const [isSlashQuickFeaturesOpen, setSlashQuickFeaturesOpen] = useState(false);
  const [slashQuickFeaturesSuppressed, setSlashQuickFeaturesSuppressed] =
    useState(false);
  const slashQuickFeaturesRootRef = useRef<HTMLDivElement | null>(null);
  const slashQuickFeaturesDrawerRef = useRef<HTMLDivElement | null>(null);

  // Auto-open the slash menu while the prompt is focused and starts with "/".
  // ESC / outside-click / blur will close it, but typing again will re-open.
  useEffect(() => {
    if (!showExpanded) {
      setSlashQuickFeaturesOpen(false);
      setSlashQuickFeaturesSuppressed(false);
      return;
    }
    if (!isPromptFocused || !promptStartsWithSlash) {
      setSlashQuickFeaturesOpen(false);
      setSlashQuickFeaturesSuppressed(false);
      return;
    }
    if (!slashQuickFeaturesSuppressed) {
      setSlashQuickFeaturesOpen(true);
    }
  }, [
    isPromptFocused,
    promptStartsWithSlash,
    showExpanded,
    slashQuickFeaturesSuppressed,
  ]);

  useEffect(() => {
    if (!isSlashQuickFeaturesOpen) return;

    const onPointerDownCapture = (event: PointerEvent) => {
      const root = slashQuickFeaturesRootRef.current;
      const drawer = slashQuickFeaturesDrawerRef.current;
      const target = event.target as Node | null;
      if (!root || !target) return;
      if (root.contains(target)) return;
      if (drawer?.contains(target)) return;
      // Defer closing so ReactFlow can start a drag on the same pointerdown.
      queueMicrotask(() => setSlashQuickFeaturesOpen(false));
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setSlashQuickFeaturesOpen(false);
      setSlashQuickFeaturesSuppressed(true);
    };

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("keydown", onKeyDownCapture, true);
    };
  }, [isSlashQuickFeaturesOpen]);

  const stripElementTokens = useCallback((prompt: string) => {
    let next = String(prompt ?? "");
    // Prefer removing token-only lines first (keeps user text intact).
    next = next.replace(/^\s*<<<element_\d+>>>\s*$(\r?\n)?/gim, "");
    // Safety: remove any remaining inline tokens.
    next = next.replace(/<<<element_\d+>>>/g, "");
    // Trim leading blank lines introduced by removals.
    next = next.replace(/^\s*\r?\n/g, "");
    return next;
  }, []);

  const applyKlingElements = useCallback(
    (elements: KlingElement[], options?: { skipSnapshot?: boolean }) => {
      if (!isKlingImageModel) return;
      if (!options?.skipSnapshot) takeSnapshot();
      setNodes((currentNodes) =>
        (currentNodes ?? []).map((node) => {
          if (node.id !== data.id) return node;
          const nodeData: any = (node as any).data ?? {};
          const nodeClass: any = nodeData.node;
          if (!nodeClass) return node;

          const templateRaw: any = nodeClass.template ?? {};
          const nextTemplate: any = { ...templateRaw };

          const patchValue = (fieldName: string, value: any) => {
            const field = nextTemplate?.[fieldName];
            if (!field || typeof field !== "object") return;
            nextTemplate[fieldName] = { ...field, value };
          };

          const currentPrompt = String(nextTemplate[PROMPT_NAME]?.value ?? "");
          const cleaned = stripElementTokens(currentPrompt);

          const ids = (elements ?? []).map((el) => el.element_id).filter((x) => typeof x === "number");
          const idsValue = ids.join(",");
          const tokens = ids.map((_id, idx) => `<<<element_${idx + 1}>>>`).join("\n");
          const nextPrompt = tokens
            ? cleaned.trim().length
              ? `${tokens}\n${cleaned.trimStart()}`
              : tokens
            : cleaned;

          patchValue("kling_element_ids", idsValue);
          patchValue(PROMPT_NAME, nextPrompt);

          return {
            ...node,
            data: {
              ...nodeData,
              node: { ...nodeClass, template: nextTemplate },
            },
          };
        }),
      );
    },
    [data.id, isKlingImageModel, setNodes, stripElementTokens, takeSnapshot],
  );
  const [quickAddMenu, setQuickAddMenu] = useState<{
    x: number;
    y: number;
    kind: "input" | "output";
  } | null>(null);
  const lockedPlusSide = quickAddMenu?.kind
    ? (quickAddMenu.kind === "input" ? "left" : "right")
    : null;

  // Image creator "+" handles: hidden when node is not selected; shown when cursor enters
  // the 212x212 capture zone centered on the default "+" position; selected nodes keep them visible.
  type PlusSide = "left" | "right";
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const leaveGraceTimerRef = useRef<number | null>(null);
  const fadeOutTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [activePlusSide, setActivePlusSide] = useState<PlusSide | null>(null);
  const [visiblePlusSide, setVisiblePlusSide] = useState<PlusSide | null>(null);
  // Note: we intentionally compute alignment at creation time to avoid extra renders (less jank).
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

  // Sync the external "+" handles with the preview frame aspect ratio animation (avoid end-of-animation jumps).
  const leftHandleMotionRef = useRef<HTMLDivElement | null>(null);
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

      const targets = [leftHandleMotionRef.current, rightHandlesMotionRef.current].filter(
        Boolean,
      ) as HTMLElement[];
      if (!targets.length) return;

      for (const el of targets) {
        if (typeof el.animate !== "function") continue;
        const anim = el.animate(
          [{ transform: "translateY(0px)" }, { transform: `translateY(${motion.deltaCenterPx}px)` }],
          { duration: motion.durationMs, easing: motion.easing, fill: "both" },
        );
        previewHandleAnimsRef.current.push(anim);
        // Keep final transform until the preview panel commits its layout; we'll clear on commit callback.
        anim.onfinish = () => {
          el.style.transform = `translateY(${motion.deltaCenterPx}px)`;
          try {
            anim.cancel();
          } catch {
            // ignore
          }
        };
      }

      onPersistentPreviewMotionStart?.(motion);
    },
    [clearPreviewHandleAnims, onPersistentPreviewMotionStart],
  );

  const handlePersistentPreviewMotionCommit = useCallback(() => {
    const targets = [leftHandleMotionRef.current, rightHandlesMotionRef.current].filter(
      Boolean,
    ) as HTMLElement[];
    for (const el of targets) {
      el.style.transform = "";
    }
    clearPreviewHandleAnims();
    onPersistentPreviewMotionCommit?.();
  }, [clearPreviewHandleAnims, onPersistentPreviewMotionCommit]);

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
  const promptReadonly = Boolean(data.node?.flow) || isBusy;

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
    const current = String(template.resolution?.value ?? "");
    const options = Array.isArray(template.resolution?.options)
      ? template.resolution.options
      : [];
    const supportsAuto = options.some((opt) => String(opt) === "Auto");

    // Nano Banana doesn't support image_size; keep it at Auto (if Auto is available in options).
    if (isNanoBanana && supportsAuto) {
      if (current !== "Auto") {
        handleResolutionChange({ value: "Auto" }, { skipSnapshot: true });
      }
      return;
    }

    // If Auto is currently selected but the model doesn't offer it, move to a non-Auto fallback.
    if (!isNanoBanana && current === "Auto" && !supportsAuto) {
      const fallback =
        template.resolution?.default ??
        options.find((opt) => String(opt) !== "Auto") ??
        options[0];
      if (fallback !== undefined && fallback !== null && String(fallback) !== current) {
        handleResolutionChange({ value: fallback }, { skipSnapshot: true });
      }
    }
  }, [
    isNanoBanana,
    template.resolution?.default,
    template.resolution?.options,
    template.resolution?.value,
    handleResolutionChange,
  ]);

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
      ? "Loader2"
      : "Play";

  const handleSlashQuickFeatureSelect = useCallback(
    (featureId: SlashQuickFeatureId) => {
      if (disableSlashQuickFeatures) return;

      const { slashPayload, remainingPrompt } = splitLeadingSlashPrompt(
        String(resolvedPromptValue ?? ""),
      );
      const normalizedTopic = normalizeSlashQuickFeatureTopic(
        slashPayload,
        featureId,
      );
      const featurePrompt = buildSlashQuickFeaturePrompt(
        featureId,
        normalizedTopic,
      );
      const nextPrompt = remainingPrompt
        ? `${featurePrompt}\n\n${remainingPrompt}`
        : featurePrompt;

      takeSnapshot();
      setIsPromptComposing(false);
      setPromptCompositionValue(null);
      setPromptDraftValue(nextPrompt);
      setSlashQuickFeaturesOpen(false);
      setSlashQuickFeaturesSuppressed(true);
      handlePromptChange({ value: nextPrompt }, { skipSnapshot: true });

      if (isBusy) return;

      // Let prompt state commit first; otherwise validation may see stale empty prompt
      // and exit before entering BUILDING status (which hides loading animations).
      window.requestAnimationFrame(() => {
        const flowState = useFlowStore.getState();
        const latestNode = flowState.getNode(data.id);
        const latestPrompt = String(
          ((latestNode?.data as any)?.node?.template?.[PROMPT_NAME]?.value ?? ""),
        ).trim();
        const latestHasConnection = flowState.edges.some(
          (edge) => edge.source === data.id || edge.target === data.id,
        );
        if (!latestHasConnection && latestPrompt.length === 0) return;

        flowState.clearFlowPoolForNodes([nodeIdForRun]);
        void flowState.buildFlow({
          stopNodeId: data.id,
          eventDelivery: eventDeliveryConfig,
        });
        track("Flow Build - Clicked", {
          stopNodeId: data.id,
          trigger: "slash_quick_feature",
          featureId,
        });
      });
    },
    [
      disableSlashQuickFeatures,
      resolvedPromptValue,
      takeSnapshot,
      isBusy,
      nodeIdForRun,
      data.id,
      eventDeliveryConfig,
      handlePromptChange,
    ],
  );

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
        // Add commonly supported ratios based on model capabilities (per docs / upstream support),
        // but do not introduce unsupported knobs for models.
        const extraRatios: Array<string> = [];
        if (isGeminiImageModel) {
          extraRatios.push("21:9", "4:5", "5:4");
        }
        if (isWanModel || isSeedreamImageModel || isKlingImageModel) {
          extraRatios.push("21:9");
        }
        if (extraRatios.length) {
          options = Array.from(new Set([...options, ...extraRatios]));
        }

        // Nano Banana supports 4:5, 5:4.
        // Wan, Nano Banana, Seedream, Kling support 21:9.
        const bananaExclusiveRatios = new Set(["4:5", "5:4"]);
        const wideRatios = new Set(["21:9"]);

        options = options.filter((opt) => {
          const optStr = String(opt);

          // 4:5, 5:4 -> Only for Gemini (Nano Banana)
          if (bananaExclusiveRatios.has(optStr)) {
            return isGeminiImageModel;
          }

          // 21:9 -> Wan OR Gemini OR Seedream
          if (wideRatios.has(optStr)) {
            return isWanModel || isGeminiImageModel || isSeedreamImageModel || isKlingImageModel;
          }

          // adaptive -> Kling always (maps to upstream "auto"); others require reference.
          const isAdaptiveAllowed =
            isKlingImageModel ||
            ((isWanModel || isGeminiImageModel || isSeedreamImageModel) &&
              hasAnyReferenceSelected);

          if (optStr.toLowerCase() === "adaptive" && !isAdaptiveAllowed) {
            return false;
          }
          return true;
        });
      }
      if (field.name === "resolution" && isNanoBanana) {
        // Nano Banana doesn't support image_size; we expose a single "Auto" toggle as UI affordance.
        if (!options.some((opt) => String(opt) === "Auto")) {
          options = ["Auto", ...options];
        }
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
          return isNanoBanana ? options.filter((opt) => String(opt) !== "Auto") : undefined;
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
    isSeedreamImageModel,
    isKlingImageModel,
    edgeImageCountLimit,
  ]);

  const modelNameConfig = controlConfigs.find((config) => config.name === "model_name");
  const resolutionConfig = controlConfigs.find((config) => config.name === "resolution");
  const aspectRatioConfig = controlConfigs.find((config) => config.name === "aspect_ratio");
  const imageCountConfig = controlConfigs.find((config) => config.name === "image_count");

  // When references are present and the model supports "adaptive" aspect ratio,
  // default to it (avoid overriding explicit user choices).
  const prevHasAnyReferenceSelectedRef = useRef(false);
  useEffect(() => {
    const becameSelected =
      hasAnyReferenceSelected && !prevHasAnyReferenceSelectedRef.current;
    prevHasAnyReferenceSelectedRef.current = hasAnyReferenceSelected;
    if (!hasAnyReferenceSelected) return;
    if (!aspectRatioConfig) return;

    const hasAdaptiveOption = aspectRatioConfig.options.some(
      (opt) => String(opt).trim().toLowerCase() === "adaptive",
    );
    if (!hasAdaptiveOption) return;

    const currentRaw = String(template.aspect_ratio?.value ?? "").trim();
    if (currentRaw.toLowerCase() === "adaptive") return;

    // Only auto-set when we're still effectively at the default (or unset), or when a model refresh
    // produced an invalid value under the new option set.
    const defaultRaw = String(
      template.aspect_ratio?.default ?? aspectRatioConfig.options[0] ?? "",
    ).trim();
    const isUnset = currentRaw.length === 0;
    const isDefault =
      defaultRaw.length > 0 && currentRaw.length > 0 && currentRaw === defaultRaw;
    const isFirstOption =
      aspectRatioConfig.options.length > 0 &&
      currentRaw.length > 0 &&
      currentRaw === String(aspectRatioConfig.options[0]).trim();
    const isInvalid =
      currentRaw.length > 0 &&
      !aspectRatioConfig.options.some((opt) => String(opt).trim() === currentRaw);

    // If a reference was just added, only switch when the user is still on default-ish ratio.
    if (becameSelected && !(isUnset || isDefault || isFirstOption)) return;

    if (isUnset || isDefault || isFirstOption || isInvalid || becameSelected) {
      handleAspectRatioChange({ value: "adaptive" }, { skipSnapshot: true });
    }
  }, [
    aspectRatioConfig,
    handleAspectRatioChange,
    hasAnyReferenceSelected,
    template.aspect_ratio?.default,
    template.aspect_ratio?.value,
  ]);

  const modelNameConfigWithReferencePreserve = useMemo(() => {
    if (!modelNameConfig) return null;
    return {
      ...modelNameConfig,
      handleOnNewValueOptions: () => {
        const currentReference = template?.[REFERENCE_FIELD];
        const preserveValue = currentReference?.value;
        const preserveFilePath = currentReference?.file_path;

        return {
          setNodeClass: (newNodeClass) => {
            // Preserve uploaded reference images across model refresh (server returns a new template).
            const nextRef = newNodeClass?.template?.[REFERENCE_FIELD];
            if (!nextRef) return;
            if (preserveValue !== undefined) nextRef.value = preserveValue;
            if (preserveFilePath !== undefined) nextRef.file_path = preserveFilePath;
          },
        };
      },
    };
  }, [modelNameConfig, template]);

  const multiTurnEnabled = Boolean(template?.[MULTI_TURN_FIELD]?.value);
  const onlineSearchEnabled = Boolean(template?.[ONLINE_SEARCH_FIELD]?.value);

  const toggleMultiTurn = useCallback(() => {
    handleMultiTurnChange({ value: !multiTurnEnabled });
  }, [handleMultiTurnChange, multiTurnEnabled]);

  const toggleOnlineSearch = useCallback(() => {
    handleOnlineSearchChange({ value: !onlineSearchEnabled });
  }, [handleOnlineSearchChange, onlineSearchEnabled]);

  const maxReferenceEntries = useMemo(() => {
    const defaultLimit = isWanModel
      ? 4
      : isNanoBanana
        ? 3
        : isKlingImageModel
          ? 10
          : MAX_REFERENCE_IMAGES;
    const explicitLimit =
      (typeof referenceField?.max_length === "number" && referenceField?.max_length) ||
      (typeof referenceField?.max_files === "number" && referenceField?.max_files) ||
      (typeof referenceField?.list_max === "number" && referenceField?.list_max);
    if (typeof explicitLimit === "number" && explicitLimit > 0) {
      return edgeImageCountLimit ? Math.min(explicitLimit, edgeImageCountLimit) : explicitLimit;
    }
    return edgeImageCountLimit ? Math.min(defaultLimit, edgeImageCountLimit) : defaultLimit;
  }, [referenceField, isWanModel, isNanoBanana, isKlingImageModel, edgeImageCountLimit]);
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

  const handleCreateImg2ImgDownstreamNode = useCallback((forceNew = false) => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    if (!forceNew) {
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
        requestUploadDialogForNode(existingDownstreamNodeId);
        return;
      }
    }

    const imageComponentTemplate = templates["DoubaoImageCreator"];
    if (!imageComponentTemplate) return;

    const referenceTemplateField = imageComponentTemplate.template?.[REFERENCE_FIELD];
    if (!referenceTemplateField) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const newNodeX = currentNode.position.x + NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: "DoubaoImageCreator",
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
    const newImageNode: GenericNodeType = {
      id: newImageNodeId,
      type: "genericNode",
      position: {
        x: newNodeX,
        y: newNodeY,
      },
      data: {
        node: cloneDeep(imageComponentTemplate),
        showNode: !imageComponentTemplate.minimized,
        type: "DoubaoImageCreator",
        id: newImageNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newImageNode]);

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

    const edge = {
      id: `xy-edge__${data.id}-${sourceHandle.name}-${newImageNodeId}-${targetHandle.fieldName}`,
      source: data.id,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      target: newImageNodeId,
      targetHandle: scapedJSONStringfy(targetHandle),
      type: "default",
      data: {
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
      },
    } as EdgeType;

    setEdges((prev) => [...prev, edge]);

    queueMicrotask(() => requestUploadDialogForNode(newImageNodeId));

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
    // onConnect,
    setNodes,
    setEdges,
    takeSnapshot,
    templates,
    requestUploadDialogForNode,
  ]);

  const handleCreateTextUpstreamNode = useCallback(() => {
    console.log("[DEBUG] handleCreateTextUpstreamNode - START");

    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) {
      console.log("[DEBUG] Early return: currentNode not found");
      return;
    }

    const promptTemplateField = template[PROMPT_NAME];
    if (!promptTemplateField) {
      console.log("[DEBUG] Early return: promptTemplateField not found");
      return;
    }

    const existingUpstreamNodeId = edges
      .map((edge) => {
        if (edge.target !== data.id) return null;

        const sourceNode = nodes.find((node) => node.id === edge.source);
        if (sourceNode?.data?.type !== TEXT_COMPONENT_NAME) return null;
        if (sourceNode.position.x >= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== PROMPT_NAME) return null;

        return sourceNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingUpstreamNodeId) {
      console.log("[DEBUG] Early return: existingUpstreamNodeId found:", existingUpstreamNodeId);
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingUpstreamNodeId,
        })),
      );
      return;
    }

    const textTemplate = templates[TEXT_COMPONENT_NAME];
    if (!textTemplate) {
      console.log("[DEBUG] Early return: textTemplate not found for", TEXT_COMPONENT_NAME);
      return;
    }

    console.log("[DEBUG] Proceeding to create new TextCreation node");

    takeSnapshot();

    const newTextNodeId = getNodeId(TEXT_COMPONENT_NAME);
    const newNodeX = currentNode.position.x - NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: TEXT_COMPONENT_NAME,
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
    const newTextNode: GenericNodeType = {
      id: newTextNodeId,
      type: "genericNode",
      position: {
        x: newNodeX,
        y: newNodeY,
      },
      data: {
        node: cloneDeep(textTemplate),
        showNode: !textTemplate.minimized,
        type: TEXT_COMPONENT_NAME,
        id: newTextNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newTextNode]);

    const outputDefinition =
      textTemplate.outputs?.find((output) => output.name === TEXT_OUTPUT_NAME) ??
      textTemplate.outputs?.find((output) => !output.hidden) ??
      textTemplate.outputs?.[0];

    const sourceHandle = {
      output_types: outputDefinition?.types?.length ? outputDefinition.types : ["Data"],
      id: newTextNodeId,
      dataType: TEXT_COMPONENT_NAME,
      name: outputDefinition?.name ?? TEXT_OUTPUT_NAME,
    };

    const targetHandle = {
      inputTypes: promptTemplateField.input_types,
      type: promptTemplateField.type,
      id: data.id,
      fieldName: PROMPT_NAME,
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    // Delay edge creation to ensure the new node is fully rendered
    setTimeout(() => {
      // Use onConnect - the standard ReactFlow method for creating edges
      onConnect({
        source: newTextNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    }, 200);

    track("DoubaoImageCreator - Create Text Upstream Node", {
      sourceNodeId: newTextNodeId,
      targetNodeId: data.id,
      sourceComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    NODE_OFFSET_X,
    PROMPT_NAME,
    TEXT_COMPONENT_NAME,
    TEXT_OUTPUT_NAME,
    data.id,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    template,
    templates,
  ]);

  const handleCreateTextDownstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const textTemplate = templates[TEXT_COMPONENT_NAME];
    if (!textTemplate) return;

    const draftTemplateField = textTemplate.template?.draft_text;
    if (!draftTemplateField) return;

    const existingDownstreamNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== TEXT_COMPONENT_NAME) return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== "draft_text") return null;

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
      return;
    }

    takeSnapshot();

    const newTextNodeId = getNodeId(TEXT_COMPONENT_NAME);
    const seededTextTemplate = cloneDeep(textTemplate);
    const geminiModel = seededTextTemplate.template?.model_name?.options?.find((opt) =>
      String(opt).startsWith("gemini-"),
    );
    if (geminiModel && seededTextTemplate.template?.model_name) {
      seededTextTemplate.template.model_name.value = geminiModel;
    }

    const newTextNode: GenericNodeType = {
      id: newTextNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x + NODE_OFFSET_X,
        y: computeAlignedNodeTopY({
          anchorNodeId: data.id,
          anchorNodeType: data.type,
          targetNodeType: TEXT_COMPONENT_NAME,
          targetX: currentNode.position.x + NODE_OFFSET_X,
          fallbackTopY: currentNode.position.y,
          stepY: 160,
          avoidOverlap: true,
        }),
      },
      data: {
        node: seededTextTemplate,
        showNode: !seededTextTemplate.minimized,
        type: TEXT_COMPONENT_NAME,
        id: newTextNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newTextNode]);

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
      inputTypes: draftTemplateField.input_types,
      type: draftTemplateField.type,
      id: newTextNodeId,
      fieldName: "draft_text",
      ...(draftTemplateField.proxy ? { proxy: draftTemplateField.proxy } : {}),
    };

    const edge = {
      id: `xy-edge__${data.id}-${sourceHandle.name}-${newTextNodeId}-${targetHandle.fieldName}`,
      source: data.id,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      target: newTextNodeId,
      targetHandle: scapedJSONStringfy(targetHandle),
      type: "default",
      data: {
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
      },
    } as EdgeType;

    setEdges((prev) => [...prev, edge]);

    track("DoubaoImageCreator - Create Text Downstream Node", {
      sourceNodeId: data.id,
      targetNodeId: newTextNodeId,
      targetComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    IMAGE_OUTPUT_NAME,
    NODE_OFFSET_X,
    TEXT_COMPONENT_NAME,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    // onConnect,
    setEdges,
    setNodes,
    takeSnapshot,
    templates,
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
    const seededVideoTemplate = cloneDeep(videoTemplate);
    // "参考图生视频": pick a model that supports the "reference" role.
    if (imageRole === "reference") {
      const modelField = seededVideoTemplate?.template?.model_name;
      const modelOptions = Array.isArray(modelField?.options) ? modelField.options : [];
      const preferred = modelOptions.find((option) =>
        getImageRoleLimits(String(option ?? "")).allowedRoles.includes("reference"),
      );
      if (preferred && modelField) {
        modelField.value = preferred;
      }
    }
    const newVideoNode: GenericNodeType = {
      id: newVideoNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x + NODE_OFFSET_X,
        y: computeAlignedNodeTopY({
          anchorNodeId: data.id,
          anchorNodeType: data.type,
          targetNodeType: "DoubaoVideoGenerator",
          targetX: currentNode.position.x + NODE_OFFSET_X,
          fallbackTopY: currentNode.position.y,
          stepY: 160,
          avoidOverlap: true,
        }),
      },
      data: {
        node: seededVideoTemplate,
        showNode: !videoTemplate.minimized,
        type: "DoubaoVideoGenerator",
        id: newVideoNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newVideoNode]);

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

    const edge = {
      id: `xy-edge__${data.id}-${sourceHandle.name}-${newVideoNodeId}-${targetHandle.fieldName}`,
      source: data.id,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      target: newVideoNodeId,
      targetHandle: scapedJSONStringfy(targetHandle),
      type: "default",
      data: {
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
        ...(imageRole ? { imageRole } : {}),
      },
    } as EdgeType;

    setEdges((prev) => [...prev, edge]);

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
    // onConnect,
    setEdges,
    setNodes,
    takeSnapshot,
    templates,
    openUploadDialog,
  ]);

  const handleCreateBackgroundUpstreamNode = useCallback((forceNew = false) => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const referenceTemplateField = template[REFERENCE_FIELD];
    if (!referenceTemplateField) return;

    if (!forceNew) {
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
            selected: node.id === existingUpstreamNodeId,
          })),
        );
        requestUploadDialogForNode(existingUpstreamNodeId);
        return;
      }
    }

    const imageTemplate = templates["DoubaoImageCreator"];
    if (!imageTemplate) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const newNodeX = currentNode.position.x - NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: "DoubaoImageCreator",
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
    const newImageNode: GenericNodeType = {
      id: newImageNodeId,
      type: "genericNode",
      position: {
        x: newNodeX,
        y: newNodeY,
      },
      data: {
        node: cloneDeep(imageTemplate),
        showNode: !imageTemplate.minimized,
        type: "DoubaoImageCreator",
        id: newImageNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newImageNode]);

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

    const edge = {
      id: `xy-edge__${newImageNodeId}-${sourceHandle.name}-${data.id}-${targetHandle.fieldName}`,
      source: newImageNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      target: data.id,
      targetHandle: scapedJSONStringfy(targetHandle),
      type: "default",
      data: {
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
      },
    } as EdgeType;

    setEdges((prev) => [...prev, edge]);

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
    // onConnect,
    setEdges,
    setNodes,
    takeSnapshot,
    template,
    templates,
    requestUploadDialogForNode,
  ]);

  const handlePreviewSuggestionClickWithVideo = useCallback(
    (label: string) => {
      if (label === "以图生图") {
        handleCreateImg2ImgDownstreamNode(true);
        return;
      }
      if (label === REFERENCE_VIDEO_LABEL || label === FIRST_FRAME_VIDEO_LABEL) {
        const role: EdgeImageRole = label === FIRST_FRAME_VIDEO_LABEL ? "first" : "reference";
        handleCreateReferenceVideoDownstreamNode(role);
        return;
      }
      if (label === BACKGROUND_LABEL) {
        handleCreateBackgroundUpstreamNode(true);
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

  const quickAddTitle =
    quickAddMenu?.kind === "input" ? "添加上下文：" : "下游组件链接：";
  const quickAddItems = useMemo(() => {
    if (!quickAddMenu) return [];

    if (quickAddMenu.kind === "input") {
      return [
        {
          key: "text-upstream",
          label: "文本创作",
          icon: "ToyBrick",
          onSelect: handleCreateTextUpstreamNode,
        },
        {
          key: "image-upstream",
          label: "图片创作",
          icon: "Image",
          onSelect: () => handleCreateBackgroundUpstreamNode(true),
        },
      ];
    }

    return [
      {
        key: "video-downstream",
        label: "视频创作",
        icon: "Clapperboard",
        onSelect: () => handleCreateReferenceVideoDownstreamNode(),
      },
      {
        key: "image-downstream",
        label: "图片创作",
        icon: "Image",
        // Always create a new downstream image creator (do not reuse existing one).
        onSelect: () => handleCreateImg2ImgDownstreamNode(true),
      },
      {
        key: "text-downstream",
        label: "文本创作",
        icon: "ToyBrick",
        onSelect: handleCreateTextDownstreamNode,
      },
    ];
  }, [
    handleCreateBackgroundUpstreamNode,
    handleCreateImg2ImgDownstreamNode,
    handleCreateReferenceVideoDownstreamNode,
    handleCreateTextDownstreamNode,
    handleCreateTextUpstreamNode,
    quickAddMenu,
  ]);

  const [_, startTransition] = useTransition();
  const componentRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number>(0);

  useEffect(() => {
    if (!componentRef.current || !data.id) return;

    const nodeElement = componentRef.current;

    // Initialize prevHeight with current height
    prevHeightRef.current = nodeElement.offsetHeight;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize if available for better accuracy, fallback to contentRect or offsetHeight
        const currentHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;

        // We compare against the last observed height
        const prevHeight = prevHeightRef.current;

        // If height changed significantly (ignore sub-pixel noise)
        if (Math.abs(currentHeight - prevHeight) > 1) {
          const delta = currentHeight - prevHeight;

          // Update ref immediately for next frame
          prevHeightRef.current = currentHeight;

          // Apply Y-correction synchronously-ish via state used in transition
          // Note: We need to update the node position in the ReactFlow store
          startTransition(() => {
            setNodes((nodes) =>
              nodes.map((node) => {
                if (node.id === data.id) {
                  return {
                    ...node,
                    position: {
                      ...node.position,
                      y: node.position.y - delta,
                    },
                  };
                }
                return node;
              })
            );
          });
        }
      }
    });

    resizeObserver.observe(nodeElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setNodes, data.id]);

  return (
    <div
      ref={componentRef}
      className="relative flex flex-col gap-4 px-4 pb-4 transition-all duration-300 ease-in-out"
    >

      {quickAddMenu && (
        <DoubaoQuickAddMenu
          open={Boolean(quickAddMenu)}
          position={{ x: quickAddMenu.x, y: quickAddMenu.y }}
          title={quickAddTitle}
          items={quickAddItems}
          onOpenChange={(open) => {
            if (!open) {
              setQuickAddMenu(null);
              // Release the lock so the "+" bubble can fade out normally.
              setActivePlusSide(null);
            }
          }}
        />
      )}

      {/* Preview */}

      <div className="relative flex flex-col gap-4 lg:flex-row">
        {referenceHandleMeta && (
          <div className="absolute left-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:block">
            <div ref={leftHandleMotionRef}>
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
                visible={selected || visiblePlusSide === "left" || lockedPlusSide === "left"}
                isTracking={activePlusSide === "left" || lockedPlusSide === "left"}
                clickMode="menu"
                onMenuRequest={({ x, y, kind }) => {
                  clearPlusTimers();
                  setVisiblePlusSide("left");
                  setActivePlusSide("left");
                  setQuickAddMenu({ x, y, kind });
                }}
                onPlusPointerEnter={(event) =>
                  lockedPlusSide
                    ? undefined
                    : showPlusForSide("left", event.clientX, event.clientY)
                }
                onPlusPointerMove={(event) =>
                  lockedPlusSide
                    ? undefined
                    : updatePlusOffset("left", event.clientX, event.clientY)
                }
                onPlusPointerLeave={(event) =>
                  lockedPlusSide
                    ? undefined
                    : startHidePlus("left", event.clientX, event.clientY)
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
          </div>
        )}
        <div
          ref={previewWrapRef}
          className="relative flex-1"
          data-preview-wrap="doubao"
        >
          {/* Hover/capture zones: a 212x212 square centered on the default "+" center point. */}
          <div
            className="absolute left-0 top-1/2 z-[800] hidden h-[212px] w-[212px] -translate-x-full -translate-y-1/2 lg:block"
            onPointerEnter={(event) =>
              quickAddMenu
                ? undefined
                : showPlusForSide("left", event.clientX, event.clientY)
            }
            onPointerMove={(event) =>
              quickAddMenu
                ? undefined
                : updatePlusOffset("left", event.clientX, event.clientY)
            }
            onPointerLeave={(event) =>
              quickAddMenu
                ? undefined
                : startHidePlus("left", event.clientX, event.clientY)
            }
          />
          <div
            className="absolute left-full top-1/2 z-[800] hidden h-[212px] w-[212px] -translate-y-1/2 lg:block"
            onPointerEnter={(event) =>
              quickAddMenu
                ? undefined
                : showPlusForSide("right", event.clientX, event.clientY)
            }
            onPointerMove={(event) =>
              quickAddMenu
                ? undefined
                : updatePlusOffset("right", event.clientX, event.clientY)
            }
            onPointerLeave={(event) =>
              quickAddMenu
                ? undefined
                : startHidePlus("right", event.clientX, event.clientY)
            }
          />
          <DoubaoPreviewPanel
            nodeId={data.id}
            componentName={data.type}
            appearance="imageCreator"
            referenceImages={[]}
            onRequestUpload={openUploadDialog}
            onSuggestionClick={handlePreviewSuggestionClickWithVideo}
            onActionsChange={onPreviewActionsChange}
            aspectRatio={String(
              template.aspect_ratio?.value ??
                template.aspect_ratio?.default ??
                "adaptive",
            )}
            onPersistentPreviewMotionStart={handlePersistentPreviewMotionStart}
            onPersistentPreviewMotionCommit={handlePersistentPreviewMotionCommit}
          />
        </div>
        {previewOutputHandles.length > 0 && (
          <div
            className={cn(
              "absolute right-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-start",
            )}
          >
            <div ref={rightHandlesMotionRef}>
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
                    visible={selected || visiblePlusSide === "right" || lockedPlusSide === "right"}
                    isTracking={activePlusSide === "right" || lockedPlusSide === "right"}
                    clickMode="menu"
                    onMenuRequest={({ x, y, kind }) => {
                      setVisiblePlusSide("right");
                      setActivePlusSide("right");
                      setQuickAddMenu({ x, y, kind });
                    }}
                    onPlusPointerEnter={(event) =>
                      lockedPlusSide
                        ? undefined
                        : showPlusForSide("right", event.clientX, event.clientY)
                    }
                    onPlusPointerMove={(event) =>
                      lockedPlusSide
                        ? undefined
                        : updatePlusOffset("right", event.clientX, event.clientY)
                    }
                    onPlusPointerLeave={(event) =>
                      lockedPlusSide
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


      {/* Prompt/config container (floating overlay; must not change node height) */}
      {showExpanded && (
      <div className="nodrag pointer-events-auto absolute left-0 right-0 top-full z-[1600]">
        <div
          className={cn(
            "relative mt-4 rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)]",
            "transition-colors transition-shadow duration-200 ease-out dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_25px_50px_rgba(0,0,0,0.30)]",
            // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
            "transform-gpu origin-top scale-[var(--inv-zoom)]",
          )}
          style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
          ref={slashQuickFeaturesRootRef}
        >
          <SlashQuickFeaturesDrawer
            open={isSlashQuickFeaturesOpen}
            disabled={disableSlashQuickFeatures}
            anchorRef={slashQuickFeaturesRootRef}
            drawerRef={slashQuickFeaturesDrawerRef}
            onSelect={handleSlashQuickFeatureSelect}
          />

          <PromptModal
            id={`doubao-image-prompt-${data.id}`}
            field_name={PROMPT_NAME}
            readonly={promptReadonly}
            value={promptValue}
              setValue={(newValue) => handlePromptChange({ value: newValue })}
              nodeClass={data.node!}
              setNodeClass={handleNodeClass}
            >
              <button
                type="button"
                aria-label="放大输入"
                title="放大输入"
                className={cn(
                  // Keep the expand button and the run button on the same vertical line.
                  "absolute right-6 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full",
                  "bg-[#F4F5F9] text-[#3C4057] transition-colors hover:bg-[#E9ECF6]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7BFF]/30",
                  "dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15",
                )}
              >
                <ForwardedIconComponent name="Scan" className="h-4 w-4" />
              </button>
            </PromptModal>

            <div className="text-sm text-[#3C4057] dark:text-slate-100">
              <div className="flex min-h-[168px] flex-col gap-3">
                {promptReferencePreviews.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {visiblePromptReferencePreviews.map((preview, index) => {
                      const previewSource =
                        preview.imageSource ?? preview.downloadSource ?? "";
                      return (
                        <div
                          key={preview.id ?? `${previewSource}-${index}`}
                          className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#E2E7F5] bg-[#F4F6FB] dark:border-white/15 dark:bg-white/10"
                        >
                          {previewSource ? (
                            <img
                              src={previewSource}
                              alt={preview.label ?? preview.fileName ?? `参考图 ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#7D85A8] dark:text-slate-300">
                              <ForwardedIconComponent name="Image" className="h-4 w-4" />
                            </div>
                          )}
                          {index === 0 && promptReferencePreviews.length > 1 && (
                            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#1B66FF] px-1 text-center text-[10px] font-semibold leading-5 text-white shadow">
                              {promptReferencePreviews.length}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {promptReferencePreviews.length > visiblePromptReferencePreviews.length && (
                      <span className="inline-flex h-16 items-center rounded-xl border border-dashed border-[#D7DEEF] px-2 text-xs text-[#5E6484] dark:border-white/20 dark:text-slate-300">
                        +{promptReferencePreviews.length - visiblePromptReferencePreviews.length}
                      </span>
                    )}
                  </div>
                )}
                <textarea
                rows={3}
                value={resolvedPromptValue}
                disabled={isBusy}
                readOnly={promptReadonly}
                placeholder="描述你想要生成的内容，并在下方调整生成参数。（按下 Enter 生成，Shift+Enter 换行）"
                className={cn(
                  "nopan nodelete nodrag noflow nowheel custom-scroll w-full resize-none",
                  "min-h-[72px] max-h-[72px] overflow-y-auto",
                  "border-0 bg-transparent p-0 pr-20 text-sm leading-6 text-[#1C202D] focus:outline-none",
                  "placeholder:text-[#9CA3C0]",
                  generationPromptInputBusyClass(isBusy),
                  klingElementApplied && "bg-[#FFF7D6] dark:bg-amber-500/15",
                  "dark:text-white dark:placeholder:text-slate-400",
                )}
                onFocus={() => {
                  setPromptFocused(true);
                  setSlashQuickFeaturesSuppressed(false);
                  if (!promptSnapshotTakenRef.current) {
                    takeSnapshot();
                    promptSnapshotTakenRef.current = true;
                  }
                }}
                onBlur={() => {
                  // Defer to avoid interfering with ReactFlow drag initiation on the same pointer event.
                  queueMicrotask(() => {
                    setPromptFocused(false);
                    setSlashQuickFeaturesOpen(false);
                    setSlashQuickFeaturesSuppressed(false);
                  });
                }}
                onChange={(e) => {
                  const next = e.target.value;
                  setPromptDraftValue(next);
                  setSlashQuickFeaturesSuppressed(false);
                  if (next.trimStart().startsWith("/")) {
                    setSlashQuickFeaturesOpen(true);
                  } else {
                    setSlashQuickFeaturesOpen(false);
                  }
                  if (isPromptComposing) {
                    setPromptCompositionValue(next);
                    return;
                  }
                  setPromptCompositionValue(null);
                  handlePromptChange({ value: next }, { skipSnapshot: true });
                }}
                onCompositionStart={() => {
                  setIsPromptComposing(true);
                }}
                onCompositionEnd={(e) => {
                  setIsPromptComposing(false);
                  const finalValue = promptCompositionValue ?? e.currentTarget.value;
                  setPromptCompositionValue(null);
                  setPromptDraftValue(finalValue);
                  handlePromptChange({ value: finalValue }, { skipSnapshot: true });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setSlashQuickFeaturesOpen(false);
                    setSlashQuickFeaturesSuppressed(true);
                    return;
                  }
                  if (e.key !== "Enter" || e.shiftKey) return;
                  if ((e.nativeEvent as any)?.isComposing || isPromptComposing) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (!disableRun) handleRun();
                }}
                />

                <div className="mt-auto flex flex-wrap gap-3 pt-2">
              {modelNameConfigWithReferencePreserve && (
                <DoubaoParameterButton data={data} config={modelNameConfigWithReferencePreserve} />
              )}

              {resolutionConfig && aspectRatioConfig ? (
                <DoubaoImageCreatorResolutionAspectButton
                  data={data}
                  resolutionConfig={resolutionConfig}
                  aspectRatioConfig={aspectRatioConfig}
                  isNanoBanana={isNanoBanana}
                  disabled={isBusy}
                  widthClass="basis-[210px]"
                />
              ) : (
                <>
                  {resolutionConfig && (
                    <DoubaoParameterButton data={data} config={resolutionConfig} />
                  )}
                  {aspectRatioConfig && (
                    <DoubaoParameterButton data={data} config={aspectRatioConfig} />
                  )}
                </>
              )}

              {imageCountConfig && (
                <DoubaoParameterButton data={data} config={imageCountConfig} />
              )}

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

              <div className="ml-auto flex items-center gap-3">
                {isKlingImageModel && (
                  <KlingElementPickerButton
                    disabled={isBusy}
                    selectedElementIds={selectedKlingElementIds}
                    onPick={applyKlingElements}
                  />
                )}

                <button
                  type="button"
                  disabled={disableRun}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full text-white",
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
              <div className="space-y-3 rounded-2xl bg-[#F7F9FF] p-4 transition-colors duration-200 ease-out dark:border dark:border-white/20 dark:bg-neutral-800/75 dark:backdrop-blur-xl">
                <p className="text-sm font-medium text-foreground">
                  选择要上传的图片（支持多选）
                </p>
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F4F5F9] text-sm font-medium text-[#13141A] transition-colors duration-200 dark:bg-slate-800/40 dark:text-white dark:hover:bg-slate-800/50",
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

              <div className="space-y-3 rounded-2xl border border-dashed border-[#E0E5F2] bg-white/80 p-3 transition-colors duration-200 ease-out dark:border-white/20 dark:bg-neutral-800/70 dark:backdrop-blur-xl">
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
                            className="group relative flex flex-col overflow-hidden rounded-xl border border-[#E2E7F5] bg-white shadow-sm transition-colors duration-200 dark:border-white/10 dark:bg-slate-800/40 dark:shadow-[0_20px_35px_rgba(0,0,0,0.35)] dark:hover:bg-slate-800/50"
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
                        <div className="space-y-2 rounded-xl border border-[#E2E7F5] bg-[#F8FAFF] p-3 transition-colors duration-200 dark:border-white/10 dark:bg-slate-800/40">
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
                          <div className="h-48 w-full overflow-hidden rounded-lg bg-[#F4F6FB] dark:bg-slate-800/50">
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

function SlashQuickFeaturesDrawer({
  open,
  disabled,
  anchorRef,
  drawerRef,
  onSelect,
}: {
  open: boolean;
  disabled: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  drawerRef: RefObject<HTMLDivElement | null>;
  onSelect: (featureId: SlashQuickFeatureId) => void;
}) {
  const [isMounted, setMounted] = useState(false);
  const [fixedStyle, setFixedStyle] = useState<
    | { left: number; top: number; width: number }
    | null
  >(null);
  const lastFixedStyleRef = useRef<
    | { left: number; top: number; width: number }
    | null
  >(null);
  const clearFixedStyleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // When closed, keep the last measured position briefly to allow a smooth close animation,
  // then fully unmount so it never blocks canvas interactions (node dragging, etc.).
  useEffect(() => {
    if (open) {
      if (clearFixedStyleTimerRef.current) {
        window.clearTimeout(clearFixedStyleTimerRef.current);
        clearFixedStyleTimerRef.current = null;
      }
      return;
    }
    if (!fixedStyle) return;

    clearFixedStyleTimerRef.current = window.setTimeout(() => {
      lastFixedStyleRef.current = null;
      setFixedStyle(null);
      clearFixedStyleTimerRef.current = null;
    }, 220);

    return () => {
      if (clearFixedStyleTimerRef.current) {
        window.clearTimeout(clearFixedStyleTimerRef.current);
        clearFixedStyleTimerRef.current = null;
      }
    };
  }, [open, fixedStyle]);

  // Keep the portal aligned with the (transformed) prompt container while open.
  useEffect(() => {
    if (!open) return;
    let raf = 0;

    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const next = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
      const prev = lastFixedStyleRef.current;
      if (
        !prev ||
        prev.left !== next.left ||
        prev.top !== next.top ||
        prev.width !== next.width
      ) {
        lastFixedStyleRef.current = next;
        setFixedStyle(next);
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [anchorRef, open]);

  if (!isMounted) return null;
  if (!open && !fixedStyle) return null;

  const wrapper = (
    <div
      // Positioned at the prompt container top edge; inner panel animates upward (above the prompt container).
      style={
        fixedStyle
          ? {
              position: "fixed",
              left: fixedStyle.left,
              top: fixedStyle.top,
              width: fixedStyle.width,
              zIndex: 99999,
            }
          : { position: "fixed", left: 0, top: 0, width: 0, zIndex: 99999 }
      }
      className="pointer-events-none"
      aria-hidden={!open}
    >
      <div
        ref={drawerRef}
        role="presentation"
        onMouseDown={(e) => {
          // Keep the prompt textarea focused while interacting with the drawer.
          e.preventDefault();
        }}
        className={cn(
          "transform-gpu transition-all duration-200 ease-out",
          open ? "pointer-events-auto" : "pointer-events-none",
          open ? "opacity-100" : "opacity-0",
        )}
        style={{
          // Slide a bit while keeping the top edge anchored to the prompt container.
          transform: open
            ? "translateY(calc(-100% - 12px))"
            : "translateY(calc(-100% - 4px))",
        }}
      >
        <div
          className={cn(
            "rounded-2xl border p-3 shadow-[0_20px_45px_rgba(0,0,0,0.20)] backdrop-blur-xl",
            // Theme-following palette: light uses a subtle white card; dark uses a blurred dark card.
            "border-[#E6E9F4] bg-white/95 text-[#1C202D]",
            "dark:border-white/10 dark:bg-neutral-950/70 dark:text-white dark:shadow-[0_20px_45px_rgba(0,0,0,0.55)]",
          )}
        >
          <div className="space-y-1">
            {SLASH_QUICK_FEATURES.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                // Keep textarea focus (so the drawer doesn't collapse on blur mid-click).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(item.id);
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-black/5 dark:hover:bg-white/10",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg",
                    "bg-black/5 text-[#2E3150] dark:bg-white/10 dark:text-white/90",
                  )}
                >
                  <ForwardedIconComponent
                    name={item.icon}
                    className="h-4 w-4"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-6">
                    {item.title}
                  </div>
                  <div className="text-xs leading-5 text-[#6B7280] dark:text-white/70">
                    {item.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {disabled && (
            <div className="mt-2 px-3 text-xs text-red-500 dark:text-red-400">
              {SLASH_QUICK_FEATURES_DISABLED_TIP}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(wrapper, document.body);
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
