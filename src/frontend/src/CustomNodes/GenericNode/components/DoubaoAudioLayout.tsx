import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ReactFlowState, useStore } from "@xyflow/react";
import DoubaoPreviewPanel from "./DoubaoPreviewPanel";
import RenderInputParameters from "./RenderInputParameters";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { BuildStatus } from "@/constants/enums";
import type { GenericNodeType, NodeDataType } from "@/types/flow";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { findLastNode, getNodeId, scapeJSONParse, scapedJSONStringfy } from "@/utils/reactflowUtils";
import { track } from "@/customization/utils/analytics";
import { cn } from "@/utils/utils";
import { useTypesStore } from "@/stores/typesStore";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import { getNodeInputColors } from "@/CustomNodes/helpers/get-node-input-colors";
import { getNodeInputColorsName } from "@/CustomNodes/helpers/get-node-input-colors-name";
import { computeAlignedNodeTopY } from "@/CustomNodes/helpers/previewCenterAlignment";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  DOUBAO_CONTROL_HINTS,
  DOUBAO_CONFIG_TOOLTIP,
} from "./DoubaoParameterButton";
import type { DoubaoPreviewPanelActions } from "./DoubaoPreviewPanel";
import DoubaoQuickAddMenu from "./DoubaoQuickAddMenu";
import HandleRenderComponent from "./handleRenderComponent";
import cloneDeep from "lodash/cloneDeep";

const DOWNSTREAM_NODE_OFFSET_X = 950;
const UPSTREAM_NODE_OFFSET_X = 950;
const AUDIO_OUTPUT_NAME = "audio";
const AUDIO_INPUT_FIELD = "audio_input";
const TEXT_COMPONENT_NAME = "TextCreation";
const TEXT_OUTPUT_NAME = "text_output";

const CONTROL_FIELDS = [
  { name: "voice_type", icon: "Mic", widthClass: "basis-[240px] grow" },
] as const;

const PROMPT_FIELD = "text";
type Props = {
  data: NodeDataType;
  types: any;
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
  onPreviewActionsChange?: (actions: DoubaoPreviewPanelActions) => void;
};

