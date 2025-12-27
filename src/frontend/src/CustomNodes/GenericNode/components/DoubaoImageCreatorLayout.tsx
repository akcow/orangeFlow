import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DoubaoPreviewPanel, { type DoubaoReferenceImage } from "./DoubaoPreviewPanel";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import useHandleOnNewValue, {
  type handleOnNewValueType,
} from "../../hooks/use-handle-new-value";
import type { InputFieldType } from "@/types/api";
import type { NodeDataType } from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { track } from "@/customization/utils/analytics";
import { findLastNode } from "@/utils/reactflowUtils";
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
import { scapeJSONParse } from "@/utils/reactflowUtils";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[230px] grow-[2]" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[150px]" },
  { name: "aspect_ratio", icon: "Square", widthClass: "basis-[110px]" },
  { name: "image_count", icon: "Layers", widthClass: "basis-[90px]" },
] as const;

const PROMPT_NAME = "prompt";
const REFERENCE_FIELD = "reference_images";
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
};

export default function DoubaoImageCreatorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
}: DoubaoImageCreatorLayoutProps) {
  const template = data.node?.template ?? {};
  const showExpanded = Boolean(selected);
  const customFields = new Set<string>([
    PROMPT_NAME,
    REFERENCE_FIELD,
    ...CONTROL_FIELDS.map((item) => item.name),
    ...SENSITIVE_FIELDS,
  ]);
  const hasAdditionalFields = Object.keys(template).some(
    (field) => !customFields.has(field),
  );

  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
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
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const { mutateAsync: uploadReferenceFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const [isRunHovering, setRunHovering] = useState(false);
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

      if (field.name === "image_count") {
        options = buildRangeOptions(templateField);
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

  const maxReferenceEntries = useMemo(() => {
    const explicitLimit =
      (typeof referenceField?.max_length === "number" && referenceField?.max_length) ||
      (typeof referenceField?.max_files === "number" && referenceField?.max_files) ||
      (typeof referenceField?.list_max === "number" && referenceField?.list_max);
    if (typeof explicitLimit === "number" && explicitLimit > 0) {
      return explicitLimit;
    }
    return MAX_REFERENCE_IMAGES;
  }, [referenceField]);
  const maxLocalEntries = Math.max(
    maxReferenceEntries - upstreamReferencePreviews.length,
    0,
  );
  const uploadMaxEntries = Math.max(maxLocalEntries, localReferenceCount);
  const canAddMoreReferences =
    localReferenceCount < maxLocalEntries &&
    selectedReferenceCount < maxReferenceEntries;

  const allowedExtensions = useMemo(() => {
    const source = referenceFileTypes && referenceFileTypes.length > 0
      ? referenceFileTypes
      : DEFAULT_REFERENCE_EXTENSIONS;
    return source.map((ext) => ext.replace(/^\./, "").toLowerCase());
  }, [referenceFileTypes]);

  const filePickerAccept = useMemo(
    () => allowedExtensions.map((ext) => `.${ext}`).join(","),
    [allowedExtensions],
  );

  const openUploadDialog = useCallback(() => {
    if (isReferenceUploadPending) return;
    setUploadDialogOpen(true);
  }, [isReferenceUploadPending]);

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
            error?.response?.data?.detail ??
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
    const listener = () => openUploadDialog();
    window.addEventListener("doubao-preview-upload", listener);
    return () => window.removeEventListener("doubao-preview-upload", listener);
  }, []);

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
      <div className="rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-[0_25px_50px_rgba(0,0,0,0.55)]">
        <div className="mt-5 flex flex-col gap-5">
          <div className="relative flex flex-col gap-4 lg:flex-row">
            {referenceHandleMeta && (
              <div className="absolute -left-12 top-1/2 hidden -translate-y-1/2 lg:block">
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
                />
              </div>
            )}
            <div className="flex-1">
              <DoubaoPreviewPanel
                nodeId={data.id}
                componentName={data.type}
                appearance="imageCreator"
                referenceImages={combinedReferencePreviews}
                onRequestUpload={openUploadDialog}
              />
            </div>
            {previewOutputHandles.length > 0 && (
              <div
                className={cn(
                  "absolute left-full top-1/2 hidden -translate-y-1/2 pl-6 lg:flex lg:flex-col lg:items-start",
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
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {showExpanded && (
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
  setErrorData: ReturnType<typeof useAlertStore>["setErrorData"];
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
            error?.response?.data?.detail ??
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
