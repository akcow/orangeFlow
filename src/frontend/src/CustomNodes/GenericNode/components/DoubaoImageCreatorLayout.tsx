import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import InputFileComponent from "@/components/core/parameterRenderComponent/components/inputFileComponent";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
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
import { BASE_URL_API } from "@/constants/constants";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  buildRangeOptions,
} from "./DoubaoParameterButton";
import type { TypesStoreType } from "@/types/zustand/types";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[230px] grow-[2]" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[150px]" },
  { name: "aspect_ratio", icon: "Square", widthClass: "basis-[110px]" },
  { name: "image_count", icon: "Layers", widthClass: "basis-[90px]" },
] as const;

const PROMPT_NAME = "prompt";
const REFERENCE_FIELD = "reference_images";

type DoubaoImageCreatorLayoutProps = {
  data: NodeDataType;
  types: TypesStoreType["types"];
  isToolMode: boolean;
  buildStatus: BuildStatus;
  outputsSection?: ReactNode;
};

export default function DoubaoImageCreatorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  outputsSection,
}: DoubaoImageCreatorLayoutProps) {
  const template = data.node?.template ?? {};
  const customFields = new Set<string>([
    PROMPT_NAME,
    REFERENCE_FIELD,
    ...CONTROL_FIELDS.map((item) => item.name),
  ]);

  const referenceField = template[REFERENCE_FIELD];
  const referencePreviews = useMemo<DoubaoReferenceImage[]>(
    () => buildReferencePreviewItems(referenceField),
    [referenceField],
  );
  const selectedReferenceCount = referencePreviews.length;

  const referenceFileTypes =
    referenceField?.fileTypes ??
    referenceField?.file_types ??
    referenceField?.fileTypesList;

  const [isUploadDialogOpen, setUploadDialogOpen] = useState(false);
  const handleReferenceChange = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: REFERENCE_FIELD,
  });

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

      return {
        ...field,
        template: templateField,
        options,
        value: templateField.value,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [template]);

  const openUploadDialog = () => {
    setUploadDialogOpen(true);
  };

  useEffect(() => {
    const listener = () => openUploadDialog();
    window.addEventListener("doubao-preview-upload", listener);
    return () => window.removeEventListener("doubao-preview-upload", listener);
  }, []);

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

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#6F768F]">
          <span>
            可上传参考图增强生成效果
            {selectedReferenceCount > 0 && ` · 已选 ${selectedReferenceCount}`}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-5 rounded-[26px] border border-[#EEF1F9] bg-[#F9FAFF] p-5">
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
                referenceImages={referencePreviews}
                onRequestUpload={openUploadDialog}
              />
            </div>
            {outputsSection && (
              <div
                className={cn(
                  "absolute left-full top-1/2 hidden translate-x-6 -translate-y-1/2 lg:block",
                )}
              >
                {outputsSection}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-[20px] border border-[#E6EAF7] bg-white p-4 text-sm text-[#3C4057] shadow-[0_18px_35px_rgba(15,23,42,0.07)]">
            <div
              className={cn(
                "rounded-[12px] border border-[#E8ECF6] bg-[#FDFEFE] p-3",
                "[&_.primary-input]:bg-transparent",
                "[&_.primary-input]:text-[#1C202D]",
                "[&_.primary-input]:text-sm",
                "[&_.primary-input]:placeholder:text-[#9CA3C0]",
                "[&_.text-muted-foreground]:text-[#8D92A8]",
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
        </div>
      </div>

      <div className="rounded-[20px] border border-[#ECEFF6] bg-white p-5 shadow-sm">
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

      <Dialog open={isUploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="w-[400px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>选择图片</DialogTitle>
            <DialogDescription>
              支持 JPG/PNG 格式，每张不超过 10MB。
            </DialogDescription>
          </DialogHeader>
          {referenceField && (
            <InputFileComponent
              value={referenceField.value}
              file_path={referenceField.file_path}
              handleOnNewValue={handleReferenceChange}
              disabled={false}
              fileTypes={referenceFileTypes}
              isList={referenceField.is_list ?? referenceField.list ?? true}
              tempFile={referenceField.temp_file ?? true}
              id={`${data.id}-reference-images`}
              variant="minimal"
              triggerLabel="从设备上传"
              triggerClassName="bg-[#F4F5F9] text-[#13141A]"
              onUploadComplete={() => setUploadDialogOpen(false)}
            />
          )}
          <DialogFooter>
            <p className="w-full text-center text-xs text-muted-foreground">
              可多选图片，帮助模型理解目标风格
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
