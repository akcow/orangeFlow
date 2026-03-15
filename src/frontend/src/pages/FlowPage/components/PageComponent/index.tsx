import {
  type Connection,
  type Edge,
  type NodeChange,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  ReactFlow,
  reconnectEdge,
  SelectionMode,
  type SelectionDragHandler,
} from "@xyflow/react";
import _, { cloneDeep } from "lodash";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { useShallow } from "zustand/react/shallow";
import { DefaultEdge } from "@/CustomEdges";
import GroupContainerNode from "@/CustomNodes/GroupContainerNode";
import NoteNode from "@/CustomNodes/NoteNode";
import FlowToolbar from "@/components/core/flowToolbarComponent";
import {
  COLOR_OPTIONS,
  NOTE_NODE_MIN_HEIGHT,
  NOTE_NODE_MIN_WIDTH,
} from "@/constants/constants";
import { CreditsBalanceButton } from "@/components/CreditsBalanceButton";
import { useGetBuildsQuery } from "@/controllers/API/queries/_builds";
import CustomLoader from "@/customization/components/custom-loader";
import { track } from "@/customization/utils/analytics";
import useAutoSaveFlow from "@/hooks/flows/use-autosave-flow";
import useSaveFlow from "@/hooks/flows/use-save-flow";
import useUploadFlow from "@/hooks/flows/use-upload-flow";
import { useAddComponent } from "@/hooks/use-add-component";
import { nodeColorsName } from "@/utils/styleUtils";
import { isSupportedNodeTypes } from "@/utils/utils";
import GenericNode from "../../../../CustomNodes/GenericNode";
import { Link } from "react-router-dom";
import { Button } from "../../../../components/ui/button";
import IconComponent from "../../../../components/common/genericIconComponent";
import FlowMenu from "../../../../components/core/appHeaderComponent/components/FlowMenu";
import PublishDropdown from "../../../../components/core/flowToolbarComponent/components/deploy-dropdown";
import {
  UPLOAD_ALERT_LIST,
  UPLOAD_ERROR_ALERT,
  WRONG_FILE_ERROR_ALERT,
} from "../../../../constants/alerts_constants";
import ExportModal from "../../../../modals/exportModal";
import useAlertStore from "../../../../stores/alertStore";
import useFlowStore from "../../../../stores/flowStore";
import useFlowsManagerStore from "../../../../stores/flowsManagerStore";
import { useShortcutsStore } from "../../../../stores/shortcuts";
import { useTypesStore } from "../../../../stores/typesStore";
import type { APIClassType } from "../../../../types/api";
import type {
  AllNodeType,
  EdgeType,
  NoteNodeType,
} from "../../../../types/flow";
import {
  dissolveSmallGroups,
  fitGroupToChildren,
  getAbsolutePosition,
  getNextGroupName,
  getNodeDimensions,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  isGroupContainerNode,
} from "../../../../utils/groupingUtils";
import {
  getNodeId,
  isValidConnection,
  scapeJSONParse,
} from "../../../../utils/reactflowUtils";
import ConnectionLineComponent from "../ConnectionLineComponent";
import SelectionMenu from "../SelectionMenuComponent";
import UpdateAllComponents from "../UpdateAllComponents";
import DoubaoImageCreatorMoreActionsMenu from "./components/doubao-image-creator-more-actions-menu";
import DoubaoVideoGeneratorMoreActionsMenu from "./components/doubao-video-generator-more-actions-menu";
import DoubaoAudioMoreActionsMenu from "./components/doubao-audio-more-actions-menu";
import TextCreationMoreActionsMenu from "./components/text-creation-more-actions-menu";
import ProCameraMoreActionsMenu from "./components/pro-camera-more-actions-menu";
import HelperLines from "./components/helper-lines";
import CanvasMiniMap from "@/components/core/canvasMiniMapComponent/CanvasMiniMap";
import CanvasAssistantDrawer from "@/components/core/canvasAssistantComponent/CanvasAssistantDrawer";
import CanvasAssistantLauncher from "@/components/core/canvasAssistantComponent/CanvasAssistantLauncher";
import { useCanvasUiStore } from "@/stores/canvasUiStore";
import { useCanvasAssistantStore } from "@/stores/canvasAssistantStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import {
  getHelperLines,
  getSnapPosition,
  type HelperLinesState,
} from "./helpers/helper-lines";
import {
  MemoizedBackground,
  MemoizedCanvasControls,
} from "./MemoizedComponents";
import getRandomName from "./utils/get-random-name";
import isWrappedWithClass from "./utils/is-wrapped-with-class";

function shouldDeselectNodeOnMarquee(node: AllNodeType): boolean {
  // Keep default ReactFlow selection behavior so marquee selection can be grouped.
  // (Some builds previously avoided selecting generic nodes here; that breaks grouping UX.)
  return false;
}

const nodeTypes = {
  genericNode: GenericNode,
  noteNode: NoteNode,
  groupNode: GroupContainerNode,
};

const edgeTypes = {
  default: DefaultEdge,
};

const CLIPBOARD_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "gif",
  "tiff",
  "svg",
  "heic",
  "heif",
]);

const CLIPBOARD_VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "webm",
  "mkv",
  "avi",
  "m4v",
]);

const CLIPBOARD_AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "flac",
]);

type UserUploadNodeType =
  | "UserUploadImage"
  | "UserUploadVideo"
  | "UserUploadAudio";

