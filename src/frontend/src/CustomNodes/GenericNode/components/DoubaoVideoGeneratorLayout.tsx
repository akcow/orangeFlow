import { cloneDeep } from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import DoubaoPreviewPanel, { type DoubaoReferenceImage } from "./DoubaoPreviewPanel";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import type { GenericNodeType, NodeDataType } from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { useTypesStore } from "@/stores/typesStore";
import { track } from "@/customization/utils/analytics";
import { findLastNode, getNodeId, scapedJSONStringfy } from "@/utils/reactflowUtils";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import { getNodeInputColors } from "@/CustomNodes/helpers/get-node-input-colors";
import { getNodeInputColorsName } from "@/CustomNodes/helpers/get-node-input-colors-name";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  buildRangeOptions,
  DOUBAO_CONTROL_HINTS,
  DOUBAO_CONFIG_TOOLTIP,
} from "./DoubaoParameterButton";
import HandleRenderComponent from "./handleRenderComponent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useHandleOnNewValue, {
  type handleOnNewValueType,
} from "../../hooks/use-handle-new-value";
import type { InputFieldType } from "@/types/api";
import { createFileUpload } from "@/helpers/create-file-upload";
import useAlertStore from "@/stores/alertStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import { BASE_URL_API } from "@/constants/constants";
import { scapeJSONParse } from "@/utils/reactflowUtils";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[220px] grow" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[140px]" },
  { name: "aspect_ratio", icon: "RectangleHorizontal", widthClass: "basis-[150px]" },
  { name: "duration", icon: "Timer", widthClass: "basis-[110px]" },
] as const;

const PROMPT_NAME = "prompt";
const DEFAULT_DURATION_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15];
const FIRST_FRAME_FIELD = "first_frame_image";
const LAST_FRAME_FIELD = "last_frame_image";
const ASPECT_RATIO_FIELD = "aspect_ratio";
const AUDIO_INPUT_FIELD = "audio_input";
const DEFAULT_ASPECT_RATIO_OPTIONS = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
  "adaptive",
];
const MODEL_LIMITS: Record<
  string,
  { resolutions?: string[]; minDuration?: number; maxDuration?: number; enableLastFrame?: boolean }
> = {
  "Doubao-Seedance-1.5-pro｜251215": {
    resolutions: ["480p", "720p"],
    minDuration: 4,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro｜250528": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro-fast｜251015": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: false,
  },
  "wan2.6": {
    resolutions: ["720p", "1080p"],
    minDuration: 5,
    maxDuration: 15,
    enableLastFrame: false,
  },
  "wan2.5": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 5,
    maxDuration: 10,
    enableLastFrame: false,
  },
  "VEO3.1": {
    resolutions: ["720p", "1080p"],
    minDuration: 4,
    maxDuration: 8,
    enableLastFrame: true,
  },
  "veo3.1-fast": {
    resolutions: ["720p", "1080p"],
    minDuration: 4,
    maxDuration: 8,
    enableLastFrame: true,
  },
  "sora-2": {
    resolutions: ["720p", "1080p"],
    minDuration: 10,
    maxDuration: 15,
    enableLastFrame: false,
  },
  "sora-2-pro": {
    resolutions: ["720p", "1080p"],
    minDuration: 10,
    maxDuration: 25,
    enableLastFrame: false,
  },
};

function getWanAllowedDurations(modelName: string, mode: string | null) {
  if (!modelName.startsWith("wan2.")) return null;
  if (modelName === "wan2.5") return [5, 10];
  if (modelName === "wan2.6") {
    if (mode === "r2v") return [5, 10];
    return [5, 10, 15];
  }
  return null;
}

function pickClosestDuration(value: number, options: number[]) {
  if (!options.length) return value;
  return options.reduce((closest, option) => {
    const delta = Math.abs(option - value);
    const closestDelta = Math.abs(closest - value);
    if (delta < closestDelta) return option;
    if (delta === closestDelta) return Math.min(closest, option);
    return closest;
  }, options[0]);
}
const DEFAULT_FIRST_FRAME_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tiff",
];
const FIRST_FRAME_MAX_UPLOADS = 6;
const VEO_REFERENCE_IMAGE_LIMIT = 3;
const VEO_MAX_UPLOADS = 5;
const SENSITIVE_FIELDS = ["api_key"];
const FIRST_FRAME_FIELD_FALLBACK: InputFieldType = {
  type: "file",
  required: false,
  placeholder: "",
  list: true,
  show: true,
  readonly: false,
  name: "first_frame_image",
  display_name: "首帧图输入",
  input_types: ["Data"],
  file_types: DEFAULT_FIRST_FRAME_EXTENSIONS,
  fileTypes: DEFAULT_FIRST_FRAME_EXTENSIONS,
};
const LAST_FRAME_FIELD_FALLBACK: InputFieldType = {
  type: "file",
  required: false,
  placeholder: "",
  list: false,
  show: true,
  readonly: false,
  name: LAST_FRAME_FIELD,
  display_name: "尾帧图输入",
  input_types: ["Data"],
  file_types: DEFAULT_FIRST_FRAME_EXTENSIONS,
  fileTypes: DEFAULT_FIRST_FRAME_EXTENSIONS,
};

type Props = {
  data: NodeDataType;
  types: any;
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
};

export default function DoubaoVideoGeneratorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
}: Props) {
  const UPSTREAM_NODE_OFFSET_X = 950;
  const UPSTREAM_NODE_OFFSET_Y = 750;
  const IMAGE_OUTPUT_NAME = "image";
  const FIRST_FRAME_BUTTON_LABEL = "首帧生成视频";
  const FIRST_LAST_FRAME_BUTTON_LABEL = "首尾帧生成视频";
  const PRO_FAST_MODEL = "Doubao-Seedance-1.0-pro-fast｜251015";
  const DEFAULT_LAST_FRAME_MODEL = "Doubao-Seedance-1.0-pro｜250528";
  const template = data.node?.template ?? {};
  const showExpanded = Boolean(selected);
  const selectedModel =
    (template.model_name?.value as string | undefined) ??
    (template.model_name?.default as string | undefined) ??
    (template.model_name?.options?.[0] as string | undefined) ??
    "";
  const normalizedModelName = selectedModel.toString().trim();
  const isWanModel = normalizedModelName.startsWith("wan2.");
  const isVeoModel =
    normalizedModelName === "VEO3.1" || normalizedModelName === "veo3.1-fast";
  const isSoraModel = normalizedModelName === "sora-2" || normalizedModelName === "sora-2-pro";
  const modelLimits = MODEL_LIMITS[normalizedModelName] ?? null;
  const allowLastFrame = modelLimits?.enableLastFrame ?? true;
  const firstFrameMaxUploads = isSoraModel
    ? 1
    : isVeoModel
      ? VEO_MAX_UPLOADS
      : FIRST_FRAME_MAX_UPLOADS;
  const customFields = new Set<string>([
    PROMPT_NAME,
    FIRST_FRAME_FIELD,
    LAST_FRAME_FIELD,
    AUDIO_INPUT_FIELD,
    ...CONTROL_FIELDS.map((item) => item.name),
    ...SENSITIVE_FIELDS,
  ]);
  const hasAdditionalFields = Object.keys(template).some(
    (field) => !customFields.has(field),
  );
  const promptField = template[PROMPT_NAME];
  const aspectRatioField = template[ASPECT_RATIO_FIELD];
  const firstFrameFieldRaw = template[FIRST_FRAME_FIELD];
  const firstFrameField = useMemo<InputFieldType>(() => {
    if (!firstFrameFieldRaw) return FIRST_FRAME_FIELD_FALLBACK;
    const normalizedInputTypes =
      firstFrameFieldRaw.input_types && firstFrameFieldRaw.input_types.length > 0
        ? firstFrameFieldRaw.input_types
        : FIRST_FRAME_FIELD_FALLBACK.input_types;
    const normalizedFileTypes =
      firstFrameFieldRaw.file_types && firstFrameFieldRaw.file_types.length > 0
        ? firstFrameFieldRaw.file_types
        : FIRST_FRAME_FIELD_FALLBACK.file_types;
    const normalizedCamelFileTypes =
      firstFrameFieldRaw.fileTypes && firstFrameFieldRaw.fileTypes.length > 0
        ? firstFrameFieldRaw.fileTypes
        : FIRST_FRAME_FIELD_FALLBACK.fileTypes;
    return {
      ...FIRST_FRAME_FIELD_FALLBACK,
      ...firstFrameFieldRaw,
      input_types: normalizedInputTypes,
      file_types: normalizedFileTypes,
      fileTypes: normalizedCamelFileTypes,
    };
  }, [firstFrameFieldRaw]);
  const lastFrameFieldRaw = template[LAST_FRAME_FIELD];
  const lastFrameField = useMemo<InputFieldType>(() => {
    if (!lastFrameFieldRaw) return LAST_FRAME_FIELD_FALLBACK;
    const normalizedInputTypes =
      lastFrameFieldRaw.input_types && lastFrameFieldRaw.input_types.length > 0
        ? lastFrameFieldRaw.input_types
        : LAST_FRAME_FIELD_FALLBACK.input_types;
    const normalizedFileTypes =
      lastFrameFieldRaw.file_types && lastFrameFieldRaw.file_types.length > 0
        ? lastFrameFieldRaw.file_types
        : LAST_FRAME_FIELD_FALLBACK.file_types;
    const normalizedCamelFileTypes =
      lastFrameFieldRaw.fileTypes && lastFrameFieldRaw.fileTypes.length > 0
        ? lastFrameFieldRaw.fileTypes
        : LAST_FRAME_FIELD_FALLBACK.fileTypes;
    return {
      ...LAST_FRAME_FIELD_FALLBACK,
      ...lastFrameFieldRaw,
      input_types: normalizedInputTypes,
      file_types: normalizedFileTypes,
      fileTypes: normalizedCamelFileTypes,
    };
  }, [lastFrameFieldRaw]);
  const [isFirstFrameDialogOpen, setFirstFrameDialogOpen] = useState(false);
  const [isFirstFrameUploadPending, setFirstFrameUploadPending] = useState(false);
  const [forceFirstLastFrameMode, setForceFirstLastFrameMode] = useState(false);
  const [
    disableSoraModelSelectionAfterFrameActions,
    setDisableSoraModelSelectionAfterFrameActions,
  ] = useState(false);
  const { handleOnNewValue: handleFirstFrameChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: FIRST_FRAME_FIELD,
  });
  const { handleOnNewValue: handleLastFrameChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: LAST_FRAME_FIELD,
  });
  const { handleOnNewValue: handleModelNameChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "model_name",
  });
  const { handleOnNewValue: handleDurationChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "duration",
  });
  const { handleOnNewValue: handleResolutionChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "resolution",
  });
  const { handleOnNewValue: handleAspectRatioChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: ASPECT_RATIO_FIELD,
  });
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const { mutateAsync: uploadFirstFrameFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const [isRunHovering, setRunHovering] = useState(false);
  const buildFlow = useFlowStore((state) => state.buildFlow);
  const isBuilding = useFlowStore((state) => state.isBuilding);
  const stopBuilding = useFlowStore((state) => state.stopBuilding);
  const clearFlowPoolForNodes = useFlowStore(
    (state) => state.clearFlowPoolForNodes,
  );
  const eventDeliveryConfig = useUtilityStore((state) => state.eventDelivery);
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const typeData = useTypesStore((state) => state.data);
  const hasAnyConnection = useMemo(
    () => edges.some((edge) => edge.source === data.id || edge.target === data.id),
    [edges, data.id],
  );
  const isPromptEmpty = useMemo(() => {
    const value = template[PROMPT_NAME]?.value;
    if (typeof value === "string") return value.trim().length === 0;
    return value === undefined || value === null;
  }, [template]);
  const disableRun = !hasAnyConnection && isPromptEmpty;

  const hasLastFrameEdge = useMemo(() => {
    return edges.some((edge) => {
      if (edge.target !== data.id) return false;
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName === LAST_FRAME_FIELD;
    });
  }, [edges, data.id]);

  const hasLastFrameValue = useMemo(() => {
    return (
      (Array.isArray(lastFrameField?.value) && lastFrameField.value.length > 0) ||
      (!!lastFrameField?.value && !Array.isArray(lastFrameField?.value)) ||
      (Array.isArray(lastFrameField?.file_path) && lastFrameField.file_path.length > 0) ||
      (!!lastFrameField?.file_path && !Array.isArray(lastFrameField?.file_path))
    );
  }, [lastFrameField]);

  const hasFirstFrameEdge = useMemo(() => {
    return edges.some((edge) => {
      if (edge.target !== data.id) return false;
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName === FIRST_FRAME_FIELD;
    });
  }, [edges, data.id]);

  const hasFirstFrameValue = useMemo(() => {
    return (
      (Array.isArray(firstFrameField?.value) && firstFrameField.value.length > 0) ||
      (!!firstFrameField?.value && !Array.isArray(firstFrameField?.value)) ||
      (Array.isArray(firstFrameField?.file_path) && firstFrameField.file_path.length > 0) ||
      (!!firstFrameField?.file_path && !Array.isArray(firstFrameField?.file_path))
    );
  }, [firstFrameField]);
  const hasFirstFrame = Boolean(hasFirstFrameEdge || hasFirstFrameValue);
  const hasLastFrame = Boolean(hasLastFrameEdge || hasLastFrameValue);
  const shouldBlockFirstLastMix = Boolean(
    !isWanModel && !isVeoModel && !isSoraModel && hasFirstFrame && hasLastFrame,
  );

  const hasReferenceVideosValue = useMemo(() => {
    if (!(isWanModel && normalizedModelName === "wan2.6")) return false;
    const entries = collectFirstFrameEntries(firstFrameField);
    return entries.some((entry) => {
      const path = (entry.path || "").toString();
      const suffix = path.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase();
      return suffix === "mp4" || suffix === "mov";
    });
  }, [firstFrameField, isWanModel, normalizedModelName]);

  const wanMode = useMemo(() => {
    if (!isWanModel) return null;
    if (hasReferenceVideosValue) return "r2v";
    if (hasFirstFrameEdge || hasFirstFrameValue) return "i2v";
    return "t2v";
  }, [hasFirstFrameEdge, hasFirstFrameValue, hasReferenceVideosValue, isWanModel]);

  const shouldDisableProFastModel = Boolean(hasLastFrameEdge || hasLastFrameValue);
  const isFirstLastFrameMode = Boolean(
    forceFirstLastFrameMode || hasLastFrameEdge || hasLastFrameValue,
  );
  const shouldShowLastFrameHandle = Boolean(allowLastFrame || hasLastFrameEdge);

  const resolveSeedanceModelForFirstLastFrame = useCallback(() => {
    const modelOptions: Array<string> =
      (template.model_name?.options as Array<string> | undefined) ?? [];
    if (modelOptions.includes(DEFAULT_LAST_FRAME_MODEL)) {
      return DEFAULT_LAST_FRAME_MODEL;
    }
    const firstEnabled = modelOptions.find((option) => {
      const normalized = String(option ?? "").trim();
      if (!normalized) return false;
      if (normalized.startsWith("wan2.")) return false;
      const limits = MODEL_LIMITS[normalized];
      if (limits && limits.enableLastFrame === false) return false;
      return true;
    });
    return firstEnabled ?? DEFAULT_LAST_FRAME_MODEL;
  }, [DEFAULT_LAST_FRAME_MODEL, template.model_name?.options]);

  useEffect(() => {
    if (!shouldDisableProFastModel) return;
    if (normalizedModelName !== PRO_FAST_MODEL) return;

    const modelOptions: Array<string> =
      (template.model_name?.options as Array<string> | undefined) ?? [];
    const fallback =
      modelOptions.includes(DEFAULT_LAST_FRAME_MODEL)
        ? DEFAULT_LAST_FRAME_MODEL
        : modelOptions.find((option) => option !== PRO_FAST_MODEL) ??
          DEFAULT_LAST_FRAME_MODEL;

    handleModelNameChange({ value: fallback }, { skipSnapshot: true });
  }, [
    DEFAULT_LAST_FRAME_MODEL,
    PRO_FAST_MODEL,
    handleModelNameChange,
    normalizedModelName,
    shouldDisableProFastModel,
    template.model_name?.options,
  ]);

  useEffect(() => {
    if (!isFirstLastFrameMode) return;
    if (!isWanModel) return;
    const fallback = resolveSeedanceModelForFirstLastFrame();
    handleModelNameChange({ value: fallback }, { skipSnapshot: true });
  }, [handleModelNameChange, isFirstLastFrameMode, isWanModel, resolveSeedanceModelForFirstLastFrame]);

  const nodeIdForRun = data.node?.flow?.data
    ? (findLastNode(data.node.flow.data!)?.id ?? data.id)
    : data.id;

  const isBusy = buildStatus === BuildStatus.BUILDING || isBuilding;

  const handleRun = () => {
    if (buildStatus === BuildStatus.BUILDING && isRunHovering) {
      stopBuilding();
      return;
    }
    if (disableRun) return;
    if (isBusy) return;
    if (shouldBlockFirstLastMix) {
      setErrorData({
        title: "首尾帧冲突",
        list: ["豆包模型不支持首尾帧同时输入，请清空尾帧或移除首帧后再运行。"],
      });
      return;
    }
    clearFlowPoolForNodes([nodeIdForRun]);
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
    const selectedResolutionValue = String(
      template.resolution?.value ??
        template.resolution?.default ??
        template.resolution?.options?.[0] ??
        "1080p",
    ).trim();
    const selectedDurationValue = Number(
      template.duration?.value ?? template.duration?.default ?? template.duration?.options?.[0] ?? 8,
    );
    const veoEntries = isVeoModel ? collectFirstFrameEntries(firstFrameField) : [];
    return CONTROL_FIELDS.map((field) => {
      const templateField = template[field.name];
      if (!templateField) return null;

      let options: Array<string | number> = Array.isArray(templateField.options)
        ? templateField.options
        : [];
      let value = templateField.value;
      let disabledOptions: Array<string | number> | undefined;

      if (field.name === "duration") {
        const rangeOptions = buildRangeOptions(templateField);
        options = rangeOptions.length ? rangeOptions : DEFAULT_DURATION_OPTIONS;
        const minDuration = modelLimits?.minDuration ?? Math.min(...DEFAULT_DURATION_OPTIONS);
        const maxDuration = modelLimits?.maxDuration ?? Math.max(...DEFAULT_DURATION_OPTIONS);
        const disabled = options.filter((option) => {
          const numeric = Number(option);
          if (Number.isNaN(numeric)) return true;
          return numeric < minDuration || numeric > maxDuration;
        });
        disabledOptions = disabled;
        const numericValue =
          typeof value === "number"
            ? value
            : typeof value === "string"
              ? Number(value)
              : null;
        if (typeof numericValue === "number" && !Number.isNaN(numericValue)) {
          if (numericValue < minDuration || numericValue > maxDuration) {
            value = Math.min(Math.max(numericValue, minDuration), maxDuration);
          }
        }

        if (isWanModel) {
          const allowedDurations = getWanAllowedDurations(normalizedModelName, wanMode);
          if (allowedDurations?.length) {
            const allowedSet = new Set(allowedDurations);
            const extraDisabled = options.filter((option) => !allowedSet.has(Number(option)));
            disabledOptions = [...(disabledOptions ?? []), ...extraDisabled];
            if (
              typeof numericValue === "number" &&
              !Number.isNaN(numericValue) &&
              !allowedSet.has(numericValue)
            ) {
              value = allowedDurations[0];
            }
          }
        }

        if (isVeoModel) {
          const baseAllowed = [4, 6, 8];
          const hasFirst =
            veoEntries.some((entry) => entry.role === "first") || veoEntries.length === 1;
          const hasReference = veoEntries.some((entry) => entry.role === "reference");
          const hasLast = Boolean(hasLastFrameEdge || hasLastFrameValue);
          const isReferenceMode = Boolean(hasReference && !hasFirst && !hasLast);
          const isInterpolationMode = Boolean(hasFirst && hasLast);
          // 只有在参考图模式或插值模式时才必须使用 8 秒
          // 1080p 的限制由后端处理，不在前端强制禁用
          const mustBeEight = isReferenceMode || isInterpolationMode;
          const allowedSet = new Set<number>(mustBeEight ? [8] : baseAllowed);
          const extraDisabled = options.filter((option) => !allowedSet.has(Number(option)));
          disabledOptions = [...(disabledOptions ?? []), ...extraDisabled];
          if (typeof numericValue === "number" && !Number.isNaN(numericValue) && !allowedSet.has(numericValue)) {
            value = mustBeEight ? 8 : baseAllowed[0];
          }
        }

        if (isSoraModel) {
          // Sora 模型的时长限制：sora-2 支持 10/15 秒，sora-2-pro 支持 10/15/25 秒
          const allowedDurations = normalizedModelName === "sora-2" ? [10, 15] : [10, 15, 25];
          const normalizedOptions = options
            .map((option) => Number(option))
            .filter((option) => !Number.isNaN(option));
          options = Array.from(new Set([...normalizedOptions, ...allowedDurations])).sort(
            (a, b) => a - b,
          );
          const allowedSet = new Set(allowedDurations);
          const extraDisabled = options.filter((option) => !allowedSet.has(Number(option)));
          disabledOptions = [...(disabledOptions ?? []), ...extraDisabled];
          if (typeof numericValue === "number" && !Number.isNaN(numericValue) && !allowedSet.has(numericValue)) {
            value = allowedDurations[0];
          }
        }
      }

      if (field.name === "resolution" && modelLimits?.resolutions?.length) {
        const allowed = new Set(modelLimits.resolutions.map(String));
        disabledOptions = options.filter((option) => !allowed.has(String(option)));
      }
      if (field.name === "resolution" && isVeoModel) {
        const allowed = new Set<string>(["720p", "1080p"]);
        const baseDisabled = options.filter((option) => !allowed.has(String(option)));
        disabledOptions = [...(disabledOptions ?? []), ...baseDisabled];
        // Veo 模型：1080p 仅在时长为 8 秒时可用
        const durationIsEight = Number.isFinite(selectedDurationValue) ? selectedDurationValue === 8 : true;
        if (!durationIsEight) {
          disabledOptions = [...(disabledOptions ?? []), "1080p"];
          if (String(value ?? "").trim() === "1080p") {
            value = "720p";
          }
        }
      }

      if (field.name === ASPECT_RATIO_FIELD) {
        if (!options.length) {
          options = DEFAULT_ASPECT_RATIO_OPTIONS;
        }
        if (isWanModel) {
          if (wanMode === "i2v") {
            disabledOptions = options.filter((opt) => String(opt) !== "adaptive");
            value = "adaptive";
          } else {
            const disabled = new Set<string>(["adaptive", "21:9"]);
            if (selectedResolutionValue === "480p") {
              disabled.add("4:3");
              disabled.add("3:4");
            }
            disabledOptions = options.filter((opt) => disabled.has(String(opt)));
          }
        }
        if (isVeoModel) {
          const hasFirst =
            veoEntries.some((entry) => entry.role === "first") || veoEntries.length === 1;
          const hasReference = veoEntries.some((entry) => entry.role === "reference");
          const hasLast = Boolean(hasLastFrameEdge || hasLastFrameValue);
          const isReferenceMode = Boolean(hasReference && !hasFirst && !hasLast);
          const allowed = isReferenceMode
            ? new Set<string>(["16:9"])
            : new Set<string>(["16:9", "9:16"]);
          disabledOptions = options.filter((opt) => !allowed.has(String(opt)));
        }

        if (isSoraModel) {
          // Sora API 支持的尺寸仅覆盖横/竖屏两种比例：16:9 与 9:16
          const allowed = new Set<string>(["16:9", "9:16"]);
          disabledOptions = options.filter((opt) => !allowed.has(String(opt)));
        }
      }

      if (field.name === "model_name" && shouldDisableProFastModel) {
        disabledOptions = [...(disabledOptions ?? []), PRO_FAST_MODEL];
      }
      if (field.name === "model_name" && disableSoraModelSelectionAfterFrameActions) {
        disabledOptions = [...(disabledOptions ?? []), "sora-2", "sora-2-pro"];
      }
      if (field.name === "model_name" && isFirstLastFrameMode) {
        const wanModels = options.filter((option) => String(option).trim().startsWith("wan2."));
        disabledOptions = [...(disabledOptions ?? []), ...wanModels];
      }

       // 如果当前值被禁用，自动落到首个可用选项
      if (
        disabledOptions?.length &&
        disabledOptions.map(String).includes(String(value ?? ""))
      ) {
        const firstEnabled = options.find(
          (option) => !disabledOptions!.map(String).includes(String(option)),
        );
        value = firstEnabled ?? value;
      }

      if (options.length && !options.map(String).includes(String(value ?? ""))) {
        [value] = options;
      }

      const tooltipText =
        DOUBAO_CONTROL_HINTS[field.name] ?? DOUBAO_CONFIG_TOOLTIP;
      return {
        ...field,
        template: templateField,
        options,
        value,
        disabledOptions,
        tooltip: tooltipText,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [
    disableSoraModelSelectionAfterFrameActions,
    PRO_FAST_MODEL,
    firstFrameField,
    hasLastFrameEdge,
    hasLastFrameValue,
    isFirstLastFrameMode,
    isSoraModel,
    isVeoModel,
    isWanModel,
    modelLimits,
    normalizedModelName,
    shouldDisableProFastModel,
    template,
    wanMode,
  ]);

  const upstreamFirstFrameFields = useMemo<InputFieldType[]>(() => {
    const incomingEdges = edges?.filter(
      (edge) => edge.target === data.id && edge.targetHandle,
    );
    const collected: InputFieldType[] = [];

    incomingEdges?.forEach((edge) => {
      try {
        const targetHandle = scapeJSONParse(edge.targetHandle!);
        const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
        if (fieldName !== FIRST_FRAME_FIELD) return;
      } catch {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (!sourceNode) return;
      const sourceType = sourceNode?.data?.type;
      if (
        sourceType !== "DoubaoVideoGenerator" &&
        sourceType !== "DoubaoImageCreator"
      ) {
        return;
      }

      const sourceTemplateField =
        sourceNode.data?.node?.template?.[FIRST_FRAME_FIELD] ??
        sourceNode.data?.node?.template?.["reference_images"];

      if (sourceTemplateField) {
        collected.push(sourceTemplateField);
      }
    });

    return collected;
  }, [edges, nodes, data.id]);

  const upstreamLastFrameFields = useMemo<InputFieldType[]>(() => {
    const incomingEdges = edges?.filter(
      (edge) => edge.target === data.id && edge.targetHandle,
    );
    const collected: InputFieldType[] = [];

    incomingEdges?.forEach((edge) => {
      try {
        const targetHandle = scapeJSONParse(edge.targetHandle!);
        const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
        if (fieldName !== LAST_FRAME_FIELD) return;
      } catch {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (!sourceNode) return;
      const sourceType = sourceNode?.data?.type;
      if (
        sourceType !== "DoubaoVideoGenerator" &&
        sourceType !== "DoubaoImageCreator"
      ) {
        return;
      }

      const sourceTemplateField =
        sourceNode.data?.node?.template?.[FIRST_FRAME_FIELD] ??
        sourceNode.data?.node?.template?.["reference_images"];

      if (sourceTemplateField) {
        collected.push(sourceTemplateField);
      }
    });

    return collected;
  }, [edges, nodes, data.id]);

  const firstFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItems(firstFrameField),
    [firstFrameField],
  );
  const upstreamFirstFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItemsFromFields(upstreamFirstFrameFields),
    [upstreamFirstFrameFields],
  );
  const combinedFirstFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () =>
      mergeReferencePreviewLists(firstFramePreviews, upstreamFirstFramePreviews),
    [firstFramePreviews, upstreamFirstFramePreviews],
  );
  const lastFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItems(lastFrameField),
    [lastFrameField],
  );
  const upstreamLastFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItemsFromFields(upstreamLastFrameFields),
    [upstreamLastFrameFields],
  );
  const combinedLastFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => mergeReferencePreviewLists(lastFramePreviews, upstreamLastFramePreviews),
    [lastFramePreviews, upstreamLastFramePreviews],
  );
  const selectedLastFrame = combinedLastFramePreviews[0] ?? null;
  const selectedLastFrameSource = useMemo(
    () =>
      (selectedLastFrame?.downloadSource || selectedLastFrame?.imageSource || "")
        .toString()
        .trim(),
    [selectedLastFrame],
  );
  const upstreamLastFrameNodeId = useMemo(() => {
    const edge = edges.find((candidate) => {
      if (candidate.target !== data.id || !candidate.targetHandle) return false;
      try {
        const targetHandle = scapeJSONParse(candidate.targetHandle);
        return targetHandle?.fieldName === LAST_FRAME_FIELD;
      } catch {
        return false;
      }
    });
    return edge?.source ?? null;
  }, [edges, data.id]);
  const isSelectedLastFrameFromUpstream = useMemo(() => {
    if (!selectedLastFrameSource) return false;
    return upstreamLastFramePreviews.some((preview) => {
      const source = (preview.downloadSource || preview.imageSource || "").toString().trim();
      return source === selectedLastFrameSource;
    });
  }, [selectedLastFrameSource, upstreamLastFramePreviews]);
  const firstFrameEntries = useMemo(
    () => collectFirstFrameEntries(firstFrameField),
    [firstFrameField],
  );
  const buildFirstFrameFieldUpdate = useCallback(
    (entries: FirstFrameEntry[], { forceRoles = false }: { forceRoles?: boolean } = {}) => {
      const shouldIncludeRoles = forceRoles || isVeoModel || entries.some((entry) => entry.role);
      const fallbackRole = entries.length === 1 ? "first" : "reference";
      return {
        value: shouldIncludeRoles
          ? entries.map((entry) => ({
              name: entry.name,
              display_name: entry.name,
              role: entry.role ?? fallbackRole,
            }))
          : entries.map((entry) => entry.name),
        file_path: entries.map((entry) => entry.path),
      };
    },
    [isVeoModel],
  );

  useEffect(() => {
    if (!isVeoModel) return;
    if (!firstFrameEntries.length) return;
    if (firstFrameEntries.some((entry) => entry.role)) return;

    const defaultRole = firstFrameEntries.length === 1 ? "first" : "reference";
    handleFirstFrameChange(
      buildFirstFrameFieldUpdate(
        firstFrameEntries.map((entry) => ({ ...entry, role: defaultRole })),
        { forceRoles: true },
      ),
      { skipSnapshot: true },
    );
  }, [buildFirstFrameFieldUpdate, firstFrameEntries, handleFirstFrameChange, isVeoModel]);

  const durationRaw =
    template.duration?.value ?? template.duration?.default ?? template.duration?.options?.[0];
  const currentDurationValue =
    typeof durationRaw === "number"
      ? durationRaw
      : typeof durationRaw === "string"
        ? Number(durationRaw)
        : null;

  const resolutionRaw =
    template.resolution?.value ?? template.resolution?.default ?? template.resolution?.options?.[0];
  const currentResolutionValue =
    resolutionRaw === undefined || resolutionRaw === null
      ? null
      : String(resolutionRaw).trim();

  const aspectRatioRaw =
    aspectRatioField?.value ?? aspectRatioField?.default ?? aspectRatioField?.options?.[0];
  const currentAspectRatioValue =
    aspectRatioRaw === undefined || aspectRatioRaw === null
      ? null
      : String(aspectRatioRaw).trim();

  const veoMode = useMemo(() => {
    if (!isVeoModel) return null;
    const hasFirst =
      firstFrameEntries.some((entry) => entry.role === "first") || firstFrameEntries.length === 1;
    const hasReference = firstFrameEntries.some((entry) => entry.role === "reference");
    const hasLast = Boolean(hasLastFrameEdge || hasLastFrameValue);
    const isReferenceMode = Boolean(hasReference && !hasFirst && !hasLast);
    const isInterpolationMode = Boolean(hasFirst && hasLast);
    return { isReferenceMode, isInterpolationMode };
  }, [firstFrameEntries, hasLastFrameEdge, hasLastFrameValue, isVeoModel]);

  useEffect(() => {
    if (!isVeoModel || !template.duration) return;
    const durationValue =
      typeof currentDurationValue === "number" && Number.isFinite(currentDurationValue)
        ? currentDurationValue
        : null;
    if (durationValue === null) return;

    const mustBeEight = Boolean(veoMode?.isReferenceMode || veoMode?.isInterpolationMode);
    const allowedDurations = mustBeEight ? [8] : [4, 6, 8];
    if (!allowedDurations.includes(durationValue)) {
      const fallback = mustBeEight ? 8 : pickClosestDuration(durationValue, allowedDurations);
      handleDurationChange({ value: fallback }, { skipSnapshot: true });
    }
  }, [currentDurationValue, handleDurationChange, isVeoModel, template.duration, veoMode]);

  useEffect(() => {
    if (!isVeoModel || !template.resolution) return;
    const durationValue =
      typeof currentDurationValue === "number" && Number.isFinite(currentDurationValue)
        ? currentDurationValue
        : null;
    if (durationValue === null) return;

    const mustBeEight = Boolean(veoMode?.isReferenceMode || veoMode?.isInterpolationMode);
    const allowedDurations = mustBeEight ? [8] : [4, 6, 8];
    const normalizedDuration = allowedDurations.includes(durationValue)
      ? durationValue
      : mustBeEight
        ? 8
        : pickClosestDuration(durationValue, allowedDurations);

    if (normalizedDuration !== 8 && currentResolutionValue === "1080p") {
      handleResolutionChange({ value: "720p" }, { skipSnapshot: true });
    }
  }, [
    currentDurationValue,
    currentResolutionValue,
    handleResolutionChange,
    isVeoModel,
    template.resolution,
    veoMode,
  ]);

  useEffect(() => {
    if (!isVeoModel || !aspectRatioField) return;
    if (!currentAspectRatioValue) return;
    const allowed = veoMode?.isReferenceMode ? ["16:9"] : ["16:9", "9:16"];
    if (!allowed.includes(currentAspectRatioValue)) {
      handleAspectRatioChange({ value: "16:9" }, { skipSnapshot: true });
    }
  }, [aspectRatioField, currentAspectRatioValue, handleAspectRatioChange, isVeoModel, veoMode]);

  const selectedFirstFrameIndex = useMemo(() => {
    if (!isVeoModel) return 0;
    const roleIndex = firstFrameEntries.findIndex((entry) => entry.role === "first");
    if (roleIndex >= 0) return roleIndex;
    if (firstFrameEntries.length === 1 && !firstFrameEntries[0]?.role) return 0;
    return -1;
  }, [firstFrameEntries, isVeoModel]);
  const selectedFirstFrame =
    selectedFirstFrameIndex >= 0
      ? (combinedFirstFramePreviews[selectedFirstFrameIndex] ?? null)
      : null;
  const firstFrameCount = combinedFirstFramePreviews.length;
  const localFirstFrameCount = firstFramePreviews.length;
  const canUploadMoreFirstFrames = isSoraModel
    ? firstFrameCount < firstFrameMaxUploads
    : localFirstFrameCount < firstFrameMaxUploads;
  const veoHasFirstOrLastLocally = useMemo(() => {
    if (!isVeoModel) return false;
    const localEntries = firstFrameEntries.slice(0, localFirstFrameCount);
    const hasFirst = localEntries.some((entry) => entry.role === "first") || localEntries.length === 1;
    const hasLast =
      localEntries.some((entry) => entry.role === "last") ||
      Boolean(hasLastFrameEdge || hasLastFrameValue);
    return hasFirst || hasLast;
  }, [firstFrameEntries, hasLastFrameEdge, hasLastFrameValue, isVeoModel, localFirstFrameCount]);
  const veoHasReferenceLocally = useMemo(() => {
    if (!isVeoModel) return false;
    const localEntries = firstFrameEntries.slice(0, localFirstFrameCount);
    return localEntries.some((entry) => entry.role === "reference");
  }, [firstFrameEntries, isVeoModel, localFirstFrameCount]);
  const firstFrameFileTypes =
    firstFrameField?.fileTypes ??
    firstFrameField?.file_types ??
    firstFrameField?.fileTypesList;
  const firstFrameAllowedExtensions = useMemo(() => {
    const source =
      firstFrameFileTypes && firstFrameFileTypes.length > 0
        ? firstFrameFileTypes
        : DEFAULT_FIRST_FRAME_EXTENSIONS;
    return source.map((ext) => ext.replace(/^\./, "").toLowerCase());
  }, [firstFrameFileTypes]);
  const canUploadReferenceVideos = isWanModel && normalizedModelName === "wan2.6";
  const firstFrameUploadAllowedExtensions = useMemo(() => {
    if (canUploadReferenceVideos) return firstFrameAllowedExtensions;
    return firstFrameAllowedExtensions.filter((ext) => ext !== "mp4" && ext !== "mov");
  }, [canUploadReferenceVideos, firstFrameAllowedExtensions]);
  const firstFrameFilePickerAccept = useMemo(
    () => firstFrameUploadAllowedExtensions.map((ext) => `.${ext}`).join(","),
    [firstFrameUploadAllowedExtensions],
  );

  const firstFrameHandleMeta = useMemo(() => {
    const colors = getNodeInputColors(
      firstFrameField.input_types,
      firstFrameField.type,
      types,
    );
    const colorName = getNodeInputColorsName(
      firstFrameField.input_types,
      firstFrameField.type,
      types,
    );
    return {
      id: {
        inputTypes: firstFrameField.input_types,
        type: firstFrameField.type,
        id: data.id,
        fieldName: FIRST_FRAME_FIELD,
      },
      tooltip: isSoraModel
        ? "Sora 参考图输入（input_reference）"
        : firstFrameField.input_types?.join(", ") ?? firstFrameField.type ?? "首帧图输入",
      title: isSoraModel ? "参考图输入" : firstFrameField.display_name ?? "首帧图输入",
      colors,
      colorName,
      proxy: firstFrameField.proxy,
    };
  }, [data.id, firstFrameField, isSoraModel, types]);

  const lastFrameHandleMeta = useMemo(() => {
    const colors = getNodeInputColors(
      lastFrameField.input_types,
      lastFrameField.type,
      types,
    );
    const colorName = getNodeInputColorsName(
      lastFrameField.input_types,
      lastFrameField.type,
      types,
    );
    return {
      id: {
        inputTypes: lastFrameField.input_types,
        type: lastFrameField.type,
        id: data.id,
        fieldName: LAST_FRAME_FIELD,
      },
      tooltip:
        lastFrameField.input_types?.join(", ") ??
        lastFrameField.type ??
        "尾帧图输入",
      title: lastFrameField.display_name ?? "尾帧图输入",
      colors,
      colorName,
      proxy: lastFrameField.proxy,
    };
  }, [lastFrameField, types, data.id]);

  const audioInputField = template[AUDIO_INPUT_FIELD];
  const audioHandleMeta = useMemo(() => {
    if (!isWanModel) return null;
    if (!audioInputField) return null;
    const inputTypes =
      audioInputField.input_types && audioInputField.input_types.length > 0
        ? audioInputField.input_types
        : ["Data"];
    const resolvedType = audioInputField.type ?? "data";
    const colors = getNodeInputColors(inputTypes, resolvedType, types);
    const colorName = getNodeInputColorsName(inputTypes, resolvedType, types);
    return {
      id: {
        inputTypes,
        type: resolvedType,
        id: data.id,
        fieldName: AUDIO_INPUT_FIELD,
      },
      tooltip: inputTypes?.join(", ") ?? resolvedType ?? "音频输入",
      title: audioInputField.display_name ?? "音频输入",
      colors,
      colorName,
      proxy: audioInputField.proxy,
    };
  }, [audioInputField, isWanModel, types, data.id]);

  const promptHandleMeta = useMemo(() => {
    if (!promptField) return null;
    const colors = getNodeInputColors(
      promptField.input_types,
      promptField.type,
      types,
    );
    const colorName = getNodeInputColorsName(
      promptField.input_types,
      promptField.type,
      types,
    );
    return {
      id: {
        inputTypes: promptField.input_types,
        type: promptField.type,
        id: data.id,
        fieldName: PROMPT_NAME,
      },
      colors,
      colorName,
      tooltip: promptField.input_types?.join(", ") ?? promptField.type ?? "提示词输入",
      title: promptField.display_name ?? "提示词输入",
      proxy: promptField.proxy,
    };
  }, [promptField, types, data.id]);

  const openFirstFrameDialog = useCallback(() => {
    if (isFirstFrameUploadPending) return;
    setFirstFrameDialogOpen(true);
  }, [isFirstFrameUploadPending]);

  const requestUploadDialogForNode = useCallback((nodeId: string) => {
    const uploadEvent = new CustomEvent("doubao-preview-upload", {
      detail: { nodeId },
    });
    window.dispatchEvent(uploadEvent);
  }, []);

  const handleCreateFirstFrameUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const firstFrameTemplateField = template[FIRST_FRAME_FIELD];
    if (!firstFrameTemplateField) return;

    const existingUpstreamNodeId = edges
      .map((edge) => {
        if (edge.target !== data.id) return null;

        const sourceNode = nodes.find((node) => node.id === edge.source);
        if (sourceNode?.data?.type !== "DoubaoImageCreator") return null;
        if (sourceNode.position.x >= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== FIRST_FRAME_FIELD) return null;

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
        x: currentNode.position.x - UPSTREAM_NODE_OFFSET_X,
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
      inputTypes: firstFrameTemplateField.input_types,
      type: firstFrameTemplateField.type,
      id: data.id,
      fieldName: FIRST_FRAME_FIELD,
      ...(firstFrameTemplateField.proxy ? { proxy: firstFrameTemplateField.proxy } : {}),
    };

    onConnect({
      source: newImageNodeId,
      target: data.id,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    queueMicrotask(() => requestUploadDialogForNode(newImageNodeId));

    track("DoubaoVideoGenerator - Create First Frame Upstream Node", {
      sourceNodeId: newImageNodeId,
      targetNodeId: data.id,
      sourceComponent: "DoubaoImageCreator",
    });
  }, [
    IMAGE_OUTPUT_NAME,
    UPSTREAM_NODE_OFFSET_X,
    data.id,
    edges,
    nodes,
    onConnect,
    requestUploadDialogForNode,
    setNodes,
    takeSnapshot,
    template,
    templates,
  ]);

  const handleCreateFirstLastFrameUpstreamNodes = useCallback(() => {
    if (isSoraModel) {
      setErrorData({
        title: "Sora 不支持首尾帧模式",
        list: ["Sora 系列仅支持参考图生视频（最多 1 张 input_reference）。"],
      });
      return;
    }
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const firstFrameTemplateField = template[FIRST_FRAME_FIELD];
    const lastFrameTemplateField = template[LAST_FRAME_FIELD];
    if (!firstFrameTemplateField || !lastFrameTemplateField) return;

    setForceFirstLastFrameMode(true);
    if (isWanModel || normalizedModelName === PRO_FAST_MODEL) {
      const fallback = resolveSeedanceModelForFirstLastFrame();
      handleModelNameChange({ value: fallback }, { skipSnapshot: true });
    }

    const findExistingUpstream = (targetFieldName: string) => {
      return edges
        .map((edge) => {
          if (edge.target !== data.id) return null;

          const sourceNode = nodes.find((node) => node.id === edge.source);
          if (sourceNode?.data?.type !== "DoubaoImageCreator") return null;
          if (sourceNode.position.x >= currentNode.position.x) return null;

          const targetHandle =
            edge.data?.targetHandle ??
            (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
          if (targetHandle?.fieldName !== targetFieldName) return null;

          const sourceHandle =
            edge.data?.sourceHandle ??
            (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
          if (sourceHandle?.name !== IMAGE_OUTPUT_NAME) return null;

          return sourceNode.id;
        })
        .find(Boolean) as string | undefined;
    };

    const existingFirstFrameNodeId = findExistingUpstream(FIRST_FRAME_FIELD);
    const existingLastFrameNodeId = findExistingUpstream(LAST_FRAME_FIELD);

    const ensureConnection = (
      sourceNodeId: string,
      targetFieldName: string,
      targetTemplateField: any,
    ) => {
      const latestEdges = useFlowStore.getState().edges;
      const hasEdge = latestEdges.some((edge) => {
        if (edge.source !== sourceNodeId || edge.target !== data.id) return false;
        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        return targetHandle?.fieldName === targetFieldName;
      });
      if (hasEdge) return;

      const imageTemplate = templates["DoubaoImageCreator"];
      const outputDefinition =
        imageTemplate?.outputs?.find((output: any) => output.name === IMAGE_OUTPUT_NAME) ??
        imageTemplate?.outputs?.find((output: any) => !output.hidden) ??
        imageTemplate?.outputs?.[0];
      const sourceOutputTypes =
        outputDefinition?.types && outputDefinition.types.length === 1
          ? outputDefinition.types
          : outputDefinition?.selected
            ? [outputDefinition.selected]
            : ["Data"];

      const sourceHandle = {
        output_types: sourceOutputTypes,
        id: sourceNodeId,
        dataType: "DoubaoImageCreator",
        name: outputDefinition?.name ?? IMAGE_OUTPUT_NAME,
        ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
      };

      const targetHandle = {
        inputTypes: targetTemplateField.input_types,
        type: targetTemplateField.type,
        id: data.id,
        fieldName: targetFieldName,
        ...(targetTemplateField.proxy ? { proxy: targetTemplateField.proxy } : {}),
      };

      onConnect({
        source: sourceNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    };

    if (existingFirstFrameNodeId && existingLastFrameNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected:
            node.id === data.id ||
            node.id === existingFirstFrameNodeId ||
            node.id === existingLastFrameNodeId,
        })),
      );
      ensureConnection(existingFirstFrameNodeId, FIRST_FRAME_FIELD, firstFrameTemplateField);
      ensureConnection(existingLastFrameNodeId, LAST_FRAME_FIELD, lastFrameTemplateField);
      return;
    }

    const imageTemplate = templates["DoubaoImageCreator"];
    if (!imageTemplate) return;

    takeSnapshot();

    const nodesToAdd: GenericNodeType[] = [];

    const createNamedImageNode = (displayName: string, y: number) => {
      const newImageNodeId = getNodeId("DoubaoImageCreator");
      const seeded = cloneDeep(imageTemplate);
      seeded.display_name = displayName;
      const newNode: GenericNodeType = {
        id: newImageNodeId,
        type: "genericNode",
        position: {
          x: currentNode.position.x - UPSTREAM_NODE_OFFSET_X,
          y,
        },
        data: {
          node: seeded,
          showNode: !seeded.minimized,
          type: "DoubaoImageCreator",
          id: newImageNodeId,
        },
        selected: true,
      };
      nodesToAdd.push(newNode);
      return newImageNodeId;
    };

    const firstFrameNodeId =
      existingFirstFrameNodeId ??
      createNamedImageNode("首帧", currentNode.position.y - UPSTREAM_NODE_OFFSET_Y);
    const lastFrameNodeId =
      existingLastFrameNodeId ??
      createNamedImageNode("尾帧", currentNode.position.y + UPSTREAM_NODE_OFFSET_Y);

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({
        ...node,
        selected: node.id === data.id,
      })),
      ...nodesToAdd,
    ]);

    ensureConnection(firstFrameNodeId, FIRST_FRAME_FIELD, firstFrameTemplateField);
    ensureConnection(lastFrameNodeId, LAST_FRAME_FIELD, lastFrameTemplateField);

    track("DoubaoVideoGenerator - Create First+Last Frame Upstream Nodes", {
      sourceNodeId: data.id,
      sourceComponent: "DoubaoVideoGenerator",
    });
  }, [
    FIRST_FRAME_FIELD,
    IMAGE_OUTPUT_NAME,
    LAST_FRAME_FIELD,
    PRO_FAST_MODEL,
    UPSTREAM_NODE_OFFSET_X,
    UPSTREAM_NODE_OFFSET_Y,
    data.id,
    edges,
    handleModelNameChange,
    isWanModel,
    normalizedModelName,
    nodes,
    onConnect,
    setNodes,
    setForceFirstLastFrameMode,
    takeSnapshot,
    template,
    templates,
    resolveSeedanceModelForFirstLastFrame,
    isSoraModel,
    setErrorData,
  ]);

  const handlePreviewSuggestionClick = useCallback(
    (label: string) => {
      if (label === FIRST_FRAME_BUTTON_LABEL) {
        setDisableSoraModelSelectionAfterFrameActions(true);
        handleCreateFirstFrameUpstreamNode();
        return;
      }
      if (label === FIRST_LAST_FRAME_BUTTON_LABEL) {
        setDisableSoraModelSelectionAfterFrameActions(true);
        handleCreateFirstLastFrameUpstreamNodes();
      }
    },
    [
      FIRST_FRAME_BUTTON_LABEL,
      FIRST_LAST_FRAME_BUTTON_LABEL,
      handleCreateFirstFrameUpstreamNode,
      handleCreateFirstLastFrameUpstreamNodes,
      setDisableSoraModelSelectionAfterFrameActions,
    ],
  );

  const triggerFirstFrameUpload = useCallback(() => {
    if (isFirstFrameUploadPending) {
      return;
    }
    void handleFirstFrameUpload({
      referenceField: firstFrameField,
      accept: firstFrameFilePickerAccept,
      allowedExtensions: firstFrameUploadAllowedExtensions,
      currentFlowId,
      uploadReferenceFile: uploadFirstFrameFile,
      validateFileSize,
      handleReferenceChange: handleFirstFrameChange,
      setErrorData,
      setReferenceUploadPending: setFirstFrameUploadPending,
      maxEntries: firstFrameMaxUploads,
      enableRoles: isVeoModel,
      maxReferenceImages: isVeoModel ? VEO_REFERENCE_IMAGE_LIMIT : null,
    });
  }, [
    firstFrameField,
    isFirstFrameUploadPending,
    firstFrameFilePickerAccept,
    firstFrameUploadAllowedExtensions,
    currentFlowId,
    uploadFirstFrameFile,
    validateFileSize,
    handleFirstFrameChange,
    firstFrameMaxUploads,
    isVeoModel,
    setErrorData,
  ]);

  const handleFirstFrameRemove = useCallback(
    (index: number) => {
      if (index >= localFirstFrameCount) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (!entries.length || index < 0 || index >= entries.length) return;
      entries.splice(index, 1);
      handleFirstFrameChange(buildFirstFrameFieldUpdate(entries));
    },
    [buildFirstFrameFieldUpdate, firstFrameField, handleFirstFrameChange, localFirstFrameCount],
  );

  const handleSetPrimaryFirstFrame = useCallback(
    (index: number) => {
      if (index >= localFirstFrameCount) return;
      if (index <= 0) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (index >= entries.length) return;
      const [selected] = entries.splice(index, 1);
      entries.unshift(selected);
      handleFirstFrameChange(buildFirstFrameFieldUpdate(entries));
    },
    [buildFirstFrameFieldUpdate, firstFrameField, handleFirstFrameChange, localFirstFrameCount],
  );

  const handleVeoSetFirstFrame = useCallback(
    (index: number) => {
      if (!isVeoModel) return;
      if (index >= localFirstFrameCount) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (!entries.length || index < 0 || index >= entries.length) return;
      if (entries[index]?.role === "last") {
        setErrorData({
          title: "无法设置首帧",
          list: ["该图片已被设为尾帧，请先取消尾帧或选择其他图片作为首帧。"],
        });
        return;
      }

      const updated = entries.map((entry, idx) => {
        if (idx === index) return { ...entry, role: "first" as const };
        if (entry.role === "first") return { ...entry, role: "reference" as const };
        return { ...entry, role: entry.role ?? "reference" };
      });

      const referenceCount = updated.filter((entry) => (entry.role ?? "reference") === "reference").length;
      if (referenceCount > VEO_REFERENCE_IMAGE_LIMIT) {
        setErrorData({
          title: "参考图数量超限",
          list: [`Veo 3.1 参考图最多 ${VEO_REFERENCE_IMAGE_LIMIT} 张，请先把某张设为首帧/尾帧或删除后再试。`],
        });
        return;
      }

      handleFirstFrameChange(buildFirstFrameFieldUpdate(updated, { forceRoles: true }));
    },
    [
      buildFirstFrameFieldUpdate,
      firstFrameField,
      handleFirstFrameChange,
      isVeoModel,
      localFirstFrameCount,
      setErrorData,
    ],
  );

  const handleVeoSetReferenceImage = useCallback(
    (index: number) => {
      if (!isVeoModel) return;
      if (index >= localFirstFrameCount) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (!entries.length || index < 0 || index >= entries.length) return;

      const updated = entries.map((entry, idx) => {
        if (idx !== index) return { ...entry, role: entry.role ?? "reference" };
        return { ...entry, role: "reference" as const };
      });

      const referenceCount = updated.filter((entry) => (entry.role ?? "reference") === "reference").length;
      if (referenceCount > VEO_REFERENCE_IMAGE_LIMIT) {
        setErrorData({
          title: "参考图数量超限",
          list: [`Veo 3.1 参考图最多 ${VEO_REFERENCE_IMAGE_LIMIT} 张，请先把某张设为首帧/尾帧或删除后再试。`],
        });
        return;
      }

      handleFirstFrameChange(buildFirstFrameFieldUpdate(updated, { forceRoles: true }));
    },
    [
      buildFirstFrameFieldUpdate,
      firstFrameField,
      handleFirstFrameChange,
      isVeoModel,
      localFirstFrameCount,
      setErrorData,
    ],
  );

  const handleVeoSetLastFrame = useCallback(
    (index: number) => {
      if (!isVeoModel) return;
      if (!allowLastFrame) return;
      if (index >= localFirstFrameCount) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (!entries.length || index < 0 || index >= entries.length) return;

      const hasOtherFirst = entries.some(
        (entry, idx) => (entry.role ?? (entries.length === 1 ? "first" : "reference")) === "first" && idx !== index,
      );
      if (!hasOtherFirst) {
        setErrorData({
          title: "无法设置尾帧",
          list: ["Veo 插值需要先选择首帧（首帧与尾帧不能是同一张）。"],
        });
        return;
      }
      if (entries[index]?.role === "first") {
        setErrorData({
          title: "无法设置尾帧",
          list: ["首帧与尾帧不能是同一张图片。"],
        });
        return;
      }

      const updated = entries.map((entry, idx) => {
        if (idx === index) return { ...entry, role: "last" as const };
        if (entry.role === "last") return { ...entry, role: "reference" as const };
        return { ...entry, role: entry.role ?? "reference" };
      });

      const referenceCount = updated.filter((entry) => (entry.role ?? "reference") === "reference").length;
      if (referenceCount > VEO_REFERENCE_IMAGE_LIMIT) {
        setErrorData({
          title: "参考图数量超限",
          list: [`Veo 3.1 参考图最多 ${VEO_REFERENCE_IMAGE_LIMIT} 张，请先把某张设为首帧或删除后再试。`],
        });
        return;
      }

      const target = updated[index]!;
      handleFirstFrameChange(buildFirstFrameFieldUpdate(updated, { forceRoles: true }), { skipSnapshot: true });
      handleLastFrameChange({ value: target.name, file_path: target.path }, { skipSnapshot: true });
    },
    [
      allowLastFrame,
      buildFirstFrameFieldUpdate,
      firstFrameField,
      handleFirstFrameChange,
      handleLastFrameChange,
      isVeoModel,
      localFirstFrameCount,
      setErrorData,
    ],
  );

  const handleSetLastFrame = useCallback(
    (index: number) => {
      if (index >= localFirstFrameCount) return;
      const entries = firstFrameEntries;
      if (!entries.length || index < 0 || index >= entries.length) return;
      const target = entries[index];
      handleLastFrameChange({
        value: target.name,
        file_path: target.path,
      });
    },
    [firstFrameEntries, handleLastFrameChange, localFirstFrameCount],
  );

  const handleClearLastFrame = useCallback(() => {
    if (isVeoModel) {
      const entries = collectFirstFrameEntries(firstFrameField);
      if (entries.some((entry) => entry.role === "last")) {
        handleFirstFrameChange(
          buildFirstFrameFieldUpdate(
            entries.map((entry) =>
              entry.role === "last" ? { ...entry, role: "reference" } : entry,
            ),
            { forceRoles: true },
          ),
          { skipSnapshot: true },
        );
      }
    }
    handleLastFrameChange({ value: null, file_path: null });
    if (!hasLastFrameEdge) {
      setForceFirstLastFrameMode(false);
    }
  }, [
    buildFirstFrameFieldUpdate,
    firstFrameField,
    handleFirstFrameChange,
    handleLastFrameChange,
    hasLastFrameEdge,
    isVeoModel,
    setForceFirstLastFrameMode,
  ]);

  useEffect(() => {
    if (!allowLastFrame) {
      const hasLast =
        (Array.isArray(lastFrameField?.value) && lastFrameField.value.length > 0) ||
        (!!lastFrameField?.value && !Array.isArray(lastFrameField?.value)) ||
        (Array.isArray(lastFrameField?.file_path) && lastFrameField.file_path.length > 0) ||
        (!!lastFrameField?.file_path && !Array.isArray(lastFrameField?.file_path));
      if (hasLast) {
        handleClearLastFrame();
      }
    }
  }, [allowLastFrame, lastFrameField, handleClearLastFrame]);

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
            "视频输出",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data.id, data.node?.outputs, data.type, types]);

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-[0_25px_50px_rgba(0,0,0,0.55)]">

        <div className="mt-5 flex flex-col gap-5">
          <div className="relative flex flex-col gap-4 lg:flex-row">
            {(promptHandleMeta ||
              audioHandleMeta ||
              firstFrameHandleMeta ||
              shouldShowLastFrameHandle) && (
              <div className="absolute -left-12 top-1/2 hidden -translate-y-1/2 lg:flex lg:flex-col lg:gap-3">
                {promptHandleMeta && (
                  <HandleRenderComponent
                    left
                    tooltipTitle={promptHandleMeta.tooltip}
                    id={promptHandleMeta.id}
                    title={promptHandleMeta.title}
                    nodeId={data.id}
                    myData={typeData}
                    colors={promptHandleMeta.colors}
                    colorName={promptHandleMeta.colorName}
                    setFilterEdge={setFilterEdge}
                    showNode={true}
                    testIdComplement={`${data.type?.toLowerCase()}-prompt-handle`}
                    proxy={promptHandleMeta.proxy}
                  />
                )}
                {audioHandleMeta && (
                  <HandleRenderComponent
                    left
                    tooltipTitle={audioHandleMeta.tooltip}
                    id={audioHandleMeta.id}
                    title={audioHandleMeta.title}
                    nodeId={data.id}
                    myData={typeData}
                    colors={audioHandleMeta.colors}
                    colorName={audioHandleMeta.colorName}
                    setFilterEdge={setFilterEdge}
                    showNode={true}
                    testIdComplement={`${data.type?.toLowerCase()}-audio-input-handle`}
                    proxy={audioHandleMeta.proxy}
                  />
                )}
                {firstFrameHandleMeta && (
                <HandleRenderComponent
                  left
                  tooltipTitle={firstFrameHandleMeta.tooltip}
                  id={firstFrameHandleMeta.id}
                  title={firstFrameHandleMeta.title}
                  nodeId={data.id}
                  myData={typeData}
                  colors={firstFrameHandleMeta.colors}
                  colorName={firstFrameHandleMeta.colorName}
                  setFilterEdge={setFilterEdge}
                  showNode={true}
                  testIdComplement={`${data.type?.toLowerCase()}-first-frame-handle`}
                  proxy={firstFrameHandleMeta.proxy}
                />
                )}
                {shouldShowLastFrameHandle && (
                  <HandleRenderComponent
                    left
                    tooltipTitle={lastFrameHandleMeta.tooltip}
                    id={lastFrameHandleMeta.id}
                    title={lastFrameHandleMeta.title}
                    nodeId={data.id}
                    myData={typeData}
                    colors={lastFrameHandleMeta.colors}
                    colorName={lastFrameHandleMeta.colorName}
                    setFilterEdge={setFilterEdge}
                    showNode={true}
                    testIdComplement={`${data.type?.toLowerCase()}-last-frame-handle`}
                    proxy={lastFrameHandleMeta.proxy}
                  />
                )}
              </div>
            )}
            <div className="flex-1">
              <DoubaoPreviewPanel
                nodeId={data.id}
                componentName={data.type}
                appearance="videoGenerator"
                referenceImages={combinedFirstFramePreviews}
                onRequestUpload={openFirstFrameDialog}
                onSuggestionClick={handlePreviewSuggestionClick}
              />
            </div>
            {previewOutputHandles.length > 0 && (
              <div className="absolute left-full top-1/2 hidden -translate-y-1/2 pl-6 lg:flex lg:flex-col lg:items-start">
                {previewOutputHandles.map((handle, index) => (
                  <div
                    key={`${handle.id.name ?? "video"}-${index}`}
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
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {showExpanded && (
          <div className="space-y-3 text-sm text-[#3C4057] dark:text-slate-100">
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
                  [PROMPT_NAME]: {
                    placeholder:
                      "描述你想要生成的内容，并在下方调整生成参数。（按下 Enter 生成，Shift+Enter 换行）",
                  },
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {controlConfigs.map((config) => (
                <DoubaoParameterButton key={config.name} data={data} config={config} />
              ))}

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
          )}
        </div>
      </div>

      {showExpanded && hasAdditionalFields && (
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

      <Dialog
        open={isFirstFrameDialogOpen}
        onOpenChange={setFirstFrameDialogOpen}
      >
          <DialogContent className="w-[500px]">
            <DialogHeader>
              <DialogTitle>{isSoraModel ? "上传参考图（Sora）" : "上传图片或视频"}</DialogTitle>
                <DialogDescription>
                  {isSoraModel
                    ? "Sora 系列仅支持参考图生视频（最多 1 张，将作为 input_reference）。不支持首尾帧插值，请上传 1 张图片并填写提示词。"
                    : isVeoModel
                      ? "Veo 3.1 仅支持图片输入：可设置首帧/尾帧，或最多 3 张参考图。提示：如已设置首帧/尾帧，参考图会被自动忽略（首/尾帧优先）。"
                      : "支持 JPG/PNG/WebP 等图片格式；wan2.6 还支持 MP4/MOV 参考视频。"}
               </DialogDescription>
            </DialogHeader>
          {firstFrameField ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl bg-[#F7F9FF] p-4 dark:border dark:border-white/10 dark:bg-[#111a2b]/80">
                <p className="text-sm font-medium text-foreground">
                  {isSoraModel ? "选择要上传的参考图（最多 1 张）" : "选择要上传的图片或视频（支持多选）"}
                </p>
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F4F5F9] text-sm font-medium text-[#13141A] dark:bg-white/5 dark:text-white",
                    (isFirstFrameUploadPending || !canUploadMoreFirstFrames) &&
                      "opacity-70",
                  )}
                  onClick={triggerFirstFrameUpload}
                  disabled={isFirstFrameUploadPending || !canUploadMoreFirstFrames}
                >
                  <ForwardedIconComponent
                    name={isFirstFrameUploadPending ? "Loader2" : "Upload"}
                   className={cn(
                     "h-4 w-4",
                     isFirstFrameUploadPending && "animate-spin",
                   )}
                 />
                  <span>
                    {isFirstFrameUploadPending
                      ? "上传中..."
                      : isSoraModel
                        ? "上传参考图"
                        : "上传图片或视频"}
                  </span>
                </button>
                <p className="text-xs text-muted-foreground">
                  已保留 {firstFrameCount} / {firstFrameMaxUploads} {isSoraModel ? "张参考图" : "张候选素材"}
                </p>
                {isSoraModel && firstFrameCount > 1 && (
                  <p className="text-xs text-amber-600">
                    检测到多个参考图输入，Sora 仅会使用列表中的第一张图片作为 input_reference。建议上游图片节点只生成 1 张；如为本节点上传的图片，可删除多余项。
                  </p>
                )}
                {!canUploadMoreFirstFrames && (
                  <p className="text-xs text-amber-600">
                    {isSoraModel
                      ? "已达到参考图上限，请删除后再上传。"
                      : "已达到候选图上限，请删除不需要的图片后再上传。"}
                  </p>
                )}
                {selectedFirstFrame && (
                  <p className="text-xs text-[#4B5168] dark:text-slate-200">
                    {isSoraModel ? "当前参考图：" : "当前首帧："}
                    {selectedFirstFrame.fileName ?? selectedFirstFrame.label}
                  </p>
                )}
                {allowLastFrame ? (
                  selectedLastFrame ? (
                    <div className="flex items-center justify-between text-xs text-[#4B5168] dark:text-slate-200">
                      <span>
                        当前尾帧：{selectedLastFrame.fileName ?? selectedLastFrame.label}
                        {isSelectedLastFrameFromUpstream ? "（上游）" : ""}
                      </span>
                      <button
                        type="button"
                        className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                        onClick={() => {
                          if (isSelectedLastFrameFromUpstream && upstreamLastFrameNodeId) {
                            setNodes((currentNodes) =>
                              currentNodes.map((node) => ({
                                ...node,
                                selected: node.id === data.id || node.id === upstreamLastFrameNodeId,
                              })),
                            );
                            requestUploadDialogForNode(upstreamLastFrameNodeId);
                            return;
                          }
                          handleClearLastFrame();
                        }}
                      >
                        {isSelectedLastFrameFromUpstream ? "前往上游" : "清除尾帧"}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[#4B5168] dark:text-slate-200">
                      请选择图片设置为尾帧，模型将按首尾衔接生成视频。
                    </p>
                  )
                ) : isSoraModel ? null : (
                  <p className="text-xs text-amber-700">当前模型不支持尾帧设置</p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-dashed border-[#E0E5F2] bg-white/80 p-3 dark:border-white/15 dark:bg-[#0a1220]/70">
                <div className="flex items-center justify-between text-xs text-[#636A86] dark:text-slate-300">
                  <span>{isSoraModel ? "参考图管理" : "首帧候选管理"}</span>
                  <span className="font-medium text-[#1B66FF]">
                    {firstFrameCount} / {firstFrameMaxUploads}
                  </span>
                </div>

                {firstFrameCount > 0 ? (
                  <div className="space-y-3">
                    {isVeoModel && veoHasFirstOrLastLocally && veoHasReferenceLocally && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                        已设置首帧/尾帧：参考图将被忽略（首/尾帧优先）。
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                    {combinedFirstFramePreviews.map((preview, index) => {
                      const previewSource =
                        preview.downloadSource ?? preview.imageSource ?? "";
                      const isSelectedLastFrame =
                        allowLastFrame &&
                        selectedLastFrameSource &&
                        previewSource &&
                        previewSource.toString().trim() === selectedLastFrameSource;
                      const isUpstream = index >= localFirstFrameCount;
                      const localRole = !isUpstream ? firstFrameEntries[index]?.role : undefined;
                      const isSelectedFirstFrame = isVeoModel
                        ? localRole === "first" ||
                          (!localRole &&
                            !isUpstream &&
                            firstFrameEntries.length === 1 &&
                            index === 0)
                        : index === 0;

                      return (
                        <div
                          key={preview.id ?? `${preview.imageSource}-${index}`}
                          className="group relative flex flex-col overflow-hidden rounded-xl border border-[#E2E7F5] bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
                        >
                          <div className="relative h-28 w-full overflow-hidden">
                            {isVideoCandidate(previewSource, preview.fileName) ? (
                              <video
                                src={previewSource}
                                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                                <img
                                  src={preview.imageSource}
                                  alt={
                                    preview.label ??
                                    preview.fileName ??
                                    `${isSoraModel ? "参考图" : "候选素材"} ${index + 1}`
                                  }
                                  className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                />
                              )}
                              {isSelectedFirstFrame && (
                                <span className="absolute left-3 top-3 rounded-full bg-[#1B66FF]/90 px-2 py-0.5 text-[11px] font-medium text-white shadow">
                                  {isVeoModel ? "首帧" : isSoraModel ? "参考图" : "当前首帧"}
                                </span>
                              )}
                            {isVeoModel && !isUpstream && localRole === "reference" && (
                              <span className="absolute left-3 top-3 rounded-full bg-[#10B981]/90 px-2 py-0.5 text-[11px] font-medium text-white shadow">
                                {veoHasFirstOrLastLocally ? "参考图(将忽略)" : "参考图"}
                              </span>
                            )}
                            {isSelectedLastFrame && (
                              <span className="absolute right-3 top-3 rounded-full bg-[#111827]/80 px-2 py-0.5 text-[11px] font-medium text-white shadow">
                                {isVeoModel ? "尾帧" : "当前尾帧"}
                              </span>
                            )}
                            {isUpstream && (
                              <span className="absolute left-3 bottom-3 rounded-full bg-[#0f172a]/70 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                                上游
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between px-3 py-2 text-[11px] text-[#5E6484] dark:text-slate-200">
                            <span className="line-clamp-1">
                              {preview.label ??
                                preview.fileName ??
                                `${isSoraModel ? "参考图" : "候选图"} ${index + 1}`}
                            </span>
                            <div className="flex items-center gap-2">
                              {isVeoModel ? (
                                <>
                                  {allowLastFrame && (
                                    <button
                                      type="button"
                                      className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                      onClick={() => handleVeoSetLastFrame(index)}
                                      disabled={isUpstream}
                                    >
                                      {isSelectedLastFrame ? "已设尾帧" : "设为尾帧"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                    onClick={() => handleVeoSetFirstFrame(index)}
                                    disabled={isUpstream || isSelectedFirstFrame}
                                  >
                                    {isSelectedFirstFrame ? "已设首帧" : "设为首帧"}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[#10B981] hover:underline dark:text-[#34d399]"
                                    onClick={() => handleVeoSetReferenceImage(index)}
                                    disabled={isUpstream || localRole === "reference"}
                                  >
                                    {localRole === "reference" ? "已设参考" : "设为参考"}
                                  </button>
                                </>
                              ) : (
                                <>
                                  {allowLastFrame && (
                                    <button
                                      type="button"
                                      className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                      onClick={() => handleSetLastFrame(index)}
                                      disabled={isUpstream}
                                    >
                                      {isSelectedLastFrame ? "已设尾帧" : "设为尾帧"}
                                    </button>
                                  )}
                                  {!isSoraModel && index !== 0 && (
                                    <button
                                      type="button"
                                      className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                      onClick={() => handleSetPrimaryFirstFrame(index)}
                                      disabled={isUpstream}
                                    >
                                      设为首帧
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                type="button"
                                className="text-[#C93636] hover:underline dark:text-[#ff9a9a] disabled:text-[#C93636]/40 dark:disabled:text-[#ff9a9a]/50"
                                onClick={() => handleFirstFrameRemove(index)}
                                disabled={isUpstream}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isSoraModel
                      ? "目前还没有参考图，点击上方按钮上传 1 张图片。"
                      : "目前还没有候选素材，点击上方按钮上传图片或视频。"}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              当前组件不支持首帧上传。
            </p>
          )}
          <DialogFooter>
            <p className="w-full text-center text-xs text-muted-foreground">
              {isSoraModel
                ? "Sora 最多 1 张参考图（input_reference）。"
                : isVeoModel
                  ? "最多保留 5 份素材（首帧 1、尾帧 1、参考图最多 3）。"
                  : `最多保留 ${firstFrameMaxUploads} 张候选图，新上传的图片默认用作首帧。`}
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type FirstFrameEntry = {
  name: string;
  path: string;
  role?: "first" | "reference" | "last";
};

async function handleFirstFrameUpload({
  referenceField,
  accept,
  allowedExtensions,
  currentFlowId,
  uploadReferenceFile,
  validateFileSize,
  handleReferenceChange,
  setErrorData,
  setReferenceUploadPending,
  maxEntries,
  enableRoles,
  maxReferenceImages,
}: {
  referenceField: InputFieldType;
  accept: string;
  allowedExtensions: string[];
  currentFlowId: string;
  uploadReferenceFile: (payload: { file: File; id: string }) => Promise<{
    file_path?: string;
  }>;
  validateFileSize: (file: File) => void;
  handleReferenceChange: handleOnNewValueType;
  setErrorData: (payload: any) => void;
  setReferenceUploadPending: (loading: boolean) => void;
  maxEntries: number;
  enableRoles: boolean;
  maxReferenceImages: number | null;
}) {
  if (!currentFlowId) {
    setErrorData({
      title: maxEntries === 1 ? "无法上传参考图" : "无法上传首帧图",
      list: ["请先保存或重新打开画布后再试。"],
    });
    return;
  }

  const files = await createFileUpload({
    multiple: maxEntries > 1,
    accept,
  });
  if (!files.length) return;

  for (const file of files) {
    try {
      validateFileSize(file);
    } catch (error: any) {
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
        title: "仅支持以下格式",
        list: [allowedExtensions.map((ext) => ext.toUpperCase()).join(", ")],
      });
      return;
    }
  }

  const existingEntries = collectFirstFrameEntries(referenceField);
  if (existingEntries.length + files.length > maxEntries) {
    setErrorData({
      title: "已达到候选素材上限",
      list: [`最多保留 ${maxEntries} 份素材，请先删除不需要的图片后再上传。`],
    });
    return;
  }

  if (enableRoles && maxReferenceImages != null) {
    const existingReferenceCount = existingEntries.filter(
      (entry) => (entry.role ?? "reference") === "reference",
    ).length;
    const newReferenceCount =
      existingEntries.length === 0 && files.length === 1 ? 0 : files.length;
    if (existingReferenceCount + newReferenceCount > maxReferenceImages) {
      setErrorData({
        title: "参考图数量超限",
        list: [
          `Veo 3.1 参考图最多 ${maxReferenceImages} 张：请先把某张设为首帧/尾帧或删除后再上传。`,
        ],
      });
      return;
    }
  }

  setReferenceUploadPending(true);
  try {
    const uploadedEntries: FirstFrameEntry[] = [];
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
        const defaultRole =
          enableRoles && existingEntries.length === 0 && files.length === 1
            ? "first"
            : enableRoles
              ? "reference"
              : undefined;
        uploadedEntries.push({ name: file.name, path: serverPath, role: defaultRole });
      } catch (error: any) {
        console.error(error);
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

    const mergedEntries = [...uploadedEntries, ...existingEntries];

    handleReferenceChange(
      enableRoles
        ? {
            value: mergedEntries.map((entry) => ({
              name: entry.name,
              display_name: entry.name,
              role: entry.role ?? (mergedEntries.length === 1 ? "first" : "reference"),
            })),
            file_path: mergedEntries.map((entry) => entry.path),
          }
        : {
            value: mergedEntries.map((entry) => entry.name),
            file_path: mergedEntries.map((entry) => entry.path),
          },
    );
  } finally {
    setReferenceUploadPending(false);
  }
}

function collectFirstFrameEntries(field: InputFieldType): FirstFrameEntry[] {
  const values = toArray(field.value);
  const paths = toArray(field.file_path);
  const length = Math.max(values.length, paths.length);
  const entries: FirstFrameEntry[] = [];
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
      `候选素材 ${index + 1}`;
    const role =
      rawValue && typeof rawValue === "object"
        ? extractReferenceRole(rawValue)
        : undefined;
    entries.push({
      name: resolvedName,
      path: resolvedPath,
      role,
    });
  }
  return entries;
}

function buildFirstFramePreviewItemsFromFields(
  fields: InputFieldType[],
): DoubaoReferenceImage[] {
  if (!fields.length) return [];
  const previews: DoubaoReferenceImage[] = [];
  fields.forEach((field) => {
    previews.push(...buildFirstFramePreviewItems(field));
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

function buildFirstFramePreviewItems(
  field: InputFieldType,
): DoubaoReferenceImage[] {
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
      `候选素材 ${index + 1}`;
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

function extractReferenceRole(entry: unknown): FirstFrameEntry["role"] | undefined {
  if (!entry && entry !== 0) return undefined;
  if (typeof entry !== "object") return undefined;
  const record = entry as any;
  const direct = record.role;
  if (typeof direct === "string" && direct.trim()) {
    const normalized = direct.trim();
    if (normalized === "first" || normalized === "reference" || normalized === "last") {
      return normalized;
    }
  }
  const nested = record.value;
  if (nested && typeof nested === "object") {
    const nestedRole = (nested as any).role;
    if (typeof nestedRole === "string" && nestedRole.trim()) {
      const normalized = nestedRole.trim();
      if (normalized === "first" || normalized === "reference" || normalized === "last") {
        return normalized;
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
    (segments[1] === "images" || segments[1] === "download")
  ) {
    segments = segments.slice(2);
  }
  if (segments.length < 2) return null;
  const [flowId, ...rest] = segments;
  if (!flowId || !rest.length) return null;
  const encodedFlow = encodeURIComponent(flowId);
  const encodedFile = rest.map((part) => encodeURIComponent(part)).join("/");
  const fileName = rest[rest.length - 1];
  const url = isVideoCandidate(trimmed, fileName)
    ? `${BASE_URL_API}files/download/${encodedFlow}/${encodedFile}`
    : `${BASE_URL_API}files/images/${encodedFlow}/${encodedFile}`;
  return {
    url,
    downloadUrl: url,
    fileName,
    sourceId: `${flowId}-${fileName}`,
  };
}

function isVideoCandidate(source: string | undefined, fileName?: string) {
  const combined = `${fileName ?? ""} ${source ?? ""}`.toLowerCase();
  return combined.includes(".mp4") || combined.includes(".mov");
}

function extractFileName(value: string): string | undefined {
  if (!value) return undefined;
  const sanitized = value.replace(/\\/g, "/");
  const parts = sanitized.split("/");
  return parts.pop() || undefined;
}
