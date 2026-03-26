import { cloneDeep } from "lodash";
import { type ReactFlowState, useStore } from "@xyflow/react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import DoubaoPreviewPanel, { type DoubaoPreviewPanelActions, type DoubaoReferenceImage } from "./DoubaoPreviewPanel";
import MediaReferencePromptInput from "@/components/MediaReferencePromptInput";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import GenerationCostPill from "./GenerationCostPill";
import DoubaoQuickAddMenu from "./DoubaoQuickAddMenu";
import RenderInputParameters from "./RenderInputParameters";
import PromptModal from "@/modals/promptModal";
import { cn } from "@/utils/utils";
import type {
  EdgeType,
  GenericNodeType,
  NodeDataType,
  sourceHandleType,
  targetHandleType,
} from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { useTypesStore } from "@/stores/typesStore";
import { track } from "@/customization/utils/analytics";
import {
  findLastNode,
  getNodeId,
  getImageRoleLimits,
  resolveEdgeImageRole,
  scapedJSONStringfy,
  scapeJSONParse,
  type EdgeImageRole,
} from "@/utils/reactflowUtils";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import { getNodeInputColors } from "@/CustomNodes/helpers/get-node-input-colors";
import { getNodeInputColorsName } from "@/CustomNodes/helpers/get-node-input-colors-name";
import { computeAlignedNodeTopY } from "@/CustomNodes/helpers/previewCenterAlignment";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  buildRangeOptions,
  DOUBAO_CONTROL_HINTS,
  DOUBAO_CONFIG_TOOLTIP,
} from "./DoubaoParameterButton";
import DoubaoVideoGeneratorResolutionAspectDurationButton from "./DoubaoVideoGeneratorResolutionAspectDurationButton";
import HandleRenderComponent from "./handleRenderComponent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useHandleNodeClass from "@/CustomNodes/hooks/use-handle-node-class";
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
import KlingElementPickerButton from "@/components/kling/KlingElementPickerButton";
import type { MediaReferenceSuggestion } from "@/components/mediaReferencePromptUtils";
import { generationPromptInputBusyClass } from "./promptGenerationStyles";
import type { KlingElement } from "@/stores/klingElementsStore";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "flex-none basis-[170px]" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[140px]" },
  { name: "aspect_ratio", icon: "RectangleHorizontal", widthClass: "basis-[150px]" },
  { name: "duration", icon: "Timer", widthClass: "basis-[110px]" },
] as const;

const UPSCALE_CONTROL_FIELDS = [
  { name: "vidu_upscale_resolution", icon: "Monitor", widthClass: "basis-[140px]" },
] as const;

const PROMPT_NAME = "prompt";
const DEFAULT_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16];
const FIRST_FRAME_FIELD = "first_frame_image" as const;
const LAST_FRAME_FIELD = "last_frame_image" as const;
const ASPECT_RATIO_FIELD = "aspect_ratio";
const AUDIO_INPUT_FIELD = "audio_input";
const ENABLE_AUDIO_FIELD = "enable_audio";
const USER_UPLOAD_VIDEO_EXTENSIONS = ["mp4", "mov", "webm"];
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
  "Seedance 1.5 pro": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 4,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.5-pro｜251215": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 4,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Seedance 1.0 pro": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro｜250528": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: true,
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
  "kling O1": {
    minDuration: 3,
    maxDuration: 10,
    enableLastFrame: true,
  },
  "kling O3": {
    minDuration: 3,
    maxDuration: 15,
    enableLastFrame: true,
  },
  "kling V3": {
    minDuration: 3,
    maxDuration: 15,
    enableLastFrame: true,
  },
  "viduq3-pro": {
    minDuration: 1,
    maxDuration: 16,
    enableLastFrame: false,
  },
  "viduq2-pro": {
    // Mode-dependent in backend (t2v/i2v: 1-10, start-end: 1-8, reference2video: 0-10).
    // Keep this permissive here; backend range_spec will drive the actual UI options.
    minDuration: 0,
    maxDuration: 10,
    enableLastFrame: true,
  },
  "vidu-upscale": {
    resolutions: ["1080p", "2K", "4K", "8K"],
    enableLastFrame: false,
  },
};

function hasVideoInFileInput(field: any): boolean {
  if (!field) return false;
  const candidates: any[] = [];
  if (Array.isArray(field.file_path)) candidates.push(...field.file_path);
  else if (field.file_path) candidates.push(field.file_path);
  if (Array.isArray(field.value)) candidates.push(...field.value);
  else if (field.value) candidates.push(field.value);

  const hasVideoExt = (raw: any): boolean => {
    if (!raw) return false;
    if (typeof raw === "string") {
      const s = raw.split("?", 1)[0].toLowerCase();
      // Some uploads are stored with a "masked" extension (e.g. ".mp_") even though the bytes are MP4.
      return (
        s.endsWith(".mp4") ||
        s.endsWith(".flv") ||
        s.endsWith(".m3u8") ||
        s.endsWith(".mxf") ||
        s.endsWith(".mov") ||
        s.endsWith(".avi") ||
        s.endsWith(".webm") ||
        s.endsWith(".mkv") ||
        s.endsWith(".ts") ||
        s.endsWith(".mp_")
      );
    }
    if (typeof raw === "object") {
      // Common shapes from Data/file components
      const nested = (raw as any).file_path ?? (raw as any).path ?? (raw as any).value;
      return hasVideoExt(nested);
    }
    return false;
  };

  return candidates.some(hasVideoExt);
}

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