function inferClipboardResourceNodeType(file: File): UserUploadNodeType | null {
  const mime = String(file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (mime.startsWith("image/") || CLIPBOARD_IMAGE_EXTENSIONS.has(ext)) {
    return "UserUploadImage";
  }
  if (mime.startsWith("video/") || CLIPBOARD_VIDEO_EXTENSIONS.has(ext)) {
    return "UserUploadVideo";
  }
  if (mime.startsWith("audio/") || CLIPBOARD_AUDIO_EXTENSIONS.has(ext)) {
    return "UserUploadAudio";
  }
  return null;
}

function getClipboardFileName(file: File, nodeType: UserUploadNodeType): string {
  if (file.name?.trim()) return file.name;
  const fallbackExt =
    nodeType === "UserUploadImage"
      ? "png"
      : nodeType === "UserUploadVideo"
        ? "mp4"
        : "mp3";
  return `${nodeType.toLowerCase()}-${Date.now()}.${fallbackExt}`;
}

export default function Page({
  view,
  setIsLoading,
}: {
  view?: boolean;
  setIsLoading: (isLoading: boolean) => void;
}): JSX.Element {
  const { id } = useParams();
  const setCanvasAssistantActiveFlowId = useCanvasAssistantStore(
    (s) => s.setActiveFlowId,
  );
  const uploadFlow = useUploadFlow();
  const autoSaveFlow = useAutoSaveFlow();
  const types = useTypesStore((state) => state.types);
  const templates = useTypesStore((state) => state.templates);
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const setFilterComponent = useFlowStore((state) => state.setFilterComponent);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const setPositionDictionary = useFlowStore(
    (state) => state.setPositionDictionary,
  );
  const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
  const setReactFlowInstance = useFlowStore(
    (state) => state.setReactFlowInstance,
  );
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const isEmptyFlow = useRef(nodes.length === 0);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const setNodes = useFlowStore((state) => state.setNodes);
  const setEdges = useFlowStore((state) => state.setEdges);
  const deleteNode = useFlowStore((state) => state.deleteNode);
  const deleteEdge = useFlowStore((state) => state.deleteEdge);
  const undo = useFlowsManagerStore((state) => state.undo);
  const redo = useFlowsManagerStore((state) => state.redo);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const paste = useFlowStore((state) => state.paste);
  const lastCopiedSelection = useFlowStore(
    (state) => state.lastCopiedSelection,
  );
  const setLastCopiedSelection = useFlowStore(
    (state) => state.setLastCopiedSelection,
  );
  const onConnect = useFlowStore((state) => state.onConnect);
  const setRightClickedNodeId = useFlowStore(
    (state) => state.setRightClickedNodeId,
  );
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const updateCurrentFlow = useFlowStore((state) => state.updateCurrentFlow);
  const [selectionMenuVisible, setSelectionMenuVisible] = useState(false);
  const [openExportModal, setOpenExportModal] = useState(false);
  const edgeUpdateSuccessful = useRef(true);

  const isLocked = useFlowStore(
    useShallow((state) => state.currentFlow?.locked),
  );

  const position = useRef({ x: 0, y: 0 });
  const [lastSelection, setLastSelection] =
    useState<OnSelectionChangeParams | null>(null);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const saveFlow = useSaveFlow();
  const { mutateAsync: uploadResourceFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();
  const pendingInternalPastePositionRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const pendingInternalPasteTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCanvasAssistantActiveFlowId(id ?? null);
  }, [id, setCanvasAssistantActiveFlowId]);

  useEffect(() => {
    if (currentFlowId !== "") {
      isEmptyFlow.current = nodes.length === 0;
    }
  }, [currentFlowId]);

  const [isAddingNote, setIsAddingNote] = useState(false);

  const addComponent = useAddComponent();

  const zoomLevel = reactFlowInstance?.getZoom();
  const shadowBoxWidth = NOTE_NODE_MIN_WIDTH * (zoomLevel || 1);
  const shadowBoxHeight = NOTE_NODE_MIN_HEIGHT * (zoomLevel || 1);
  const shadowBoxBackgroundColor = COLOR_OPTIONS[Object.keys(COLOR_OPTIONS)[0]];

  const handleCreateOrMergeGroup = useCallback(() => {
    if (isLocked) return;
    if (!lastSelection?.nodes || lastSelection.nodes.length < 2) return;

    takeSnapshot();

    const currentNodes = cloneDeep(useFlowStore.getState().nodes);
    const nodeById = new Map(currentNodes.map((n) => [n.id, n]));

    const initialSelectedIds = new Set(lastSelection.nodes.map((n) => n.id));
    const selectedGroupIds = new Set(
      currentNodes
        .filter((n) => initialSelectedIds.has(n.id))
        .filter(isGroupContainerNode)
        .map((n) => n.id),
    );

    // If a group container is selected, treat it as a single unit and ignore its descendants.
    const isDescendantOfSelectedGroup = (node: AllNodeType) => {
      let parentId = node.parentId;
      while (parentId) {
        if (selectedGroupIds.has(parentId)) return true;
        const parent = nodeById.get(parentId);
        parentId = parent?.parentId;
      }
      return false;
    };

    const effectiveSelectedNodes = currentNodes.filter(
      (n) => initialSelectedIds.has(n.id) && !isDescendantOfSelectedGroup(n),
    );
    if (effectiveSelectedNodes.length < 2) return;

    const effectiveSelectedIds = new Set(effectiveSelectedNodes.map((n) => n.id));

    // Prefer grouping into an explicitly selected group container.
    const explicitTarget = effectiveSelectedNodes.find(isGroupContainerNode);
    const parentTarget = effectiveSelectedNodes.find((n) => {
      if (!n.parentId) return false;
      const parent = nodeById.get(n.parentId);
      return !!parent && isGroupContainerNode(parent);
    });

    let targetGroupId: string | null =
      explicitTarget?.id ?? parentTarget?.parentId ?? null;

    // Snapshot absolute positions before we change parent relationships.
    const absPosById = new Map<string, { x: number; y: number }>();
    for (const n of currentNodes) {
      absPosById.set(n.id, getAbsolutePosition(n, nodeById));
    }

    // Create a new group if we're not merging into an existing one.
    if (!targetGroupId) {
      const parentIds = new Set(effectiveSelectedNodes.map((n) => n.parentId ?? ""));
      const commonParentId =
        parentIds.size === 1 ? effectiveSelectedNodes[0]!.parentId ?? undefined : undefined;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const n of effectiveSelectedNodes) {
        const abs = absPosById.get(n.id)!;
        const { width, height } = getNodeDimensions(n);
        minX = Math.min(minX, abs.x);
        minY = Math.min(minY, abs.y);
        maxX = Math.max(maxX, abs.x + width);
        maxY = Math.max(maxY, abs.y + height);
      }

      const groupAbs = {
        x: minX - GROUP_PADDING,
        y: minY - (GROUP_PADDING + GROUP_HEADER_HEIGHT),
      };
      const groupWidth = Math.max(240, maxX - minX + GROUP_PADDING * 2);
      const groupHeight = Math.max(120, maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT);

      const parentAbs =
        commonParentId && nodeById.get(commonParentId)
          ? absPosById.get(commonParentId)!
          : { x: 0, y: 0 };

      const groupId = getNodeId("group");
      const label = getNextGroupName(currentNodes);

      const groupNode: any = {
        id: groupId,
        type: "groupNode",
        position: { x: groupAbs.x - parentAbs.x, y: groupAbs.y - parentAbs.y },
        data: { id: groupId, type: "GroupContainer", label, backgroundColor: "blue" },
        parentId: commonParentId,
        width: groupWidth,
        height: groupHeight,
        draggable: true,
        selectable: true,
        zIndex: -100,
        style: { zIndex: -100 },
      };

      currentNodes.push(groupNode);
      nodeById.set(groupId, groupNode);
      absPosById.set(groupId, groupAbs);
      targetGroupId = groupId;
    }

    const targetAbs = absPosById.get(targetGroupId)!;

    let nextNodes: AllNodeType[] = currentNodes.map((n) => {
      if (n.id === targetGroupId) {
        return { ...n, selected: true };
      }
      if (!effectiveSelectedIds.has(n.id)) {
        return { ...n, selected: false };
      }

      const abs = absPosById.get(n.id)!;
      const rel = { x: abs.x - targetAbs.x, y: abs.y - targetAbs.y };
      const moved: any = {
        ...n,
        selected: false,
        parentId: targetGroupId,
        position: rel,
      };
      delete moved.extent;
      delete moved.expandParent;
      return moved;
    }) as AllNodeType[];

    // Make sure the target container fits the (possibly expanded) set of children.
    nextNodes = fitGroupToChildren(targetGroupId, nextNodes);

    // Auto-dissolve groups with <= 1 member (per requirements).
    nextNodes = dissolveSmallGroups(nextNodes);

    setNodes(nextNodes);
    setRightClickedNodeId(null);
  }, [isLocked, lastSelection, setNodes, setRightClickedNodeId, takeSnapshot]);

  const handleDissolveGroup = useCallback(
    (groupId?: string) => {
      if (isLocked) return;
      const targetId =
        groupId ??
        (lastSelection?.nodes?.length === 1 ? lastSelection.nodes[0]!.id : undefined);
      if (!targetId) return;

      takeSnapshot();

      const currentNodes = cloneDeep(useFlowStore.getState().nodes);
      const nodeById = new Map(currentNodes.map((n) => [n.id, n]));
      const group = nodeById.get(targetId);
      if (!group || !isGroupContainerNode(group)) return;

      const children = currentNodes.filter((n) => n.parentId === targetId);
      const parent =
        group.parentId && nodeById.get(group.parentId) ? nodeById.get(group.parentId)! : null;
      const parentAbs = parent ? getAbsolutePosition(parent, nodeById) : { x: 0, y: 0 };

      const absPosById = new Map<string, { x: number; y: number }>();
      for (const n of currentNodes) {
        absPosById.set(n.id, getAbsolutePosition(n, nodeById));
      }

      let nextNodes: AllNodeType[] = currentNodes
        .filter((n) => n.id !== targetId)
        .map((n) => ({ ...n, selected: false }));

      nextNodes = nextNodes.map((n) => {
        if (!children.some((c) => c.id === n.id)) return n;
        const abs = absPosById.get(n.id)!;
        const moved: any = {
          ...n,
          parentId: group.parentId,
          position: { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y },
        };
        delete moved.extent;
        delete moved.expandParent;
        return moved;
      });

      if (group.parentId) {
        nextNodes = fitGroupToChildren(group.parentId, nextNodes);
      }
      nextNodes = dissolveSmallGroups(nextNodes);

      setNodes(nextNodes);
      setRightClickedNodeId(null);
    },
    [isLocked, lastSelection, setNodes, setRightClickedNodeId, takeSnapshot],
  );

  const handleCreateWorkflowFromGroup = useCallback(
    (groupId: string) => {
      if (isLocked) return;
      if (!groupId) return;
      window.dispatchEvent(
        new CustomEvent("lf:open-workflows-panel", { detail: { groupId } }),
      );
    },
    [isLocked],
  );

  useEffect(() => {
    const handleMouseMove = (event) => {
      position.current = { x: event.clientX, y: event.clientY };
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [lastCopiedSelection, lastSelection, takeSnapshot, selectionMenuVisible]);

  const { isFetching } = useGetBuildsQuery({ flowId: currentFlowId });

  const showCanvas =
    Object.keys(templates).length > 0 &&
    Object.keys(types).length > 0 &&
    !isFetching;

  useEffect(() => {
    setIsLoading(!showCanvas);
  }, [showCanvas]);

  useEffect(() => {
    useFlowStore.setState({ autoSaveFlow });
  }, [autoSaveFlow]);

  const clearPendingInternalPaste = useCallback(() => {
    if (pendingInternalPasteTimerRef.current !== null) {
      window.clearTimeout(pendingInternalPasteTimerRef.current);
      pendingInternalPasteTimerRef.current = null;
    }
    pendingInternalPastePositionRef.current = null;
  }, []);

  const cancelPendingInternalPasteTimer = useCallback(() => {
    if (pendingInternalPasteTimerRef.current !== null) {
      window.clearTimeout(pendingInternalPasteTimerRef.current);
      pendingInternalPasteTimerRef.current = null;
    }
  }, []);

  const executeInternalPaste = useCallback(
    (screenPosition?: { x: number; y: number }) => {
      if (!lastCopiedSelection) return;
      takeSnapshot();
      paste(lastCopiedSelection, {
        x: screenPosition?.x ?? position.current.x,
        y: screenPosition?.y ?? position.current.y,
      });
    },
    [lastCopiedSelection, paste, takeSnapshot],
  );

  const pasteClipboardResources = useCallback(
    async (files: File[], screenPosition: { x: number; y: number }) => {
      if (isLocked) return false;

      const filesWithType = files
        .map((file) => ({
          file,
          nodeType: inferClipboardResourceNodeType(file),
        }))
        .filter(
          (item): item is { file: File; nodeType: UserUploadNodeType } =>
            item.nodeType !== null,
        );

      if (!filesWithType.length) {
        return false;
      }

      if (!currentFlowId) {
        setErrorData({
          title: "Unable to paste resources",
          list: ["Please save the flow first, then paste again."],
        });
        return true;
      }

      const createdNodes: AllNodeType[] = [];
      const uploadErrors: string[] = [];
      const uploadQueue: Array<{
        nodeId: string;
        file: File;
        fileName: string;
        localPreviewPath: string;
      }> = [];

      for (let index = 0; index < filesWithType.length; index += 1) {
        const { file, nodeType } = filesWithType[index]!;
        const fileName = getClipboardFileName(file, nodeType);

        try {
          validateFileSize(file);

          const template = (templates as any)?.[nodeType];
          if (!template) {
            throw new Error(`Template "${nodeType}" is not loaded.`);
          }

          const seededTemplate = cloneDeep(template);
          const localPreviewPath = URL.createObjectURL(file);
          if (seededTemplate.template?.file) {
            seededTemplate.template.file.value = fileName;
            seededTemplate.template.file.file_path = localPreviewPath;
          }

          const offset = index * 36;
          const flowPosition = reactFlowInstance
            ? reactFlowInstance.screenToFlowPosition({
                x: screenPosition.x + offset,
                y: screenPosition.y + offset,
              })
            : { x: 0, y: 0 };
          const nodeId = getNodeId(nodeType);

          createdNodes.push({
            id: nodeId,
            type: "genericNode",
            position: flowPosition,
            data: {
              node: seededTemplate,
              showNode: !seededTemplate.minimized,
              type: nodeType,
              id: nodeId,
            },
            selected: false,
          } as AllNodeType);

          uploadQueue.push({
            nodeId,
            file,
            fileName,
            localPreviewPath,
          });
        } catch (error: any) {
          uploadErrors.push(
            `${fileName}: ${String(error?.message ?? "Cannot prepare preview")}`,
          );
        }
      }

      if (createdNodes.length > 0) {
        takeSnapshot();
        setNodes((currentNodes) => {
          const unselectedNodes = (currentNodes ?? []).map((node) => ({
            ...node,
            selected: false,
          }));
          const nextNodes = createdNodes.map((node, index) => ({
            ...node,
            selected: index === createdNodes.length - 1,
          }));
          return [...unselectedNodes, ...nextNodes];
        });
      }

      if (!uploadQueue.length) {
        if (uploadErrors.length > 0) {
          setErrorData({
            title: "Some resources failed to paste",
            list: uploadErrors.slice(0, 5),
          });
        }
        return true;
      }

      try {
        // Ensure backend flow exists before uploading clipboard files.
        await saveFlow();
      } catch (error: any) {
        setErrorData({
          title: "Pasted resources are local-only",
          list: [
            String(
              error?.message ??
                "Failed to save flow before upload. You can retry saving manually.",
            ),
          ],
        });
        return true;
      }

      for (const item of uploadQueue) {
        try {
          const uploaded = await uploadResourceFile({
            file: item.file,
            id: currentFlowId,
          });
          const serverPath = String((uploaded as any)?.file_path ?? "").trim();
          if (!serverPath) {
            throw new Error("Missing file_path in upload response.");
          }

          setNodes((currentNodes) =>
            (currentNodes ?? []).map((node) => {
              if (node.id !== item.nodeId) return node;
              const updatedNode = cloneDeep(node) as any;
              const fileTemplate = updatedNode?.data?.node?.template?.file;
              if (fileTemplate) {
                fileTemplate.value = item.fileName;
                fileTemplate.file_path = serverPath;
              }
              return updatedNode;
            }),
          );

          URL.revokeObjectURL(item.localPreviewPath);
        } catch (error: any) {
          uploadErrors.push(
            `${item.fileName}: ${String(error?.message ?? "Upload failed")}`,
          );
        }
      }

      if (uploadErrors.length > 0) {
        setErrorData({
          title: "Some resources failed to paste",
          list: uploadErrors.slice(0, 5),
        });
      }

      return true;
    },
    [
      currentFlowId,
      isLocked,
      reactFlowInstance,
      saveFlow,
      setErrorData,
      setNodes,
      takeSnapshot,
      templates,
      uploadResourceFile,
      validateFileSize,
    ],
  );

  const handleNativePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (isLocked) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".noflow")) return;
      cancelPendingInternalPasteTimer();

      const clipboardItems = Array.from(event.clipboardData?.items ?? []);
      const clipboardFiles = clipboardItems
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file instanceof File);

      if (clipboardFiles.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        (event as unknown as Event).stopImmediatePropagation();
        const pendingPosition = pendingInternalPastePositionRef.current;
        const handled = await pasteClipboardResources(
          clipboardFiles,
          position.current,
        );
        if (handled) {
          clearPendingInternalPaste();
          return;
        }
        if (pendingPosition && lastCopiedSelection) {
          clearPendingInternalPaste();
          executeInternalPaste(pendingPosition);
          return;
        }
        clearPendingInternalPaste();
        return;
      }

      if (pendingInternalPastePositionRef.current && lastCopiedSelection) {
        const pendingPosition = pendingInternalPastePositionRef.current;
        clearPendingInternalPaste();
        event.preventDefault();
        event.stopPropagation();
        (event as unknown as Event).stopImmediatePropagation();
        executeInternalPaste(pendingPosition);
      }
    },
    [
      clearPendingInternalPaste,
      cancelPendingInternalPasteTimer,
      executeInternalPaste,
      isLocked,
      lastCopiedSelection,
      pasteClipboardResources,
    ],
  );

  useEffect(() => {
    const listener = (event: ClipboardEvent) => {
      void handleNativePaste(event);
    };

    document.addEventListener("paste", listener, true);
    return () => {
      document.removeEventListener("paste", listener, true);
      clearPendingInternalPaste();
    };
  }, [clearPendingInternalPaste, handleNativePaste]);

  function handleUndo(e: KeyboardEvent) {
    if (!isWrappedWithClass(e, "noflow")) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      undo();
    }
  }

  function handleRedo(e: KeyboardEvent) {
    if (!isWrappedWithClass(e, "noflow")) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      redo();
    }
  }

  function handleGroup(e: KeyboardEvent) {
    if (selectionMenuVisible && (lastSelection?.nodes?.length ?? 0) > 1) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      handleCreateOrMergeGroup();
    }
  }

  function handleDuplicate(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e as unknown as Event).stopImmediatePropagation();
    const selectedNode = nodes.filter((obj) => obj.selected);
    if (selectedNode.length > 0) {
      paste(
        { nodes: selectedNode, edges: [] },
        {
          x: position.current.x,
          y: position.current.y,
        },
      );
    }
  }

  function handleCopy(e: KeyboardEvent) {
    const multipleSelection = lastSelection?.nodes
      ? lastSelection?.nodes.length > 0
      : false;
    const hasTextSelection =
      (window.getSelection()?.toString().length ?? 0) > 0;

    if (
      !isWrappedWithClass(e, "noflow") &&
      !hasTextSelection &&
      (isWrappedWithClass(e, "react-flow__node") || multipleSelection)
    ) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      if (lastSelection) {
        setLastCopiedSelection(_.cloneDeep(lastSelection));
      }
    }
  }

  function handleCut(e: KeyboardEvent) {
    if (!isWrappedWithClass(e, "noflow")) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      if (window.getSelection()?.toString().length === 0 && lastSelection) {
        setLastCopiedSelection(_.cloneDeep(lastSelection), true);
      }
    }
  }

  function handlePaste(e: KeyboardEvent) {
    if (isWrappedWithClass(e, "noflow")) return;
    if ((window.getSelection()?.toString().length ?? 0) > 0) return;
    if (!lastCopiedSelection) return;

    clearPendingInternalPaste();
    pendingInternalPastePositionRef.current = {
      x: position.current.x,
      y: position.current.y,
    };
    pendingInternalPasteTimerRef.current = window.setTimeout(() => {
      const pendingPosition = pendingInternalPastePositionRef.current;
      clearPendingInternalPaste();
      if (!pendingPosition) return;
      executeInternalPaste(pendingPosition);
    }, 120);
  }

  function handleDelete(e: KeyboardEvent) {
    if (isLocked) return;
    if (!isWrappedWithClass(e, "nodelete") && lastSelection) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      takeSnapshot();
      if (lastSelection.edges?.length) {
        track("Component Connection Deleted");
      }
      if (lastSelection.nodes?.length) {
        lastSelection.nodes.forEach((n) => {
          track("Component Deleted", { componentType: n.data.type });
        });
      }
      deleteNode(lastSelection.nodes.map((node) => node.id));
      deleteEdge(lastSelection.edges.map((edge) => edge.id));
    }
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setRightClickedNodeId(null);
    }
  }

  function handleDownload(e: KeyboardEvent) {
    if (!isWrappedWithClass(e, "noflow")) {
      e.preventDefault();
      (e as unknown as Event).stopImmediatePropagation();
      setOpenExportModal(true);
    }
  }

  const undoAction = useShortcutsStore((state) => state.undo);
  const redoAction = useShortcutsStore((state) => state.redo);
  const redoAltAction = useShortcutsStore((state) => state.redoAlt);
  const copyAction = useShortcutsStore((state) => state.copy);
  const duplicate = useShortcutsStore((state) => state.duplicate);
  const deleteAction = useShortcutsStore((state) => state.delete);
  const groupAction = useShortcutsStore((state) => state.group);
  const cutAction = useShortcutsStore((state) => state.cut);
  const pasteAction = useShortcutsStore((state) => state.paste);
  const downloadAction = useShortcutsStore((state) => state.download);
  //@ts-ignore
  useHotkeys(undoAction, handleUndo);
  //@ts-ignore
  useHotkeys(redoAction, handleRedo);
  //@ts-ignore
  useHotkeys(redoAltAction, handleRedo);
  //@ts-ignore
  useHotkeys(groupAction, handleGroup);
  //@ts-ignore
  useHotkeys(duplicate, handleDuplicate);
  //@ts-ignore
  useHotkeys(copyAction, handleCopy);
  //@ts-ignore
  useHotkeys(cutAction, handleCut);
  //@ts-ignore
  useHotkeys(pasteAction, handlePaste);
  //@ts-ignore
  useHotkeys(deleteAction, handleDelete);
  //@ts-ignore
  useHotkeys(downloadAction, handleDownload);
  //@ts-ignore
  useHotkeys("delete", handleDelete);
  //@ts-ignore
  useHotkeys("escape", handleEscape);

  const onConnectMod = useCallback(
    (params: Connection) => {
      takeSnapshot();
      onConnect(params);
      track("New Component Connection Added");
    },
    [takeSnapshot, onConnect],
  );

  const [helperLines, setHelperLines] = useState<HelperLinesState>({});
  const [isDragging, setIsDragging] = useState(false);
  const helperLineEnabled = useFlowStore((state) => state.helperLineEnabled);
  const marqueeSelectingRef = useRef(false);
  const marqueeSelectionJustEndedRef = useRef(false);

  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      // Helper-lines use pane-space coordinates; nested nodes use parent-relative coordinates.
      // Mixing the two causes snapping/selection jitter while dragging inside groups.
      if ((node as any).parentId) return;
      if (helperLineEnabled) {
        const currentHelperLines = getHelperLines(node, nodes);
        setHelperLines(currentHelperLines);
      }
    },
    [helperLineEnabled, nodes],
  );

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node) => {
      // 👇 make dragging a node undoable
      takeSnapshot();
      setIsDragging(true);
      // 👉 you can place your event handlers here
    },
    [takeSnapshot],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      // 👇 make moving the canvas undoable
      autoSaveFlow();
      updateCurrentFlow({ nodes });
      setPositionDictionary({});
      setIsDragging(false);
      setHelperLines({});
    },
    [
      autoSaveFlow,
      nodes,
      setPositionDictionary,
      updateCurrentFlow,
    ],
  );

  const onNodesChangeWithHelperLines = useCallback(
    (changes: NodeChange<AllNodeType>[]) => {
      // During marquee selection, prevent generic nodes from becoming selected at all.
      // This avoids any selected-state UI from appearing (from start of drag to end).
      const filteredChanges =
        marqueeSelectingRef.current
          ? changes.filter((change) => {
            if (change.type !== "select") return true;
            const nodeId = change.id as string;
            const node = nodes.find((n) => n.id === nodeId);
            return !(node && shouldDeselectNodeOnMarquee(node));
          })
          : changes;

      if (!helperLineEnabled) {
        onNodesChange(filteredChanges);
        return;
      }

      // Apply snapping to position changes during drag
      const modifiedChanges = filteredChanges.map((change) => {
        if (
          change.type === "position" &&
          "dragging" in change &&
          "position" in change &&
          "id" in change &&
          isDragging
        ) {
          const nodeId = change.id as string;
          const draggedNode = nodes.find((n) => n.id === nodeId);

          if (draggedNode && change.position) {
            // Don't snap nested nodes; their coordinates are parent-relative.
            if ((draggedNode as any).parentId) {
              return change;
            }
            const updatedNode = {
              ...draggedNode,
              position: change.position,
            };

            const snapPosition = getSnapPosition(updatedNode, nodes);

            // Only snap if we're actively dragging
            if (change.dragging) {
              // Apply snap if there's a significant difference
              if (
                Math.abs(snapPosition.x - change.position.x) > 0.1 ||
                Math.abs(snapPosition.y - change.position.y) > 0.1
              ) {
                return {
                  ...change,
                  position: snapPosition,
                };
              }
            } else {
              // This is the final position change when drag ends
              // Force snap to ensure it stays where it should
              return {
                ...change,
                position: snapPosition,
              };
            }
          }
        }
        return change;
      });

      onNodesChange(modifiedChanges);
    },
    [onNodesChange, nodes, isDragging, helperLineEnabled],
  );

  const onSelectionDragStart: SelectionDragHandler = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.types.some((types) => isSupportedNodeTypes(types))) {
      event.dataTransfer.dropEffect = "move";
    } else {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isLocked) return;
      const grabbingElement =
        document.getElementsByClassName("cursor-grabbing");
      if (grabbingElement.length > 0) {
        document.body.removeChild(grabbingElement[0]);
      }
      if (event.dataTransfer.types.some((type) => isSupportedNodeTypes(type))) {
        takeSnapshot();

        const datakey = event.dataTransfer.types.find((type) =>
          isSupportedNodeTypes(type),
        );

        // Extract the data from the drag event and parse it as a JSON object
        const data: { type: string; node?: APIClassType } = JSON.parse(
          event.dataTransfer.getData(datakey!),
        );

        addComponent(data.node!, data.type, {
          x: event.clientX,
          y: event.clientY,
        });
      } else if (event.dataTransfer.types.some((types) => types === "Files")) {
        takeSnapshot();
        const position = {
          x: event.clientX,
          y: event.clientY,
        };
        uploadFlow({
          files: Array.from(event.dataTransfer.files!),
          position: position,
        }).catch((error) => {
          setErrorData({
            title: UPLOAD_ERROR_ALERT,
            list: [(error as Error).message],
          });
        });
      } else {
        setErrorData({
          title: WRONG_FILE_ERROR_ALERT,
          list: [UPLOAD_ALERT_LIST],
        });
      }
    },
    [takeSnapshot, addComponent],
  );

  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback(
    (oldEdge: EdgeType, newConnection: Connection) => {
      if (isValidConnection(newConnection, nodes, edges)) {
        edgeUpdateSuccessful.current = true;
        // Preserve custom edge metadata (e.g. imageRole / videoReferType) while updating handles.
        oldEdge.data = {
          ...(oldEdge.data ?? {}),
          targetHandle: scapeJSONParse(newConnection.targetHandle!),
          sourceHandle: scapeJSONParse(newConnection.sourceHandle!),
        };
        setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
      }
    },
    [setEdges],
  );

  const onEdgeUpdateEnd = useCallback((_, edge: Edge): void => {
    if (!edgeUpdateSuccessful.current) {
      setEdges((eds) => eds.filter((edg) => edg.id !== edge.id));
    }
    edgeUpdateSuccessful.current = true;
  }, []);

  const [selectionEnded, setSelectionEnded] = useState(true);
  const [imageCreatorMoreActionsMenu, setImageCreatorMoreActionsMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [videoGeneratorMoreActionsMenu, setVideoGeneratorMoreActionsMenu] =
    useState<{
      nodeId: string;
      x: number;
      y: number;
    } | null>(null);
  const [audioCreatorMoreActionsMenu, setAudioCreatorMoreActionsMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [textCreationMoreActionsMenu, setTextCreationMoreActionsMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [proCameraMoreActionsMenu, setProCameraMoreActionsMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  const onSelectionEnd = useCallback(() => {
    if (marqueeSelectingRef.current) {
      marqueeSelectionJustEndedRef.current = true;
      marqueeSelectingRef.current = false;
    }
    setSelectionEnded(true);
  }, []);
  const onSelectionStart = useCallback((event: MouseEvent) => {
    event.preventDefault();
    marqueeSelectingRef.current = true;
    marqueeSelectionJustEndedRef.current = false;
    setSelectionEnded(false);
  }, []);

  // Workaround to show the menu only after the selection has ended.
  useEffect(() => {
    const rawNodes = lastSelection?.nodes ?? [];
    const isGroupOnly =
      rawNodes.length === 1 && rawNodes[0]?.type === "groupNode";

    if (selectionEnded && rawNodes.length > 0 && (isGroupOnly || rawNodes.length > 1)) {
      setSelectionMenuVisible(true);
      return;
    }

    setSelectionMenuVisible(false);
  }, [selectionEnded, lastSelection]);

  const onSelectionChange = useCallback(
    (flow: OnSelectionChangeParams): void => {
      setLastSelection(flow);
      setImageCreatorMoreActionsMenu(null);
      setVideoGeneratorMoreActionsMenu(null);
      setAudioCreatorMoreActionsMenu(null);
      setTextCreationMoreActionsMenu(null);
      setProCameraMoreActionsMenu(null);
      if (
        flow.nodes &&
        (flow.nodes.length === 0 || flow.nodes.length > 1)
      ) {
        setRightClickedNodeId(null);
      }
    },
    [
      setRightClickedNodeId,
      setImageCreatorMoreActionsMenu,
      setVideoGeneratorMoreActionsMenu,
      setAudioCreatorMoreActionsMenu,
      setTextCreationMoreActionsMenu,
      setProCameraMoreActionsMenu,
    ],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: AllNodeType) => {
      event.preventDefault();
      if (isLocked) return;

      // Image nodes (creator + user upload): show menu at cursor, and do NOT change selection.
      if (
        node.type === "genericNode" &&
        (node.data?.type === "DoubaoImageCreator" ||
          node.data?.type === "UserUploadImage")
      ) {
        setRightClickedNodeId(null);
        setImageCreatorMoreActionsMenu({
          nodeId: node.id,
          x: event.clientX,
          y: event.clientY,
        });
        setVideoGeneratorMoreActionsMenu(null);
        setAudioCreatorMoreActionsMenu(null);
        setTextCreationMoreActionsMenu(null);
        setProCameraMoreActionsMenu(null);
        return;
      }

      // Video nodes (creator + user upload): same cursor-anchored menu behavior as image creator.
      if (
        node.type === "genericNode" &&
        (node.data?.type === "DoubaoVideoGenerator" ||
          node.data?.type === "UserUploadVideo")
      ) {
        setRightClickedNodeId(null);
        setVideoGeneratorMoreActionsMenu({
          nodeId: node.id,
          x: event.clientX,
          y: event.clientY,
        });
        setImageCreatorMoreActionsMenu(null);
        setAudioCreatorMoreActionsMenu(null);
        setTextCreationMoreActionsMenu(null);
        setProCameraMoreActionsMenu(null);
        return;
      }

      // Audio nodes (creator + user upload): same cursor-anchored menu behavior as image creator.
      if (
        node.type === "genericNode" &&
        (node.data?.type === "DoubaoTTS" || node.data?.type === "UserUploadAudio")
      ) {
        setRightClickedNodeId(null);
        setAudioCreatorMoreActionsMenu({
          nodeId: node.id,
          x: event.clientX,
          y: event.clientY,
        });
        setImageCreatorMoreActionsMenu(null);
        setVideoGeneratorMoreActionsMenu(null);
        setTextCreationMoreActionsMenu(null);
        setProCameraMoreActionsMenu(null);
        return;
      }

      // Text creation: same cursor-anchored menu behavior as image creator.
      if (node.type === "genericNode" && node.data?.type === "TextCreation") {
        setRightClickedNodeId(null);
        setTextCreationMoreActionsMenu({
          nodeId: node.id,
          x: event.clientX,
          y: event.clientY,
        });
        setImageCreatorMoreActionsMenu(null);
        setVideoGeneratorMoreActionsMenu(null);
        setAudioCreatorMoreActionsMenu(null);
        setProCameraMoreActionsMenu(null);
        return;
      }

      // Pro camera: cursor-anchored menu behavior (Delete/etc).
      if (node.type === "genericNode" && node.data?.type === "ProCamera") {
        setRightClickedNodeId(null);
        setProCameraMoreActionsMenu({
          nodeId: node.id,
          x: event.clientX,
          y: event.clientY,
        });
        setImageCreatorMoreActionsMenu(null);
        setVideoGeneratorMoreActionsMenu(null);
        setAudioCreatorMoreActionsMenu(null);
        setTextCreationMoreActionsMenu(null);
        return;
      }

      setImageCreatorMoreActionsMenu(null);
      setVideoGeneratorMoreActionsMenu(null);
      setAudioCreatorMoreActionsMenu(null);
      setTextCreationMoreActionsMenu(null);
      setProCameraMoreActionsMenu(null);

      // Set the right-clicked node ID to show its dropdown menu
      setRightClickedNodeId(node.id);

      // Focus/select the right-clicked node (same as left-click behavior)
      setNodes((currentNodes) => {
        return currentNodes.map((n) => ({
          ...n,
          selected: n.id === node.id,
        }));
      });
    },
    [
      isLocked,
      setRightClickedNodeId,
      setNodes,
      setImageCreatorMoreActionsMenu,
      setVideoGeneratorMoreActionsMenu,
      setAudioCreatorMoreActionsMenu,
      setTextCreationMoreActionsMenu,
      setProCameraMoreActionsMenu,
    ],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      setFilterEdge([]);
      setFilterComponent("");
      // Hide right-click dropdown when clicking on the pane
      setRightClickedNodeId(null);
      setImageCreatorMoreActionsMenu(null);
      setVideoGeneratorMoreActionsMenu(null);
      setAudioCreatorMoreActionsMenu(null);
      setTextCreationMoreActionsMenu(null);
      setProCameraMoreActionsMenu(null);
      if (isAddingNote) {
        const shadowBox = document.getElementById("shadow-box");
        if (shadowBox) {
          shadowBox.style.display = "none";
        }
        const position = reactFlowInstance?.screenToFlowPosition({
          x: event.clientX - shadowBoxWidth / 2,
          y: event.clientY - shadowBoxHeight / 2,
        });
        const data = {
          node: {
            description: "",
            display_name: "",
            documentation: "",
            template: {},
          },
          type: "note",
        };
        const newId = getNodeId(data.type);

        const newNode: NoteNodeType = {
          id: newId,
          type: "noteNode",
          position: position || { x: 0, y: 0 },
          data: {
            ...data,
            id: newId,
          },
        };
        setNodes((nds) => nds.concat(newNode));
        setIsAddingNote(false);
        // Signal sidebar to revert add_note active state
        window.dispatchEvent(new Event("lf:end-add-note"));
      }
    },
    [
      isAddingNote,
      setNodes,
      reactFlowInstance,
      getNodeId,
      setFilterEdge,
      setFilterComponent,
      setImageCreatorMoreActionsMenu,
      setVideoGeneratorMoreActionsMenu,
      setAudioCreatorMoreActionsMenu,
      setTextCreationMoreActionsMenu,
      setRightClickedNodeId,
    ],
  );

  const handleEdgeClick = (event, edge) => {
    if (isLocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const color =
      nodeColorsName[edge?.data?.sourceHandle?.output_types[0]] || "cyan";

    const accentColor = `hsl(var(--datatype-${color}))`;
    reactFlowWrapper.current?.style.setProperty("--selected", accentColor);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isLocked) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (event) => {
      if (isAddingNote) {
        const shadowBox = document.getElementById("shadow-box");
        if (shadowBox) {
          shadowBox.style.display = "block";
          shadowBox.style.left = `${event.clientX - shadowBoxWidth / 2}px`;
          shadowBox.style.top = `${event.clientY - shadowBoxHeight / 2}px`;
        }
      }
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [isAddingNote, shadowBoxWidth, shadowBoxHeight]);

  // Listen for a global event to start the add-note flow from outside components
  useEffect(() => {
    const handleStartAddNote = () => {
      setIsAddingNote(true);
      const shadowBox = document.getElementById("shadow-box");
      if (shadowBox) {
        shadowBox.style.display = "block";
        shadowBox.style.left = `${position.current.x - shadowBoxWidth / 2}px`;
        shadowBox.style.top = `${position.current.y - shadowBoxHeight / 2}px`;
      }
    };

    window.addEventListener("lf:start-add-note", handleStartAddNote);
    return () => {
      window.removeEventListener("lf:start-add-note", handleStartAddNote);
    };
  }, [shadowBoxWidth, shadowBoxHeight]);

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 2;
  const VIEW_MODE_DEFAULT_ZOOM = 0.4;
  const fitViewOptions = {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };

  // Always start with the minimap closed on each flow/view entry.
  useEffect(() => {
    useCanvasUiStore.getState().setMiniMapOpen(false);
  }, [id, view]);

  useEffect(() => {
    if (!view || !reactFlowInstance || nodes.length === 0) return;
    const frameId = window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: 0.16, duration: 0 });
      void reactFlowInstance.zoomTo(VIEW_MODE_DEFAULT_ZOOM, { duration: 180 });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [view, reactFlowInstance, currentFlowId, nodes.length]);

  return (
    <div className="h-full w-full bg-canvas" ref={reactFlowWrapper}>
      {showCanvas ? (
        <>
          <div id="react-flow-id" className="h-full w-full bg-canvas relative">
            <div className="absolute left-0 top-0 z-50 flex w-full justify-between p-4 pointer-events-none">
              <div className="flex items-center gap-4 pointer-events-auto">
                <Link to="/home" className="flex items-center gap-3 transition-opacity hover:opacity-85">
                  <img src="/branding/orangeflow-icon-512.png" alt="OrangeFlow icon" className="h-9 w-9 rounded-2xl object-cover" />
                </Link>
                <div className="flex h-10 items-center rounded-xl bg-white/5 px-2 backdrop-blur-sm shadow-sm border border-black/5 dark:border-white/10">
                  <FlowMenu />
                </div>
              </div>
              <div className="flex items-center gap-3 pointer-events-auto">
                <CreditsBalanceButton />
                <Button variant="secondary" className="h-10 rounded-full px-5 text-sm font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:bg-[#3D3D42]" style={{ backgroundColor: "#2E2E32" }}>
                  <IconComponent name="Sparkles" className="mr-1.5 h-[18px] w-[18px] text-yellow-500" />
                  社区
                </Button>
                <PublishDropdown />
              </div>
            </div>
            <MemoizedCanvasControls
              view={view}
              setIsAddingNote={setIsAddingNote}
              shadowBoxWidth={shadowBoxWidth}
              shadowBoxHeight={shadowBoxHeight}
            />
            <SelectionMenu
              lastSelection={lastSelection}
              isVisible={selectionMenuVisible}
              nodes={lastSelection?.nodes}
              onGroup={handleCreateOrMergeGroup}
              onUngroup={handleDissolveGroup}
              onCreateWorkflow={handleCreateWorkflowFromGroup}
            />
            {imageCreatorMoreActionsMenu && (
              <DoubaoImageCreatorMoreActionsMenu
                key={`${imageCreatorMoreActionsMenu.nodeId}:${imageCreatorMoreActionsMenu.x}:${imageCreatorMoreActionsMenu.y}`}
                open={true}
                nodeId={imageCreatorMoreActionsMenu.nodeId}
                position={{
                  x: imageCreatorMoreActionsMenu.x,
                  y: imageCreatorMoreActionsMenu.y,
                }}
                onOpenChange={(open) => {
                  if (!open) setImageCreatorMoreActionsMenu(null);
                }}
              />
            )}
            {videoGeneratorMoreActionsMenu && (
              <DoubaoVideoGeneratorMoreActionsMenu
                key={`${videoGeneratorMoreActionsMenu.nodeId}:${videoGeneratorMoreActionsMenu.x}:${videoGeneratorMoreActionsMenu.y}`}
                open={true}
                nodeId={videoGeneratorMoreActionsMenu.nodeId}
                position={{
                  x: videoGeneratorMoreActionsMenu.x,
                  y: videoGeneratorMoreActionsMenu.y,
                }}
                onOpenChange={(open) => {
                  if (!open) setVideoGeneratorMoreActionsMenu(null);
                }}
              />
            )}
            {audioCreatorMoreActionsMenu && (
              <DoubaoAudioMoreActionsMenu
                key={`${audioCreatorMoreActionsMenu.nodeId}:${audioCreatorMoreActionsMenu.x}:${audioCreatorMoreActionsMenu.y}`}
                open={true}
                nodeId={audioCreatorMoreActionsMenu.nodeId}
                position={{
                  x: audioCreatorMoreActionsMenu.x,
                  y: audioCreatorMoreActionsMenu.y,
                }}
                onOpenChange={(open) => {
                  if (!open) setAudioCreatorMoreActionsMenu(null);
                }}
              />
            )}
            {textCreationMoreActionsMenu && (
              <TextCreationMoreActionsMenu
                key={`${textCreationMoreActionsMenu.nodeId}:${textCreationMoreActionsMenu.x}:${textCreationMoreActionsMenu.y}`}
                open={true}
                nodeId={textCreationMoreActionsMenu.nodeId}
                position={{
                  x: textCreationMoreActionsMenu.x,
                  y: textCreationMoreActionsMenu.y,
                }}
                onOpenChange={(open) => {
                  if (!open) setTextCreationMoreActionsMenu(null);
                }}
              />
            )}
            {proCameraMoreActionsMenu && (
              <ProCameraMoreActionsMenu
                key={`${proCameraMoreActionsMenu.nodeId}:${proCameraMoreActionsMenu.x}:${proCameraMoreActionsMenu.y}`}
                open={true}
                nodeId={proCameraMoreActionsMenu.nodeId}
                position={{
                  x: proCameraMoreActionsMenu.x,
                  y: proCameraMoreActionsMenu.y,
                }}
                onOpenChange={(open) => {
                  if (!open) setProCameraMoreActionsMenu(null);
                }}
              />
            )}
            <ReactFlow<AllNodeType, EdgeType>
              nodes={nodes}
              edges={edges}
              onNodesChange={view ? undefined : onNodesChangeWithHelperLines}
              onEdgesChange={view ? undefined : onEdgesChange}
              onConnect={view || isLocked ? undefined : onConnectMod}
              // Requirement: dragging an unselected node must NOT change the selection set.
              // (Keep click-to-select behavior unchanged.)
              selectNodesOnDrag={false}
              // Disable click-to-connect globally; our "+" handles use click for menus.
              connectOnClick={false}
              disableKeyboardA11y={true}
              nodesFocusable={!isLocked && !view}
              edgesFocusable={!isLocked && !view}
              nodesDraggable={!view && !isLocked}
              nodesConnectable={!view && !isLocked}
              elementsSelectable={!view && !isLocked}
              onInit={setReactFlowInstance}
              nodeTypes={nodeTypes}
              defaultViewport={{
                x: 0,
                y: 0,
                zoom: view ? VIEW_MODE_DEFAULT_ZOOM : 1,
              }}
              onReconnect={view || isLocked ? undefined : onEdgeUpdate}
              onReconnectStart={view || isLocked ? undefined : onEdgeUpdateStart}
              onReconnectEnd={view || isLocked ? undefined : onEdgeUpdateEnd}
              onNodeDrag={view ? undefined : onNodeDrag}
              onNodeDragStart={view ? undefined : onNodeDragStart}
              onSelectionDragStart={view ? undefined : onSelectionDragStart}
              elevateEdgesOnSelect={false}
              onSelectionEnd={view ? undefined : onSelectionEnd}
              onSelectionStart={view ? undefined : onSelectionStart}
              selectionMode={SelectionMode.Partial}
              connectionRadius={30}
              edgeTypes={edgeTypes}
              connectionLineComponent={ConnectionLineComponent}
              onDragOver={view ? undefined : onDragOver}
              onNodeDragStop={view ? undefined : onNodeDragStop}
              onDrop={view ? undefined : onDrop}
              onSelectionChange={view ? undefined : onSelectionChange}
              deleteKeyCode={[]}
              nodeOrigin={[0, 0]}
              fitView={isEmptyFlow.current ? false : true}
              fitViewOptions={fitViewOptions}
              className="theme-attribution"
              tabIndex={isLocked ? -1 : undefined}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              zoomOnScroll
              zoomOnPinch
              panOnDrag
              panActivationKeyCode={""}
              proOptions={{ hideAttribution: true }}
              onPaneClick={onPaneClick}
              onEdgeClick={handleEdgeClick}
              onKeyDown={handleKeyDown}
              onNodeContextMenu={onNodeContextMenu}
            >
              <UpdateAllComponents />
              <MemoizedBackground />
              {helperLineEnabled && <HelperLines helperLines={helperLines} />}
              <CanvasMiniMap />
              {!view && <CanvasAssistantLauncher />}
              {!view && <CanvasAssistantDrawer />}
            </ReactFlow>
          </div>
          <div
            id="shadow-box"
            style={{
              position: "absolute",
              width: `${shadowBoxWidth}px`,
              height: `${shadowBoxHeight}px`,
              backgroundColor: `${shadowBoxBackgroundColor}`,
              opacity: 0.7,
              pointerEvents: "none",
              // Prevent shadow-box from showing unexpectedly during initial renders
              display: "none",
            }}
          ></div>
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <CustomLoader remSize={30} />
        </div>
      )}
      <ExportModal open={openExportModal} setOpen={setOpenExportModal} />
    </div>
  );
}
