import { useCallback, useMemo, useState } from "react";
import DoubaoPreviewPanel, { type DoubaoReferenceImage } from "./DoubaoPreviewPanel";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import type { NodeDataType } from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { useTypesStore } from "@/stores/typesStore";
import { track } from "@/customization/utils/analytics";
import { findLastNode } from "@/utils/reactflowUtils";
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

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[220px] grow" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[140px]" },
  { name: "duration", icon: "Timer", widthClass: "basis-[110px]" },
] as const;

const PROMPT_NAME = "prompt";
const DEFAULT_DURATION_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FIRST_FRAME_FIELD = "first_frame_image";
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
  const template = data.node?.template ?? {};
  const showExpanded = Boolean(selected);
  const customFields = new Set<string>([
    PROMPT_NAME,
    FIRST_FRAME_FIELD,
    ...CONTROL_FIELDS.map((item) => item.name),
    ...SENSITIVE_FIELDS,
  ]);
  const hasAdditionalFields = Object.keys(template).some(
    (field) => !customFields.has(field),
  );
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
  const [isFirstFrameDialogOpen, setFirstFrameDialogOpen] = useState(false);
  const [isFirstFrameUploadPending, setFirstFrameUploadPending] = useState(false);
  const { handleOnNewValue: handleFirstFrameChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: FIRST_FRAME_FIELD,
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
  const typeData = useTypesStore((state) => state.data);

  const nodeIdForRun = data.node?.flow?.data
    ? (findLastNode(data.node.flow.data!)?.id ?? data.id)
    : data.id;

  const isBusy = buildStatus === BuildStatus.BUILDING || isBuilding;

  const handleRun = () => {
    clearFlowPoolForNodes([nodeIdForRun]);
    if (buildStatus === BuildStatus.BUILDING && isRunHovering) {
      stopBuilding();
      return;
    }
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

      let options: Array<string | number> =
        templateField.options ?? templateField.list ?? [];

      if (field.name === "duration") {
        const rangeOptions = buildRangeOptions(templateField);
        options = rangeOptions.length ? rangeOptions : DEFAULT_DURATION_OPTIONS;
      }

      const tooltipText =
        DOUBAO_CONTROL_HINTS[field.name] ?? DOUBAO_CONFIG_TOOLTIP;
      return {
        ...field,
        template: templateField,
        options,
        value: templateField.value,
        tooltip: tooltipText,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [template]);

  const firstFramePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildFirstFramePreviewItems(firstFrameField),
    [firstFrameField],
  );
  const selectedFirstFrame = firstFramePreviews[0] ?? null;
  const firstFrameCount = firstFramePreviews.length;
  const canUploadMoreFirstFrames = firstFrameCount < FIRST_FRAME_MAX_UPLOADS;
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
  const firstFrameFilePickerAccept = useMemo(
    () => firstFrameAllowedExtensions.map((ext) => `.${ext}`).join(","),
    [firstFrameAllowedExtensions],
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
      tooltip:
        firstFrameField.input_types?.join(", ") ??
        firstFrameField.type ??
        "首帧图输入",
      title: firstFrameField.display_name ?? "首帧图输入",
      colors,
      colorName,
      proxy: firstFrameField.proxy,
    };
  }, [firstFrameField, types, data.id]);

  const openFirstFrameDialog = useCallback(() => {
    if (isFirstFrameUploadPending) return;
    setFirstFrameDialogOpen(true);
  }, [isFirstFrameUploadPending]);

  const triggerFirstFrameUpload = useCallback(() => {
    if (isFirstFrameUploadPending) {
      return;
    }
    void handleFirstFrameUpload({
      referenceField: firstFrameField,
      accept: firstFrameFilePickerAccept,
      allowedExtensions: firstFrameAllowedExtensions,
      currentFlowId,
      uploadReferenceFile: uploadFirstFrameFile,
      validateFileSize,
      handleReferenceChange: handleFirstFrameChange,
      setErrorData,
      setReferenceUploadPending: setFirstFrameUploadPending,
      maxEntries: FIRST_FRAME_MAX_UPLOADS,
    });
  }, [
    firstFrameField,
    isFirstFrameUploadPending,
    firstFrameFilePickerAccept,
    firstFrameAllowedExtensions,
    currentFlowId,
    uploadFirstFrameFile,
    validateFileSize,
    handleFirstFrameChange,
    setErrorData,
  ]);

  const handleFirstFrameRemove = useCallback(
    (index: number) => {
      const entries = collectFirstFrameEntries(firstFrameField);
      if (!entries.length || index < 0 || index >= entries.length) return;
      entries.splice(index, 1);
      handleFirstFrameChange({
        value: entries.map((entry) => entry.name),
        file_path: entries.map((entry) => entry.path),
      });
    },
    [firstFrameField, handleFirstFrameChange],
  );

  const handleSetPrimaryFirstFrame = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const entries = collectFirstFrameEntries(firstFrameField);
      if (index >= entries.length) return;
      const [selected] = entries.splice(index, 1);
      entries.unshift(selected);
      handleFirstFrameChange({
        value: entries.map((entry) => entry.name),
        file_path: entries.map((entry) => entry.path),
      });
    },
    [firstFrameField, handleFirstFrameChange],
  );

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
            {firstFrameHandleMeta && (
              <div className="absolute -left-12 top-1/2 hidden -translate-y-1/2 lg:block">
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
              </div>
            )}
            <div className="flex-1">
              <DoubaoPreviewPanel
                nodeId={data.id}
                componentName={data.type}
                appearance="videoGenerator"
                onRequestUpload={openFirstFrameDialog}
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
                    inputTypes: ["Message"],
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
                className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2E7BFF] text-white shadow-[0_12px_24px_rgba(46,123,255,0.35)] transition hover:bg-[#0F5CE0]"
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
            <DialogTitle>上传首帧图片</DialogTitle>
            <DialogDescription>
              支持 JPG/PNG/WebP 等格式，每张不超过 10MB。
            </DialogDescription>
          </DialogHeader>
          {firstFrameField ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl bg-[#F7F9FF] p-4 dark:border dark:border-white/10 dark:bg-[#111a2b]/80">
                <p className="text-sm font-medium text-foreground">
                  选择要上传的图片（支持多选）
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
                  <span>{isFirstFrameUploadPending ? "上传中..." : "从设备上传"}</span>
                </button>
                <p className="text-xs text-muted-foreground">
                  已保留 {firstFrameCount} / {FIRST_FRAME_MAX_UPLOADS} 张候选图
                </p>
                {!canUploadMoreFirstFrames && (
                  <p className="text-xs text-amber-600">
                    已达到候选图上限，请删除不需要的图片后再上传。
                  </p>
                )}
                {selectedFirstFrame && (
                  <p className="text-xs text-[#4B5168] dark:text-slate-200">
                    当前首帧：{selectedFirstFrame.fileName ?? selectedFirstFrame.label}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-dashed border-[#E0E5F2] bg-white/80 p-3 dark:border-white/15 dark:bg-[#0a1220]/70">
                <div className="flex items-center justify-between text-xs text-[#636A86] dark:text-slate-300">
                  <span>首帧候选管理</span>
                  <span className="font-medium text-[#1B66FF]">
                    {firstFrameCount} / {FIRST_FRAME_MAX_UPLOADS}
                  </span>
                </div>

                {firstFrameCount > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {firstFramePreviews.map((preview, index) => (
                      <div
                        key={preview.id ?? `${preview.imageSource}-${index}`}
                        className="group relative flex flex-col overflow-hidden rounded-xl border border-[#E2E7F5] bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
                      >
                        <div className="relative h-28 w-full overflow-hidden">
                          <img
                            src={preview.imageSource}
                            alt={preview.label ?? preview.fileName ?? `候选图 ${index + 1}`}
                            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                          />
                          {index === 0 && (
                            <span className="absolute left-3 top-3 rounded-full bg-[#1B66FF]/90 px-2 py-0.5 text-[11px] font-medium text-white shadow">
                              当前首帧
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-[#5E6484] dark:text-slate-200">
                          <span className="line-clamp-1">
                            {preview.label ?? preview.fileName ?? `候选图 ${index + 1}`}
                          </span>
                          <div className="flex items-center gap-2">
                            {index !== 0 && (
                              <button
                                type="button"
                                className="text-[#1B66FF] hover:underline dark:text-[#7da6ff]"
                                onClick={() => handleSetPrimaryFirstFrame(index)}
                              >
                                设为首帧
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-[#C93636] hover:underline dark:text-[#ff9a9a]"
                              onClick={() => handleFirstFrameRemove(index)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    目前还没有候选图，点击上方按钮上传图片。
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
              最多保留 {FIRST_FRAME_MAX_UPLOADS} 张候选图，新上传的图片默认用作首帧。
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type FirstFrameEntry = { name: string; path: string };

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
  setErrorData: ReturnType<typeof useAlertStore>["setErrorData"];
  setReferenceUploadPending: (loading: boolean) => void;
  maxEntries: number;
}) {
  if (!currentFlowId) {
    setErrorData({
      title: "无法上传首帧图",
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
        uploadedEntries.push({ name: file.name, path: serverPath });
      } catch (error: any) {
        console.error(error);
        setErrorData({
          title: "上传失败",
          list: [
            error?.response?.data?.detail ??
              "网络异常，稍后再试或检查后端日志。",
          ],
        });
        return;
      }
    }

    if (!uploadedEntries.length) return;

    const existingEntries = collectFirstFrameEntries(referenceField);
    const mergedEntries = [...uploadedEntries, ...existingEntries];
    const limitedEntries =
      mergedEntries.length > maxEntries
        ? mergedEntries.slice(0, maxEntries)
        : mergedEntries;

    handleReferenceChange({
      value: limitedEntries.map((entry) => entry.name),
      file_path: limitedEntries.map((entry) => entry.path),
    });
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
      `候选图 ${index + 1}`;
    entries.push({
      name: resolvedName,
      path: resolvedPath,
    });
  }
  return entries;
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
      `候选图 ${index + 1}`;
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
    const candidates = [
      entry?.file_path,
      entry?.path,
      entry?.value,
      entry?.url,
      entry?.image_url,
      entry?.image_data_url,
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
    const candidates = [entry?.display_name, entry?.filename, entry?.name];
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