function resolvePreferredOrFirstEnabledOption(
  config: DoubaoControlConfig | undefined,
  preferred: unknown,
): string | number | undefined {
  if (!config) return undefined;
  const options = Array.isArray(config.options) ? config.options : [];
  if (!options.length) return undefined;

  const disabledSet = new Set((config.disabledOptions ?? []).map((opt) => String(opt)));
  const enabledOptions = options.filter((opt) => !disabledSet.has(String(opt)));
  if (!enabledOptions.length) return undefined;

  const preferredString =
    preferred === undefined || preferred === null ? "" : String(preferred).trim();
  if (preferredString) {
    const matched = enabledOptions.find((opt) => String(opt).trim() === preferredString);
    if (matched !== undefined) return matched;
  }
  return enabledOptions[0];
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
const KLING_MAX_UPLOADS = 7;
const VEO_REFERENCE_IMAGE_LIMIT = 3;
const VEO_MAX_UPLOADS = 5;
const VEO_FAST_MAX_UPLOADS = 2;
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
const KLING_MULTI_SHOT_FIELD_FALLBACK: InputFieldType = {
  type: "bool",
  required: false,
  placeholder: "",
  list: false,
  show: false,
  readonly: false,
  name: "kling_multi_shot",
  display_name: "多镜头模式",
  value: false,
};
const KLING_SHOT_TYPE_FIELD_FALLBACK: InputFieldType = {
  type: "str",
  required: false,
  placeholder: "",
  list: false,
  show: false,
  readonly: false,
  name: "kling_shot_type",
  display_name: "Kling 分镜方式",
  // Default per requirement: intelligent storyboarding.
  value: "intelligence",
};
const KLING_MULTI_PROMPT_FIELD_FALLBACK: InputFieldType = {
  type: "str",
  required: false,
  placeholder: "",
  list: false,
  show: false,
  readonly: false,
  name: "kling_multi_prompt",
  display_name: "Kling Multi Prompt",
  value: "[]",
  multiline: true,
};

type Props = {
  data: NodeDataType;
  types: any;
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
type CandidatePreview = DoubaoReferenceImage & {
  originField: typeof FIRST_FRAME_FIELD | typeof LAST_FRAME_FIELD;
  isUpstream: boolean;
  sourceIndex?: number;
};

export default function DoubaoVideoGeneratorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
  onPreviewActionsChange,
  onPersistentPreviewMotionStart,
  onPersistentPreviewMotionCommit,
}: Props) {
  const UPSTREAM_NODE_OFFSET_X = 950;
  const UPSTREAM_NODE_OFFSET_Y = 750;
  const IMAGE_OUTPUT_NAME = "image";
  const VIDEO_OUTPUT_NAME = "video";
  const TEXT_COMPONENT_NAME = "TextCreation";
  const TEXT_OUTPUT_NAME = "text_output";
  const TEXT_DRAFT_FIELD_NAME = "draft_text";
  const AUDIO_COMPONENT_NAME = "DoubaoTTS";
  const AUDIO_OUTPUT_NAME = "audio";
  const FIRST_FRAME_BUTTON_LABEL = "首帧生成视频";
  const FIRST_LAST_FRAME_BUTTON_LABEL = "首尾帧生成视频";
  const DEFAULT_LAST_FRAME_MODEL = "Seedance 1.0 pro";
  const template = data.node?.template ?? {};
  // Avoid resizing the node while the user is box-selecting; resizing can cause the
  // selection set to oscillate and look like "twitching".
  const userSelectionActive = useStore((s) => s.userSelectionActive);
  const showExpanded = Boolean(selected) && !userSelectionActive;
  const selectedModel =
    (template.model_name?.value as string | undefined) ??
    (template.model_name?.default as string | undefined) ??
    (template.model_name?.options?.[0] as string | undefined) ??
    "";
  const normalizedModelName = selectedModel.toString().trim();

  const isWanModel = normalizedModelName.startsWith("wan2.");
  const isVeoFast = normalizedModelName === "veo3.1-fast";
  const isVeoModel = normalizedModelName === "VEO3.1" || isVeoFast;
  const isSoraModel = normalizedModelName === "sora-2" || normalizedModelName === "sora-2-pro";
  const isSeedanceModel =
    normalizedModelName.toLowerCase().includes("seedance") ||
    normalizedModelName.toLowerCase().includes("seedream") ||
    normalizedModelName.includes("即梦");
  const isKlingModel = normalizedModelName.toLowerCase().startsWith("kling");
  const isViduUpscaleModel = normalizedModelName.toLowerCase() === "vidu-upscale";
  const klingModelLower = normalizedModelName.trim().toLowerCase();
  const isKlingO3 = isKlingModel && (klingModelLower === "kling o3" || klingModelLower === "kling-v3-omni");
  const isKlingV3 = isKlingModel && (klingModelLower === "kling v3" || klingModelLower === "kling-v3");
  const isKlingMultiShotModel = isKlingO3 || isKlingV3;
  const klingMultiShotEnabled = useMemo(() => {
    if (!isKlingMultiShotModel) return false;
    const field: any = (template as any).kling_multi_shot;
    const raw = field?.value ?? field?.default ?? false;
    if (raw === true) return true;
    if (raw === false) return false;
    const s = String(raw).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }, [isKlingMultiShotModel, template]);
  const klingShotType = useMemo(() => {
    if (!isKlingMultiShotModel) return "customize";
    const raw: any =
      (template as any).kling_shot_type?.value ??
      (template as any).kling_shot_type?.default ??
      "";
    const s = String(raw ?? "").trim().toLowerCase();
    if (s === "customize" || s === "intelligence") return s;
    return "intelligence";
  }, [isKlingMultiShotModel, template]);
  const klingIntelligentShotEnabled = Boolean(
    isKlingMultiShotModel && klingMultiShotEnabled && klingShotType === "intelligence",
  );
  const klingElementIdsValue = String(template.kling_element_ids?.value ?? "").trim();
  const selectedKlingElementIds = useMemo(() => {
    const raw = String(klingElementIdsValue || "");
    const hits = raw.match(/\d+/g) ?? [];
    const ids = hits
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(ids));
  }, [klingElementIdsValue]);
  const klingElementApplied = isKlingModel && selectedKlingElementIds.length > 0;
  const isViduModel = normalizedModelName.toLowerCase().startsWith("vidu");
  const isViduQ2Pro = normalizedModelName === "viduq2-pro";
  const klingReferType = String(
    template.kling_video_refer_type?.value ??
    template.kling_video_refer_type?.default ??
    template.kling_video_refer_type?.options?.[0] ??
    "feature",
  )
    .trim()
    .toLowerCase();
  const roleLimits = useMemo(
    () => getImageRoleLimits(normalizedModelName),
    [normalizedModelName],
  );
  const supportsReferenceRole = roleLimits.allowedRoles.includes("reference");
  const modelLimits = MODEL_LIMITS[normalizedModelName] ?? null;
  const allowLastFrame = (modelLimits?.enableLastFrame ?? true) && !(isKlingModel && klingReferType === "base");
  const veoReferenceLimit = isVeoFast ? 0 : VEO_REFERENCE_IMAGE_LIMIT;
  const firstFrameMaxUploads = isSoraModel
    ? 1
    : isVeoFast
      ? VEO_FAST_MAX_UPLOADS
      : isVeoModel
        ? VEO_MAX_UPLOADS
        : isKlingModel
          ? (isKlingV3 ? 1 : KLING_MAX_UPLOADS)
          : isViduQ2Pro
            ? 6
            : isViduModel
              ? 1
            : FIRST_FRAME_MAX_UPLOADS;
  const customFields = new Set<string>([
    PROMPT_NAME,
    FIRST_FRAME_FIELD,
    LAST_FRAME_FIELD,
    AUDIO_INPUT_FIELD,
    ENABLE_AUDIO_FIELD,
    ...CONTROL_FIELDS.map((item) => item.name),
    ...UPSCALE_CONTROL_FIELDS.map((item) => item.name),
    "vidu_upscale_max_wait_seconds",
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
      ...(isViduUpscaleModel
        ? {
          is_list: false,
          list: false,
          file_types: ["mp4", "flv", "m3u8", "mxf", "mov", "ts", "webm", "mkv"],
          fileTypes: ["mp4", "flv", "m3u8", "mxf", "mov", "ts", "webm", "mkv"],
        }
        : {}),
    };
  }, [firstFrameFieldRaw, isViduUpscaleModel]);
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
  const handleModelNameChangePreserve = useCallback(
    (nextValue: string, options?: Parameters<handleOnNewValueType>[1]) => {
      const snapshotField = (field: any) => {
        const value = field?.value;
        const file_path = field?.file_path;
        return {
          value: Array.isArray(value) ? [...value] : value,
          file_path: Array.isArray(file_path) ? [...file_path] : file_path,
        };
      };

      const preserved = {
        first: snapshotField(template?.[FIRST_FRAME_FIELD]),
        last: snapshotField(template?.[LAST_FRAME_FIELD]),
        reference: snapshotField(template?.reference_images),
        audio: snapshotField(template?.[AUDIO_INPUT_FIELD]),
        enableAudio: snapshotField(template?.[ENABLE_AUDIO_FIELD]),
      };

      handleModelNameChange(
        { value: nextValue },
        {
          ...options,
          setNodeClass: (newNodeClass) => {
            const nextTemplate = newNodeClass?.template;
            if (!nextTemplate) return;

            const apply = (fieldName: string, payload: any) => {
              const field = nextTemplate[fieldName];
              if (!field) return;
              if (payload.value !== undefined) field.value = payload.value;
              if (payload.file_path !== undefined) field.file_path = payload.file_path;
            };

            apply(FIRST_FRAME_FIELD, preserved.first);
            apply(LAST_FRAME_FIELD, preserved.last);
            apply("reference_images", preserved.reference);
            apply(AUDIO_INPUT_FIELD, preserved.audio);
            apply(ENABLE_AUDIO_FIELD, preserved.enableAudio);

            options?.setNodeClass?.(newNodeClass);
          },
        },
      );
    },
    [handleModelNameChange, template],
  );


  // Migrate legacy Seedance display names (older saved flows) to the new dropdown labels.
  useEffect(() => {
    const legacyToNew: Record<string, string> = {
      "Doubao-Seedance-1.5-proï½?51215": "Seedance 1.5 pro",
      "Doubao-Seedance-1.0-proï½?50528": "Seedance 1.0 pro",
    };
    const next = legacyToNew[normalizedModelName];
    if (!next) return;
    const options: string[] = Array.isArray(template?.model_name?.options) ? template.model_name.options : [];
    if (options.length && !options.includes(next)) return;
    handleModelNameChangePreserve(next, { skipSnapshot: true });
  }, [handleModelNameChangePreserve, normalizedModelName, template?.model_name?.options]);
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
  const { handleOnNewValue: handlePromptChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: PROMPT_NAME,
  });
  const { handleOnNewValue: handleKlingReferTypeChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "kling_video_refer_type",
  });
  const { handleOnNewValue: handleKlingMultiPromptChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "kling_multi_prompt",
  });
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const { mutateAsync: uploadFirstFrameFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const [isRunHovering, setRunHovering] = useState(false);

  const stripElementTokens = useCallback((prompt: string) => {
    let next = String(prompt ?? "");
    next = next.replace(/^\s*<<<element_\d+>>>\s*$(\r?\n)?/gim, "");
    next = next.replace(/<<<element_\d+>>>/g, "");
    next = next.replace(/^\s*\r?\n/g, "");
    return next;
  }, []);

  const applyKlingElement = useCallback(
    (elements: KlingElement[], options?: { skipSnapshot?: boolean }) => {
      if (!isKlingModel) return;
      if (!options?.skipSnapshot) useFlowsManagerStore.getState().takeSnapshot();
      useFlowStore.getState().setNodes((currentNodes) =>
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
    [data.id, isKlingModel, stripElementTokens],
  );
  const [quickAddMenu, setQuickAddMenu] = useState<{
    x: number;
    y: number;
    kind: "input" | "output";
  } | null>(null);
  const lockedPlusSide = quickAddMenu?.kind
    ? (quickAddMenu.kind === "input" ? "left" : "right")
    : null;

  // Video creator "+" handles: hidden when node is not selected; shown when cursor enters
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
          [
            { transform: "translateY(0px)" },
            { transform: `translateY(${motion.deltaCenterPx}px)` },
          ],
          { duration: motion.durationMs, easing: motion.easing, fill: "both" },
        );
        previewHandleAnimsRef.current.push(anim);
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
      const withinY =
        rawY >= -106 - slopNodeSpace && rawY <= 106 + slopNodeSpace;

      return withinX && withinY;
    },
    [canvasZoom],
  );

  const computePlusOffset = useCallback(
    (side: PlusSide, clientX: number, clientY: number) => {
      const rect = previewWrapRef.current?.getBoundingClientRect();
      if (!rect) return DEFAULT_PLUS_OFFSET[side];

      // Bubble/zone transforms are inside the ReactFlow viewport and therefore scale with zoom.
      // Convert screen-space pointer delta -> node-space delta so the "+" can truly track the cursor.
      const zoom = canvasZoom || 1;

      // Convert screen-space pointer position -> node-space offset relative to the preview edge,
      // so the bubble center can precisely match the cursor across different zoom levels.
      const edgeX = side === "left" ? rect.left : rect.right;
      const centerY = rect.top + rect.height / 2;

      // Capture zone: 212x212 square centered at the default "+" center point.
      // Left side x-range in node-space is [-212, 0]; right side is [0, 212].
      const rawX = (clientX - edgeX) / zoom;
      const clampedX =
        side === "left"
          ? Math.max(-212, Math.min(0, rawX))
          : Math.max(0, Math.min(212, rawX));
      const clampedY = Math.max(-106, Math.min(106, (clientY - centerY) / zoom));

      return { x: clampedX, y: clampedY };
    },
    [DEFAULT_PLUS_OFFSET, canvasZoom],
  );

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
    [DEFAULT_PLUS_OFFSET, clearPlusTimers, isPointerInCaptureZone, selected],
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
  const stopLatestChainForNode = useFlowStore(
    (state) => state.stopLatestChainForNode,
  );
  const eventDeliveryConfig = useUtilityStore((state) => state.eventDelivery);
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const setNode = useFlowStore((state) => state.setNode);
  const setEdges = useFlowStore((state) => state.setEdges);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const typeData = useTypesStore((state) => state.data);
  const { handleNodeClass } = useHandleNodeClass(data.id);
  const promptSnapshotTakenRef = useRef(false);
  const klingMultiShotSnapshotTakenRef = useRef(false);
  const [isPromptFocused, setPromptFocused] = useState(false);
  const [isPromptComposing, setIsPromptComposing] = useState(false);
  const [promptCompositionValue, setPromptCompositionValue] = useState<string | null>(null);
  const promptValue = String(template[PROMPT_NAME]?.value ?? "");
  const [promptDraftValue, setPromptDraftValue] = useState(promptValue);

  useEffect(() => {
    if (!showExpanded) {
      // Reset "single undo step" snapshot sentinel when the overlay closes.
      promptSnapshotTakenRef.current = false;
      klingMultiShotSnapshotTakenRef.current = false;
    }
  }, [showExpanded]);

  // Some models (e.g. kling O1) use a dedicated `last_frame_image` input, but older templates may omit it.
  // If the field is missing, `cleanEdges()` will auto-remove edges targeting it. Ensure it exists in the node template.
  useEffect(() => {
    if (!isKlingModel) return;
    if (!allowLastFrame) return;
    if (template[LAST_FRAME_FIELD]) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== data.id) return node;
        const currentTemplate = node.data?.node?.template ?? {};
        if (currentTemplate[LAST_FRAME_FIELD]) return node;
        return {
          ...node,
          data: {
            ...node.data,
            node: {
              ...node.data.node,
              template: {
                ...currentTemplate,
                [LAST_FRAME_FIELD]: {
                  ...LAST_FRAME_FIELD_FALLBACK,
                },
              },
            },
          },
        };
      }),
    );
  }, [allowLastFrame, data.id, isKlingModel, setNodes, template]);

  // Multi-shot fields were introduced later for kling O3/V3; older saved flows may not have them in the template.
  useEffect(() => {
    if (!isKlingMultiShotModel) return;
    const hasMultiShot = Boolean((template as any).kling_multi_shot);
    const hasShotType = Boolean((template as any).kling_shot_type);
    const hasMultiPrompt = Boolean((template as any).kling_multi_prompt);
    if (hasMultiShot && hasShotType && hasMultiPrompt) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== data.id) return node;
        const currentTemplate = node.data?.node?.template ?? {};
        const nextTemplate: any = { ...currentTemplate };
        if (!nextTemplate.kling_multi_shot) nextTemplate.kling_multi_shot = { ...KLING_MULTI_SHOT_FIELD_FALLBACK };
        if (!nextTemplate.kling_shot_type) {
          // Backward-compat: before we introduced `shot_type=intelligence`, multi-shot always meant multi_prompt (customize).
          // If an older saved flow has multi-shot enabled (or has a non-empty multi_prompt), default to customize to preserve behavior.
          const rawMultiShot =
            currentTemplate?.kling_multi_shot?.value ?? currentTemplate?.kling_multi_shot?.default ?? false;
          const multiShotEnabled =
            rawMultiShot === true ||
            (typeof rawMultiShot === "string" &&
              ["true", "1", "yes"].includes(rawMultiShot.trim().toLowerCase()));
          const rawMultiPrompt = String(
            currentTemplate?.kling_multi_prompt?.value ?? currentTemplate?.kling_multi_prompt?.default ?? "",
          ).trim();
          const hasMultiPrompt = rawMultiPrompt !== "" && rawMultiPrompt !== "[]";
          const inferred = multiShotEnabled || hasMultiPrompt ? "customize" : "intelligence";
          nextTemplate.kling_shot_type = { ...KLING_SHOT_TYPE_FIELD_FALLBACK, value: inferred };
        }
        if (!nextTemplate.kling_multi_prompt) nextTemplate.kling_multi_prompt = { ...KLING_MULTI_PROMPT_FIELD_FALLBACK };
        return {
          ...node,
          data: {
            ...node.data,
            node: {
              ...node.data.node,
              template: nextTemplate,
            },
          },
        };
      }),
    );
  }, [data.id, isKlingMultiShotModel, setNodes, template]);
  const hasAnyConnection = useMemo(
    () => edges.some((edge) => edge.source === data.id || edge.target === data.id),
    [edges, data.id],
  );
  const isPromptEmpty = useMemo(() => {
    const value = template[PROMPT_NAME]?.value;
    if (typeof value === "string") return value.trim().length === 0;
    return value === undefined || value === null;
  }, [template]);

  const klingMultiPromptRaw = String(
    (template as any).kling_multi_prompt?.value ??
      (template as any).kling_multi_prompt?.default ??
      "[]",
  );
  type KlingMultiShotItem = { index: number; prompt: string; duration: number };
  const klingMultiPromptItems = useMemo<KlingMultiShotItem[]>(() => {
    if (!klingMultiPromptRaw.trim()) return [];
    try {
      const parsed = JSON.parse(klingMultiPromptRaw);
      if (!Array.isArray(parsed)) return [];
      const normalized = parsed
        .map((item: any, idx: number) => {
          if (!item || typeof item !== "object") return null;
          const prompt = String(item.prompt ?? "").trim();
          const duration = Number(String(item.duration ?? "").trim());
          const safeDuration = Number.isFinite(duration) ? duration : 0;
          return {
            index: Number(item.index ?? idx + 1) || idx + 1,
            prompt,
            duration: safeDuration,
          };
        })
        .filter(Boolean) as KlingMultiShotItem[];
      return normalized;
    } catch {
      return [];
    }
  }, [klingMultiPromptRaw]);
  const klingTotalDuration = useMemo(() => {
    const raw = template.duration?.value ?? template.duration?.default ?? 5;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 5;
  }, [template.duration?.default, template.duration?.value]);

  // When switching into multi-shot mode, seed multi_prompt from the current prompt (best-effort)
  // (prompt is ignored in multi-shot mode, but we keep it so users can toggle back).
  useEffect(() => {
    // Only seed when the user is in "customize" mode; intelligent mode uses `prompt` directly.
    if (!klingMultiShotEnabled || klingIntelligentShotEnabled) return;
    const raw = klingMultiPromptRaw.trim();
    const isEmpty = raw === "" || raw === "[]";
    if (!isEmpty) return;
    const seed = String(promptValue ?? "").trim();
    if (!seed) return;
    const payload = JSON.stringify([
      { index: 1, prompt: seed, duration: String(Math.max(1, Math.floor(klingTotalDuration))) },
    ]);
    handleKlingMultiPromptChange({ value: payload }, { skipSnapshot: true });
  }, [
    handleKlingMultiPromptChange,
    klingMultiPromptRaw,
    klingMultiShotEnabled,
    klingTotalDuration,
    promptValue,
  ]);
  const klingMultiPromptSummary = useMemo(() => {
    if (!klingMultiShotEnabled) return { hasContent: false, valid: true, sum: 0, error: "" };
    const totalDuration = Number(template.duration?.value ?? template.duration?.default ?? 5);
    const shots = klingMultiPromptItems;
    if (shots.length < 1 || shots.length > 6) {
      return { hasContent: false, valid: false, sum: 0, error: "多镜头分镜数量需为 1-6。" };
    }
    const hasContent = shots.some((s) => s.prompt.trim().length > 0);
    let sum = 0;
    for (const shot of shots) {
      if (!shot.prompt.trim()) return { hasContent, valid: false, sum, error: "分镜提示词不能为空。" };
      if (shot.prompt.length > 512) return { hasContent, valid: false, sum, error: "单个分镜提示词不能超过 512 字符。" };
      if (!Number.isFinite(shot.duration) || shot.duration < 1) return { hasContent, valid: false, sum, error: "分镜时长必须 >= 1 秒。" };
      sum += shot.duration;
    }
    if (Number.isFinite(totalDuration) && sum !== totalDuration) {
      return { hasContent, valid: false, sum, error: "分镜时长之和必须等于总时长（duration）。" };
    }
    return { hasContent, valid: true, sum, error: "" };
  }, [klingMultiPromptItems, klingMultiShotEnabled, template.duration?.default, template.duration?.value]);

  const klingCustomizeShotEnabled = Boolean(klingMultiShotEnabled && !klingIntelligentShotEnabled);
  const hasIncomingVideoBridgeForUpscale = useMemo(() => {
    return edges.some((edge) => {
      if (edge.target !== data.id) return false;
      let parsedTargetHandle: any = null;
      if (edge.data?.targetHandle) {
        parsedTargetHandle = edge.data.targetHandle;
      } else if (edge.targetHandle) {
        try {
          parsedTargetHandle = scapeJSONParse(edge.targetHandle);
        } catch {
          parsedTargetHandle = null;
        }
      }
      const targetHandle = parsedTargetHandle;
      const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
      if (fieldName !== FIRST_FRAME_FIELD) return false;
      const edgeVideoReferType = edge.data?.videoReferType;
      if (edgeVideoReferType === "base" || edgeVideoReferType === "feature") return true;
      const sourceNode = nodes.find((node) => node.id === edge.source);
      return sourceNode?.data?.type === "DoubaoVideoGenerator" || sourceNode?.data?.type === "UserUploadVideo";
    });
  }, [FIRST_FRAME_FIELD, data.id, edges, nodes]);
  const canRunViduUpscale =
    hasVideoInFileInput(firstFrameField) || hasIncomingVideoBridgeForUpscale;
  const disableRun = klingIntelligentShotEnabled
    ? isPromptEmpty
    : klingCustomizeShotEnabled
      ? (!klingMultiPromptSummary.hasContent || !klingMultiPromptSummary.valid)
      : isViduUpscaleModel
        ? !canRunViduUpscale
        : (!hasAnyConnection && isPromptEmpty);
  useEffect(() => {
    if (isPromptFocused || isPromptComposing) return;
    setPromptDraftValue(promptValue);
  }, [isPromptComposing, isPromptFocused, promptValue]);

  const resolvedPromptValue = isPromptComposing
    ? (promptCompositionValue ?? promptDraftValue)
    : promptDraftValue;

  const updateKlingMultiPrompt = useCallback(
    (next: Array<{ prompt: string; duration: number }>) => {
      const normalized = (next ?? [])
        .slice(0, 6)
        .map((shot, idx) => ({
          index: idx + 1,
          prompt: String(shot?.prompt ?? ""),
          duration: String(Math.max(1, Math.floor(Number(shot?.duration ?? 1) || 1))),
        }));
      handleKlingMultiPromptChange({ value: JSON.stringify(normalized) }, { skipSnapshot: true });
    },
    [handleKlingMultiPromptChange],
  );

  const hasIncomingVideoBridge = useMemo(() => {
    return edges.some((edge) => {
      if (edge.target !== data.id) return false;
      let parsedTargetHandle: any = null;
      if (edge.data?.targetHandle) {
        parsedTargetHandle = edge.data.targetHandle;
      } else if (edge.targetHandle) {
        try {
          parsedTargetHandle = scapeJSONParse(edge.targetHandle);
        } catch {
          parsedTargetHandle = null;
        }
      }
      const targetHandle = parsedTargetHandle;
      const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
      if (fieldName !== FIRST_FRAME_FIELD) return false;
      const edgeVideoReferType = edge.data?.videoReferType;
      if (edgeVideoReferType === "base" || edgeVideoReferType === "feature") return true;
      const sourceNode = nodes.find((node) => node.id === edge.source);
      return sourceNode?.data?.type === "DoubaoVideoGenerator" || sourceNode?.data?.type === "UserUploadVideo";
    });
  }, [edges, nodes, data.id]);

  const supportsRoleLast = roleLimits.allowedRoles.includes("last");
  const hasRoleLastEdge = useMemo(() => {
    if (!supportsRoleLast) return false;
    const roleEdges = edges.filter((edge) => {
      if (edge.target !== data.id) return false;
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName === FIRST_FRAME_FIELD;
    });
    const totalRoleEdges = roleEdges.length;
    return roleEdges.some(
      (edge) => resolveEdgeImageRole(edge, totalRoleEdges) === "last",
    );
  }, [FIRST_FRAME_FIELD, data.id, edges, supportsRoleLast]);

  const hasLastFrameEdge = useMemo(() => {
    return (
      edges.some((edge) => {
        if (edge.target !== data.id) return false;
        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        return targetHandle?.fieldName === LAST_FRAME_FIELD;
      }) || hasRoleLastEdge
    );
  }, [LAST_FRAME_FIELD, data.id, edges, hasRoleLastEdge]);

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
  // Some models don't support providing a last frame at all. If a user switches models while a
  // last-frame edge/value exists, block run with a clear message instead of silently ignoring it.
  const shouldBlockFirstLastMix = Boolean(!allowLastFrame && hasLastFrame);

  const hasReferenceVideosValue = useMemo(() => {
    if (!(isWanModel && normalizedModelName === "wan2.6")) return false;
    if (hasIncomingVideoBridge) return true;
    const entries = collectFirstFrameEntries(firstFrameField);
    return entries.some((entry) => {
      const path = (entry.path || "").toString();
      const suffix = path.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase();
      return suffix === "mp4" || suffix === "mov";
    });
  }, [firstFrameField, hasIncomingVideoBridge, isWanModel, normalizedModelName]);

  const wanMode = useMemo(() => {
    if (!isWanModel) return null;
    if (hasReferenceVideosValue) return "r2v";
    if (hasFirstFrameEdge || hasFirstFrameValue) return "i2v";
    return "t2v";
  }, [hasFirstFrameEdge, hasFirstFrameValue, hasReferenceVideosValue, isWanModel]);

  // "参考图生视频" mode: a single incoming reference-role edge (no first/last, no tail-frame).
  // When active, the model dropdown should only show models that support the "reference" role.
  const isReferenceVideoMode = useMemo(() => {
    const getTargetFieldName = (edge: EdgeType) => {
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName ?? targetHandle?.name;
    };

    const incomingFrameEdges = edges.filter((edge) => {
      if (edge.target !== data.id) return false;
      if (getTargetFieldName(edge) !== FIRST_FRAME_FIELD) return false;
      const videoReferType = edge.data?.videoReferType;
      if (videoReferType === "base" || videoReferType === "feature") return false;
      const sourceNode = nodes.find((node) => node.id === edge.source);
      const sourceType = sourceNode?.data?.type;
      if (sourceType === "DoubaoVideoGenerator" || sourceType === "UserUploadVideo") {
        return false;
      }
      return true;
    });
    if (!incomingFrameEdges.length) return false;

    const totalRoleEdges = incomingFrameEdges.length;
    const roles = incomingFrameEdges.map((edge) => resolveEdgeImageRole(edge, totalRoleEdges));
    const hasReference = roles.includes("reference");
    const hasFirst = roles.includes("first");
    const hasLast = roles.includes("last");
    if (!hasReference || hasFirst || hasLast) return false;

    const hasDedicatedLastEdge = edges.some((edge) => {
      if (edge.target !== data.id) return false;
      return getTargetFieldName(edge) === LAST_FRAME_FIELD;
    });
    if (hasDedicatedLastEdge || hasLastFrameValue) return false;

    return true;
  }, [FIRST_FRAME_FIELD, LAST_FRAME_FIELD, data.id, edges, hasLastFrameValue, nodes]);

  const isFirstLastFrameMode = Boolean(
    forceFirstLastFrameMode || hasLastFrameEdge || hasLastFrameValue,
  );
  const shouldShowLastFrameHandle = isVeoModel
    ? Boolean(hasLastFrameEdge)
    : Boolean(allowLastFrame || hasLastFrameEdge);

  // If the user has set a tail frame, automatically prevent Wan model selection (Wan doesn't support tail frames).
  // Prefer switching to a Seedance model that supports first+last frames.
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
    if (!isFirstLastFrameMode) return;
    if (!isWanModel) return;
    const fallback = resolveSeedanceModelForFirstLastFrame();
    handleModelNameChangePreserve(fallback, { skipSnapshot: true });
  }, [handleModelNameChangePreserve, isFirstLastFrameMode, isWanModel, resolveSeedanceModelForFirstLastFrame]);

  // Keep tail-frame edges compatible while switching models.
  useEffect(() => {
    const getTargetFieldName = (edge: EdgeType) => {
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName ?? targetHandle?.name;
    };

    const firstFrameTemplateField = template[FIRST_FRAME_FIELD];
    const lastFrameTemplateField = template[LAST_FRAME_FIELD];

    // Seedance: tail frame is represented as a role-edge ("last") on first_frame_image.
    if (isSeedanceModel && firstFrameTemplateField) {
      const needsMigration = edges.some(
        (edge) =>
          edge.target === data.id && getTargetFieldName(edge) === LAST_FRAME_FIELD,
      );
      if (needsMigration) {
        setEdges((currentEdges) =>
          currentEdges.map((edge) => {
            if (edge.target !== data.id) return edge;
            if (getTargetFieldName(edge) !== LAST_FRAME_FIELD) return edge;
            const targetHandle = {
              inputTypes: firstFrameTemplateField.input_types,
              type: firstFrameTemplateField.type,
              id: data.id,
              fieldName: FIRST_FRAME_FIELD,
              ...(firstFrameTemplateField.proxy ? { proxy: firstFrameTemplateField.proxy } : {}),
            };
            return {
              ...edge,
              targetHandle: scapedJSONStringfy(targetHandle),
              data: {
                ...(edge.data ?? {}),
                targetHandle,
                imageRole: "last",
              },
            } as EdgeType;
          }),
        );
      }
      return;
    }

    // Kling: tail frame must use the dedicated last_frame_image input.
    if (isKlingModel && lastFrameTemplateField) {
      const roleLastEdges = edges.filter((edge) => {
        if (edge.target !== data.id) return false;
        if (getTargetFieldName(edge) !== FIRST_FRAME_FIELD) return false;
        return edge.data?.imageRole === "last";
      });
      if (!roleLastEdges.length) return;

      const hasDedicatedLast = edges.some(
        (edge) => edge.target === data.id && getTargetFieldName(edge) === LAST_FRAME_FIELD,
      ) || hasLastFrameValue;

      const edgeToPromote = !hasDedicatedLast ? roleLastEdges[0] : null;
      const edgeIdsToDemote = new Set(
        (hasDedicatedLast ? roleLastEdges : roleLastEdges.slice(1)).map((edge) => edge.id),
      );

      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          if (edge.target !== data.id) return edge;
          if (getTargetFieldName(edge) !== FIRST_FRAME_FIELD) return edge;
          if (edge.data?.imageRole !== "last") return edge;

          if (edgeToPromote && edge.id === edgeToPromote.id) {
            const targetHandle = {
              inputTypes: lastFrameTemplateField.input_types,
              type: lastFrameTemplateField.type,
              id: data.id,
              fieldName: LAST_FRAME_FIELD,
              ...(lastFrameTemplateField.proxy ? { proxy: lastFrameTemplateField.proxy } : {}),
            };
            return {
              ...edge,
              targetHandle: scapedJSONStringfy(targetHandle),
              data: {
                ...(edge.data ?? {}),
                targetHandle,
                imageRole: "last",
              },
            } as EdgeType;
          }

          if (edgeIdsToDemote.has(edge.id)) {
            return {
              ...edge,
              data: {
                ...(edge.data ?? {}),
                imageRole: "reference",
              },
            } as EdgeType;
          }

          return edge;
        }),
      );

      if (klingReferType === "base" && template.kling_video_refer_type) {
        handleKlingReferTypeChange({ value: "feature" }, { skipSnapshot: true });
      }
    }
  }, [
    FIRST_FRAME_FIELD,
    LAST_FRAME_FIELD,
    data.id,
    edges,
    handleKlingReferTypeChange,
    hasLastFrameValue,
    isKlingModel,
    isSeedanceModel,
    klingReferType,
    setEdges,
    template,
  ]);

  const nodeIdForRun = data.node?.flow?.data
    ? (findLastNode(data.node.flow.data!)?.id ?? data.id)
    : data.id;

  const isBusy = buildStatus === BuildStatus.BUILDING;
  const promptReadonly = Boolean(data.node?.flow) || isBusy;

  const handleRun = () => {
    if (buildStatus === BuildStatus.BUILDING) {
      stopLatestChainForNode(nodeIdForRun);
      return;
    }
    if (disableRun) return;
    if (isBusy) return;
    if (shouldBlockFirstLastMix) {
      setErrorData({
        title: "尾帧不支持",
        list: ["当前模型不支持尾帧输入。请清空尾帧/移除尾帧连接，或切换到支持首尾帧的模型后再运行。"],
      });
      return;
    }
    buildFlow({
      stopNodeId: data.id,
      eventDelivery: eventDeliveryConfig,
    });
    track("Flow Build - Clicked", { stopNodeId: data.id });
  };

  const runIconName =
    buildStatus === BuildStatus.BUILDING
      ? "Square"
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
    const klingHasVideoInput = isKlingModel
      ? hasVideoInFileInput(firstFrameField) || hasIncomingVideoBridge
      : false;
    const viduHasVideoInput = isViduQ2Pro
      ? hasVideoInFileInput(firstFrameField) || hasIncomingVideoBridge
      : false;
    const viduHasLastFrameAny = Boolean(isViduQ2Pro && (hasLastFrameEdge || hasLastFrameValue));
    return CONTROL_FIELDS.map((field) => {
      const templateField = template[field.name];
      if (!templateField) return null;
      if (templateField.show === false) return null;
      if (isViduUpscaleModel && field.name === "model_name") return null;
      if (
        isViduUpscaleModel &&
        (field.name === "resolution" || field.name === "aspect_ratio" || field.name === "duration")
      ) {
        return null;
      }

      // Kling: resolution is not a supported knob in the upstream API.
      if (isKlingModel && field.name === "resolution") return null;
      // Kling: duration is ignored for video editing (refer_type=base).
      if (isKlingModel && field.name === "duration" && klingReferType === "base") return null;
      // Kling: aspect_ratio is irrelevant for video editing (refer_type=base).
      if (isKlingModel && field.name === "aspect_ratio" && klingReferType === "base") return null;

      let options: Array<string | number> = Array.isArray(templateField.options)
        ? templateField.options
        : [];
      let value = templateField.value;
      let disabledOptions: Array<string | number> | undefined;

      // Backward-compat: some saved flows persist gateway model ids instead of display names.
      if (field.name === "model_name") {
        const normalizedValue = String(value ?? "").trim().toLowerCase();
        const normalizedOptions = options.map((opt) => String(opt).trim());
        if (
          normalizedValue === "kling-v3-omni" &&
          normalizedOptions.some((opt) => opt.toLowerCase() === "kling o3")
        ) {
          value = "kling O3";
        }
        if (
          normalizedValue === "kling-v3" &&
          normalizedOptions.some((opt) => opt.toLowerCase() === "kling v3")
        ) {
          value = "kling V3";
        }
      }

      if (field.name === "duration") {
        const rangeOptions = buildRangeOptions(templateField);
        options = rangeOptions.length ? rangeOptions : DEFAULT_DURATION_OPTIONS;

        // Vidu q2-pro duration is mode-dependent; infer mode from current inputs so the UI exposes 0=auto only in r2v.
        if (isViduQ2Pro) {
          if (viduHasVideoInput) {
            options = Array.from({ length: 11 }, (_, idx) => idx); // 0..10
          } else if (viduHasLastFrameAny) {
            options = Array.from({ length: 8 }, (_, idx) => idx + 1); // 1..8
          } else {
            options = Array.from({ length: 10 }, (_, idx) => idx + 1); // 1..10
          }
        }
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

        if (isKlingModel) {
          // Docs:
          // - kling O3: 3-15; with reference video (feature): 3-10
          // - kling O1: keep historical UI constraint (some t2v/首帧场景仅 5/10)
          let allowedDurations: number[] = [];
          if (isKlingO3 || isKlingV3) {
            const max = klingHasVideoInput ? 10 : 15;
            allowedDurations = Array.from({ length: max - 2 }, (_, idx) => idx + 3); // 3..max
          } else {
            const localEntries = collectFirstFrameEntries(firstFrameField);
            const localImageEntries = localEntries.filter((entry) => {
              const suffix = (entry.path || "")
                .toString()
                .split("?", 1)[0]
                .split("#", 1)[0]
                .split(".")
                .pop()
                ?.toLowerCase();
              return suffix !== "mp4" && suffix !== "mov";
            });
            const localHasFirstFrame =
              localImageEntries.some((entry) => entry.role === "first") ||
              (localImageEntries.length === 1 && !localImageEntries[0]?.role);
            const hasAnyLocalImage = localImageEntries.length > 0;
            const hasAnyIncomingImageEdge = edges.some((edge) => {
              if (edge.target !== data.id) return false;
              const targetHandle =
                edge.data?.targetHandle ??
                (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
              const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
              if (fieldName !== FIRST_FRAME_FIELD) return false;
              const isVideoBridge =
                edge.data?.videoReferType === "base" || edge.data?.videoReferType === "feature";
              return !isVideoBridge;
            });
            const incomingRoleEdges = edges.filter((edge) => {
              if (edge.target !== data.id) return false;
              const targetHandle =
                edge.data?.targetHandle ??
                (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
              const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
              if (fieldName !== FIRST_FRAME_FIELD) return false;
              const isVideoBridge =
                edge.data?.videoReferType === "base" || edge.data?.videoReferType === "feature";
              return !isVideoBridge;
            });
            const totalIncomingRoles = incomingRoleEdges.length;
            const incomingHasFirstFrame =
              incomingRoleEdges.some(
                (edge) => resolveEdgeImageRole(edge as any, totalIncomingRoles) === "first",
              ) && totalIncomingRoles > 0;
            const hasAnyImageInput = hasAnyLocalImage || hasAnyIncomingImageEdge;
            const hasFirstFrameLike =
              localHasFirstFrame ||
              incomingHasFirstFrame ||
              Boolean(hasLastFrameEdge || hasLastFrameValue);

            allowedDurations =
              !klingHasVideoInput && (!hasAnyImageInput || hasFirstFrameLike)
                ? [5, 10]
                : [3, 4, 5, 6, 7, 8, 9, 10];
          }
          const allowedSet = new Set<number>(allowedDurations);
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

        if (isKlingModel) {
          // Kling O1 only supports 16:9 / 9:16 / 1:1.
          const allowed = new Set<string>(["16:9", "9:16", "1:1"]);
          disabledOptions = options.filter((opt) => !allowed.has(String(opt)));
        }
      }

      if (field.name === "model_name" && disableSoraModelSelectionAfterFrameActions) {
        disabledOptions = [...(disabledOptions ?? []), "sora-2", "sora-2-pro"];
      }
      if (field.name === "model_name" && isReferenceVideoMode && !hasIncomingVideoBridge) {
        const allowed = new Set(
          options
            .map((option) => String(option ?? "").trim())
            .filter((option) =>
              getImageRoleLimits(option).allowedRoles.includes("reference"),
            ),
        );
        if (allowed.size > 0) {
          const extraDisabled = options.filter(
            (option) => !allowed.has(String(option ?? "").trim()),
          );
          disabledOptions = [...(disabledOptions ?? []), ...extraDisabled];
        }
      }
      if (field.name === "model_name" && isFirstLastFrameMode) {
        const wanModels = options.filter((option) => String(option).trim().startsWith("wan2."));
        // Vidu: q3-pro doesn't support start-end2video, but q2-pro does.
        const viduModels = options.filter((option) => String(option).trim().toLowerCase() === "viduq3-pro");
        disabledOptions = [...(disabledOptions ?? []), ...wanModels, ...viduModels];
      }
      if (field.name === "model_name" && hasIncomingVideoBridge) {
        const allowed = new Set<string>([
          "kling o1",
          "kling-video-o1",
          "kling o3",
          "kling-v3-omni",
          "wan2.6",
          "viduq2-pro",
        ]);
        const extraDisabled = options.filter((option) => !allowed.has(String(option).trim().toLowerCase()));
        disabledOptions = [...(disabledOptions ?? []), ...extraDisabled];
        const normalizedValue = String(value ?? "").trim().toLowerCase();
        if (!allowed.has(normalizedValue)) {
          const normalizedOptions = options.map((opt) => String(opt).trim());
          if (normalizedOptions.some((opt) => opt.toLowerCase() === "kling o1")) value = "kling O1";
          else if (normalizedOptions.some((opt) => opt.toLowerCase() === "kling o3")) value = "kling O3";
          else if (normalizedOptions.some((opt) => opt.toLowerCase() === "wan2.6")) value = "wan2.6";
          else if (normalizedOptions.some((opt) => opt.toLowerCase() === "viduq2-pro")) value = "viduq2-pro";
        }
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
    firstFrameField,
    hasIncomingVideoBridge,
    hasLastFrameEdge,
    hasLastFrameValue,
    isReferenceVideoMode,
    isKlingModel,
    isFirstLastFrameMode,
    isViduUpscaleModel,
    isSoraModel,
    isVeoModel,
    isWanModel,
    modelLimits,
    normalizedModelName,
    template,
    wanMode,
    data.id,
    edges,
  ]);

  const modelNameConfig = controlConfigs.find((config) => config.name === "model_name");
  const resolutionConfig = controlConfigs.find((config) => config.name === "resolution");
  const aspectRatioConfig = controlConfigs.find((config) => config.name === "aspect_ratio");
  const durationConfig = controlConfigs.find((config) => config.name === "duration");

  // Reset config params to defaults when model changes
  const prevNormalizedModelNameRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Skip on initial mount (not a model change)
    if (prevNormalizedModelNameRef.current === undefined) {
      prevNormalizedModelNameRef.current = normalizedModelName;
      return;
    }
    if (normalizedModelName === prevNormalizedModelNameRef.current) return;
    prevNormalizedModelNameRef.current = normalizedModelName;

    // Reset resolution to default
    if (resolutionConfig) {
      const defaultResolution = resolvePreferredOrFirstEnabledOption(
        resolutionConfig,
        template.resolution?.default,
      );
      if (defaultResolution !== undefined) {
        handleResolutionChange({ value: defaultResolution }, { skipSnapshot: true });
      }
    }

    // Reset aspect_ratio to default
    if (aspectRatioConfig) {
      const defaultAspectRatio = resolvePreferredOrFirstEnabledOption(
        aspectRatioConfig,
        template.aspect_ratio?.default,
      );
      if (defaultAspectRatio !== undefined) {
        handleAspectRatioChange({ value: defaultAspectRatio }, { skipSnapshot: true });
      }
    }

    // Reset duration to default
    if (durationConfig) {
      const defaultDuration = resolvePreferredOrFirstEnabledOption(
        durationConfig,
        template.duration?.default,
      );
      if (defaultDuration !== undefined) {
        handleDurationChange({ value: defaultDuration }, { skipSnapshot: true });
      }
    }
  }, [
    normalizedModelName,
    resolutionConfig,
    aspectRatioConfig,
    durationConfig,
    template.resolution?.default,
    template.aspect_ratio?.default,
    template.duration?.default,
    handleResolutionChange,
    handleAspectRatioChange,
    handleDurationChange,
  ]);

  const upscaleControlConfigs = useMemo(() => {
    if (!isViduUpscaleModel) return [] as Array<DoubaoControlConfig>;
    return UPSCALE_CONTROL_FIELDS.map((field) => {
      const templateField = template[field.name];
      if (!templateField) return null;
      const options: Array<string | number> = Array.isArray(templateField.options)
        ? templateField.options
        : [];
      if (!options.length) return null;
      let value = templateField.value;
      if (!options.map(String).includes(String(value ?? ""))) {
        [value] = options;
      }
      const tooltipText =
        DOUBAO_CONTROL_HINTS[field.name] ?? DOUBAO_CONFIG_TOOLTIP;
      return {
        ...field,
        template: templateField,
        options,
        value,
        tooltip: tooltipText,
      } as DoubaoControlConfig;
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [isViduUpscaleModel, template]);
  const enableAudioField = template?.[ENABLE_AUDIO_FIELD];
  const isSeedance15 = normalizedModelName === "Seedance 1.5 pro" ||
    normalizedModelName === "Doubao-Seedance-1.5-pro｜251215";
  const showAudioToggle = Boolean(
    enableAudioField &&
    (isSeedance15 ||
      // Wan t2v/i2v: `audio_url` controls audio behavior (omit => auto; set => use provided).
      // Wan r2v docs do not expose audio_url, so we hide the toggle to avoid a placebo option.
      ((normalizedModelName === "wan2.5" || normalizedModelName === "wan2.6") && wanMode !== "r2v") ||
      isKlingO3 ||
      isKlingV3),
  );

  const modelNameConfigWithPreserve = useMemo(() => {
    if (!modelNameConfig) return null;
    return {
      ...modelNameConfig,
      handleOnNewValueOptions: () => {
        const snapshotField = (field: any) => {
          const value = field?.value;
          const file_path = field?.file_path;
          return {
            value: Array.isArray(value) ? [...value] : value,
            file_path: Array.isArray(file_path) ? [...file_path] : file_path,
          };
        };
        const preserved = {
          first: snapshotField(template?.[FIRST_FRAME_FIELD]),
          last: snapshotField(template?.[LAST_FRAME_FIELD]),
          reference: snapshotField(template?.reference_images),
          audio: snapshotField(template?.[AUDIO_INPUT_FIELD]),
          enableAudio: snapshotField(template?.[ENABLE_AUDIO_FIELD]),
        };
        return {
          setNodeClass: (newNodeClass) => {
            const nextTemplate = newNodeClass?.template;
            if (!nextTemplate) return;
            const apply = (fieldName: string, payload: any) => {
              const field = nextTemplate[fieldName];
              if (!field) return;
              if (payload.value !== undefined) field.value = payload.value;
              if (payload.file_path !== undefined) field.file_path = payload.file_path;
            };
            apply(FIRST_FRAME_FIELD, preserved.first);
            apply(LAST_FRAME_FIELD, preserved.last);
            apply("reference_images", preserved.reference);
            apply(AUDIO_INPUT_FIELD, preserved.audio);
            apply(ENABLE_AUDIO_FIELD, preserved.enableAudio);
          },
        };
      },
    } as DoubaoControlConfig;
  }, [
    FIRST_FRAME_FIELD,
    LAST_FRAME_FIELD,
    AUDIO_INPUT_FIELD,
    ENABLE_AUDIO_FIELD,
    modelNameConfig,
    template,
  ]);

  const upstreamFirstFrameFields = useMemo<InputFieldType[]>(() => {
    const incomingEdges = edges?.filter(
      (edge) => edge.target === data.id && edge.targetHandle,
    );
    const collected: InputFieldType[] = [];

    const getTargetFieldName = (edge: EdgeType) => {
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      return targetHandle?.fieldName ?? targetHandle?.name;
    };

    const roleEdges =
      incomingEdges?.filter(
        (edge) => getTargetFieldName(edge) === FIRST_FRAME_FIELD,
      ) ?? [];
    const totalRoleEdges = roleEdges.length;

    roleEdges.forEach((edge) => {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (!sourceNode) return;
      const sourceType = sourceNode?.data?.type;

      // 支持 DoubaoVideoGenerator、DoubaoImageCreator、UserUploadImage、UserUploadVideo 作为上游预览源
      const isDoubaoSource =
        sourceType === "DoubaoVideoGenerator" ||
        sourceType === "DoubaoImageCreator";
      const isUploadSource =
        sourceType === "UserUploadImage" ||
        sourceType === "UserUploadVideo";

      if (!isDoubaoSource && !isUploadSource) {
        return;
      }

      let sourceTemplateField: InputFieldType | undefined;

      if (isDoubaoSource) {
        sourceTemplateField =
          sourceNode.data?.node?.template?.[FIRST_FRAME_FIELD] ??
          sourceNode.data?.node?.template?.["reference_images"];
      } else if (isUploadSource) {
        // UserUploadImage/UserUploadVideo 的数据在 template.file 字段中
        const fileField = sourceNode.data?.node?.template?.file;
        if (fileField) {
          // 将 file 字段转换为 first_frame_image 兼容格式
          sourceTemplateField = {
            type: "file",
            required: false,
            placeholder: "",
            list: false,
            show: true,
            readonly: false,
            name: FIRST_FRAME_FIELD,
            display_name: "上传文件",
            input_types: ["Data"],
            file_path: fileField.file_path,
            value: fileField.value,
          };
        }
      }

      if (sourceTemplateField) {
        const edgeRole = isSoraModel
          ? "reference"
          : resolveEdgeImageRole(edge, totalRoleEdges);
        const normalizedRole = roleLimits.allowedRoles.includes(edgeRole)
          ? edgeRole
          : roleLimits.allowedRoles[0] ?? "first";
        collected.push(applyEdgeRoleToField(sourceTemplateField, normalizedRole));
      }
    });

    return collected;
  }, [edges, nodes, data.id, isSoraModel, roleLimits.allowedRoles]);

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

      // 支持 DoubaoVideoGenerator、DoubaoImageCreator、UserUploadImage、UserUploadVideo 作为上游预览源
      const isDoubaoSource =
        sourceType === "DoubaoVideoGenerator" ||
        sourceType === "DoubaoImageCreator";
      const isUploadSource =
        sourceType === "UserUploadImage" ||
        sourceType === "UserUploadVideo";

      if (!isDoubaoSource && !isUploadSource) {
        return;
      }

      let sourceTemplateField: InputFieldType | undefined;

      if (isDoubaoSource) {
        sourceTemplateField =
          sourceNode.data?.node?.template?.[FIRST_FRAME_FIELD] ??
          sourceNode.data?.node?.template?.["reference_images"];
      } else if (isUploadSource) {
        // UserUploadImage/UserUploadVideo 的数据在 template.file 字段中
        const fileField = sourceNode.data?.node?.template?.file;
        if (fileField) {
          sourceTemplateField = {
            type: "file",
            required: false,
            placeholder: "",
            list: false,
            show: true,
            readonly: false,
            name: LAST_FRAME_FIELD,
            display_name: "上传文件",
            input_types: ["Data"],
            file_path: fileField.file_path,
            value: fileField.value,
          };
        }
      }

      if (sourceTemplateField) {
        collected.push(applyEdgeRoleToField(sourceTemplateField, "last"));
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
  const normalizedFirstFramePreviews = useMemo(() => {
    if (!firstFramePreviews.length) return [];
    if (isSoraModel) {
      return firstFramePreviews.map((preview) => ({
        ...preview,
        role: preview.role ?? "reference",
      }));
    }
    if (isVeoModel) {
      if (firstFramePreviews.some((preview) => preview.role)) {
        return firstFramePreviews;
      }
      const fallbackRole = firstFramePreviews.length <= 1 ? "first" : "reference";
      return firstFramePreviews.map((preview) => ({
        ...preview,
        role: preview.role ?? fallbackRole,
      }));
    }
    if (!supportsReferenceRole) {
      const hasAllowedRole = firstFramePreviews.some(
        (preview) => preview.role && roleLimits.allowedRoles.includes(preview.role),
      );
      return firstFramePreviews.map((preview, index) => ({
        ...preview,
        role:
          preview.role && roleLimits.allowedRoles.includes(preview.role)
            ? preview.role
            : !hasAllowedRole && index === 0
              ? "first"
              : undefined,
      }));
    }
    const hasExplicitRole = firstFramePreviews.some((preview) => preview.role);
    return firstFramePreviews.map((preview, index) => ({
      ...preview,
      role:
        preview.role ??
        (hasExplicitRole ? "reference" : index === 0 ? "first" : "reference"),
    }));
  }, [firstFramePreviews, isSoraModel, isVeoModel, roleLimits.allowedRoles, supportsReferenceRole]);
  const normalizedUpstreamFirstFramePreviews = useMemo(() => {
    if (!upstreamFirstFramePreviews.length) return [];
    if (isSoraModel) {
      return upstreamFirstFramePreviews.map((preview) => ({
        ...preview,
        role: preview.role ?? "reference",
      }));
    }
    if (isVeoModel) {
      if (upstreamFirstFramePreviews.some((preview) => preview.role)) {
        return upstreamFirstFramePreviews;
      }
      const fallbackRole = upstreamFirstFramePreviews.length <= 1 ? "first" : "reference";
      return upstreamFirstFramePreviews.map((preview) => ({
        ...preview,
        role: preview.role ?? fallbackRole,
      }));
    }
    if (!supportsReferenceRole) {
      const hasAllowedRole = upstreamFirstFramePreviews.some(
        (preview) => preview.role && roleLimits.allowedRoles.includes(preview.role),
      );
      return upstreamFirstFramePreviews.map((preview, index) => ({
        ...preview,
        role:
          preview.role && roleLimits.allowedRoles.includes(preview.role)
            ? preview.role
            : !hasAllowedRole && index === 0
              ? "first"
              : undefined,
      }));
    }
    const hasExplicitRole = upstreamFirstFramePreviews.some((preview) => preview.role);
    return upstreamFirstFramePreviews.map((preview, index) => ({
      ...preview,
      role:
        preview.role ??
        (hasExplicitRole ? "reference" : index === 0 ? "first" : "reference"),
    }));
  }, [
    upstreamFirstFramePreviews,
    isSoraModel,
    isVeoModel,
    roleLimits.allowedRoles,
    supportsReferenceRole,
  ]);
  const combinedFirstFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () =>
      mergeReferencePreviewLists(
        normalizedFirstFramePreviews,
        normalizedUpstreamFirstFramePreviews,
      ),
    [normalizedFirstFramePreviews, normalizedUpstreamFirstFramePreviews],
  );
  const lastFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItems(lastFrameField),
    [lastFrameField],
  );
  const upstreamLastFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItemsFromFields(upstreamLastFrameFields),
    [upstreamLastFrameFields],
  );
  const normalizedLastFramePreviews = useMemo(
    () =>
      lastFramePreviews.map((preview) => ({
        ...preview,
        role: "last" as const,
      })),
    [lastFramePreviews],
  );
  const normalizedUpstreamLastFramePreviews = useMemo(
    () =>
      upstreamLastFramePreviews.map((preview) => ({
        ...preview,
        role: "last" as const,
      })),
    [upstreamLastFramePreviews],
  );
  const combinedLastFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () =>
      mergeReferencePreviewLists(
        normalizedLastFramePreviews,
        normalizedUpstreamLastFramePreviews,
      ),
    [normalizedLastFramePreviews, normalizedUpstreamLastFramePreviews],
  );
  const combinedImagePreviews = useMemo<CandidatePreview[]>(() => {
    const localFirst = normalizedFirstFramePreviews.map((preview, index) => ({
      ...preview,
      originField: FIRST_FRAME_FIELD,
      isUpstream: false,
      sourceIndex: index,
    }));
    const upstreamFirst = normalizedUpstreamFirstFramePreviews.map((preview) => ({
      ...preview,
      originField: FIRST_FRAME_FIELD,
      isUpstream: true,
    }));
    const localLast = normalizedLastFramePreviews.map((preview, index) => ({
      ...preview,
      originField: LAST_FRAME_FIELD,
      isUpstream: false,
      sourceIndex: index,
    }));
    const upstreamLast = normalizedUpstreamLastFramePreviews.map((preview) => ({
      ...preview,
      originField: LAST_FRAME_FIELD,
      isUpstream: true,
    }));
    return dedupePreviews([
      ...localFirst,
      ...upstreamFirst,
      ...localLast,
      ...upstreamLast,
    ]);
  }, [
    normalizedFirstFramePreviews,
    normalizedUpstreamFirstFramePreviews,
    normalizedLastFramePreviews,
    normalizedUpstreamLastFramePreviews,
  ]);
  const promptMediaPreviews = combinedImagePreviews;
  const visiblePromptMediaPreviews = useMemo<CandidatePreview[]>(
    () => promptMediaPreviews.slice(0, 6),
    [promptMediaPreviews],
  );
  const promptMediaSuggestions = useMemo<MediaReferenceSuggestion[]>(() => {
    let imageIndex = 0;
    let videoIndex = 0;

    return promptMediaPreviews.map((preview, index) => {
      const previewSource = preview.imageSource ?? preview.downloadSource ?? "";
      const isVideo = isVideoCandidate(previewSource, preview.fileName);
      const suggestionIndex = isVideo ? ++videoIndex : ++imageIndex;
      const kind = isVideo ? "video" : "image";

      return {
        id: preview.id ?? `${kind}-${suggestionIndex}-${index}`,
        kind,
        index: suggestionIndex,
        label: `${kind === "video" ? "Video" : "Image"} ${suggestionIndex}`,
        token: `{{${kind === "video" ? "Video" : "Image"} ${suggestionIndex}}}`,
        sourceLabel: preview.label ?? preview.fileName,
        previewUrl: previewSource || undefined,
      };
    });
  }, [promptMediaPreviews]);
  const selectedLastFrame = combinedLastFramePreviews[0] ?? null;
  const selectedLastFrameSource = useMemo(
    () =>
      (selectedLastFrame?.imageSource || selectedLastFrame?.downloadSource || "")
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
    return normalizedUpstreamLastFramePreviews.some((preview) => {
      const source = (preview.imageSource || preview.downloadSource || "").toString().trim();
      return source === selectedLastFrameSource;
    });
  }, [selectedLastFrameSource, normalizedUpstreamLastFramePreviews]);
  const firstFrameEntries = useMemo(
    () => collectFirstFrameEntries(firstFrameField),
    [firstFrameField],
  );
  const buildFirstFrameFieldUpdate = useCallback(
    (entries: FirstFrameEntry[], { forceRoles = false }: { forceRoles?: boolean } = {}) => {
      const shouldIncludeRoles = forceRoles || isVeoModel || entries.some((entry) => entry.role);
      return {
        value: shouldIncludeRoles
          ? entries.map((entry, index) => ({
            name: entry.name,
            display_name: entry.name,
            role:
              entry.role ??
              (entries.length === 1
                ? "first"
                : isVeoFast
                  ? index === 0
                    ? "first"
                    : "last"
                  : "reference"),
          }))
          : entries.map((entry) => entry.name),
        file_path: entries.map((entry) => entry.path),
      };
    },
    [isVeoFast, isVeoModel],
  );

  useEffect(() => {
    if (!isVeoModel) return;
    if (!firstFrameEntries.length) return;
    if (firstFrameEntries.some((entry) => entry.role)) return;

    const defaultRole = firstFrameEntries.length === 1 ? "first" : isVeoFast ? "last" : "reference";
    handleFirstFrameChange(
      buildFirstFrameFieldUpdate(
        firstFrameEntries.map((entry, index) => ({
          ...entry,
          role:
            firstFrameEntries.length === 1
              ? "first"
              : isVeoFast
                ? index === 0
                  ? "first"
                  : "last"
                : defaultRole,
        })),
        { forceRoles: true },
      ),
      { skipSnapshot: true },
    );
  }, [buildFirstFrameFieldUpdate, firstFrameEntries, handleFirstFrameChange, isVeoFast, isVeoModel]);

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
    if (isSoraModel) {
      const referenceIndex = combinedFirstFramePreviews.findIndex(
        (entry) => entry.role === "reference",
      );
      if (referenceIndex >= 0) return referenceIndex;
      return combinedFirstFramePreviews.length ? 0 : -1;
    }
    if (isVeoModel) {
      const roleIndex = combinedFirstFramePreviews.findIndex(
        (entry) => entry.role === "first",
      );
      if (roleIndex >= 0) return roleIndex;
      if (combinedFirstFramePreviews.length === 1 && !combinedFirstFramePreviews[0]?.role) {
        return 0;
      }
      return -1;
    }
    return combinedFirstFramePreviews.length ? 0 : -1;
  }, [combinedFirstFramePreviews, isSoraModel, isVeoModel]);
  const selectedFirstFrame =
    selectedFirstFrameIndex >= 0
      ? (combinedFirstFramePreviews[selectedFirstFrameIndex] ?? null)
      : null;
  const selectedFirstFrameSource = useMemo(
    () =>
      (selectedFirstFrame?.imageSource || selectedFirstFrame?.downloadSource || "")
        .toString()
        .trim(),
    [selectedFirstFrame],
  );
  const firstFrameCount = combinedFirstFramePreviews.length;
  const localFirstFrameCount = firstFramePreviews.length;
  const upscalePreviewSource = isViduUpscaleModel ? selectedFirstFrameSource : "";
  const upscalePreviewIsVideo =
    Boolean(upscalePreviewSource) &&
    isVideoCandidate(upscalePreviewSource, selectedFirstFrame?.fileName);
  const klingIncomingMediaCounts = useMemo(() => {
    if (!isKlingModel) return { imageEdges: 0, videoEdges: 0 };
    let imageEdges = 0;
    let videoEdges = 0;
    edges.forEach((edge) => {
      if (edge.target !== data.id) return;
      let targetHandle: any = null;
      if (edge.data?.targetHandle) {
        targetHandle = edge.data.targetHandle;
      } else if (edge.targetHandle) {
        try {
          targetHandle = scapeJSONParse(edge.targetHandle);
        } catch {
          targetHandle = null;
        }
      }
      const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
      if (fieldName !== FIRST_FRAME_FIELD) return;

      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (
        sourceNode?.data?.type === "DoubaoVideoGenerator" ||
        sourceNode?.data?.type === "UserUploadVideo"
      ) {
        videoEdges += 1;
      } else {
        imageEdges += 1;
      }
    });
    return { imageEdges, videoEdges };
  }, [data.id, edges, isKlingModel, nodes]);
  const klingLocalMediaCounts = useMemo(() => {
    if (!isKlingModel) return { images: 0, videos: 0 };
    let images = 0;
    let videos = 0;
    firstFrameEntries.forEach((entry) => {
      if (isVideoCandidate(entry.path, entry.name)) videos += 1;
      else images += 1;
    });
    return { images, videos };
  }, [firstFrameEntries, isKlingModel]);
  const klingHasLastFrameAny = Boolean(isKlingModel && (hasLastFrameEdge || hasLastFrameValue));
  const klingTotalVideosNow = isKlingModel
    ? klingIncomingMediaCounts.videoEdges + klingLocalMediaCounts.videos
    : 0;
  const klingHasReferenceVideoNow = Boolean(isKlingModel && klingTotalVideosNow > 0);
  const klingMaxImagesTotal = isKlingModel ? (klingHasReferenceVideoNow ? 4 : 7) : 0;
  const klingTotalImagesNow = isKlingModel
    ? klingIncomingMediaCounts.imageEdges + klingLocalMediaCounts.images + (klingHasLastFrameAny ? 1 : 0)
    : 0;
  const klingCanUploadVideo = Boolean(isKlingModel && klingTotalVideosNow === 0 && klingTotalImagesNow <= 4);
  const klingCanUploadImage = Boolean(isKlingModel && klingTotalImagesNow < klingMaxImagesTotal);
  const klingCanUploadAny = Boolean(isKlingModel && (klingCanUploadImage || klingCanUploadVideo));

  const viduIncomingMediaCounts = useMemo(() => {
    if (!isViduQ2Pro) return { imageEdges: 0, videoEdges: 0 };
    let imageEdges = 0;
    let videoEdges = 0;
    edges.forEach((edge) => {
      if (edge.target !== data.id) return;
      let targetHandle: any = null;
      if (edge.data?.targetHandle) {
        targetHandle = edge.data.targetHandle;
      } else if (edge.targetHandle) {
        try {
          targetHandle = scapeJSONParse(edge.targetHandle);
        } catch {
          targetHandle = null;
        }
      }
      const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
      if (fieldName !== FIRST_FRAME_FIELD) return;

      const edgeVideoReferType = edge.data?.videoReferType;
      if (edgeVideoReferType === "base" || edgeVideoReferType === "feature") {
        videoEdges += 1;
        return;
      }

      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (
        sourceNode?.data?.type === "DoubaoVideoGenerator" ||
        sourceNode?.data?.type === "UserUploadVideo"
      ) {
        videoEdges += 1;
      } else {
        imageEdges += 1;
      }
    });
    return { imageEdges, videoEdges };
  }, [data.id, edges, isViduQ2Pro, nodes]);

  const viduLocalMediaCounts = useMemo(() => {
    if (!isViduQ2Pro) return { images: 0, videos: 0 };
    let images = 0;
    let videos = 0;
    firstFrameEntries.forEach((entry) => {
      if (isVideoCandidate(entry.path, entry.name)) videos += 1;
      else images += 1;
    });
    return { images, videos };
  }, [firstFrameEntries, isViduQ2Pro]);

  const viduTotalVideosNow = isViduQ2Pro
    ? viduIncomingMediaCounts.videoEdges + viduLocalMediaCounts.videos
    : 0;
  const viduTotalImagesNow = isViduQ2Pro
    ? viduIncomingMediaCounts.imageEdges + viduLocalMediaCounts.images
    : 0;
  const viduHasReferenceVideoNow = Boolean(isViduQ2Pro && viduTotalVideosNow > 0);
  const viduMaxVideosTotal = 2;
  const viduMaxImagesTotal = viduHasReferenceVideoNow ? 4 : 1;
  const viduCanUploadVideo = Boolean(isViduQ2Pro && viduTotalVideosNow < viduMaxVideosTotal);
  const viduCanUploadImage = Boolean(isViduQ2Pro && viduTotalImagesNow < viduMaxImagesTotal);
  const viduCanUploadAny = Boolean(isViduQ2Pro && (viduCanUploadImage || viduCanUploadVideo));
  const canUploadMoreFirstFrames = isSoraModel
    ? firstFrameCount < firstFrameMaxUploads
    : isKlingModel
      ? klingCanUploadAny
      : isViduQ2Pro
        ? viduCanUploadAny
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
  const canUploadReferenceVideos =
    (isWanModel && normalizedModelName === "wan2.6") || isKlingModel || isViduQ2Pro || isViduUpscaleModel;
  const firstFrameUploadAllowedExtensions = useMemo(() => {
    if (canUploadReferenceVideos) return firstFrameAllowedExtensions;
    return firstFrameAllowedExtensions.filter((ext) => ext !== "mp4" && ext !== "mov" && ext !== "avi");
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

  const promptHandleMeta = useMemo(() => {
    if (!promptField || isViduUpscaleModel) return null;
    const inputTypes =
      promptField.input_types && promptField.input_types.length > 0
        ? promptField.input_types
        : ["Message", "Data", "Text"];
    const resolvedType = promptField.type ?? "data";
    const colors = getNodeInputColors(inputTypes, resolvedType, types);
    const colorName = getNodeInputColorsName(inputTypes, resolvedType, types);
    return {
      id: {
        inputTypes,
        type: resolvedType,
        id: data.id,
        fieldName: PROMPT_NAME,
      },
      tooltip: inputTypes?.join(", ") ?? resolvedType ?? "提示词输入",
      title: promptField.display_name ?? "提示词输入",
      colors,
      colorName,
      proxy: promptField.proxy,
    };
  }, [promptField, types, data.id, isViduUpscaleModel]);

  const audioInputField = template[AUDIO_INPUT_FIELD];
  const audioHandleMeta = useMemo(() => {
    if (!audioInputField || isViduUpscaleModel) return null;
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
  }, [audioInputField, types, data.id, isViduUpscaleModel]);

  const openFirstFrameDialog = useCallback(() => {
    if (isFirstFrameUploadPending) return;
    setFirstFrameDialogOpen(true);
  }, [isFirstFrameUploadPending]);

  const triggerTopBarUpload = useCallback(async () => {
    if (!currentFlowId) {
      setErrorData({
        title: "无法上传视频",
        list: ["请先保存当前工作流后再上传。"],
      });
      return;
    }

    const uploadTemplate = templates?.["UserUploadVideo"];
    if (!uploadTemplate) {
      setErrorData({
        title: "无法切换为视频资源上传组件",
        list: ["未加载到“上传视频（UserUploadVideo）”模板。"],
      });
      return;
    }

    const files = await createFileUpload({
      multiple: false,
      accept: USER_UPLOAD_VIDEO_EXTENSIONS.map((ext) => `.${ext}`).join(","),
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

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ext || !USER_UPLOAD_VIDEO_EXTENSIONS.includes(ext)) {
      setErrorData({
        title: "文件格式不支持",
        list: [USER_UPLOAD_VIDEO_EXTENSIONS.map((item) => item.toUpperCase()).join(", ")],
      });
      return;
    }

    try {
      const response = await uploadFirstFrameFile({ file, id: currentFlowId });
      const serverPath = String((response as { file_path?: string } | undefined)?.file_path ?? "").trim();
      if (!serverPath) {
        throw new Error("Missing file_path");
      }

      takeSnapshot();
      setNode(data.id, (oldNode) => {
        if (oldNode.type !== "genericNode") return oldNode;

        const nextTemplate = cloneDeep(uploadTemplate);
        if ((nextTemplate as any)?.template?.file) {
          (nextTemplate as any).template.file.value = file.name;
          (nextTemplate as any).template.file.file_path = serverPath;
        }

        return {
          ...oldNode,
          data: {
            ...(oldNode.data as NodeDataType),
            id: data.id,
            type: "UserUploadVideo",
            selected_output: undefined,
            selected_output_type: undefined,
            output_types: undefined,
            node: nextTemplate as NodeDataType["node"],
          },
        };
      });
    } catch (error: any) {
      setErrorData({
        title: "上传失败",
        list: [
          error?.response?.data?.detail ?? error?.message ?? "网络异常，稍后再试或检查后端日志。",
        ],
      });
    }
  }, [
    currentFlowId,
    data.id,
    setErrorData,
    setNode,
    takeSnapshot,
    templates,
    uploadFirstFrameFile,
    validateFileSize,
  ]);

  // Keep parity with the image creator: allow external UI (node top bar) to trigger the upload dialog.
  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId?: string }>;
      const requestedNodeId = customEvent?.detail?.nodeId;
      if (requestedNodeId && requestedNodeId !== data.id) return;
      if (!requestedNodeId && !selected) return;
      openFirstFrameDialog();
    };
    window.addEventListener("doubao-preview-upload", listener);
    return () => window.removeEventListener("doubao-preview-upload", listener);
  }, [data.id, openFirstFrameDialog, selected]);

  const requestUploadDialogForNode = useCallback((nodeId: string) => {
    const uploadEvent = new CustomEvent("doubao-preview-upload", {
      detail: { nodeId },
    });
    window.dispatchEvent(uploadEvent);
  }, []);

  const handleCreateTextUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const promptTemplateField = template[PROMPT_NAME];
    if (!promptTemplateField) return;

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
      // Keep a single selected node (avoid auto-group UI).
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingUpstreamNodeId,
        })),
      );
      return;
    }

    const textTemplate = templates[TEXT_COMPONENT_NAME];
    if (!textTemplate) return;

    takeSnapshot();

    const newTextNodeId = getNodeId(TEXT_COMPONENT_NAME);
    const newNodeX = currentNode.position.x - UPSTREAM_NODE_OFFSET_X;
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
      textTemplate.outputs?.find((output: any) => output.name === TEXT_OUTPUT_NAME) ??
      textTemplate.outputs?.find((output: any) => !output.hidden) ??
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

    // Delay edge creation to ensure the new node is fully rendered.
    setTimeout(() => {
      onConnect({
        source: newTextNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    }, 200);

    track("DoubaoVideoGenerator - Create Text Upstream Node", {
      sourceNodeId: newTextNodeId,
      targetNodeId: data.id,
      sourceComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    PROMPT_NAME,
    TEXT_COMPONENT_NAME,
    TEXT_OUTPUT_NAME,
    UPSTREAM_NODE_OFFSET_X,
    data.id,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    template,
    templates,
  ]);

  const handleCreateAudioUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const audioTemplateField = template[AUDIO_INPUT_FIELD];
    if (!audioTemplateField) return;

    const existingUpstreamNodeId = edges
      .map((edge) => {
        if (edge.target !== data.id) return null;

        const sourceNode = nodes.find((node) => node.id === edge.source);
        if (sourceNode?.data?.type !== AUDIO_COMPONENT_NAME) return null;
        if (sourceNode.position.x >= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== AUDIO_INPUT_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== AUDIO_OUTPUT_NAME) return null;

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
      return;
    }

    const audioTemplate = templates[AUDIO_COMPONENT_NAME];
    if (!audioTemplate) return;

    takeSnapshot();

    const newAudioNodeId = getNodeId(AUDIO_COMPONENT_NAME);
    const newNodeX = currentNode.position.x - UPSTREAM_NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: AUDIO_COMPONENT_NAME,
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
    const newAudioNode: GenericNodeType = {
      id: newAudioNodeId,
      type: "genericNode",
      position: {
        x: newNodeX,
        y: newNodeY,
      },
      data: {
        node: cloneDeep(audioTemplate),
        showNode: !audioTemplate.minimized,
        type: AUDIO_COMPONENT_NAME,
        id: newAudioNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newAudioNode]);

    const outputDefinition =
      audioTemplate.outputs?.find((output: any) => output.name === AUDIO_OUTPUT_NAME) ??
      audioTemplate.outputs?.find((output: any) => !output.hidden) ??
      audioTemplate.outputs?.[0];

    const sourceOutputTypes =
      outputDefinition?.types && outputDefinition.types.length === 1
        ? outputDefinition.types
        : outputDefinition?.selected
          ? [outputDefinition.selected]
          : ["Data"];

    const sourceHandle = {
      output_types: sourceOutputTypes,
      id: newAudioNodeId,
      dataType: AUDIO_COMPONENT_NAME,
      name: outputDefinition?.name ?? AUDIO_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: audioTemplateField.input_types,
      type: audioTemplateField.type,
      id: data.id,
      fieldName: AUDIO_INPUT_FIELD,
      ...(audioTemplateField.proxy ? { proxy: audioTemplateField.proxy } : {}),
    };

    // Delay edge creation to ensure the new node's handles are mounted; otherwise the edge
    // may not render and looks like "failed to auto-connect".
    setTimeout(() => {
      onConnect({
        source: newAudioNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    }, 200);

    track("DoubaoVideoGenerator - Create Audio Upstream Node", {
      sourceNodeId: newAudioNodeId,
      targetNodeId: data.id,
      sourceComponent: AUDIO_COMPONENT_NAME,
    });
  }, [
    AUDIO_COMPONENT_NAME,
    AUDIO_INPUT_FIELD,
    AUDIO_OUTPUT_NAME,
    UPSTREAM_NODE_OFFSET_X,
    UPSTREAM_NODE_OFFSET_Y,
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

    const draftTemplateField = textTemplate.template?.[TEXT_DRAFT_FIELD_NAME];
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
        if (targetHandle?.fieldName !== TEXT_DRAFT_FIELD_NAME) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== VIDEO_OUTPUT_NAME) return null;

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
    const newNodeX = currentNode.position.x + UPSTREAM_NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: TEXT_COMPONENT_NAME,
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
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
        x: newNodeX,
        y: newNodeY,
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
      data.node?.outputs?.find((output) => output.name === VIDEO_OUTPUT_NAME) ??
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
      name: outputDefinition?.name ?? VIDEO_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: draftTemplateField.input_types,
      type: draftTemplateField.type,
      id: newTextNodeId,
      fieldName: TEXT_DRAFT_FIELD_NAME,
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

    track("DoubaoVideoGenerator - Create Text Downstream Node", {
      sourceNodeId: data.id,
      targetNodeId: newTextNodeId,
      targetComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    TEXT_COMPONENT_NAME,
    TEXT_DRAFT_FIELD_NAME,
    UPSTREAM_NODE_OFFSET_X,
    VIDEO_OUTPUT_NAME,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    setEdges,
    setNodes,
    takeSnapshot,
    templates,
  ]);

  const handleCreateVideoDownstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const videoTemplate = templates["DoubaoVideoGenerator"];
    if (!videoTemplate) return;

    const firstFrameTemplateField = videoTemplate.template?.[FIRST_FRAME_FIELD];
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
        if (targetHandle?.fieldName !== FIRST_FRAME_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== VIDEO_OUTPUT_NAME) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingDownstreamVideoNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingDownstreamVideoNodeId,
        })),
      );
      return;
    }

    takeSnapshot();

    const newVideoNodeId = getNodeId("DoubaoVideoGenerator");
    const newNodeX = currentNode.position.x + UPSTREAM_NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: "DoubaoVideoGenerator",
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
    const newVideoNode: GenericNodeType = {
      id: newVideoNodeId,
      type: "genericNode",
      position: {
        x: newNodeX,
        y: newNodeY,
      },
      data: {
        node: cloneDeep(videoTemplate),
        showNode: !videoTemplate.minimized,
        type: "DoubaoVideoGenerator",
        id: newVideoNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newVideoNode]);

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === VIDEO_OUTPUT_NAME) ??
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
      name: outputDefinition?.name ?? VIDEO_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: firstFrameTemplateField.input_types,
      type: firstFrameTemplateField.type,
      id: newVideoNodeId,
      fieldName: FIRST_FRAME_FIELD,
      ...(firstFrameTemplateField.proxy ? { proxy: firstFrameTemplateField.proxy } : {}),
    };

    // Video-to-video edges support a dedicated refer type. Defaulting to "base" makes the intent
    // explicit ("视频编辑"). Users can change it later on the edge itself.
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
        videoReferType: "base",
      },
    } as EdgeType;

    setEdges((prev) => [...prev, edge]);

    track("DoubaoVideoGenerator - Create Video Downstream Node", {
      sourceNodeId: data.id,
      targetNodeId: newVideoNodeId,
      targetComponent: "DoubaoVideoGenerator",
    });
  }, [
    FIRST_FRAME_FIELD,
    UPSTREAM_NODE_OFFSET_X,
    VIDEO_OUTPUT_NAME,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    setEdges,
    setNodes,
    takeSnapshot,
    templates,
  ]);

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
      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          if (edge.source !== existingUpstreamNodeId || edge.target !== data.id) {
            return edge;
          }
          const targetHandle: targetHandleType | null =
            edge.data?.targetHandle ??
            (edge.targetHandle && edge.targetHandle.includes("{")
              ? (() => {
                  try {
                    return scapeJSONParse(edge.targetHandle) as targetHandleType;
                  } catch {
                    return null;
                  }
                })()
              : null);
          if (targetHandle?.fieldName !== FIRST_FRAME_FIELD) return edge;
          const sourceHandle: sourceHandleType | null =
            edge.data?.sourceHandle ??
            (edge.sourceHandle && edge.sourceHandle.includes("{")
              ? (() => {
                  try {
                    return scapeJSONParse(edge.sourceHandle) as sourceHandleType;
                  } catch {
                    return null;
                  }
                })()
              : null);
          if (!sourceHandle) return edge;
          return {
            ...edge,
            data: {
              ...(edge.data ?? {}),
              sourceHandle,
              targetHandle,
              imageRole: "first",
            },
          };
        }),
      );
      requestUploadDialogForNode(existingUpstreamNodeId);
      return;
    }

    const imageTemplate = templates["DoubaoImageCreator"];
    if (!imageTemplate) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const newNodeX = currentNode.position.x - UPSTREAM_NODE_OFFSET_X;
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
      imageRole: "first",
    } as any);

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
    setEdges,
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

    // Prefer the normalized field definitions used by handles; raw template fields may miss input_types,
    // causing handle-id mismatches and failed auto-connect.
    const firstFrameTemplateField = template[FIRST_FRAME_FIELD] ?? firstFrameField;
    // Use component-level lastFrameField (with fallback) to support models like kling O1.
    const lastFrameTemplateField = lastFrameField;
    if (!firstFrameTemplateField) return;
    const useRoleEdgesForFirstLast = Boolean(isVeoModel || isSeedanceModel);
    // Only bail if the model explicitly doesn't support last-frame (e.g. via allowLastFrame).
    // For models like kling O1 that do support it, proceed with the fallback template field.
    if (!useRoleEdgesForFirstLast && !allowLastFrame) return;

    setForceFirstLastFrameMode(true);
    if (isWanModel) {
      const fallback = resolveSeedanceModelForFirstLastFrame();
      handleModelNameChangePreserve(fallback, { skipSnapshot: true });
    }
    if (
      isKlingModel &&
      klingReferType === "base" &&
      template.kling_video_refer_type
    ) {
      // Kling video editing ("base") doesn't support tail-frame input. Switch to "feature"
      // so the newly created tail-frame connection works as expected.
      handleKlingReferTypeChange({ value: "feature" }, { skipSnapshot: true });
    }

    const roleEdges = useRoleEdgesForFirstLast
      ? edges.filter((edge) => {
        if (edge.target !== data.id) return false;
        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        return targetHandle?.fieldName === FIRST_FRAME_FIELD;
      })
      : [];
    const totalRoleEdges = roleEdges.length;

    const findExistingUpstream = (
      targetFieldName: string,
      desiredRole?: EdgeImageRole,
    ) => {
      const candidates = useRoleEdgesForFirstLast && desiredRole ? roleEdges : edges;
      return candidates
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

          if (useRoleEdgesForFirstLast && desiredRole) {
            const resolvedRole = resolveEdgeImageRole(edge, totalRoleEdges);
            if (resolvedRole !== desiredRole) return null;
          }

          return sourceNode.id;
        })
        .find(Boolean) as string | undefined;
    };

    const existingFirstFrameNodeId = findExistingUpstream(FIRST_FRAME_FIELD, "first");
    const existingLastFrameNodeId = useRoleEdgesForFirstLast
      ? findExistingUpstream(FIRST_FRAME_FIELD, "last")
      : findExistingUpstream(LAST_FRAME_FIELD);

    const ensureConnection = (
      sourceNodeId: string,
      targetFieldName: string,
      targetTemplateField: any,
      imageRole?: EdgeImageRole,
    ) => {
      const latestEdges = useFlowStore.getState().edges;
      const hasEdge = latestEdges.some((edge) => {
        if (edge.source !== sourceNodeId || edge.target !== data.id) return false;
        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        return targetHandle?.fieldName === targetFieldName;
      });
        if (hasEdge) {
          if (imageRole) {
            setEdges((currentEdges) =>
              currentEdges.map((edge) => {
                if (edge.source !== sourceNodeId || edge.target !== data.id) return edge;
                const targetHandle: targetHandleType | null =
                  edge.data?.targetHandle ??
                  (edge.targetHandle && edge.targetHandle.includes("{")
                    ? (() => {
                        try {
                          return scapeJSONParse(edge.targetHandle) as targetHandleType;
                        } catch {
                          return null;
                        }
                      })()
                    : null);
                if (targetHandle?.fieldName !== targetFieldName) return edge;
                const sourceHandle: sourceHandleType | null =
                  edge.data?.sourceHandle ??
                  (edge.sourceHandle && edge.sourceHandle.includes("{")
                    ? (() => {
                        try {
                          return scapeJSONParse(edge.sourceHandle) as sourceHandleType;
                        } catch {
                          return null;
                        }
                      })()
                    : null);
                if (!sourceHandle) return edge;
                return {
                  ...edge,
                  data: {
                    ...(edge.data ?? {}),
                    sourceHandle,
                    targetHandle,
                    imageRole,
                  },
                };
              }),
            );
          }
          return;
      }

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
        ...(imageRole ? { imageRole } : {}),
      } as any);
    };

    const lastTargetField = useRoleEdgesForFirstLast ? FIRST_FRAME_FIELD : LAST_FRAME_FIELD;
    const lastTargetTemplateField = useRoleEdgesForFirstLast
      ? firstFrameTemplateField
      : lastFrameTemplateField;

    const hasConnection = (sourceNodeId: string, targetFieldName: string) => {
      const latestEdges = useFlowStore.getState().edges;
      return latestEdges.some((edge) => {
        if (edge.source !== sourceNodeId || edge.target !== data.id) return false;
        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        return targetHandle?.fieldName === targetFieldName;
      });
    };

    const connectWithRetries = (firstId: string, lastId: string, attempt = 0) => {
      ensureConnection(
        firstId,
        FIRST_FRAME_FIELD,
        firstFrameTemplateField,
        useRoleEdgesForFirstLast ? "first" : undefined,
      );
      ensureConnection(
        lastId,
        lastTargetField,
        lastTargetTemplateField,
        useRoleEdgesForFirstLast ? "last" : undefined,
      );

      // Retry a few times: ReactFlow may not have registered new node handles yet.
      if (attempt < 6 && (!hasConnection(lastId, lastTargetField) || !hasConnection(firstId, FIRST_FRAME_FIELD))) {
        setTimeout(() => connectWithRetries(firstId, lastId, attempt + 1), 200);
      }
    };

    if (existingFirstFrameNodeId && existingLastFrameNodeId) {
      connectWithRetries(existingFirstFrameNodeId, existingLastFrameNodeId);
      queueMicrotask(() => requestUploadDialogForNode(existingFirstFrameNodeId));
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
        selected: false,
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

    setNodes((currentNodes) => [...currentNodes, ...nodesToAdd]);

    // ReactFlow may not have the newly added upstream node registered yet; defer connections and retry.
    setTimeout(() => connectWithRetries(firstFrameNodeId, lastFrameNodeId), 200);
    queueMicrotask(() => requestUploadDialogForNode(firstFrameNodeId));

    track("DoubaoVideoGenerator - Create First+Last Frame Upstream Nodes", {
      sourceNodeId: data.id,
      sourceComponent: "DoubaoVideoGenerator",
    });
  }, [
    FIRST_FRAME_FIELD,
    IMAGE_OUTPUT_NAME,
    LAST_FRAME_FIELD,
    UPSTREAM_NODE_OFFSET_X,
    UPSTREAM_NODE_OFFSET_Y,
    allowLastFrame,
    data.id,
    edges,
    handleKlingReferTypeChange,
    handleModelNameChange,
    isKlingModel,
    isSeedanceModel,
    isWanModel,
    klingReferType,
    firstFrameField,
    lastFrameField,
    normalizedModelName,
    nodes,
    onConnect,
    setNodes,
    setEdges,
    setForceFirstLastFrameMode,
    takeSnapshot,
    template,
    templates,
    resolveSeedanceModelForFirstLastFrame,
    isSoraModel,
    isVeoModel,
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
    if (!canUploadMoreFirstFrames) {
      setErrorData({
        title: "无法继续上传",
        list: [
          isKlingModel
            ? "kling O1：有参考视频时图片最多 4 张、无参考视频时图片最多 7 张（参考视频最多 1 段）。请删除多余素材后再上传。"
            : isViduQ2Pro
              ? "Vidu q2-pro：无参考视频时图片最多 1 张；有参考视频时视频最多 2 段、图片最多 4 张。请删除多余素材后再上传。"
            : "已达到候选素材上限，请删除不需要的图片后再上传。",
        ],
      });
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
      maxReferenceImages: isVeoModel ? veoReferenceLimit : null,
      klingLimits: isKlingModel
        ? {
          incomingImageEdges: klingIncomingMediaCounts.imageEdges,
          incomingVideoEdges: klingIncomingMediaCounts.videoEdges,
          hasLastFrame: klingHasLastFrameAny,
        }
        : null,
      viduLimits: isViduQ2Pro
        ? {
          incomingImageEdges: viduIncomingMediaCounts.imageEdges,
          incomingVideoEdges: viduIncomingMediaCounts.videoEdges,
        }
        : null,
    });
  }, [
    firstFrameField,
    isFirstFrameUploadPending,
    canUploadMoreFirstFrames,
    isKlingModel,
    klingIncomingMediaCounts.imageEdges,
    klingIncomingMediaCounts.videoEdges,
    klingHasLastFrameAny,
    isViduQ2Pro,
    viduIncomingMediaCounts.imageEdges,
    viduIncomingMediaCounts.videoEdges,
    firstFrameFilePickerAccept,
    firstFrameUploadAllowedExtensions,
    currentFlowId,
    uploadFirstFrameFile,
    validateFileSize,
    handleFirstFrameChange,
    firstFrameMaxUploads,
    isVeoModel,
    veoReferenceLimit,
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
        if (isVeoFast) {
          if (entry.role === "first") return { ...entry, role: "last" as const };
          return { ...entry, role: entry.role ?? "last" };
        }
        if (entry.role === "first") return { ...entry, role: "reference" as const };
        return { ...entry, role: entry.role ?? "reference" };
      });

      const referenceCount = updated.filter((entry) => (entry.role ?? "reference") === "reference").length;
      if (!isVeoFast && referenceCount > veoReferenceLimit) {
        setErrorData({
          title: "参考图数量超限",
          list: [`Veo 3.1 参考图最多 ${veoReferenceLimit} 张，请先把某张设为首帧/尾帧或删除后再试。`],
        });
        return;
      }

      handleFirstFrameChange(buildFirstFrameFieldUpdate(updated, { forceRoles: true }));
    },
    [
      buildFirstFrameFieldUpdate,
      firstFrameField,
      handleFirstFrameChange,
      isVeoFast,
      isVeoModel,
      localFirstFrameCount,
      setErrorData,
      veoReferenceLimit,
    ],
  );

  const handleVeoSetReferenceImage = useCallback(
    (index: number) => {
      if (!isVeoModel) return;
      if (isVeoFast) {
        setErrorData({
          title: "Veo 快速版不支持参考图",
          list: ["请改用标准版或将图片设置为首帧/尾帧。"],
        });
        return;
      }
      if (index >= localFirstFrameCount) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (!entries.length || index < 0 || index >= entries.length) return;

      const updated = entries.map((entry, idx) => {
        if (idx !== index) return { ...entry, role: entry.role ?? "reference" };
        return { ...entry, role: "reference" as const };
      });

      const referenceCount = updated.filter((entry) => (entry.role ?? "reference") === "reference").length;
      if (referenceCount > veoReferenceLimit) {
        setErrorData({
          title: "参考图数量超限",
          list: [`Veo 3.1 参考图最多 ${veoReferenceLimit} 张，请先把某张设为首帧/尾帧或删除后再试。`],
        });
        return;
      }

      handleFirstFrameChange(buildFirstFrameFieldUpdate(updated, { forceRoles: true }));
    },
    [
      buildFirstFrameFieldUpdate,
      firstFrameField,
      handleFirstFrameChange,
      isVeoFast,
      isVeoModel,
      localFirstFrameCount,
      setErrorData,
      veoReferenceLimit,
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
        if (isVeoFast) {
          if (entry.role === "last") return { ...entry, role: "first" as const };
          return { ...entry, role: entry.role ?? "first" };
        }
        if (entry.role === "last") return { ...entry, role: "reference" as const };
        return { ...entry, role: entry.role ?? "reference" };
      });

      const referenceCount = updated.filter((entry) => (entry.role ?? "reference") === "reference").length;
      if (!isVeoFast && referenceCount > veoReferenceLimit) {
        setErrorData({
          title: "参考图数量超限",
          list: [`Veo 3.1 参考图最多 ${veoReferenceLimit} 张，请先把某张设为首帧或删除后再试。`],
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
      isVeoFast,
      isVeoModel,
      localFirstFrameCount,
      setErrorData,
      veoReferenceLimit,
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
        const nextEntries: FirstFrameEntry[] = isVeoFast
          ? entries.filter((entry) => entry.role !== "last")
          : entries.map<FirstFrameEntry>((entry) =>
            entry.role === "last" ? { ...entry, role: "reference" } : entry,
          );
        handleFirstFrameChange(
          buildFirstFrameFieldUpdate(nextEntries, { forceRoles: true }),
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
    isVeoFast,
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

  const quickAddTitle =
    quickAddMenu?.kind === "input" ? "添加上下文：" : "下游组件连接：";
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
          onSelect: handleCreateFirstFrameUpstreamNode,
        },
        {
          key: "audio-upstream",
          label: "音频创作",
          icon: "Music",
          onSelect: handleCreateAudioUpstreamNode,
        },
      ];
    }

    return [
      {
        key: "video-downstream",
        label: "视频编辑/参考",
        icon: "Scissors",
        onSelect: handleCreateVideoDownstreamNode,
      },
      {
        key: "text-downstream",
        label: "文本创作",
        icon: "ToyBrick",
        onSelect: handleCreateTextDownstreamNode,
      },
    ];
  }, [
    handleCreateAudioUpstreamNode,
    handleCreateFirstFrameUpstreamNode,
    handleCreateTextDownstreamNode,
    handleCreateTextUpstreamNode,
    handleCreateVideoDownstreamNode,
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
        const currentHeight =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;

        // We compare against the last observed height
        const prevHeight = prevHeightRef.current;

        // If height changed significantly (ignore sub-pixel noise)
        if (Math.abs(currentHeight - prevHeight) > 1) {
          const delta = currentHeight - prevHeight;

          // Update ref immediately for next frame
          prevHeightRef.current = currentHeight;

          // Apply Y-correction synchronously-ish via state used in transition
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
              }),
            );
          });
        }
      }
    });

    resizeObserver.observe(nodeElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setNodes, data.id, startTransition]);

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
            if (!open) setQuickAddMenu(null);
          }}
        />
      )}

      {/* Preview */}
      <div className="relative flex flex-col gap-4 lg:flex-row">
        {firstFrameHandleMeta && (
          <div className="absolute left-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:block">
            <div ref={leftHandleMotionRef}>
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
                uiVariant="plus"
                visible={selected || visiblePlusSide === "left" || lockedPlusSide === "left"}
                isTracking={activePlusSide === "left" || lockedPlusSide === "left"}
                clickMode="menu"
                disablePointerEvents={isKlingModel && !klingCanUploadAny}
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
        {/* Hidden handle for audio_input: needed so auto-created edges can render/attach correctly.
            Keep it invisible to match the ImageCreator UI (no extra visible handles in the preview area). */}
        {promptHandleMeta && (
          <div className="pointer-events-none absolute left-0 top-1/2 z-[900] -translate-y-1/2 opacity-0">
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
              uiVariant="dot"
              clickMode="none"
            />
          </div>
        )}
        {audioHandleMeta && (
          <div className="pointer-events-none absolute left-0 top-1/2 z-[900] -translate-y-1/2 opacity-0">
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
              uiVariant="dot"
              clickMode="none"
            />
          </div>
        )}
        {/* Hidden handle for last_frame_image: required so auto-created tail-frame edges can attach.
            We keep it invisible to avoid adding a second visible input handle in the preview area. */}
        {allowLastFrame && lastFrameHandleMeta && (
          <div className="pointer-events-none absolute left-0 top-1/2 z-[900] -translate-y-1/2 opacity-0">
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
              uiVariant="dot"
              clickMode="none"
            />
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
              appearance="videoGenerator"
              referenceImages={normalizedFirstFramePreviews}
              onRequestUpload={openFirstFrameDialog}
              onRequestTopBarUpload={triggerTopBarUpload}
              onSuggestionClick={handlePreviewSuggestionClick}
              onActionsChange={onPreviewActionsChange}
              aspectRatio={
              isViduModel &&
              normalizedFirstFramePreviews.length > 0 &&
              !(isViduQ2Pro && (hasIncomingVideoBridge || hasVideoInFileInput(firstFrameField)))
                ? "adaptive"
                : String(
                  template.aspect_ratio?.value ??
                  template.aspect_ratio?.default ??
                  "adaptive",
                )
              }
              onPersistentPreviewMotionStart={handlePersistentPreviewMotionStart}
              onPersistentPreviewMotionCommit={handlePersistentPreviewMotionCommit}
            />
        </div>
        {previewOutputHandles.length > 0 && (
          <div className="absolute right-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-start">
            <div ref={rightHandlesMotionRef}>
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
              "relative mt-4 border border-[#E6E9F4] bg-white shadow-[0_25px_50px_rgba(15,23,42,0.08)]",
              isViduUpscaleModel
                ? "mx-auto w-[420px] max-w-[calc(100vw-40px)] rounded-[24px] p-4"
                : "rounded-[32px] px-6 pt-6 pb-0",
              "transition-colors transition-shadow duration-200 ease-out dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_25px_50px_rgba(0,0,0,0.30)]",
              // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
              "transform-gpu origin-top scale-[var(--inv-zoom)]",
            )}
            style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
          >
            {isViduUpscaleModel ? (
              <div className="text-sm text-[#3C4057] dark:text-slate-100">
                <div className="flex flex-col gap-3">
                  {upscaleControlConfigs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {upscaleControlConfigs.map((config) => (
                        <DoubaoParameterButton
                          key={config.name}
                          data={data}
                          config={config}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-[#E2E7F5] bg-[#F4F6FB] dark:border-white/15 dark:bg-white/10">
                      {upscalePreviewSource ? (
                        upscalePreviewIsVideo ? (
                          <video
                            src={upscalePreviewSource}
                            className="pointer-events-none h-full w-full select-none object-cover"
                            muted
                            playsInline
                            preload="metadata"
                            controls={false}
                            disablePictureInPicture
                            disableRemotePlayback
                            draggable={false}
                            tabIndex={-1}
                            onContextMenu={(event) => {
                              event.preventDefault();
                            }}
                          />
                        ) : (
                          <img
                            src={upscalePreviewSource}
                            alt="上游视频封面"
                            className="pointer-events-none h-full w-full select-none object-cover"
                            draggable={false}
                          />
                        )
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#7D85A8] dark:text-slate-300">
                          <ForwardedIconComponent name="Image" className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <GenerationCostPill data={data} className="ml-0">
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
                          className="h-4 w-4"
                        />
                      </button>
                    </GenerationCostPill>
                  </div>
                </div>
              </div>
            ) : (
            ((!klingMultiShotEnabled || klingIntelligentShotEnabled) && (
              <PromptModal
                id={`doubao-video-prompt-${data.id}`}
                field_name={PROMPT_NAME}
                readonly={promptReadonly}
                value={promptValue}
                setValue={(newValue) => handlePromptChange({ value: newValue })}
                nodeClass={data.node!}
                setNodeClass={handleNodeClass}
                mediaSuggestions={promptMediaSuggestions}
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
            ))
            )}

            {!isViduUpscaleModel && (
              <>
                <div className="text-sm text-[#3C4057] dark:text-slate-100">
              <div className="flex min-h-[168px] flex-col gap-3">
                {promptMediaPreviews.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {visiblePromptMediaPreviews.map((preview, index) => {
                      const previewSource =
                        preview.imageSource ?? preview.downloadSource ?? "";
                      const roleBadge =
                        preview.role === "first"
                          ? "首"
                          : preview.role === "last"
                            ? "尾"
                            : preview.role === "reference"
                              ? "参"
                              : null;
                      return (
                        <div
                          key={preview.id ?? `${previewSource}-${preview.role ?? "none"}-${index}`}
                          className="relative h-16 w-16 overflow-hidden rounded-xl border border-[#E2E7F5] bg-[#F4F6FB] dark:border-white/15 dark:bg-white/10"
                        >
                          {previewSource ? (
                            isVideoCandidate(previewSource, preview.fileName) ? (
                              <video
                                src={previewSource}
                                className="h-full w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              <img
                                src={previewSource}
                                alt={preview.label ?? preview.fileName ?? `素材 ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            )
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#7D85A8] dark:text-slate-300">
                              <ForwardedIconComponent name="Image" className="h-4 w-4" />
                            </div>
                          )}
                          {roleBadge && (
                            <span className="absolute left-1 top-1 rounded-full bg-[#111827]/80 px-1.5 text-[10px] leading-4 text-white">
                              {roleBadge}
                            </span>
                          )}
                          {index === 0 && promptMediaPreviews.length > 1 && (
                            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#1B66FF] px-1 text-center text-[10px] font-semibold leading-5 text-white shadow">
                              {promptMediaPreviews.length}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {promptMediaPreviews.length > visiblePromptMediaPreviews.length && (
                      <span className="inline-flex h-16 items-center rounded-xl border border-dashed border-[#D7DEEF] px-2 text-xs text-[#5E6484] dark:border-white/20 dark:text-slate-300">
                        +{promptMediaPreviews.length - visiblePromptMediaPreviews.length}
                      </span>
                    )}
                  </div>
                )}
              {isViduUpscaleModel ? null : klingMultiShotEnabled && !klingIntelligentShotEnabled ? (
                <div className="space-y-3">
                  <div className="text-xs text-[#5E6484] dark:text-slate-300">
                    Kling O3 多镜头：请配置 1-6 个分镜（每个分镜 prompt ≤ 512），且分镜时长之和必须等于总时长。
                  </div>

                  {klingMultiPromptSummary.error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                      {klingMultiPromptSummary.error}
                    </div>
                  ) : null}

                  {(klingMultiPromptItems.length ? klingMultiPromptItems : [{ index: 1, prompt: "", duration: Number(template.duration?.value ?? template.duration?.default ?? 5) }]).map(
                    (shot, idx) => {
                      const list = klingMultiPromptItems.length ? klingMultiPromptItems : [{ index: 1, prompt: "", duration: Number(template.duration?.value ?? template.duration?.default ?? 5) }];
                      const asEditable = list.map((s) => ({ prompt: s.prompt, duration: s.duration }));
                      const updateAt = (nextShot: { prompt: string; duration: number }) => {
                        const next = [...asEditable];
                        next[idx] = nextShot;
                        updateKlingMultiPrompt(next);
                      };
                      const removeAt = () => {
                        const next = asEditable.filter((_, i) => i !== idx);
                        updateKlingMultiPrompt(next.length ? next : [{ prompt: "", duration: Number(template.duration?.value ?? template.duration?.default ?? 5) }]);
                      };
                      const canRemove = asEditable.length > 1;
                      return (
                        <div key={`kling-multi-shot-${idx}`} className="rounded-2xl border border-[#E6E9F4] bg-[#F8FAFF] p-3 dark:border-white/15 dark:bg-white/5">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-medium text-[#2E3150] dark:text-slate-100">镜头 {idx + 1}</div>
                            <div className="ml-auto flex items-center gap-2">
                              <label className="text-xs text-[#5E6484] dark:text-slate-300">时长</label>
                              <input
                                type="number"
                                min={1}
                                max={15}
                                value={Math.max(1, Number.isFinite(shot.duration) ? Math.floor(shot.duration) : 1)}
                                disabled={isBusy}
                                className="h-8 w-20 rounded-lg border border-[#E2E7F5] bg-white px-2 text-sm text-[#1C202D] focus:outline-none dark:border-white/15 dark:bg-neutral-900/40 dark:text-white"
                                onFocus={() => {
                                  if (!klingMultiShotSnapshotTakenRef.current) {
                                    takeSnapshot();
                                    klingMultiShotSnapshotTakenRef.current = true;
                                  }
                                }}
                                onChange={(e) => {
                                  const nextDuration = Number(e.target.value);
                                  updateAt({ prompt: shot.prompt, duration: Number.isFinite(nextDuration) ? nextDuration : 1 });
                                }}
                              />
                              {canRemove ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  className="h-8 rounded-lg border border-[#E2E7F5] bg-white px-2 text-xs text-[#5E6484] hover:bg-[#EEF2FF] disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
                                  onClick={removeAt}
                                >
                                  删除
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <MediaReferencePromptInput
                            rows={2}
                            value={shot.prompt}
                            disabled={isBusy}
                            suggestions={promptMediaSuggestions}
                            dropdownPosition="top"
                            placeholder="分镜提示词（可包含 <<<element_1>>> / <<<image_1>>> / <<<video_1>>>）"
                            maxLength={512}
                            contentClassName="mt-2 min-h-[56px] rounded-xl border border-[#E2E7F5] bg-white p-2 text-sm leading-6 text-[#1C202D] dark:border-white/15 dark:bg-neutral-900/40 dark:text-white"
                            placeholderClassName="text-[#9CA3C0] dark:text-slate-400"
                            className={cn(
                              "custom-scroll mt-2 w-full resize-none rounded-xl",
                              "min-h-[56px] border border-[#E2E7F5] bg-white p-2 text-sm leading-6 focus:outline-none",
                              "dark:border-white/15 dark:bg-neutral-900/40",
                              generationPromptInputBusyClass(isBusy),
                            )}
                            onFocus={() => {
                              if (!klingMultiShotSnapshotTakenRef.current) {
                                takeSnapshot();
                                klingMultiShotSnapshotTakenRef.current = true;
                              }
                            }}
                            onValueChange={(next) => {
                              updateAt({ prompt: next, duration: shot.duration });
                            }}
                          />
                        </div>
                      );
                    },
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[#5E6484] dark:text-slate-300">
                      当前分镜总时长：{klingMultiPromptSummary.sum}s（总时长：{String(template.duration?.value ?? template.duration?.default ?? 5)}s）
                    </div>
                    <button
                      type="button"
                      disabled={isBusy || klingMultiPromptItems.length >= 6}
                      className="h-9 rounded-full border border-[#E2E7F5] bg-white px-3 text-xs text-[#2E3150] hover:bg-[#EEF2FF] disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                      onClick={() => {
                        takeSnapshot();
                        klingMultiShotSnapshotTakenRef.current = true;
                        const totalDuration = Number(template.duration?.value ?? template.duration?.default ?? 5);
                        const current = klingMultiPromptItems.map((s) => ({ prompt: s.prompt, duration: s.duration }));
                        const sum = current.reduce((acc, s) => acc + (Number.isFinite(s.duration) ? s.duration : 0), 0);
                        const nextDuration = Number.isFinite(totalDuration) ? Math.max(1, totalDuration - sum) : 1;
                        updateKlingMultiPrompt([...current, { prompt: "", duration: nextDuration }]);
                      }}
                    >
                      添加分镜
                    </button>
                  </div>
                </div>
              ) : (
                <MediaReferencePromptInput
                  rows={4}
                  value={resolvedPromptValue}
                  disabled={isBusy}
                  readOnly={promptReadonly}
                  suggestions={promptMediaSuggestions}
                  dropdownPosition="top"
                  contentClassName="min-h-[96px] max-h-[96px] overflow-hidden p-0 pr-20 text-sm leading-6 text-[#1C202D] dark:text-white"
                  placeholderClassName="text-[#9CA3C0] dark:text-slate-400"
                  placeholder="描述你想要生成的内容，并在下方调整生成参数。（按下 Enter 生成，Shift+Enter 换行）"
                  className={cn(
                    "nopan nodelete nodrag noflow nowheel custom-scroll w-full resize-none",
                    "min-h-[96px] max-h-[96px] overflow-y-auto",
                    // Make it feel like “text on the container”, not an input box.
                    "border-0 bg-transparent p-0 pr-20 text-sm leading-6 text-[#1C202D] focus:outline-none",
                    "placeholder:text-[#9CA3C0]",
                    generationPromptInputBusyClass(isBusy),
                    klingElementApplied && "bg-[#FFF7D6] dark:bg-amber-500/15",
                    "dark:text-white dark:placeholder:text-slate-400",
                  )}
                  onFocus={() => {
                    setPromptFocused(true);
                    if (!promptSnapshotTakenRef.current) {
                      takeSnapshot();
                      promptSnapshotTakenRef.current = true;
                    }
                  }}
                  onBlur={() => {
                    setPromptFocused(false);
                  }}
                  onValueChange={(next) => {
                    setPromptDraftValue(next);
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
                    if (e.key !== "Enter" || e.shiftKey) return;
                    if ((e.nativeEvent as any)?.isComposing || isPromptComposing) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (!disableRun) handleRun();
                  }}
                />
              )}

              <div className="mt-auto flex flex-wrap gap-3 pt-2">
                {modelNameConfigWithPreserve && (
                  <DoubaoParameterButton data={data} config={modelNameConfigWithPreserve} />
                )}

                {(!isViduUpscaleModel &&
                  (aspectRatioConfig || resolutionConfig || durationConfig || showAudioToggle || isKlingMultiShotModel)) ? (
                  <DoubaoVideoGeneratorResolutionAspectDurationButton
                    data={data}
                    aspectRatioConfig={aspectRatioConfig}
                    resolutionConfig={resolutionConfig}
                    durationConfig={durationConfig}
                    enableAudioField={enableAudioField}
                    showAudioToggle={showAudioToggle}
                    disabled={isBusy}
                    widthClass="basis-[125px]"
                  />
                ) : (
                  <>
                    {aspectRatioConfig && (
                      <DoubaoParameterButton data={data} config={aspectRatioConfig} />
                    )}
                    {resolutionConfig && (
                      <DoubaoParameterButton data={data} config={resolutionConfig} />
                    )}
                    {durationConfig && (
                      <DoubaoParameterButton data={data} config={durationConfig} />
                    )}
                  </>
                )}
                {upscaleControlConfigs.map((config) => (
                  <DoubaoParameterButton key={config.name} data={data} config={config} />
                ))}

                <div className="ml-auto flex items-center gap-3">
                  {isKlingModel && (
                    <KlingElementPickerButton
                      disabled={isBusy}
                      selectedElementIds={selectedKlingElementIds}
                      onPick={applyKlingElement}
                    />
                  )}

                  <GenerationCostPill data={data} className="ml-0">
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
                        className="h-4 w-4"
                      />
                    </button>
                  </GenerationCostPill>
                </div>
                </div>
                </div>
              </div>
              </>
            )}

            {!isViduUpscaleModel && hasAdditionalFields && (
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

      <Dialog
        open={isFirstFrameDialogOpen}
        onOpenChange={setFirstFrameDialogOpen}
      >
        <DialogContent className="w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isSoraModel ? "上传参考图（Sora）" : isViduUpscaleModel ? "上传待高清视频" : "上传图片或视频"}
            </DialogTitle>
            <DialogDescription>
              {isViduUpscaleModel
                ? "Vidu 智能超清仅支持视频输入：请上传 1 段视频作为高清素材。"
                : isSoraModel
                ? "Sora 系列仅支持参考图生视频（最多 1 张，将作为 input_reference）。不支持首尾帧插值，请上传 1 张图片并填写提示词。"
                : isVeoModel
                  ? isVeoFast
                    ? "Veo 3.1 快速版仅支持首帧/尾帧（不支持参考图）。"
                    : "Veo 3.1 仅支持图片输入：可设置首帧/尾帧，或最多 3 张参考图。提示：如已设置首帧/尾帧，参考图会被自动忽略（首/尾帧优先）。"
                  : "支持 JPG/PNG/WebP 等图片格式；wan2.6 / kling O1 还支持 MP4/MOV 参考视频。"}
            </DialogDescription>
          </DialogHeader>
          {firstFrameField ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl bg-[#F7F9FF] p-4 transition-colors duration-200 ease-out dark:border dark:border-white/20 dark:bg-neutral-800/75 dark:backdrop-blur-xl">
                <p className="text-sm font-medium text-foreground">
                  {isSoraModel
                    ? "选择要上传的参考图（最多 1 张）"
                    : isViduUpscaleModel
                      ? "选择要上传的视频（最多 1 段）"
                      : "选择要上传的图片或视频（支持多选）"}
                </p>
                <button
                  type="button"
                  className={cn(
                    "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F4F5F9] text-sm font-medium text-[#13141A] transition-colors duration-200 dark:bg-slate-800/40 dark:text-white dark:hover:bg-slate-800/50",
                    (isFirstFrameUploadPending || (!isKlingModel && !canUploadMoreFirstFrames)) &&
                    "opacity-70",
                  )}
                  onClick={triggerFirstFrameUpload}
                  disabled={isFirstFrameUploadPending || (!isKlingModel && !canUploadMoreFirstFrames)}
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
                        : isViduUpscaleModel
                          ? "上传视频"
                        : "上传图片或视频"}
                  </span>
                </button>
                <p className="text-xs text-muted-foreground">
                  {isKlingModel ? (
                    <>
                      已占用 图片 {klingTotalImagesNow} / {klingMaxImagesTotal}，参考视频{" "}
                      {klingTotalVideosNow} / 1
                    </>
                  ) : (
                    <>
                      已保留 {firstFrameCount} / {firstFrameMaxUploads}{" "}
                      {isSoraModel ? "张参考图" : isViduUpscaleModel ? "段视频" : "张候选素材"}
                    </>
                  )}
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
                      : isKlingModel
                        ? "已达到 kling O1 的素材上限：有参考视频时图片最多 4 张、无参考视频时图片最多 7 张（参考视频最多 1 段）。请删除多余素材后再上传。"
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
                                // Keep a single selected node to avoid triggering the auto-group UI.
                                selected: node.id === upstreamLastFrameNodeId,
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

              <div className="space-y-3 rounded-2xl border border-dashed border-[#E0E5F2] bg-white/80 p-3 transition-colors duration-200 ease-out dark:border-white/20 dark:bg-neutral-800/70 dark:backdrop-blur-xl">
                <div className="flex items-center justify-between text-xs text-[#636A86] dark:text-slate-300">
                  <span>{isSoraModel ? "参考图管理" : "图片候选管理"}</span>
                  <span className="font-medium text-[#1B66FF]">
                    {firstFrameCount} / {firstFrameMaxUploads}
                  </span>
                </div>

                {combinedImagePreviews.length > 0 ? (
                  <div className="space-y-3">
                    {isVeoModel && veoHasFirstOrLastLocally && veoHasReferenceLocally && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                        已设置首帧/尾帧：参考图将被忽略（首/尾帧优先）。
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {combinedImagePreviews.map((preview, index) => {
                        const previewSource =
                          preview.imageSource ?? preview.downloadSource ?? "";
                        const isSelectedLastFrame = Boolean(
                          allowLastFrame &&
                            selectedLastFrameSource &&
                            previewSource &&
                            previewSource.toString().trim() === selectedLastFrameSource,
                        );
                        const isSelectedFirstFrame = Boolean(
                          preview.originField === FIRST_FRAME_FIELD &&
                            selectedFirstFrameSource &&
                            previewSource &&
                            previewSource.toString().trim() === selectedFirstFrameSource,
                        );
                        const isUpstream = preview.isUpstream;
                        const previewRole = preview.role;
                        const isRoleLast = previewRole === "last";
                        const isRoleReference = previewRole === "reference";
                        const isMarkedLast = isRoleLast || isSelectedLastFrame;
                        const canEditFirstFrame =
                          preview.originField === FIRST_FRAME_FIELD && !isUpstream;
                        const roleBadgeLabel = previewRole
                          ? previewRole === "first"
                            ? "首帧"
                            : previewRole === "last"
                              ? "尾帧"
                              : isVeoModel && veoHasFirstOrLastLocally
                                ? "参考(将忽略)"
                                : "参考"
                          : undefined;
                        const roleBadgeClass =
                          previewRole === "last"
                            ? "bg-[#111827]/80"
                            : previewRole === "reference"
                              ? "bg-[#10B981]/90"
                              : "bg-[#1B66FF]/90";
                        const roleBadgePosition =
                          previewRole === "last" ? "right-3" : "left-3";
                        const localIndex = preview.sourceIndex;

                        return (
                          <div
                            key={preview.id ?? `${preview.imageSource}-${index}`}
                            className="group relative flex flex-col overflow-hidden rounded-xl border border-[#E2E7F5] bg-white shadow-sm transition-colors duration-200 dark:border-white/10 dark:bg-slate-800/40 dark:shadow-[0_20px_35px_rgba(0,0,0,0.35)] dark:hover:bg-slate-800/50"
                          >
                            <div className="relative h-28 w-full overflow-hidden">
                              {isVideoCandidate(previewSource, preview.fileName) ? (
                                <video
                                  src={previewSource}
                                  className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                  muted
                                  playsInline
                                  preload="metadata"
                                  onMouseEnter={(event) => {
                                    const video = event.currentTarget;
                                    video.currentTime = 0;
                                    video.play().catch(() => { });
                                  }}
                                  onMouseLeave={(event) => {
                                    const video = event.currentTarget;
                                    video.pause();
                                    video.currentTime = 0;
                                  }}
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
                              {roleBadgeLabel && (
                                <span
                                  className={`absolute ${roleBadgePosition} top-3 rounded-full ${roleBadgeClass} px-2 py-0.5 text-[11px] font-medium text-white shadow`}
                                >
                                  {roleBadgeLabel}
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
                                  `${isSoraModel ? "参考图" : "候选素材"} ${index + 1}`}
                              </span>
                              <div className="flex items-center gap-2">
                                {isVeoModel ? (
                                  <>
                                    {allowLastFrame && (
                                      <button
                                        type="button"
                                        className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                        onClick={() =>
                                          typeof localIndex === "number" &&
                                          handleVeoSetLastFrame(localIndex)
                                        }
                                        disabled={!canEditFirstFrame}
                                      >
                                        {isMarkedLast ? "已设尾帧" : "设为尾帧"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                      onClick={() =>
                                        typeof localIndex === "number" &&
                                        handleVeoSetFirstFrame(localIndex)
                                      }
                                      disabled={!canEditFirstFrame || isSelectedFirstFrame}
                                    >
                                      {isSelectedFirstFrame ? "已设首帧" : "设为首帧"}
                                    </button>
                                    {!isVeoFast && (
                                      <button
                                        type="button"
                                        className="text-[#10B981] hover:underline dark:text-[#34d399]"
                                        onClick={() =>
                                          typeof localIndex === "number" &&
                                          handleVeoSetReferenceImage(localIndex)
                                        }
                                        disabled={!canEditFirstFrame || isRoleReference}
                                      >
                                        {isRoleReference ? "已设参考" : "设为参考"}
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {allowLastFrame && (
                                      <button
                                        type="button"
                                        className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                        onClick={() =>
                                          typeof localIndex === "number" &&
                                          handleSetLastFrame(localIndex)
                                        }
                                        disabled={!canEditFirstFrame}
                                      >
                                        {isMarkedLast ? "已设尾帧" : "设为尾帧"}
                                      </button>
                                    )}
                                    {!isSoraModel &&
                                      canEditFirstFrame &&
                                      localIndex !== 0 && (
                                        <button
                                          type="button"
                                          className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                          onClick={() =>
                                            typeof localIndex === "number" &&
                                            handleSetPrimaryFirstFrame(localIndex)
                                          }
                                        >
                                          设为首帧
                                        </button>
                                      )}
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="text-[#C93636] hover:underline dark:text-[#ff9a9a] disabled:text-[#C93636]/40 dark:disabled:text-[#ff9a9a]/50"
                                  onClick={() => {
                                    if (isUpstream) return;
                                    if (preview.originField === LAST_FRAME_FIELD) {
                                      handleClearLastFrame();
                                      return;
                                    }
                                    if (typeof localIndex === "number") {
                                      handleFirstFrameRemove(localIndex);
                                    }
                                  }}
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
                  ? isVeoFast
                    ? "最多保留 2 份素材（首帧 1、尾帧 1）。"
                    : "最多保留 5 份素材（首帧 1、尾帧 1、参考图最多 3）。"
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
  klingLimits,
  viduLimits,
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
  klingLimits: { incomingImageEdges: number; incomingVideoEdges: number; hasLastFrame: boolean } | null;
  viduLimits: { incomingImageEdges: number; incomingVideoEdges: number } | null;
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
  if (klingLimits) {
    const incomingVideoEdges = Number(klingLimits.incomingVideoEdges || 0);
    const incomingImageEdges = Number(klingLimits.incomingImageEdges || 0);
    const hasLastFrame = Boolean(klingLimits.hasLastFrame);

    const existingLocalVideos = existingEntries.filter((entry) =>
      isVideoCandidate(entry.path, entry.name),
    ).length;
    const existingLocalImages = Math.max(existingEntries.length - existingLocalVideos, 0);

    const newVideos = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ext === "mp4" || ext === "mov";
    }).length;
    const newImages = Math.max(files.length - newVideos, 0);

    if (incomingVideoEdges > 0 && newVideos > 0) {
      setErrorData({
        title: "参考视频数量超限",
        list: ["kling O1 最多仅支持 1 段参考视频。当前已通过组件链接提供参考视频，请勿再上传视频文件。"],
      });
      return;
    }

    const totalVideosAfter = incomingVideoEdges + existingLocalVideos + newVideos;
    if (totalVideosAfter > 1) {
      setErrorData({
        title: "参考视频数量超限",
        list: ["kling O1 最多仅支持 1 段参考视频（MP4/MOV）。请删除多余视频后再试。"],
      });
      return;
    }

    const hasVideoAfter = totalVideosAfter > 0;
    const maxImagesTotal = hasVideoAfter ? 4 : 7;
    const totalImagesAfter =
      incomingImageEdges + existingLocalImages + newImages + (hasLastFrame ? 1 : 0);

    if (totalImagesAfter > maxImagesTotal) {
      const hint = hasVideoAfter
        ? "当前已包含参考视频：图片最多 4 张（首/尾帧也计入图片数量）。"
        : "当前无参考视频：图片最多 7 张（首/尾帧也计入图片数量）。";
      setErrorData({
        title: "参考图片数量超限",
        list: [
          `kling O1 图片数量限制：有参考视频时最多 4 张、无参考视频时最多 7 张。${hint}`,
          "请删除多余图片/尾帧后再上传。",
        ],
      });
      return;
    }
  } else if (viduLimits) {
    const incomingVideoEdges = Number(viduLimits.incomingVideoEdges || 0);
    const incomingImageEdges = Number(viduLimits.incomingImageEdges || 0);

    const existingLocalVideos = existingEntries.filter((entry) =>
      isVideoCandidate(entry.path, entry.name),
    ).length;
    const existingLocalImages = Math.max(existingEntries.length - existingLocalVideos, 0);

    const newVideos = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ext === "mp4" || ext === "mov" || ext === "avi" || ext === "webm";
    }).length;
    const newImages = Math.max(files.length - newVideos, 0);

    const totalVideosAfter = incomingVideoEdges + existingLocalVideos + newVideos;
    if (totalVideosAfter > 2) {
      setErrorData({
        title: "参考视频数量超限",
        list: ["Vidu q2-pro 参考生视频最多支持 2 段参考视频（MP4/MOV/AVI）。请删除多余视频后再试。"],
      });
      return;
    }

    const hasVideoAfter = totalVideosAfter > 0;
    const maxImagesTotal = hasVideoAfter ? 4 : 1;
    const totalImagesAfter = incomingImageEdges + existingLocalImages + newImages;

    if (hasVideoAfter && totalImagesAfter < 1) {
      setErrorData({
        title: "缺少参考图",
        list: ["Vidu q2-pro 参考生视频需要至少 1 张参考图（上传视频时可同时选择图片）。"],
      });
      return;
    }

    if (totalImagesAfter > maxImagesTotal) {
      const hint = hasVideoAfter
        ? "当前已包含参考视频：参考图最多 4 张。"
        : "当前无参考视频：首帧图最多 1 张。";
      setErrorData({
        title: "参考图片数量超限",
        list: [
          `Vidu q2-pro 图片数量限制：无参考视频时最多 1 张；有参考视频时最多 4 张。${hint}`,
          "请删除多余图片后再上传。",
        ],
      });
      return;
    }
  } else if (existingEntries.length + files.length > maxEntries) {
    setErrorData({
      title: "已达到候选素材上限",
      list: [`最多保留 ${maxEntries} 份素材，请先删除不需要的图片后再上传。`],
    });
    return;
  }

  const maxReferenceImagesSafe = maxReferenceImages ?? 0;
  const supportsReferenceRoles = enableRoles && maxReferenceImagesSafe > 0;
  if (supportsReferenceRoles) {
    const existingReferenceCount = existingEntries.filter(
      (entry) => (entry.role ?? "reference") === "reference",
    ).length;
    const newReferenceCount =
      existingEntries.length === 0 && files.length === 1 ? 0 : files.length;
    if (existingReferenceCount + newReferenceCount > maxReferenceImagesSafe) {
      setErrorData({
        title: "参考图数量超限",
        list: [
          `Veo 3.1 参考图最多 ${maxReferenceImagesSafe} 张：请先把某张设为首帧/尾帧或删除后再上传。`,
        ],
      });
      return;
    }
  }

  setReferenceUploadPending(true);
  try {
    const uploadedEntries: FirstFrameEntry[] = [];
    const usedRoles = new Set<string>();
    if (enableRoles && !supportsReferenceRoles) {
      existingEntries.forEach((entry, index) => {
        const role =
          entry.role ??
          (existingEntries.length === 1
            ? "first"
            : index === 0
              ? "first"
              : "last");
        usedRoles.add(role);
      });
    }
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
        let role: "first" | "reference" | "last" | undefined;
        if (enableRoles) {
          if (supportsReferenceRoles) {
            role =
              existingEntries.length === 0 && files.length === 1
                ? "first"
                : "reference";
          } else {
            if (!usedRoles.has("first")) {
              role = "first";
            } else if (!usedRoles.has("last")) {
              role = "last";
            } else {
              setErrorData({
                title: "已达到候选素材上限",
                list: [`最多保留 ${maxEntries} 份素材，请先删除不需要的图片后再上传。`],
              });
              return;
            }
            usedRoles.add(role);
          }
        }
        uploadedEntries.push({ name: file.name, path: serverPath, role });
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
    const resolvedEntries = enableRoles
      ? mergedEntries.map((entry, index) => ({
        ...entry,
        role:
          entry.role ??
          (mergedEntries.length === 1
            ? "first"
            : supportsReferenceRoles
              ? "reference"
              : index === 0
                ? "first"
                : "last"),
      }))
      : mergedEntries;

    handleReferenceChange(
      enableRoles
        ? {
          value: resolvedEntries.map((entry) => ({
            name: entry.name,
            display_name: entry.name,
            role: entry.role!,
          })),
          file_path: resolvedEntries.map((entry) => entry.path),
        }
        : {
          value: resolvedEntries.map((entry) => entry.name),
          file_path: resolvedEntries.map((entry) => entry.path),
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

function applyEdgeRoleToField(
  field: InputFieldType,
  role: "first" | "reference" | "last",
): InputFieldType {
  const entries = collectFirstFrameEntries(field);
  if (!entries.length) return field;
  const fallbackRole = entries.length === 1 ? "first" : "reference";
  const normalizedRole = role ?? fallbackRole;
  return {
    ...field,
    value: entries.map((entry) => ({
      name: entry.name,
      display_name: entry.name,
      role: normalizedRole,
    })),
    file_path: entries.map((entry) => entry.path),
  };
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

function mergeReferencePreviewLists<T extends DoubaoReferenceImage>(base: T[], extras: T[]): T[] {
  return dedupePreviews([...base, ...extras]);
}

function dedupePreviews<T extends DoubaoReferenceImage>(previews: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  previews.forEach((preview) => {
    const baseKey = preview.imageSource ?? preview.downloadSource ?? preview.id;
    const key = preview.role ? `${baseKey}-${preview.role}` : baseKey;
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
    const valueLabel = extractReferenceLabel(valueEntries[index]);
    const resolved = resolveReferenceSource(rawSource, valueLabel);
    if (!resolved) continue;
    const label =
      valueLabel ??
      resolved.fileName ??
      `候选素材 ${index + 1}`;
    previews.push({
      id: `${resolved.sourceId}-${index}`,
      imageSource: resolved.url,
      downloadSource: resolved.downloadUrl,
      label,
      // Preserve original uploaded filename (when present) so we can correctly detect video even if the stored path
      // has an unexpected/trimmed extension (e.g. ".mp_").
      fileName: valueLabel ?? resolved.fileName,
      role: extractReferenceRole(valueEntries[index]),
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

function resolveReferenceSource(raw: string, fileNameHint?: string) {
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
    (segments[1] === "images" || segments[1] === "download" || segments[1] === "media")
  ) {
    segments = segments.slice(2);
  }
  if (segments.length < 2) return null;
  const [flowId, ...rest] = segments;
  if (!flowId || !rest.length) return null;
  const encodedFlow = encodeURIComponent(flowId);
  const encodedFile = rest.map((part) => encodeURIComponent(part)).join("/");
  const fileName = rest[rest.length - 1];
  const isVideo = isVideoCandidate(trimmed, fileNameHint ?? fileName);
  const url = isVideo
    ? `${BASE_URL_API}files/media/${encodedFlow}/${encodedFile}`
    : `${BASE_URL_API}files/images/${encodedFlow}/${encodedFile}`;
  const downloadUrl = isVideo
    ? `${BASE_URL_API}files/download/${encodedFlow}/${encodedFile}`
    : url;
  return {
    url,
    downloadUrl,
    fileName,
    sourceId: `${flowId}-${fileName}`,
  };
}

function isVideoCandidate(source: string | undefined, fileName?: string) {
  const combined = `${fileName ?? ""} ${source ?? ""}`.toLowerCase();
  return (
    combined.includes(".mp4") ||
    combined.includes(".mov") ||
    combined.includes(".avi") ||
    combined.includes(".webm") ||
    combined.includes(".mp_")
  );
}

function extractFileName(value: string): string | undefined {
  if (!value) return undefined;
  const sanitized = value.replace(/\\/g, "/");
  const parts = sanitized.split("/");
  return parts.pop() || undefined;
}
