import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { cloneDeep, zip } from "lodash";
import { create } from "zustand";
import { checkCodeValidity } from "@/CustomNodes/helpers/check-code-validity";
import { MISSED_ERROR_ALERT } from "@/constants/alerts_constants";
import { BROKEN_EDGES_WARNING } from "@/constants/constants";
import { ENABLE_DATASTAX_LANGFLOW } from "@/customization/feature-flags";
import {
  track,
  trackDataLoaded,
  trackFlowBuild,
} from "@/customization/utils/analytics";
import { t } from "@/i18n/t";
import { brokenEdgeMessage } from "@/utils/utils";
import { BuildStatus, EventDeliveryType } from "../constants/enums";
import type { LogsLogType, VertexBuildTypeAPI } from "../types/api";
import type { ChatInputType, ChatOutputType } from "../types/chat";
import type {
  AllNodeType,
  EdgeType,
  NodeDataType,
  sourceHandleType,
  targetHandleType,
} from "../types/flow";
import type {
  ComponentsToUpdateType,
  FlowStoreType,
  VertexLayerElementType,
} from "../types/zustand/flow";
import { buildFlowVerticesWithFallback } from "../utils/buildUtils";
import {
  buildPositionDictionary,
  checkChatInput,
  cleanEdges,
  detectBrokenEdgesEdges,
  getConnectedSubgraph,
  getDoubaoVideoModelName,
  getHandleId,
  canAddImageRole,
  getImageRoleCounts,
  getImageRoleLimits,
  getNodeId,
  IMAGE_ROLE_FIELD,
  IMAGE_ROLE_TARGET,
  pickImageRoleForNewEdge,
  scapedJSONStringfy,
  scapeJSONParse,
  unselectAllNodesEdges,
  updateGroupRecursion,
  validateEdge,
  validateNodes,
} from "../utils/reactflowUtils";
import {
  dissolveSmallGroups,
  getAbsolutePosition,
  isGroupContainerNode,
  sortNodesByParentDepth,
} from "../utils/groupingUtils";
import { getInputsAndOutputs } from "../utils/storeUtils";
import useAlertStore from "./alertStore";
import { useDarkStore } from "./darkStore";
import useFlowsManagerStore from "./flowsManagerStore";
import { useGlobalVariablesStore } from "./globalVariablesStore/globalVariables";
import { useTweaksStore } from "./tweaksStore";
import { useTypesStore } from "./typesStore";