export default function DoubaoAudioLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
  onPreviewActionsChange,
}: Props) {
  const template = data.node?.template ?? {};
  // Avoid resizing the node while the user is box-selecting; resizing can cause the
  // selection set to oscillate and look like "twitching".
  const userSelectionActive = useStore((s) => s.userSelectionActive);
  const showExpanded = Boolean(selected) && !userSelectionActive;

  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  // Keep UI pixel size fixed while zoom >= 57%. Below that, allow it to shrink with the canvas.
  const inverseZoom = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    return 1 / Math.max(zoom, MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

  const [quickAddMenu, setQuickAddMenu] = useState<{
    x: number;
    y: number;
    kind: "input" | "output";
  } | null>(null);
  const lockedPlusSide = quickAddMenu?.kind
    ? (quickAddMenu.kind === "input" ? "left" : "right")
    : null;

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

      const zoom = canvasZoom || 1;
      const edgeX = side === "left" ? rect.left : rect.right;
      const centerY = rect.top + rect.height / 2;

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

      clearPlusTimers();
      leaveGraceTimerRef.current = window.setTimeout(() => {
        const lastPointer = lastPointerRef.current;
        if (
          lastPointer &&
          isPointerInCaptureZone(side, lastPointer.x, lastPointer.y, 6)
        ) {
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
    [DEFAULT_PLUS_OFFSET, clearPlusTimers, isPointerInCaptureZone, selected],
  );

  useEffect(() => {
    clearPlusTimers();
    setActivePlusSide(null);
    setVisiblePlusSide(null);
    setPlusOffsetBySide(DEFAULT_PLUS_OFFSET);
  }, [DEFAULT_PLUS_OFFSET, clearPlusTimers, selected]);

  useEffect(() => () => clearPlusTimers(), [clearPlusTimers]);

  const [isRunHovering, setRunHovering] = useState(false);
  const buildFlow = useFlowStore((state) => state.buildFlow);
  const isBuilding = useFlowStore((state) => state.isBuilding);
  const stopBuilding = useFlowStore((state) => state.stopBuilding);
  const clearFlowPoolForNodes = useFlowStore(
    (state) => state.clearFlowPoolForNodes,
  );
  const eventDelivery = useUtilityStore((state) => state.eventDelivery);
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const typeData = useTypesStore((state) => state.data);
  const edges = useFlowStore((state) => state.edges);
  const nodes = useFlowStore((state) => state.nodes);
  const setNodes = useFlowStore((state) => state.setNodes);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);
  const hasAnyConnection = useMemo(
    () => edges.some((edge) => edge.source === data.id || edge.target === data.id),
    [edges, data.id],
  );
  const isPromptEmpty = useMemo(() => {
    const value = template[PROMPT_FIELD]?.value;
    if (typeof value === "string") return value.trim().length === 0;
    return value === undefined || value === null;
  }, [template]);
  const disableRun = !hasAnyConnection && isPromptEmpty;

  const nodeIdForRun = data.node?.flow?.data
    ? (findLastNode(data.node.flow.data!)?.id ?? data.id)
    : data.id;

  const isBusy = buildStatus === BuildStatus.BUILDING || isBuilding;

  const handleCreateTextUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const promptTemplateField = template[PROMPT_FIELD];
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
        if (targetHandle?.fieldName !== PROMPT_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== TEXT_OUTPUT_NAME) return null;

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

    // Force single selection to avoid triggering the selection "group" menu.
    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: node.id === data.id })),
      newTextNode,
    ]);

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
      fieldName: PROMPT_FIELD,
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    setTimeout(() => {
      onConnect({
        source: newTextNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    }, 200);

    track("DoubaoTTS - Create Text Upstream Node", {
      sourceNodeId: newTextNodeId,
      targetNodeId: data.id,
      sourceComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    data.id,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    template,
    templates,
  ]);

  const handleCreateDownstreamVideoNode = useCallback(() => {
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
        if (targetHandle?.fieldName !== AUDIO_INPUT_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== AUDIO_OUTPUT_NAME) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingVideoNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          // Keep a single selected node (avoid auto-group UI).
          selected: node.id === existingVideoNodeId,
        })),
      );
      return;
    }

    const videoComponentTemplate = templates["DoubaoVideoGenerator"];
    if (!videoComponentTemplate) return;

    const audioInputField = videoComponentTemplate.template?.[AUDIO_INPUT_FIELD];
    if (!audioInputField) return;

    takeSnapshot();

    const newVideoNodeId = getNodeId("DoubaoVideoGenerator");
    const newNodeX = currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X;
    const newNodeY = computeAlignedNodeTopY({
      anchorNodeId: data.id,
      anchorNodeType: data.type,
      targetNodeType: "DoubaoVideoGenerator",
      targetX: newNodeX,
      fallbackTopY: currentNode.position.y,
      stepY: 160,
      avoidOverlap: true,
    });
    const seededVideoComponent = cloneDeep(videoComponentTemplate);
    if (seededVideoComponent.template?.model_name) {
      seededVideoComponent.template.model_name.value = "wan2.6";
    }
    if (seededVideoComponent.template?.prompt) {
      seededVideoComponent.template.prompt.value =
        "根据上传的音频生成一段具有电影感的视频，通过动态画面、光影与氛围呈现节奏、音色与情绪。";
    }
    if (seededVideoComponent.template?.[AUDIO_INPUT_FIELD]) {
      seededVideoComponent.template[AUDIO_INPUT_FIELD].show = true;
    }

    const newVideoNode: GenericNodeType = {
      id: newVideoNodeId,
      type: "genericNode",
      position: {
        x: newNodeX,
        y: newNodeY,
      },
      data: {
        node: seededVideoComponent,
        showNode: !seededVideoComponent.minimized,
        type: "DoubaoVideoGenerator",
        id: newVideoNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newVideoNode]);

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === AUDIO_OUTPUT_NAME) ??
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
      name: outputDefinition?.name ?? AUDIO_OUTPUT_NAME,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: audioInputField.input_types,
      type: audioInputField.type,
      id: newVideoNodeId,
      fieldName: AUDIO_INPUT_FIELD,
      ...(audioInputField.proxy ? { proxy: audioInputField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newVideoNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("DoubaoTTS - Create Video Node", {
      sourceNodeId: data.id,
      targetNodeId: newVideoNodeId,
      targetComponent: "DoubaoVideoGenerator",
    });
  }, [data.id, data.node?.outputs, data.type, edges, nodes, onConnect, setNodes, takeSnapshot, templates]);

  const handlePreviewSuggestion = useCallback(
    (label: string) => {
      if (label === "音频转视频") {
        handleCreateDownstreamVideoNode();
      }
    },
    [handleCreateDownstreamVideoNode],
  );

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
      eventDelivery,
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

      const options: Array<string | number> = Array.isArray(templateField.options)
        ? templateField.options
        : [];

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
            output.selected ?? output.types?.[0] ?? output.display_name ?? "音频输出",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data.id, data.node?.outputs, data.type, types]);

  const promptField = template[PROMPT_FIELD];
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
        fieldName: PROMPT_FIELD,
      },
      colors,
      colorName,
      tooltip:
        promptField.display_name ??
        promptField.title ??
        "文本输入",
      title: promptField.display_name ?? "文本输入",
      proxy: promptField.proxy,
    };
  }, [promptField, types, data.id]);

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
      ];
    }

    return [
      {
        key: "video-downstream",
        label: "视频创作",
        icon: "Clapperboard",
        onSelect: handleCreateDownstreamVideoNode,
      },
    ];
  }, [handleCreateDownstreamVideoNode, handleCreateTextUpstreamNode, quickAddMenu]);

  return (
    <div className="relative flex flex-col gap-4 px-4 pb-4 transition-all duration-300 ease-in-out">
      {quickAddMenu && (
        <DoubaoQuickAddMenu
          open={Boolean(quickAddMenu)}
          position={{ x: quickAddMenu.x, y: quickAddMenu.y }}
          title={quickAddTitle}
          items={quickAddItems}
          onOpenChange={(open) => {
            if (!open) {
              setQuickAddMenu(null);
              setActivePlusSide(null);
            }
          }}
        />
      )}

      {/* Preview */}
      <div className="relative flex flex-col gap-4 lg:flex-row">
        {promptHandleMeta && (
          <div className="absolute left-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:block">
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
              testIdComplement={`${data.type?.toLowerCase()}-prompt-input`}
              proxy={promptHandleMeta.proxy}
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
              visualOffset={{
                x: plusOffsetBySide.left.x,
                y: plusOffsetBySide.left.y,
              }}
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
            appearance="audioCreator"
            onSuggestionClick={handlePreviewSuggestion}
            onActionsChange={onPreviewActionsChange}
          />
        </div>

        {previewOutputHandles.length > 0 && (
          <div className="absolute right-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-start">
            {previewOutputHandles.map((handle, index) => (
              <div
                key={`${handle.id.name ?? "audio"}-${index}`}
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

      {/* Prompt/config container (floating overlay; must not change node height) */}
      {showExpanded && (
        <div className="nodrag pointer-events-auto absolute left-0 right-0 top-full z-[1600]">
          <div
            className={cn(
              "mt-4 rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)]",
              "transition-colors transition-shadow duration-200 ease-out dark:border-white/20 dark:bg-slate-700/50 dark:backdrop-blur-2xl dark:shadow-[0_25px_50px_rgba(0,0,0,0.30)]",
              // Cancel ReactFlow viewport zoom (keep fixed pixel size while zooming canvas).
              "transform-gpu origin-top scale-[var(--inv-zoom)]",
            )}
            style={{ ["--inv-zoom" as any]: inverseZoom } as CSSProperties}
          >
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
                  filterFields={[PROMPT_FIELD]}
                  filterMode="include"
                  fieldOverrides={{
                    [PROMPT_FIELD]: {
                      placeholder: "描述你想要的语音内容，按需使用换行。",
                    },
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {controlConfigs.map((config) => (
                  <DoubaoParameterButton
                    key={config.name}
                    data={data}
                    config={config}
                  />
                ))}

                <button
                  type="button"
                  disabled={disableRun}
                  className={cn(
                    "ml-auto flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_12px_24px_rgba(46,123,255,0.35)] transition",
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
      )}
    </div>
  );
}
