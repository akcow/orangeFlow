import { cloneDeep } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import RenderInputParameters from "./RenderInputParameters";
import {
  DoubaoParameterButton,
  DOUBAO_CONFIG_TOOLTIP,
  DOUBAO_CONTROL_HINTS,
  type DoubaoControlConfig,
} from "./DoubaoParameterButton";
import HandleRenderComponent from "./handleRenderComponent";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { scapeJSONParse, scapedJSONStringfy, getNodeId } from "@/utils/reactflowUtils";
import { cn, getNodeRenderType } from "@/utils/utils";
import { BuildStatus } from "@/constants/enums";
import type { AllNodeType, NodeDataType } from "@/types/flow";
import type { TypesStoreType } from "@/types/zustand/types";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { useTypesStore } from "@/stores/typesStore";
import { track } from "@/customization/utils/analytics";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import { getNodeInputColors } from "@/CustomNodes/helpers/get-node-input-colors";
import { getNodeInputColorsName } from "@/CustomNodes/helpers/get-node-input-colors-name";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import { useTextCreationPreview } from "../../hooks/use-text-creation-preview";
import OutputModal from "./outputModal";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[230px]" },
] as const;

const PROMPT_FIELD = "prompt";
const DRAFT_FIELD = "draft_text";
const PREFERRED_OUTPUT = "text_output";
const SENSITIVE_FIELDS: string[] = ["api_key"];

type Props = {
  data: NodeDataType;
  types: TypesStoreType["types"];
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
};

const SUGGESTIONS = [
  { icon: "PencilLine", label: "自己编写内容" },
  { icon: "Clapperboard", label: "文字生成视频" },
  { icon: "Sparkles", label: "图片反推提示词" },
  { icon: "Music", label: "文字生成音乐" },
];