// this is our useStore hook that we can use in our components to get parts of the store and call actions
const useFlowStore = create<FlowStoreType>((set, get) => ({
  playgroundPage: false,
  setPlaygroundPage: (playgroundPage) => {
    set({ playgroundPage });
  },
  positionDictionary: {},
  setPositionDictionary: (positionDictionary) => {
    set({ positionDictionary });
  },
  isPositionAvailable: (position: { x: number; y: number }) => {
    if (
      get().positionDictionary[position.x] &&
      get().positionDictionary[position.x] === position.y
    ) {
      return false;
    }
    return true;
  },
  fitViewNode: (nodeId) => {
    if (get().reactFlowInstance && get().nodes.find((n) => n.id === nodeId)) {
      get().reactFlowInstance?.fitView({ nodes: [{ id: nodeId }] });
    }
  },
  autoSaveFlow: undefined,
  componentsToUpdate: [],
  setComponentsToUpdate: (change) => {
    const newChange =
      typeof change === "function" ? change(get().componentsToUpdate) : change;
    set({ componentsToUpdate: newChange });
  },
  updateComponentsToUpdate: (nodes) => {
    const outdatedNodes: ComponentsToUpdateType[] = [];
    const templates = useTypesStore.getState().templates;
    nodes.forEach((node) => {
      if (node.type === "genericNode") {
        const codeValidity = checkCodeValidity(node.data, templates);
        if (codeValidity && codeValidity.outdated)
          outdatedNodes.push({
            id: node.id,
            icon: node.data.node?.icon,
            display_name: node.data.node?.display_name,
            outdated: codeValidity.outdated,
            breakingChange: codeValidity.breakingChange,
            userEdited: codeValidity.userEdited,
          });
      }
    });
    set({ componentsToUpdate: outdatedNodes });
  },
  onFlowPage: false,
  setOnFlowPage: (FlowPage) => set({ onFlowPage: FlowPage }),
  flowState: undefined,
  flowBuildStatus: {},
  nodes: [],
  edges: [],
  isBuilding: false,
  stopBuilding: () => {
    get().buildController.abort();
    get().updateEdgesRunningByNodes(
      get().nodes.map((n) => n.id),
      false,
    );
    set({ isBuilding: false });
    get().revertBuiltStatusFromBuilding();
    useAlertStore.getState().setErrorData({
      title: "Build stopped",
    });
  },
  isPending: true,
  setHasIO: (hasIO) => {
    set({ hasIO });
  },
  reactFlowInstance: null,
  lastCopiedSelection: null,
  flowPool: {},
  setInputs: (inputs) => {
    set({ inputs });
  },
  setOutputs: (outputs) => {
    set({ outputs });
  },
  inputs: [],
  outputs: [],
  hasIO: get()?.inputs?.length > 0 || get()?.outputs?.length > 0,
  setFlowPool: (flowPool) => {
    set({ flowPool });
  },
  clearFlowPoolForNodes: (nodeIds: string[]) => {
    if (!nodeIds?.length) return;
    set((state) => {
      const newFlowPool = cloneDeep(state.flowPool);
      nodeIds.forEach((id) => {
        if (id in newFlowPool) {
          delete newFlowPool[id];
        }
      });
      return { flowPool: newFlowPool };
    });
  },
  updateToolMode: (nodeId: string, toolMode: boolean) => {
    get().setNode(nodeId, (node) => {
      const newNode = cloneDeep(node);
      if (newNode.type === "genericNode") {
        newNode.data.node!.tool_mode = toolMode;
      }
      return newNode;
    });
  },
  updateFreezeStatus: (nodeIds: string[], freeze: boolean) => {
    get().setNodes((oldNodes) => {
      const newNodes = cloneDeep(oldNodes);
      return newNodes.map((node) => {
        if (nodeIds.includes(node.id)) {
          (node.data as NodeDataType).node!.frozen = freeze;
        }
        return node;
      });
    });
  },
  addDataToFlowPool: (data: VertexBuildTypeAPI, nodeId: string) => {
    const newFlowPool = cloneDeep({ ...get().flowPool });
    if (!newFlowPool[nodeId]) newFlowPool[nodeId] = [data];
    else {
      newFlowPool[nodeId].push(data);
    }
    get().setFlowPool(newFlowPool);
  },
  getNodePosition: (nodeId: string) => {
    const node = get().nodes.find((node) => node.id === nodeId);
    return node?.position || { x: 0, y: 0 };
  },
  updateFlowPool: (
    nodeId: string,
    data: VertexBuildTypeAPI | ChatOutputType | ChatInputType,
    buildId?: string,
  ) => {
    const newFlowPool = cloneDeep({ ...get().flowPool });
    if (!newFlowPool[nodeId]) {
      return;
    } else {
      let index = newFlowPool[nodeId].length - 1;
      if (buildId) {
        index = newFlowPool[nodeId].findIndex((flow) => flow.id === buildId);
      }
      //check if the data is a flowpool object
      if ((data as VertexBuildTypeAPI).valid !== undefined) {
        newFlowPool[nodeId][index] = data as VertexBuildTypeAPI;
      }
      //update data results
      else {
        newFlowPool[nodeId][index].data.message = data as
          | ChatOutputType
          | ChatInputType;
      }
    }
    get().setFlowPool(newFlowPool);
  },
  CleanFlowPool: () => {
    get().setFlowPool({});
  },
  setPending: (isPending) => {
    set({ isPending });
  },
  resetFlow: (flow) => {
    const nodes = cloneDeep(flow?.data?.nodes ?? []);
    const edges = cloneDeep(flow?.data?.edges ?? []);

    // Backward-compat: some custom layouts (e.g., TextCreation preview input) render handles for fields that are
    // hidden in the template. If the template keeps `show=false`, edges get removed on reload by clean-up logic.
    nodes.forEach((node) => {
      if (node.type !== "genericNode") return;
      const componentType = node.data?.type;
      const template = node.data.node?.template as any;
      if (!template) return;

      if (componentType === "TextCreation") {
        if (template?.draft_text) {
          template.draft_text.show = true;
        }
        if (template?.prompt) {
          template.prompt.required = false;
        }
        return;
      }

      // Bridge-mode compatibility: older saved flows might have prompt/text marked as required, which causes
      // validation to fail before bridge-mode logic runs in the backend.
      if (componentType === "DoubaoVideoGenerator") {
        if (template?.prompt) {
          template.prompt.required = false;
        }
        // Ensure the wan audio input can be connected/persisted; hidden fields drop edges on reload.
        if (template?.audio_input) {
          template.audio_input.show = true;
        }
      }

      if (componentType === "DoubaoImageCreator") {
        if (template?.prompt) {
          template.prompt.required = false;
        }
      }

      if (componentType === "DoubaoTTS") {
        if (template?.text) {
          template.text.required = false;
        }
        if (template?.draft_output) {
          template.draft_output.show = true;
        }
      }

      // Ensure preview cache field exists for bridge-mode passthrough (hidden, no UI impact).
      if (
        componentType === "DoubaoVideoGenerator" ||
        componentType === "DoubaoImageCreator" ||
        componentType === "DoubaoTTS"
      ) {
        if (!template.draft_output) {
          template.draft_output = {
            type: "Data",
            required: false,
            placeholder: "",
            list: false,
            show: componentType === "DoubaoTTS",
            readonly: false,
            value: {},
            input_types: ["Data"],
            name: "draft_output",
            display_name: "预览缓存",
          };
        }
      }
    });
    const brokenEdges = detectBrokenEdgesEdges(nodes, edges);
    if (brokenEdges.length > 0) {
      useAlertStore.getState().setErrorData({
        title: BROKEN_EDGES_WARNING,
        list: brokenEdges.map((edge) => brokenEdgeMessage(edge)),
      });
    }
    const newEdges = cleanEdges(nodes, edges);
    const { inputs, outputs } = getInputsAndOutputs(nodes);
    get().updateComponentsToUpdate(nodes);

    const safeParseStringArray = (raw: string | null, key: string) => {
      if (!raw) return [] as string[];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as string[]) : ([] as string[]);
      } catch (e) {
        console.warn(`Failed to parse ${key} from localStorage; resetting.`, e);
        localStorage.removeItem(key);
        return [] as string[];
      }
    };
    set({
      dismissedNodes: safeParseStringArray(
        localStorage.getItem(`dismiss_${flow?.id}`),
        `dismiss_${flow?.id}`,
      ),
      dismissedNodesLegacy: safeParseStringArray(
        localStorage.getItem(`dismiss_legacy_${flow?.id}`),
        `dismiss_legacy_${flow?.id}`,
      ),
    });
    unselectAllNodesEdges(nodes, newEdges);
    if (flow?.id) {
      useTweaksStore.getState().initialSetup(nodes, flow?.id);
    }
    set({
      nodes,
      edges: newEdges,
      flowState: undefined,
      buildInfo: null,
      inputs,
      outputs,
      hasIO: inputs.length > 0 || outputs.length > 0,
      flowPool: {},
      currentFlow: flow,
      positionDictionary: {},
      rightClickedNodeId: null,
    });
  },
  setIsBuilding: (isBuilding) => {
    set({ isBuilding });
  },
  setFlowState: (flowState) => {
    const newFlowState =
      typeof flowState === "function" ? flowState(get().flowState) : flowState;

    if (newFlowState !== get().flowState) {
      set(() => ({
        flowState: newFlowState,
      }));
    }
  },
  setReactFlowInstance: (newState) => {
    set({ reactFlowInstance: newState });
  },
  onNodesChange: (changes: NodeChange<AllNodeType>[]) => {
    const updated = applyNodeChanges(changes, get().nodes);

    // Normalize: we don't constrain group children with `extent: 'parent'` / `expandParent`.
    // Important: avoid cloning every nested node on every drag tick; only touch nodes that
    // actually carry these props to keep XYFlow dragging stable.
    const normalized = updated.map((n) => {
      // Keep group containers behind edges/nodes.
      const shouldFixZ = (n as any).type === "groupNode" && (n as any).zIndex !== -100;

      if (!n.parentId) {
        if (!shouldFixZ) return n;
        const style: any = { ...((n as any).style ?? {}), zIndex: -100 };
        return { ...(n as any), zIndex: -100, style };
      }

      const hasExtent = Object.prototype.hasOwnProperty.call(n as any, "extent");
      const hasExpand = Object.prototype.hasOwnProperty.call(n as any, "expandParent");
      if (!hasExtent && !hasExpand && !shouldFixZ) return n;

      const nn: any = { ...n };
      delete nn.extent;
      delete nn.expandParent;
      if (shouldFixZ) {
        nn.zIndex = -100;
        nn.style = { ...(nn.style ?? {}), zIndex: -100 };
      }
      return nn;
    });

    // XYFlow derives child absolute positions from parent internals, but it may skip recomputing
    // unchanged child nodes when only the parent object changes. If a group container moves,
    // we "touch" its descendants (shallow clone) so they re-render and follow the parent.
    const nodeById = new Map(normalized.map((n) => [n.id, n]));
    const movedGroupIds = new Set(
      changes
        .filter((c) => c.type === "position" && !!(nodeById.get(c.id as string) as any))
        .map((c) => c.id as string)
        .filter((id) => nodeById.get(id)?.type === "groupNode"),
    );

    if (movedGroupIds.size > 0) {
      const childrenByParent = new Map<string, string[]>();
      for (const n of normalized) {
        if (!n.parentId) continue;
        const arr = childrenByParent.get(n.parentId) ?? [];
        arr.push(n.id);
        childrenByParent.set(n.parentId, arr);
      }

      const descendantIds = new Set<string>();
      const queue = Array.from(movedGroupIds);
      while (queue.length) {
        const gid = queue.pop()!;
        const kids = childrenByParent.get(gid) ?? [];
        for (const kid of kids) {
          if (descendantIds.has(kid)) continue;
          descendantIds.add(kid);
          if (nodeById.get(kid)?.type === "groupNode") queue.push(kid);
        }
      }

      const touched = normalized.map((n) => (descendantIds.has(n.id) ? { ...n } : n));

      // Keep parent-before-child ordering if it ever becomes invalid (older flows or edge cases).
      const indexById = new Map(touched.map((n, idx) => [n.id, idx]));
      const needsSort = touched.some((n) => {
        if (!n.parentId) return false;
        const p = indexById.get(n.parentId);
        const c = indexById.get(n.id);
        return typeof p === "number" && typeof c === "number" ? p > c : false;
      });

      set({ nodes: needsSort ? sortNodesByParentDepth(touched) : touched });
      return;
    }

    const indexById = new Map(normalized.map((n, idx) => [n.id, idx]));
    const needsSort = normalized.some((n) => {
      if (!n.parentId) return false;
      const p = indexById.get(n.parentId);
      const c = indexById.get(n.id);
      return typeof p === "number" && typeof c === "number" ? p > c : false;
    });

    set({ nodes: needsSort ? sortNodesByParentDepth(normalized) : normalized });
  },
  onEdgesChange: (changes: EdgeChange<EdgeType>[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  setNodes: (change) => {
    const newChangeRaw =
      typeof change === "function" ? change(get().nodes) : change;

    // Normalize group containers: auto-dissolve groups with <= 1 member.
    const withoutExtent = (newChangeRaw as AllNodeType[]).map((n) => {
      if (!n.parentId) return n;
      const nn: any = { ...n };
      delete nn.extent;
      delete nn.expandParent;
      return nn;
    });

    const newChange = sortNodesByParentDepth(
      dissolveSmallGroups(withoutExtent).map((n) => {
        if (n.type !== "groupNode") return n;
        const style: any = { ...((n as any).style ?? {}), zIndex: -100 };
        return { ...(n as any), zIndex: -100, style };
      }),
    );

    const newEdges = cleanEdges(newChange, get().edges);
    const { inputs, outputs } = getInputsAndOutputs(newChange);
    get().updateComponentsToUpdate(newChange);
    set({
      edges: newEdges,
      nodes: newChange,
      flowState: undefined,
      inputs,
      outputs,
      hasIO: inputs.length > 0 || outputs.length > 0,
    });
    get().updateCurrentFlow({ nodes: newChange, edges: newEdges });
    if (get().autoSaveFlow) {
      get().autoSaveFlow!();
    }
  },
  setEdges: (change) => {
    const newChange =
      typeof change === "function" ? change(get().edges) : change;
    set({
      edges: newChange,
      flowState: undefined,
    });
    get().updateCurrentFlow({ edges: newChange });
    if (get().autoSaveFlow) {
      get().autoSaveFlow!();
    }
  },
  setNode: (
    id: string,
    change: AllNodeType | ((oldState: AllNodeType) => AllNodeType),
    isUserChange: boolean = true,
    callback?: () => void,
  ) => {
    if (!get().nodes.find((node) => node.id === id)) {
      throw new Error("Node not found");
    }

    const newChange =
      typeof change === "function"
        ? change(get().nodes.find((node) => node.id === id)!)
        : change;

    const newNodes = get().nodes.map((node) => {
      if (node.id === id) {
        if (isUserChange) {
          if ((node.data as NodeDataType).node?.frozen) {
            (newChange.data as NodeDataType).node!.frozen = false;
          }
        }
        return newChange;
      }
      return node;
    });

    const newEdges = cleanEdges(newNodes, get().edges);

    set((state) => {
      if (callback) {
        // Defer the callback execution to ensure it runs after state updates are fully applied.
        queueMicrotask(callback);
      }
      return {
        ...state,
        nodes: newNodes,
        edges: newEdges,
      };
    });
    get().updateCurrentFlow({ nodes: newNodes, edges: newEdges });
    if (get().autoSaveFlow) {
      get().autoSaveFlow!();
    }
  },
  getNode: (id: string) => {
    return get().nodes.find((node) => node.id === id);
  },
  deleteNode: (nodeId) => {
    const { filteredNodes, deletedNode } = get().nodes.reduce<{
      filteredNodes: AllNodeType[];
      deletedNode: AllNodeType | null;
    }>(
      (acc, node) => {
        const isMatch =
          typeof nodeId === "string"
            ? node.id === nodeId
            : nodeId.includes(node.id);

        if (isMatch) {
          acc.deletedNode = node;
        } else {
          acc.filteredNodes.push(node);
        }

        return acc;
      },
      { filteredNodes: [], deletedNode: null },
    );

    get().setNodes(filteredNodes);

    // Clear rightClickedNodeId if the deleted node was right-clicked
    const rightClickedNodeId = get().rightClickedNodeId;
    if (rightClickedNodeId && deletedNode) {
      const isRightClickedNodeDeleted =
        typeof nodeId === "string"
          ? nodeId === rightClickedNodeId
          : nodeId.includes(rightClickedNodeId);

      if (isRightClickedNodeDeleted) {
        set({ rightClickedNodeId: null });
      }
    }

    if (deletedNode) {
      track("Component Deleted", { componentType: deletedNode.data.type });
    }
  },
  deleteEdge: (edgeId) => {
    get().setEdges(
      get().edges.filter((edge) =>
        typeof edgeId === "string"
          ? edge.id !== edgeId
          : !edgeId.includes(edge.id),
      ),
    );
    track("Component Connection Deleted", { edgeId });
  },
  paste: (selection, position) => {
    if (get().currentFlow?.locked) return;
    // Collect IDs of nodes in the selection
    const selectedNodeIds = new Set(selection.nodes.map((node) => node.id));
    // Find existing edges in the flow that connect nodes within the selection
    const existingEdgesToCopy = get().edges.filter((edge) => {
      return (
        selectedNodeIds.has(edge.source) &&
        selectedNodeIds.has(edge.target) &&
        !selection.edges.some((selEdge) => selEdge.id === edge.id)
      );
    });
    // Add these edges to the selection's edges
    if (existingEdgesToCopy.length > 0) {
      selection.edges = selection.edges.concat(existingEdgesToCopy);
    }

    if (
      selection.nodes.some((node) => node.data.type === "ChatInput") &&
      checkChatInput(get().nodes)
    ) {
      useAlertStore.getState().setNoticeData({
        title: "You can only have one Chat Input component in a flow.",
      });
      selection.nodes = selection.nodes.filter(
        (node) => node.data.type !== "ChatInput",
      );
      selection.edges = selection.edges.filter(
        (edge) =>
          selection.nodes.some((node) => edge.source === node.id) &&
          selection.nodes.some((node) => edge.target === node.id),
      );
    }

    let minimumX = Infinity;
    let minimumY = Infinity;
    const idsMap: Record<string, string> = {};
    const absPosById = new Map<string, { x: number; y: number }>();

    // `selection.nodes[*].position` is treated as absolute position (see setLastCopiedSelection).
    selection.nodes.forEach((node: AllNodeType) => {
      absPosById.set(node.id, { x: node.position.x, y: node.position.y });
      minimumX = Math.min(minimumX, node.position.x);
      minimumY = Math.min(minimumY, node.position.y);
    });

    // Build the old->new id map first so parentId remapping works regardless of node order.
    selection.nodes.forEach((node: AllNodeType) => {
      idsMap[node.id] = getNodeId((node.data as any)?.type ?? node.type ?? "node");
    });

    let newNodes: AllNodeType[] = get().nodes;
    let newEdges = get().edges;

    const insidePosition = position.paneX
      ? { x: position.paneX + position.x, y: position.paneY! + position.y }
      : get().reactFlowInstance!.screenToFlowPosition({
          x: position.x,
          y: position.y,
        });

    let internalPostionDictionary = get().positionDictionary;
    if (Object.keys(internalPostionDictionary).length === 0) {
      internalPostionDictionary = buildPositionDictionary(get().nodes);
    }
    while (!get().isPositionAvailable(insidePosition)) {
      insidePosition.x += 10;
      insidePosition.y += 10;
    }
    internalPostionDictionary[insidePosition.x] = insidePosition.y;
    get().setPositionDictionary(internalPostionDictionary);

    selection.nodes.forEach((node: AllNodeType) => {
      const newId = idsMap[node.id]!;
      const oldAbs = absPosById.get(node.id)!;

      const oldParentId = (node as any).parentId as string | undefined;
      const newParentId = oldParentId && idsMap[oldParentId] ? idsMap[oldParentId] : undefined;

      const newNode: any = {
        ...cloneDeep(node),
        id: newId,
        data: { ...cloneDeep(node.data), id: newId },
        selected: true,
      };

      if (newParentId) {
        const parentAbs = absPosById.get(oldParentId!) ?? { x: 0, y: 0 };
        newNode.parentId = newParentId;
        newNode.position = { x: oldAbs.x - parentAbs.x, y: oldAbs.y - parentAbs.y };
        delete newNode.extent;
        delete newNode.expandParent;
      } else {
        newNode.parentId = undefined;
        newNode.position = {
          x: insidePosition.x + oldAbs.x - minimumX,
          y: insidePosition.y + oldAbs.y - minimumY,
        };
        delete newNode.extent;
        delete newNode.expandParent;
      }

      updateGroupRecursion(
        newNode,
        selection.edges,
        useGlobalVariablesStore.getState().unavailableFields,
        useGlobalVariablesStore.getState().globalVariablesEntries,
      );

      // Add the new node to the list of nodes in state
      newNodes = newNodes
        .map((node) => ({ ...node, selected: false }))
        .concat({ ...newNode, selected: true });
    });
    get().setNodes(newNodes);

    selection.edges.forEach((edge: EdgeType) => {
      const source = idsMap[edge.source];
      const target = idsMap[edge.target];
      const sourceHandleObject: sourceHandleType = scapeJSONParse(
        edge.sourceHandle!,
      );
      const sourceHandle = scapedJSONStringfy({
        ...sourceHandleObject,
        id: source,
      });
      sourceHandleObject.id = source;

      const targetHandleObject: targetHandleType = scapeJSONParse(
        edge.targetHandle!,
      );
      const targetHandle = scapedJSONStringfy({
        ...targetHandleObject,
        id: target,
      });
      targetHandleObject.id = target;

      edge.data = {
        sourceHandle: sourceHandleObject,
        targetHandle: targetHandleObject,
        imageRole: edge.data?.imageRole,
        videoReferType: edge.data?.videoReferType,
      };

      const id = getHandleId(source, sourceHandle, target, targetHandle);
      newEdges = addEdge(
        {
          source,
          target,
          sourceHandle,
          targetHandle,
          id,
          data: cloneDeep(edge.data),
          selected: false,
        },
        newEdges.map((edge) => ({ ...edge, selected: false })),
      );
    });
    get().setEdges(newEdges);
  },
  setLastCopiedSelection: (newSelection, isCrop = false) => {
    if (!newSelection) {
      set({ lastCopiedSelection: newSelection });
      return;
    }

    // Expand group container selection: copying a group should include all descendants.
    const storeNodes = get().nodes;
    const storeEdges = get().edges;
    const nodeById = new Map(storeNodes.map((n) => [n.id, n]));

    const initialIds = new Set(newSelection.nodes.map((n) => n.id));
    const expandedIds = new Set(initialIds);
    const queue = Array.from(initialIds);

    while (queue.length) {
      const currentId = queue.pop()!;
      const current = nodeById.get(currentId);
      if (!current || !isGroupContainerNode(current)) continue;
      for (const child of storeNodes) {
        if (child.parentId !== currentId) continue;
        if (expandedIds.has(child.id)) continue;
        expandedIds.add(child.id);
        queue.push(child.id);
      }
    }

    const expandedNodes = Array.from(expandedIds)
      .map((id) => nodeById.get(id))
      .filter(Boolean)
      .map((n) => {
        const abs = getAbsolutePosition(n!, nodeById);
        return { ...cloneDeep(n!), position: abs };
      });

    const expandedEdges = storeEdges
      .filter((e) => expandedIds.has(e.source) && expandedIds.has(e.target))
      .map((e) => ({ ...cloneDeep(e), selected: false }));

    const selection = {
      ...newSelection,
      nodes: expandedNodes,
      edges: expandedEdges,
    };

    if (isCrop) {
      const nodesIdsSelected = selection.nodes.map((node) => node.id);
      const edgesIdsSelected = selection.edges.map((edge) => edge.id);

      nodesIdsSelected.forEach((id) => {
        get().deleteNode(id);
      });

      edgesIdsSelected.forEach((id) => {
        get().deleteEdge(id);
      });

      const newNodes = get().nodes.filter(
        (node) => !nodesIdsSelected.includes(node.id),
      );
      const newEdges = get().edges.filter(
        (edge) => !edgesIdsSelected.includes(edge.id),
      );

      set({ nodes: newNodes, edges: newEdges });
    }

    set({ lastCopiedSelection: selection });
  },
  cleanFlow: () => {
    set({
      nodes: [],
      edges: [],
      flowState: undefined,
      getFilterEdge: [],
    });
  },
  setFilterEdge: (newState) => {
    if (newState.length === 0) {
      set({ filterType: undefined });
    }
    set({ getFilterEdge: newState });
  },
  getFilterEdge: [],
  setFilterComponent: (newState) => {
    set({ getFilterComponent: newState });
  },
  getFilterComponent: "",
  rightClickedNodeId: null,
  setRightClickedNodeId: (nodeId) => {
    set({ rightClickedNodeId: nodeId });
  },
  onConnect: (connection) => {
    const _dark = useDarkStore.getState().dark;
    const setErrorData = useAlertStore.getState().setErrorData;
    // const commonMarkerProps = {
    //   type: MarkerType.ArrowClosed,
    //   width: 20,
    //   height: 20,
    //   color: dark ? "#555555" : "#000000",
    // };

    // const inputTypes = INPUT_TYPES;
    // const outputTypes = OUTPUT_TYPES;

    // const findNode = useFlowStore
    //   .getState()
    //   .nodes.find(
    //     (node) => node.id === connection.source || node.id === connection.target
    //   );

    // const sourceType = findNode?.data?.type;
    // let isIoIn = false;
    // let isIoOut = false;
    // if (sourceType) {
    //   isIoIn = inputTypes.has(sourceType);
    //   isIoOut = outputTypes.has(sourceType);
    // }

    let newEdges: EdgeType[] = [];
    get().setEdges((oldEdges) => {
      // Normalize/massage connections before applying edge-role logic.
      // (e.g. allow dropping audio onto the video's "+" input bubble, but route it to audio_input.)
      let normalizedConnection = connection;
      let targetHandle = scapeJSONParse(connection.targetHandle!);
      const sourceHandle = scapeJSONParse(connection.sourceHandle!);
      const sourceNode = get().nodes.find((node) => node.id === connection.source);
      const targetNode = get().nodes.find(
        (node) => node.id === connection.target,
      );
      let targetFieldName = targetHandle?.fieldName ?? targetHandle?.name;
      const resolvedSourceType =
        sourceNode?.data?.type ?? (sourceHandle?.dataType as string | undefined);

      // Prevent invalid semantic connections: audio output should not connect to image inputs.
      // If the user drops audio onto the video's "+" input bubble (which is the first_frame_image
      // handle for historical reasons), transparently route it to audio_input instead.
      if (
        targetNode?.data?.type === IMAGE_ROLE_TARGET &&
        (targetFieldName === IMAGE_ROLE_FIELD ||
          targetFieldName === "last_frame_image") &&
        resolvedSourceType === "DoubaoTTS"
      ) {
        const audioField = targetNode?.data?.node?.template?.["audio_input"];
        if (!audioField) {
          setErrorData({
            title: "不支持的连接",
            list: [
              "音频合成的输出是音频，不能连接到视频创作的图片输入（首帧/尾帧）。请连接到“音频输入”。",
            ],
          });
          return oldEdges;
        }

        const inputTypes =
          audioField.input_types && audioField.input_types.length > 0
            ? audioField.input_types
            : ["Data"];
        const resolvedType = audioField.type ?? "data";
        targetHandle = {
          inputTypes,
          type: resolvedType,
          id: connection.target,
          fieldName: "audio_input",
          ...(audioField.proxy ? { proxy: audioField.proxy } : {}),
        };
        targetFieldName = "audio_input";
        normalizedConnection = {
          ...connection,
          targetHandle: scapedJSONStringfy(targetHandle),
        };
      }

      // If the user drops TextCreation output onto the video generator's image "+" bubble,
      // route it to the text prompt input instead (avoid creating an invalid "首帧/参考" edge).
      if (
        targetNode?.data?.type === IMAGE_ROLE_TARGET &&
        (targetFieldName === IMAGE_ROLE_FIELD ||
          targetFieldName === "last_frame_image") &&
        resolvedSourceType === "TextCreation"
      ) {
        const promptField = targetNode?.data?.node?.template?.["prompt"];
        if (!promptField) {
          setErrorData({
            title: 'Unsupported connection',
            list: [
              'TextCreation output cannot connect to first/last frame image inputs. Please connect it to the video prompt input.',
            ],
          });
          return oldEdges;
        }

        const inputTypes =
          promptField.input_types && promptField.input_types.length > 0
            ? promptField.input_types
            : ["Message", "Data", "Text"];
        const resolvedType = promptField.type ?? "data";
        targetHandle = {
          inputTypes,
          type: resolvedType,
          id: connection.target,
          fieldName: "prompt",
          ...(promptField.proxy ? { proxy: promptField.proxy } : {}),
        };
        targetFieldName = "prompt";
        normalizedConnection = {
          ...normalizedConnection,
          targetHandle: scapedJSONStringfy(targetHandle),
        };
      }

      const modelName = getDoubaoVideoModelName(targetNode);
      const isTargetKling = modelName.toLowerCase().startsWith("kling");

      const isVideoBridgeEdge =
        targetFieldName === IMAGE_ROLE_FIELD &&
        sourceNode?.data?.type === IMAGE_ROLE_TARGET &&
        targetNode?.data?.type === IMAGE_ROLE_TARGET;

      // Kling O1 has combined media limits on its image_list/video_list. Enforce early so
      // the UI can't create invalid edges that later fail at runtime.
      if (targetNode?.data?.type === IMAGE_ROLE_TARGET && isTargetKling) {
        const safeGetTargetFieldName = (edge: EdgeType): string | undefined => {
          const th = edge.data?.targetHandle;
          if (th && typeof th === "object") return th.fieldName ?? th.name;
          if (!edge.targetHandle) return undefined;
          try {
            const parsed = scapeJSONParse(edge.targetHandle);
            return parsed?.fieldName ?? parsed?.name;
          } catch {
            return undefined;
          }
        };

        const isVideoRefString = (raw: unknown): boolean => {
          if (!raw) return false;
          const s =
            typeof raw === "string"
              ? raw
              : typeof raw === "object"
                ? // common shapes
                  String((raw as any).path ?? (raw as any).file_path ?? (raw as any).value ?? "")
                : String(raw);
          const normalized = s.trim().toLowerCase();
          if (!normalized) return false;
          const path = normalized.split("?", 1)[0].split("#", 1)[0];
          return path.endsWith(".mp4") || path.endsWith(".mov");
        };

        const countLocalFirstFrameMedia = () => {
          const template = targetNode?.data?.node?.template ?? {};
          const field = template?.[IMAGE_ROLE_FIELD];
          if (!field) return { images: 0, videos: 0 };
          const values = Array.isArray(field.value)
            ? field.value
            : field.value !== undefined && field.value !== null
              ? [field.value]
              : [];
          const paths = Array.isArray(field.file_path)
            ? field.file_path
            : field.file_path !== undefined && field.file_path !== null
              ? [field.file_path]
              : [];
          const length = Math.max(values.length, paths.length);
          let images = 0;
          let videos = 0;
          for (let i = 0; i < length; i += 1) {
            const candidate = paths[i] ?? values[i];
            if (!candidate) continue;
            if (isVideoRefString(candidate)) videos += 1;
            else images += 1;
          }
          return { images, videos };
        };

        const hasLocalLastFrame = () => {
          const template = targetNode?.data?.node?.template ?? {};
          const field = template?.["last_frame_image"];
          if (!field) return false;
          const value = field.value ?? field.file_path;
          if (Array.isArray(value)) return value.some((v) => Boolean(v));
          return Boolean(value);
        };

        const local = countLocalFirstFrameMedia();
        const existingFirstFrameEdges = oldEdges.filter((edge) => {
          if (edge.target !== connection.target) return false;
          const fieldName = safeGetTargetFieldName(edge);
          return fieldName === IMAGE_ROLE_FIELD;
        });
        const existingVideoEdges = existingFirstFrameEdges.filter((edge) => {
          const src = get().nodes.find((node) => node.id === edge.source);
          return src?.data?.type === IMAGE_ROLE_TARGET;
        }).length;
        const existingImageEdges = Math.max(existingFirstFrameEdges.length - existingVideoEdges, 0);

        const hasExistingLastFrameEdge = oldEdges.some((edge) => {
          if (edge.target !== connection.target) return false;
          const fieldName = safeGetTargetFieldName(edge);
          return fieldName === "last_frame_image";
        });
        const hasExistingLastFrame = Boolean(hasExistingLastFrameEdge || hasLocalLastFrame());

        const connectingToFirstFrame = targetFieldName === IMAGE_ROLE_FIELD;
        const connectingToLastFrame = targetFieldName === "last_frame_image";
        const addingVideo = Boolean(connectingToFirstFrame && isVideoBridgeEdge);
        const addingImage =
          Boolean(connectingToFirstFrame && !isVideoBridgeEdge) || Boolean(connectingToLastFrame);

        if (connectingToLastFrame && hasExistingLastFrame) {
          setErrorData({
            title: "尾帧输入已存在",
            list: ["kling O1：尾帧输入只能设置 1 个。请先清空/移除现有尾帧后再连接。"],
          });
          return oldEdges;
        }

        const videosAfter = existingVideoEdges + local.videos + (addingVideo ? 1 : 0);
        if (videosAfter > 1) {
          setErrorData({
            title: "参考视频数量超限",
            list: ["kling O1：最多仅支持 1 段参考视频（MP4/MOV）。请移除多余连接或删除本地视频后再试。"],
          });
          return oldEdges;
        }

        const hasVideoAfter = videosAfter > 0;
        const maxImagesTotal = hasVideoAfter ? 4 : 7;
        const imagesAfter =
          existingImageEdges +
          local.images +
          (hasExistingLastFrame ? 1 : 0) +
          (addingImage ? 1 : 0);

        if (hasVideoAfter && imagesAfter > 4) {
          setErrorData({
            title: "参考图片数量超限",
            list: [
              "kling O1：有参考视频时图片最多 4 张（首/尾帧也计入图片数量）。",
              "请先删除多余图片/尾帧或移除参考视频后再连接。",
            ],
          });
          return oldEdges;
        }

        if (imagesAfter > maxImagesTotal) {
          setErrorData({
            title: "参考图片数量超限",
            list: [
              "kling O1：无参考视频时图片最多 7 张；有参考视频时图片最多 4 张（首/尾帧也计入图片数量）。",
              "请先删除多余图片/尾帧后再连接。",
            ],
          });
          return oldEdges;
        }
      }
      const isRoleEdge =
        targetFieldName === IMAGE_ROLE_FIELD &&
        targetNode?.data?.type === IMAGE_ROLE_TARGET &&
        !isVideoBridgeEdge;
      const isLastFrameEdge =
        targetFieldName === "last_frame_image" &&
        targetNode?.data?.type === IMAGE_ROLE_TARGET;
      let imageRole: "first" | "reference" | "last" | undefined;
      let videoReferType: "base" | "feature" | undefined;
      const requestedRoleRaw =
        (connection as { imageRole?: unknown; data?: { imageRole?: unknown } })
          ?.imageRole ??
        (connection as { data?: { imageRole?: unknown } })?.data?.imageRole;
      const requestedRole =
        requestedRoleRaw === "first" ||
        requestedRoleRaw === "reference" ||
        requestedRoleRaw === "last"
          ? requestedRoleRaw
          : undefined;

      if (isLastFrameEdge) {
        imageRole = requestedRole === "last" ? requestedRole : "last";
      } else if (isVideoBridgeEdge) {
        // Default to feature reference for video-to-video connections.
        videoReferType = "feature";
      } else if (isRoleEdge) {
        const modelName = getDoubaoVideoModelName(targetNode);
        const limits = getImageRoleLimits(modelName);
        const counts = getImageRoleCounts(oldEdges, connection.target!, targetNode);
        if (requestedRole && canAddImageRole(requestedRole, counts, limits)) {
          imageRole = requestedRole;
        } else {
          const nextRole = pickImageRoleForNewEdge(limits, counts);
          if (!nextRole) {
            setErrorData({
              title: "Connection limit reached",
              list: [
                "The selected model has reached its image limit for this input. Adjust edge roles or remove a connection.",
              ],
            });
            return oldEdges;
          }
          imageRole = nextRole;
        }
      }

      newEdges = addEdge(
        {
          ...normalizedConnection,
          data: {
            targetHandle,
            sourceHandle,
            ...(imageRole ? { imageRole } : {}),
            ...(videoReferType ? { videoReferType } : {}),
          },
        },
        oldEdges,
      );

      return newEdges;
    });
  },
  unselectAll: () => {
    const newNodes = cloneDeep(get().nodes);
    newNodes.forEach((node) => {
      node.selected = false;
      const newEdges = cleanEdges(newNodes, get().edges);
      set({
        nodes: newNodes,
        edges: newEdges,
      });
    });
  },
  pastBuildFlowParams: null,
  buildInfo: null,
  setBuildInfo: (buildInfo: { error?: string[]; success?: boolean } | null) => {
    set({ buildInfo });
  },
  buildFlow: async ({
    startNodeId,
    stopNodeId,
    input_value,
    files,
    silent,
    session,
    stream = true,
    eventDelivery = EventDeliveryType.STREAMING,
  }: {
    startNodeId?: string;
    stopNodeId?: string;
    input_value?: string;
    files?: string[];
    silent?: boolean;
    session?: string;
    stream?: boolean;
    eventDelivery?: EventDeliveryType;
  }) => {
    set({
      pastBuildFlowParams: {
        startNodeId,
        stopNodeId,
        input_value,
        files,
        silent,
        session,
        stream,
        eventDelivery,
      },
      buildInfo: null,
    });
    const playgroundPage = get().playgroundPage;
    get().setIsBuilding(true);
    set({ flowBuildStatus: {} });
    const currentFlow = useFlowsManagerStore.getState().currentFlow;
    const setErrorData = useAlertStore.getState().setErrorData;

    const edges = get().edges;
    let errors: string[] = [];

    // Only validate upstream nodes/edges if startNodeId is provided
    let nodesToValidate = get().nodes;
    let edgesToValidate = edges;
    if (startNodeId) {
      const downstream = getConnectedSubgraph(
        startNodeId,
        get().nodes,
        edges,
        "downstream",
      );
      nodesToValidate = downstream.nodes;
      edgesToValidate = downstream.edges;
    } else if (stopNodeId) {
      get().setStopNodeId(stopNodeId);
      const upstream = getConnectedSubgraph(
        stopNodeId,
        get().nodes,
        edges,
        "upstream",
      );
      nodesToValidate = upstream.nodes;
      edgesToValidate = upstream.edges;
    }
    if (!stopNodeId) {
      get().setStopNodeId(undefined);
    }

    for (const edge of edgesToValidate) {
      const errorsEdge = validateEdge(edge, nodesToValidate, edgesToValidate);
      if (errorsEdge.length > 0) {
        errors.push(errorsEdge.join("\n"));
      }
    }
    const errorsObjs = validateNodes(nodesToValidate, edges);

    errors = errors.concat(errorsObjs.flatMap((obj) => obj.errors));
    if (errors.length > 0) {
      setErrorData({
        title: MISSED_ERROR_ALERT,
        list: errors,
      });
      const ids = errorsObjs.flatMap((obj) => obj.id);
      get().updateBuildStatus(ids, BuildStatus.ERROR); // Set only the build status as error without adding info to the flow pool

      get().setIsBuilding(false);
      throw new Error(t("Invalid components"));
    }

    function validateSubgraph() {}
    function handleBuildUpdate(
      vertexBuildData: VertexBuildTypeAPI,
      status: BuildStatus,
      runId: string,
    ) {
      if (vertexBuildData && vertexBuildData.inactivated_vertices) {
        get().removeFromVerticesBuild(vertexBuildData.inactivated_vertices);
        if (vertexBuildData.inactivated_vertices.length > 0) {
          get().updateBuildStatus(
            vertexBuildData.inactivated_vertices,
            BuildStatus.INACTIVE,
          );
        }
      }

      if (vertexBuildData.next_vertices_ids) {
        // next_vertices_ids is a list of vertices that are going to be built next
        // verticesLayers is a list of list of vertices ids, where each list is a layer of vertices
        // we want to add a new layer (next_vertices_ids) to the list of layers (verticesLayers)
        // and the values of next_vertices_ids to the list of vertices ids (verticesIds)

        // const nextVertices will be the zip of vertexBuildData.next_vertices_ids and
        // vertexBuildData.top_level_vertices
        // the VertexLayerElementType as {id: next_vertices_id, layer: top_level_vertex}

        // next_vertices_ids should be next_vertices_ids without the inactivated vertices
        const next_vertices_ids = vertexBuildData.next_vertices_ids.filter(
          (id) => !vertexBuildData.inactivated_vertices?.includes(id),
        );
        const top_level_vertices = vertexBuildData.top_level_vertices.filter(
          (vertex) => !vertexBuildData.inactivated_vertices?.includes(vertex),
        );
        let nextVertices: VertexLayerElementType[] = zip(
          next_vertices_ids,
          top_level_vertices,
        ).map(([id, reference]) => ({ id: id!, reference }));

        // Now we filter nextVertices to remove any vertices that are in verticesLayers
        // because they are already being built
        // each layer is a list of vertexlayerelementtypes
        const lastLayer =
          get().verticesBuild!.verticesLayers[
            get().verticesBuild!.verticesLayers.length - 1
          ];

        nextVertices = nextVertices.filter(
          (vertexElement) =>
            !lastLayer.some(
              (layerElement) =>
                layerElement.id === vertexElement.id &&
                layerElement.reference === vertexElement.reference,
            ),
        );
        const newLayers = [
          ...get().verticesBuild!.verticesLayers,
          nextVertices,
        ];
        const newIds = [
          ...get().verticesBuild!.verticesIds,
          ...next_vertices_ids,
        ];
        if (
          ENABLE_DATASTAX_LANGFLOW &&
          vertexBuildData?.id?.includes("AstraDB")
        ) {
          const search_results: LogsLogType[] = Object.values(
            vertexBuildData?.data?.logs?.search_results,
          );
          search_results.forEach((log) => {
            if (
              log.message.includes("Adding") &&
              log.message.includes("documents") &&
              log.message.includes("Vector Store")
            ) {
              trackDataLoaded(
                get().currentFlow?.id,
                get().currentFlow?.name,
                "AstraDB Vector Store",
                vertexBuildData?.id,
              );
            }
          });
        }
        get().updateVerticesBuild({
          verticesIds: newIds,
          verticesLayers: newLayers,
          runId: runId,
          verticesToRun: get().verticesBuild!.verticesToRun,
        });

        get().updateBuildStatus(top_level_vertices, BuildStatus.TO_BUILD);
      }

      get().addDataToFlowPool(
        { ...vertexBuildData, run_id: runId },
        vertexBuildData.id,
      );
      if (status !== BuildStatus.ERROR) {
        get().updateBuildStatus([vertexBuildData.id], status);
      }
    }

    await buildFlowVerticesWithFallback({
      session,
      input_value,
      files,
      flowId: currentFlow!.id,
      startNodeId,
      stopNodeId,
      onGetOrderSuccess: () => {},
      onBuildComplete: (allNodesValid) => {
        if (!silent) {
          if (allNodesValid) {
            get().setBuildInfo({ success: true });
          }
        }
        get().updateEdgesRunningByNodes(
          get().nodes.map((n) => n.id),
          false,
        );
        get().setIsBuilding(false);
        trackFlowBuild(get().currentFlow?.name ?? "Unknown", false, {
          flowId: get().currentFlow?.id,
        });
      },
      onBuildUpdate: handleBuildUpdate,
      onBuildError: (title: string, list: string[], elementList) => {
        const idList =
          (elementList
            ?.map((element) => element.id)
            .filter(Boolean) as string[]) ?? get().nodes.map((n) => n.id);
        useFlowStore.getState().updateBuildStatus(idList, BuildStatus.ERROR);
        if (get().componentsToUpdate.length > 0)
          setErrorData({
            title:
              "There are outdated components in the flow. The error could be related to them.",
          });
        get().updateEdgesRunningByNodes(
          get().nodes.map((n) => n.id),
          false,
        );
        get().setBuildInfo({ error: list, success: false });
        useAlertStore.getState().addNotificationToHistory({
          title: title,
          type: "error",
          list: list,
        });
        get().setIsBuilding(false);
        get().buildController.abort();
        trackFlowBuild(get().currentFlow?.name ?? "Unknown", true, {
          flowId: get().currentFlow?.id,
          error: list,
        });
      },
      onBuildStart: (elementList) => {
        const idList = elementList
          // reference is the id of the vertex or the id of the parent in a group node
          .map((element) => element.reference)
          .filter(Boolean) as string[];
        get().updateBuildStatus(idList, BuildStatus.BUILDING);

        const edges = get().edges;
        const newEdges = edges.map((edge) => {
          if (
            edge.data?.targetHandle &&
            idList.includes(edge.data.targetHandle.id ?? "")
          ) {
            edge.className = "ran";
          }
          return edge;
        });
        set({ edges: newEdges });
      },
      onValidateNodes: validateSubgraph,
      nodes: get().nodes || undefined,
      edges: get().edges || undefined,
      logBuilds: get().onFlowPage,
      playgroundPage,
      eventDelivery,
    });
    get().setIsBuilding(false);
    get().revertBuiltStatusFromBuilding();
  },
  getFlow: () => {
    return {
      nodes: get().nodes,
      edges: get().edges,
      viewport: get().reactFlowInstance?.getViewport()!,
    };
  },
  updateEdgesRunningByNodes: (ids: string[], running: boolean) => {
    const edges = get().edges;

    const newEdges = edges.map((edge) => {
      if (
        edge.data?.sourceHandle &&
        ids.includes(edge.data.sourceHandle.id ?? "") &&
        edge.data.sourceHandle.id !== get().stopNodeId
      ) {
        edge.animated = running;
        edge.className = running ? "running" : "";
      } else {
        edge.animated = false;
        edge.className = "not-running";
      }
      return edge;
    });
    set({ edges: newEdges });
  },
  clearEdgesRunningByNodes: async (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const edges = get().edges;
      const newEdges = edges.map((edge) => {
        edge.animated = false;
        edge.className = "";
        return edge;
      });
      set({ edges: newEdges });
      resolve();
    });
  },
  updateVerticesBuild: (
    vertices: {
      verticesIds: string[];
      verticesLayers: VertexLayerElementType[][];
      runId?: string;
      verticesToRun: string[];
    } | null,
  ) => {
    set({ verticesBuild: vertices });
  },
  verticesBuild: null,
  addToVerticesBuild: (vertices: string[]) => {
    const verticesBuild = get().verticesBuild;
    if (!verticesBuild) return;
    set({
      verticesBuild: {
        ...verticesBuild,
        verticesIds: [...verticesBuild.verticesIds, ...vertices],
      },
    });
  },
  removeFromVerticesBuild: (vertices: string[]) => {
    const verticesBuild = get().verticesBuild;
    if (!verticesBuild) return;
    set({
      verticesBuild: {
        ...verticesBuild,
        // remove the vertices from the list of vertices ids
        // that are going to be built
        verticesIds: get().verticesBuild!.verticesIds.filter(
          // keep the vertices that are not in the list of vertices to remove
          (vertex) => !vertices.includes(vertex),
        ),
      },
    });
  },
  updateBuildStatus: (nodeIdList: string[], status: BuildStatus) => {
    const newFlowBuildStatus = { ...get().flowBuildStatus };
    nodeIdList.forEach((id) => {
      newFlowBuildStatus[id] = {
        status,
      };
      if (status == BuildStatus.BUILT) {
        const timestamp_string = new Date(Date.now()).toLocaleString();
        newFlowBuildStatus[id].timestamp = timestamp_string;
      }
    });
    set({ flowBuildStatus: newFlowBuildStatus });
  },
  revertBuiltStatusFromBuilding: () => {
    const newFlowBuildStatus = { ...get().flowBuildStatus };
    Object.keys(newFlowBuildStatus).forEach((id) => {
      if (newFlowBuildStatus[id].status === BuildStatus.BUILDING) {
        newFlowBuildStatus[id].status = BuildStatus.BUILT;
      }
    });
    set({ flowBuildStatus: newFlowBuildStatus });
  },
  currentFlow: undefined,
  setCurrentFlow: (flow) => {
    set({ currentFlow: flow });
  },
  updateCurrentFlow: ({ nodes, edges }) => {
    set({
      currentFlow: {
        ...get().currentFlow!,
        data: {
          nodes: nodes ?? get().currentFlow?.data?.nodes ?? [],
          edges: edges ?? get().currentFlow?.data?.edges ?? [],
          viewport: get().currentFlow?.data?.viewport ?? {
            x: 0,
            y: 0,
            zoom: 1,
          },
        },
      },
    });
  },
  buildController: new AbortController(),
  setBuildController: (controller) => {
    set({ buildController: controller });
  },
  handleDragging: undefined,
  setHandleDragging: (handleDragging) => {
    set({ handleDragging });
  },

  filterType: undefined,
  setFilterType: (filterType) => {
    set({ filterType });
  },
  currentBuildingNodeId: undefined,
  setCurrentBuildingNodeId: (nodeIds) => {
    set({ currentBuildingNodeId: nodeIds });
  },
  resetFlowState: () => {
    set({
      nodes: [],
      edges: [],
      flowState: undefined,
      hasIO: false,
      inputs: [],
      outputs: [],
      flowPool: {},
      currentFlow: undefined,
      reactFlowInstance: null,
      lastCopiedSelection: null,
      verticesBuild: null,
      flowBuildStatus: {},
      buildInfo: null,
      isBuilding: false,
      isPending: true,
      positionDictionary: {},
      componentsToUpdate: [],
      rightClickedNodeId: null,
    });
  },
  dismissedNodes: [],
  addDismissedNodes: (dismissedNodes: string[]) => {
    const newDismissedNodes = Array.from(
      new Set([...get().dismissedNodes, ...dismissedNodes]),
    );
    localStorage.setItem(
      `dismiss_${get().currentFlow?.id}`,
      JSON.stringify(newDismissedNodes),
    );
    set({ dismissedNodes: newDismissedNodes });
  },
  removeDismissedNodes: (dismissedNodes: string[]) => {
    const newDismissedNodes = get().dismissedNodes.filter(
      (node) => !dismissedNodes.includes(node),
    );
    localStorage.setItem(
      `dismiss_${get().currentFlow?.id}`,
      JSON.stringify(newDismissedNodes),
    );
    set({ dismissedNodes: newDismissedNodes });
  },
  dismissedNodesLegacy: [],
  addDismissedNodesLegacy: (dismissedNodes: string[]) => {
    const newDismissedNodes = Array.from(
      new Set([...get().dismissedNodesLegacy, ...dismissedNodes]),
    );
    localStorage.setItem(
      `dismiss_legacy_${get().currentFlow?.id}`,
      JSON.stringify(newDismissedNodes),
    );
    set({ dismissedNodesLegacy: newDismissedNodes });
  },
  helperLineEnabled: false,
  setHelperLineEnabled: (helperLineEnabled: boolean) => {
    set({ helperLineEnabled });
  },
  setNewChatOnPlayground: (newChat: boolean) => {
    set({ newChatOnPlayground: newChat });
  },
  newChatOnPlayground: false,
  stopNodeId: undefined,
  setStopNodeId: (nodeId: string | undefined) => {
    set({ stopNodeId: nodeId });
  },
}));

export default useFlowStore;
