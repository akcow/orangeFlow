import { cloneDeep } from "lodash";
import { type ReactFlowState, useStore } from "@xyflow/react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import DoubaoQuickAddMenu from "./DoubaoQuickAddMenu";
import {
  DoubaoParameterButton,
  DOUBAO_CONFIG_TOOLTIP,
  DOUBAO_CONTROL_HINTS,
  type DoubaoControlConfig,
} from "./DoubaoParameterButton";
import type { DoubaoPreviewPanelActions } from "./DoubaoPreviewPanel";
import HandleRenderComponent from "./handleRenderComponent";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { scapeJSONParse, scapedJSONStringfy, getNodeId } from "@/utils/reactflowUtils";
import { cn } from "@/utils/utils";
import { BuildStatus } from "@/constants/enums";
import type { GenericNodeType, NodeDataType } from "@/types/flow";
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
  onPreviewActionsChange?: (actions: DoubaoPreviewPanelActions) => void;
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
  onPreviewActionsChange,
}: Props) {
  const DOWNSTREAM_NODE_OFFSET_X = 700;
  const IMAGE_UPSTREAM_NODE_OFFSET_X = 1000;
  const UPSTREAM_TEXT_NODE_OFFSET_X = 700;
  const TEXT_COMPONENT_NAME = "TextCreation";
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const onConnect = useFlowStore((state) => state.onConnect);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);

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

  // Text creator "+" handles: hidden when node is not selected; shown when cursor enters
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
      const clampedY = Math.max(
        -106,
        Math.min(106, (clientY - centerY) / zoom),
      );

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
            setVisiblePlusSide((current) =>
              current === side ? null : current,
            );
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

  // Image context is delivered through the existing left handle (draft_text).
  const hasImageContext = useMemo(() => {
    return edges.some((edge) => {
      if (edge.target !== data.id) return false;
      const targetHandle =
        edge.data?.targetHandle ??
        (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
      if (targetHandle?.fieldName !== DRAFT_FIELD) return false;

      const sourceHandle =
        edge.data?.sourceHandle ??
        (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
      if (sourceHandle?.name !== "image") return false;

      const sourceNode = nodes.find((node) => node.id === edge.source);
      return sourceNode?.data?.type === "DoubaoImageCreator";
    });
  }, [DRAFT_FIELD, data.id, edges, nodes]);
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
    const newVideoNode: GenericNodeType = {
      id: newVideoNodeId,
      type: "genericNode",
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
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newVideoNode]);

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

  const handleCreateImageDownstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const existingImageNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoImageCreator") return null;
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

    if (existingImageNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingImageNodeId,
        })),
      );
      return;
    }

    const imageComponentTemplate = templates["DoubaoImageCreator"];
    if (!imageComponentTemplate) return;

    const promptTemplateField = imageComponentTemplate.template?.prompt;
    if (!promptTemplateField) return;

    takeSnapshot();

    const newImageNodeId = getNodeId("DoubaoImageCreator");
    const seededImageComponent = cloneDeep(imageComponentTemplate);
    if (seededImageComponent.template?.prompt) {
      seededImageComponent.template.prompt.value = "根据文字描述生成图片";
    }

    const newImageNode: GenericNodeType = {
      id: newImageNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X,
        y: currentNode.position.y,
      },
      data: {
        node: seededImageComponent,
        showNode: !seededImageComponent.minimized,
        type: "DoubaoImageCreator",
        id: newImageNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newImageNode]);

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
      id: newImageNodeId,
      fieldName: "prompt",
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newImageNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("TextCreation - Create Image Node", {
      sourceNodeId: data.id,
      targetNodeId: newImageNodeId,
      targetComponent: "DoubaoImageCreator",
    });
  }, [
    DOWNSTREAM_NODE_OFFSET_X,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    templates,
  ]);

  const handleCreateTextUpstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const draftTemplateField = template[DRAFT_FIELD];
    if (!draftTemplateField) return;

    const existingUpstreamNodeId = edges
      .map((edge) => {
        if (edge.target !== data.id) return null;

        const sourceNode = nodes.find((node) => node.id === edge.source);
        if (sourceNode?.data?.type !== TEXT_COMPONENT_NAME) return null;
        if (sourceNode.position.x >= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== DRAFT_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== PREFERRED_OUTPUT) return null;

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
    const newTextNode: GenericNodeType = {
      id: newTextNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x - UPSTREAM_TEXT_NODE_OFFSET_X,
        y: currentNode.position.y,
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
      textTemplate.outputs?.find((output: any) => output.name === PREFERRED_OUTPUT) ??
      textTemplate.outputs?.find((output: any) => !output.hidden) ??
      textTemplate.outputs?.[0];

    const sourceHandle = {
      output_types: outputDefinition?.types?.length ? outputDefinition.types : ["Data"],
      id: newTextNodeId,
      dataType: TEXT_COMPONENT_NAME,
      name: outputDefinition?.name ?? PREFERRED_OUTPUT,
    };

    const targetHandle = {
      inputTypes: draftTemplateField.input_types,
      type: draftTemplateField.type,
      id: data.id,
      fieldName: DRAFT_FIELD,
      ...(draftTemplateField.proxy ? { proxy: draftTemplateField.proxy } : {}),
    };

    setTimeout(() => {
      onConnect({
        source: newTextNodeId,
        target: data.id,
        sourceHandle: scapedJSONStringfy(sourceHandle),
        targetHandle: scapedJSONStringfy(targetHandle),
      });
    }, 200);

    track("TextCreation - Create Text Upstream Node", {
      sourceNodeId: newTextNodeId,
      targetNodeId: data.id,
      sourceComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    DRAFT_FIELD,
    TEXT_COMPONENT_NAME,
    UPSTREAM_TEXT_NODE_OFFSET_X,
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

    const existingTextNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;

        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== TEXT_COMPONENT_NAME) return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== PROMPT_FIELD) return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== PREFERRED_OUTPUT) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingTextNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingTextNodeId,
        })),
      );
      return;
    }

    const textTemplate = templates[TEXT_COMPONENT_NAME];
    if (!textTemplate) return;

    const promptTemplateField = textTemplate.template?.[PROMPT_FIELD];
    if (!promptTemplateField) return;

    takeSnapshot();

    const newTextNodeId = getNodeId(TEXT_COMPONENT_NAME);
    const newTextNode: GenericNodeType = {
      id: newTextNodeId,
      type: "genericNode",
      position: {
        x: currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X,
        y: currentNode.position.y,
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
      id: newTextNodeId,
      fieldName: PROMPT_FIELD,
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newTextNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("TextCreation - Create Text Downstream Node", {
      sourceNodeId: data.id,
      targetNodeId: newTextNodeId,
      targetComponent: TEXT_COMPONENT_NAME,
    });
  }, [
    DOWNSTREAM_NODE_OFFSET_X,
    PROMPT_FIELD,
    TEXT_COMPONENT_NAME,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    templates,
  ]);

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
    const newAudioNode: GenericNodeType = {
      id: newAudioNodeId,
      type: "genericNode",
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
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newAudioNode]);

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
          // Keep a single selected node (avoid auto-group UI).
          selected: node.id === existingImageNodeId,
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
    const newImageNode: GenericNodeType = {
      id: newImageNodeId,
      type: "genericNode",
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
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newImageNode]);

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
      const options: Array<string | number> = Array.isArray(templateField.options)
        ? templateField.options
        : [];
      const disabledOptions =
        field.name === "model_name" && hasImageContext
          ? options.filter((opt) => !String(opt).startsWith("gemini-"))
          : undefined;
      const tooltipText =
        DOUBAO_CONTROL_HINTS[field.name] ?? DOUBAO_CONFIG_TOOLTIP;
      return {
        ...field,
        template: templateField,
        options,
        value: templateField.value,
        tooltip: tooltipText,
        disabledOptions,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [hasImageContext, template]);

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
              // Keep the preview frame "single-layer": the outer container provides the frame.
              "h-full min-h-0 resize-none rounded-2xl border border-transparent",
              "bg-transparent p-0 text-lg text-foreground outline-none ring-0 focus-visible:ring-0",
              "dark:text-slate-100",
            )}
            value={previewText}
            onChange={(e) => handlePreviewInput(e.target.value)}
            placeholder="在此直接编写或查看生成内容"
          />
        </div>
      );
    }
    return (
      <div
        className={cn(
          // Keep the preview frame "single-layer": avoid extra inner frames.
          "relative flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground",
          "dark:text-slate-200",
        )}
      >
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
                    return;
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
          onSelect: handleCreateImageUpstreamNode,
        },
      ];
    }

    return [
      {
        key: "text-downstream",
        label: "文本创作",
        icon: "ToyBrick",
        onSelect: handleCreateTextDownstreamNode,
      },
      {
        key: "video-downstream",
        label: "视频创作",
        icon: "Clapperboard",
        onSelect: handleCreateVideoNode,
      },
      {
        key: "image-downstream",
        label: "图片创作",
        icon: "Image",
        onSelect: handleCreateImageDownstreamNode,
      },
      {
        key: "audio-downstream",
        label: "音频合成",
        icon: "Music",
        onSelect: handleCreateAudioNode,
      },
    ];
  }, [
    handleCreateAudioNode,
    handleCreateImageDownstreamNode,
    handleCreateImageUpstreamNode,
    handleCreateTextDownstreamNode,
    handleCreateTextUpstreamNode,
    handleCreateVideoNode,
    quickAddMenu,
  ]);

  const openPreview = useCallback(() => setPreviewModalOpen(true), []);
  const noopDownload = useCallback(() => undefined, []);
  useEffect(() => {
    onPreviewActionsChange?.({
      openPreview,
      download: noopDownload,
      canDownload: false,
    });
  }, [noopDownload, onPreviewActionsChange, openPreview]);

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
        {draftHandleMeta && (
          <div className="absolute left-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:block">
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

        <div ref={previewWrapRef} className="relative flex-1">
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

          <div
            className={cn(
              "flex aspect-square w-full flex-col rounded-[16px] border border-[#dce7ff] bg-[#f3f7ff] p-4 text-sm text-foreground shadow-sm",
              "transition-all duration-300 ease-in-out", // Smooth transition
              selected
                ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.15)] scale-[1.01]"
                : "border-[#dce7ff] hover:border-indigo-200 hover:shadow-md",
              "dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-100",
              selected && "dark:border-indigo-500/50 dark:ring-indigo-500/30 dark:shadow-[0_0_20px_rgba(99,102,241,0.2)]"
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
            <div className="relative flex-1">{renderPreviewContent()}</div>
          </div>
        </div>

        {previewOutputHandles.length > 0 && (
          <div className="absolute right-0 top-1/2 z-[1200] hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-start">
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
              "dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-[0_25px_50px_rgba(0,0,0,0.55)]",
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
                  isToolMode
                  showNode
                  shownOutputs={[]}
                  showHiddenOutputs={false}
                  filterFields={[PROMPT_FIELD]}
                  filterMode="include"
                  fieldOverrides={{
                    [PROMPT_FIELD]: {
                      placeholder:
                        "描述你想要生成的内容，并在下方调整生成参数。（按下 Enter 生成，Shift+Enter 换行）",
                      inputTypes: ["Message"],
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