export default function TextCreationLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
}: Props) {
  const DOWNSTREAM_NODE_OFFSET_X = 700;
  const IMAGE_UPSTREAM_NODE_OFFSET_X = 1000;
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);

  const template = data.node?.template ?? {};
  const showExpanded = Boolean(selected);
  const customFields = useMemo(
    () => new Set<string>([
      PROMPT_FIELD,
      DRAFT_FIELD,
      ...CONTROL_FIELDS.map((item) => item.name),
      ...SENSITIVE_FIELDS,
    ]),
    [],
  );
  const hasAdditionalFields = Object.keys(template).some(
    (field) => !customFields.has(field),
  );

  const promptField = template[PROMPT_FIELD];
  const draftField = template[DRAFT_FIELD];
  const draftHandleMeta = useMemo(() => {
    if (!draftField) return null;
    const colors = getNodeInputColors(
      draftField.input_types,
      draftField.type,
      types,
    );
    const colorName = getNodeInputColorsName(
      draftField.input_types,
      draftField.type,
      types,
    );
    return {
      id: {
        inputTypes: draftField.input_types,
        type: draftField.type,
        id: data.id,
        fieldName: DRAFT_FIELD,
      },
      colors,
      colorName,
      tooltip:
        draftField.input_types?.join(", ") ??
        draftField.type ??
        "文本输入",
      title: draftField.display_name ?? "文本输入",
      proxy: draftField.proxy,
    };
  }, [draftField, types, data.id]);
  const { handleOnNewValue: handleDraftChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: DRAFT_FIELD,
  });
  const { handleOnNewValue: handlePromptChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: PROMPT_FIELD,
  });

  const [previewText, setPreviewText] = useState<string>(
    draftField?.value ?? "",
  );
  const [isEditing, setIsEditing] = useState<boolean>(
    Boolean((draftField?.value ?? "").trim()),
  );
  const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
  const [isLogsOpen, setLogsOpen] = useState(false);
  const [isRunHovering, setRunHovering] = useState(false);

  const { current, history, isBuilding, lastUpdated } = useTextCreationPreview(
    data.id,
    PREFERRED_OUTPUT,
  );
  const lastAppliedPreviewId = useRef<string | null>(null);

  useEffect(() => {
    setPreviewText(draftField?.value ?? "");
  }, [draftField?.value]);

  useEffect(() => {
    if (!current?.text || current.id === lastAppliedPreviewId.current) return;

    setPreviewText(current.text);
    setIsEditing(true);
    if (
      draftField?.value !== undefined &&
      current.text !== draftField.value
    ) {
      handleDraftChange({ value: current.text });
    }
    lastAppliedPreviewId.current = current.id;
  }, [current, draftField?.value, handleDraftChange]);

  useEffect(() => {
    setIsEditing(Boolean((draftField?.value ?? "").trim()));
  }, [draftField?.value]);

  const buildFlow = useFlowStore((state) => state.buildFlow);
  const isGlobalBuilding = useFlowStore((state) => state.isBuilding);
  const stopBuilding = useFlowStore((state) => state.stopBuilding);
  const clearFlowPoolForNodes = useFlowStore(
    (state) => state.clearFlowPoolForNodes,
  );
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const eventDeliveryConfig = useUtilityStore((state) => state.eventDelivery);
  const typeData = useTypesStore((state) => state.data);

  const busy = buildStatus === BuildStatus.BUILDING || isGlobalBuilding;
  const hasAnyConnection = useMemo(
    () => edges.some((edge) => edge.source === data.id || edge.target === data.id),
    [edges, data.id],
  );
  const isPromptEmpty = useMemo(() => {
    const value = promptField?.value;
    if (typeof value === "string") return value.trim().length === 0;
    return value === undefined || value === null;
  }, [promptField?.value]);
  const disableRun = !hasAnyConnection && isPromptEmpty;

  const handleCreateVideoNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const existingVideoNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoVideoGenerator") return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== "prompt") return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== PREFERRED_OUTPUT) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingVideoNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingVideoNodeId,
        })),
      );
      return;
    }

    const videoComponentTemplate = templates["DoubaoVideoGenerator"];
    if (!videoComponentTemplate) return;

    const promptTemplateField = videoComponentTemplate.template?.prompt;
    if (!promptTemplateField) return;

    takeSnapshot();

    const newVideoNodeId = getNodeId("DoubaoVideoGenerator");
    const seededVideoComponent = cloneDeep(videoComponentTemplate);
    if (seededVideoComponent.template?.prompt) {
      seededVideoComponent.template.prompt.value = "根据文字描述生成视频";
    }
    const newVideoNode: AllNodeType = {
      id: newVideoNodeId,
      type: getNodeRenderType("genericnode"),
      position: {
        x: currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X,
        y: currentNode.position.y,
      },
      data: {
        node: seededVideoComponent,
        showNode: !seededVideoComponent.minimized,
        type: "DoubaoVideoGenerator",
        id: newVideoNodeId,
      },
      selected: true,
    };

    setNodes((currentNodes) =>
      currentNodes
        .map((node) => ({ ...node, selected: false }))
        .concat(newVideoNode),
    );

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === PREFERRED_OUTPUT) ??
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
      name: outputDefinition?.name ?? PREFERRED_OUTPUT,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: promptTemplateField.input_types,
      type: promptTemplateField.type,
      id: newVideoNodeId,
      fieldName: "prompt",
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newVideoNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("TextCreation - Create Video Node", {
      sourceNodeId: data.id,
      targetNodeId: newVideoNodeId,
      targetComponent: "DoubaoVideoGenerator",
    });
  }, [data.id, data.node?.outputs, data.type, edges, nodes, onConnect, setNodes, takeSnapshot, templates]);

  const handleCreateAudioNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const existingAudioNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoTTS") return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== "text") return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== PREFERRED_OUTPUT) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingAudioNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingAudioNodeId,
        })),
      );
      return;
    }

    const audioComponentTemplate = templates["DoubaoTTS"];
    if (!audioComponentTemplate) return;

    const audioTextField = audioComponentTemplate.template?.text;
    if (!audioTextField) return;

    takeSnapshot();

    const newAudioNodeId = getNodeId("DoubaoTTS");
    const newAudioNode: AllNodeType = {
      id: newAudioNodeId,
      type: getNodeRenderType("genericnode"),
      position: {
        x: currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X,
        y: currentNode.position.y,
      },
      data: {
        node: cloneDeep(audioComponentTemplate),
        showNode: !audioComponentTemplate.minimized,
        type: "DoubaoTTS",
        id: newAudioNodeId,
      },
      selected: true,
    };

    setNodes((currentNodes) =>
      currentNodes
        .map((node) => ({ ...node, selected: false }))
        .concat(newAudioNode),
    );

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === PREFERRED_OUTPUT) ??
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
      name: outputDefinition?.name ?? PREFERRED_OUTPUT,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: audioTextField.input_types,
      type: audioTextField.type,
      id: newAudioNodeId,
      fieldName: "text",
      ...(audioTextField.proxy ? { proxy: audioTextField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newAudioNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("TextCreation - Create Audio Node", {
      sourceNodeId: data.id,
      targetNodeId: newAudioNodeId,
      targetComponent: "DoubaoTTS",
    });
  }, [data.id, data.node?.outputs, data.type, edges, nodes, onConnect, setNodes, takeSnapshot, templates]);

  const handleCreateImageUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const draftTemplateField = template[DRAFT_FIELD];
    if (!draftTemplateField) return;

    const ensureImageDraftConnection = (imageNodeId: string) => {
      const latestEdges = useFlowStore.getState().edges;
      const hasEdge = latestEdges.some((edge) => {
        if (edge.source !== imageNodeId || edge.target !== data.id) return false;
        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== DRAFT_FIELD) return false;
        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        return sourceHandle?.name === "image";
      });

      if (hasEdge) return;

      const sourceHandle = {
        output_types: ["Data"],
        id: imageNodeId,
        dataType: "DoubaoImageCreator",
        name: "image",
      };

      const targetHandle = {
        inputTypes: draftTemplateField.input_types,
        type: draftTemplateField.type,
        id: data.id,
        fieldName: DRAFT_FIELD,
        ...(draftTemplateField.proxy ? { proxy: draftTemplateField.proxy } : {}),
      };

      onConnect({
        source: imageNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    };

    const existingImageNodeId = edges
      .map((edge) => {
        if (edge.target !== data.id) return null;

        const sourceNode = nodes.find((node) => node.id === edge.source);
        if (sourceNode?.data?.type !== "DoubaoImageCreator") return null;
        if (sourceNode.position.x >= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== DRAFT_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== "image") return null;

        return sourceNode.id;
      })
      .find(Boolean) as string | undefined;

    const applyReversePromptInstruction = () => {
      handlePromptChange({ value: "根据图片生成提示词" }, { skipSnapshot: true });
    };

    if (existingImageNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingImageNodeId || node.id === data.id,
        })),
      );
      ensureImageDraftConnection(existingImageNodeId);
      queueMicrotask(() => ensureImageDraftConnection(existingImageNodeId));
      applyReversePromptInstruction();
      return;
    }

    const imageComponentTemplate = templates["DoubaoImageCreator"];
    if (!imageComponentTemplate) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const newImageNode: AllNodeType = {
      id: newImageNodeId,
      type: getNodeRenderType("genericnode"),
      position: {
        x: currentNode.position.x - IMAGE_UPSTREAM_NODE_OFFSET_X,
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

    setNodes((currentNodes) =>
      currentNodes
        .map((node) => ({ ...node, selected: node.id === data.id }))
        .concat(newImageNode),
    );

    const sourceHandle = {
      output_types: ["Data"],
      id: newImageNodeId,
      dataType: "DoubaoImageCreator",
      name: "image",
    };

    const targetHandle = {
      inputTypes: draftTemplateField.input_types,
      type: draftTemplateField.type,
      id: data.id,
      fieldName: DRAFT_FIELD,
      ...(draftTemplateField.proxy ? { proxy: draftTemplateField.proxy } : {}),
    };

    onConnect({
      source: newImageNodeId,
      target: data.id,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });
    queueMicrotask(() => ensureImageDraftConnection(newImageNodeId));

    applyReversePromptInstruction();

    track("TextCreation - Create Image Upstream Node", {
      sourceNodeId: newImageNodeId,
      targetNodeId: data.id,
      sourceComponent: "DoubaoImageCreator",
    });
  }, [
    data.id,
    IMAGE_UPSTREAM_NODE_OFFSET_X,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    templates,
    template,
    handlePromptChange,
  ]);

  const handleRun = () => {
    if (buildStatus === BuildStatus.BUILDING && isRunHovering) {
      stopBuilding();
      return;
    }
    if (disableRun) return;
    if (busy) return;
    buildFlow({
      stopNodeId: data.id,
      eventDelivery: eventDeliveryConfig,
    });
    track("Flow Build - Clicked", { stopNodeId: data.id, component: "TextCreation" });
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
      const options: Array<string | number> =
        templateField.options ?? templateField.list ?? [];
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
            "文本结果",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data.id, data.node?.outputs, data.type, types]);

  const handlePreviewInput = (value: string) => {
    setPreviewText(value);
    handleDraftChange({ value });
    setIsEditing(true);
  };

  const handleApplyHistory = (text: string) => {
    handlePreviewInput(text);
  };

  const handleReset = () => {
    clearFlowPoolForNodes([data.id]);
    handlePreviewInput("");
    setIsEditing(false);
  };

  const renderPreviewContent = () => {
    if (isEditing || previewText.trim()) {
      return (
        <div className="relative h-full">
          <Textarea
            className={cn(
              "h-full min-h-0 resize-none rounded-2xl border border-white/60",
              "bg-white/90 p-4 text-sm text-foreground shadow-inner outline-none ring-0 focus-visible:ring-0",
              "dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-100",
            )}
            value={previewText}
            onChange={(e) => handlePreviewInput(e.target.value)}
            placeholder="在此直接编写或查看生成内容"
          />
          <button
            type="button"
            aria-label="放大预览"
            onClick={() => setPreviewModalOpen(true)}
            className={cn(
              "absolute bottom-3 right-3 flex h-8 items-center gap-2 rounded-full border border-[#E3E8F5]",
              "bg-white/95 px-3 text-xs font-medium text-[#3C4258] shadow transition hover:border-[#C7D2F4] hover:bg-white",
            )}
          >
            <ForwardedIconComponent name="Maximize2" className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-3">
            <OutputModal
              open={isLogsOpen}
              setOpen={setLogsOpen}
              disabled={false}
              nodeId={data.id}
              outputName={PREFERRED_OUTPUT}
            >
              <button
                type="button"
                className={cn(
                  "flex h-8 items-center gap-2 rounded-full border border-[#E3E8F5]",
                  "bg-white/95 px-3 text-xs font-medium text-[#3C4258] shadow transition hover:border-[#C7D2F4] hover:bg-white",
                )}
              >
                <ForwardedIconComponent name="FileText" className="h-4 w-4" />
                Logs
              </button>
            </OutputModal>
          </div>
        </div>
      );
    }
    return (
      <div
        className={cn(
          "relative flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed",
          "border-slate-200/70 bg-white/80 p-6 text-center text-sm text-muted-foreground",
          "dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200",
        )}
      >
        <div className="absolute bottom-3 left-3">
          <OutputModal
            open={isLogsOpen}
            setOpen={setLogsOpen}
            disabled={false}
            nodeId={data.id}
            outputName={PREFERRED_OUTPUT}
          >
            <button
              type="button"
              className={cn(
                "flex h-8 items-center gap-2 rounded-full border border-[#E3E8F5]",
                "bg-white/95 px-3 text-xs font-medium text-[#3C4258] shadow transition hover:border-[#C7D2F4] hover:bg-white",
                "dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-100",
              )}
            >
              <ForwardedIconComponent name="FileText" className="h-4 w-4" />
              Logs
            </button>
          </OutputModal>
        </div>
        <div className="w-full space-y-2 text-left">
          <div className="text-xs font-semibold text-foreground dark:text-white">
            尝试：
          </div>
          <div className="grid w-full gap-2 text-xs sm:grid-cols-2">
            {SUGGESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (item.label === "自己编写内容") {
                    setIsEditing(true);
                    return;
                  }
                  if (item.label === "文字生成视频") {
                    handleCreateVideoNode();
                    return;
                  }
                  if (item.label === "文字生成音乐") {
                    handleCreateAudioNode();
                    return;
                  }
                  if (item.label === "图片反推提示词") {
                    handleCreateImageUpstreamNode();
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80",
                  "px-3 py-2 text-foreground shadow-sm transition hover:border-slate-300 hover:bg-white",
                  "dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-100",
                )}
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
      </div>
    );
  };

  return (
    <div className="space-y-4 px-4 pb-4">
      <div
        className={cn(
          "rounded-[24px] border border-[#E6E9F4] bg-white p-5",
          "shadow-[0_20px_40px_rgba(15,23,42,0.08)]",
          "dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-[0_20px_32px_rgba(0,0,0,0.55)]",
        )}
      >
        <div className="mt-5 flex flex-col gap-5">
          <div className="relative flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <div className="relative">
                <div className="aspect-square w-full">
                  <div
                    className={cn(
                      "flex h-full flex-col rounded-[16px] border border-[#dce7ff] bg-[#f3f7ff] p-4 text-sm text-foreground shadow-sm",
                      "dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-100",
                    )}
                  >
                    {isBuilding && (
                      <div className="mb-3 flex items-center justify-end text-xs text-muted-foreground">
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded-full bg-white/90 px-3 py-1",
                            "text-[11px] font-medium text-slate-600 shadow",
                            "dark:bg-slate-800/70 dark:text-slate-100",
                          )}
                        >
                          <ForwardedIconComponent
                            name="Loader2"
                            className="h-3 w-3 animate-spin"
                          />
                          <span>生成中…</span>
                        </div>
                      </div>
                    )}
                    <div className="relative flex-1">
                      {draftHandleMeta && (
                        <div className="absolute -left-12 top-1/2 hidden -translate-y-1/2 lg:block">
                          <HandleRenderComponent
                            left
                            tooltipTitle={draftHandleMeta.tooltip}
                            id={draftHandleMeta.id}
                            title={draftHandleMeta.title}
                            nodeId={data.id}
                            myData={typeData}
                            colors={draftHandleMeta.colors}
                            colorName={draftHandleMeta.colorName}
                            setFilterEdge={setFilterEdge}
                            showNode
                            testIdComplement={`${data.type?.toLowerCase()}-preview-handle`}
                            proxy={draftHandleMeta.proxy}
                          />
                        </div>
                      )}
                      <div className="h-full">{renderPreviewContent()}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {previewOutputHandles.length > 0 && (
              <div className="absolute left-full top-1/2 hidden -translate-y-1/2 pl-6 lg:flex lg:flex-col lg:items-start">
                {previewOutputHandles.map((handle, index) => (
                  <div
                    key={`${handle.id.name ?? "text"}-${index}`}
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
                      isToolMode
                      showNode
                      shownOutputs={[]}
                      showHiddenOutputs={false}
                      filterFields={[PROMPT_FIELD]}
                      filterMode="include"
                      fieldOverrides={{
                        [PROMPT_FIELD]: {
                          placeholder:
                            "描述你想要生成的内容，并在下方调整生成参数。（按下Enter 生成，Shift+Enter 换行）",
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
            filterFields={[...customFields]}
            filterMode="exclude"
          />
        </div>
      )}

      <Dialog open={isPreviewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="w-[92vw] max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <DialogTitle className="text-base">放大编辑</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-xs text-muted-foreground"
                onClick={handleReset}
              >
                <ForwardedIconComponent name="RotateCcw" className="h-4 w-4" />
                重置
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={previewText}
              onChange={(e) => handlePreviewInput(e.target.value)}
              className={cn(
                "min-h-[40vh] resize-none rounded-2xl border border-slate-200 bg-white/95 p-4",
                "text-sm shadow-inner outline-none ring-0 focus-visible:ring-0",
                "dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100",
              )}
              placeholder="在此输入或编辑生成的文本内容"
            />
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-foreground dark:text-slate-100">
                历史记录
              </div>
              <div className="text-xs text-muted-foreground">
                {lastUpdated ? `最近更新：${lastUpdated}` : "暂无生成记录"}
              </div>
            </div>
            <div className="max-h-[50vh] space-y-3 overflow-auto">
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无生成记录。</p>
              )}
              {history.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm",
                    "dark:border-white/10 dark:bg-slate-900/60",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.generatedAt && (
                      <span className="flex items-center gap-1">
                        <ForwardedIconComponent name="Clock" className="h-4 w-4" />
                        {item.generatedAt}
                      </span>
                    )}
                    {item.model && (
                      <span className="flex items-center gap-1">
                        <ForwardedIconComponent name="Sparkles" className="h-4 w-4" />
                        {item.model}
                      </span>
                    )}
                  </div>
                  <pre
                    className={cn(
                      "max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3",
                      "text-sm leading-relaxed text-foreground",
                      "dark:bg-slate-800/70 dark:text-slate-100",
                    )}
                  >
                    {item.text}
                  </pre>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-2"
                      onClick={() => handleApplyHistory(item.text)}
                    >
                      <ForwardedIconComponent name="Copy" className="h-4 w-4" />
                      应用到预览
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
