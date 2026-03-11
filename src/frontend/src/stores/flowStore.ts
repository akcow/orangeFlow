import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { cloneDeep } from "lodash";
import { create } from "zustand";
import { checkCodeValidity } from "@/CustomNodes/helpers/check-code-validity";
import { MISSED_ERROR_ALERT } from "@/constants/alerts_constants";
import { BROKEN_EDGES_WARNING } from "@/constants/constants";
import {
  track,
  trackFlowBuild,
} from "@/customization/utils/analytics";
import { t } from "@/i18n/t";
import { brokenEdgeMessage } from "@/utils/utils";
import { BuildStatus, EventDeliveryType } from "../constants/enums";
import type { VertexBuildTypeAPI } from "../types/api";
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
  getNodeDimensions,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
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
  buildingCount: 0,
  buildControllers: [],
  buildChains: {},
  activeBuildChainsByNode: {},
  registerBuildController: (controller) => {
    set((state) => ({
      buildControllers: [...state.buildControllers, controller],
    }));
  },
  unregisterBuildController: (controller) => {
    set((state) => ({
      buildControllers: state.buildControllers.filter((c) => c !== controller),
    }));
  },
  registerBuildChain: (chainId: string, controller: AbortController) => {
    set((state) => ({
      buildChains: {
        ...state.buildChains,
        [chainId]: {
          controller,
          nodes: {},
        },
      },
    }));
  },
  markChainNodesBuilding: (chainId: string, nodeIds: string[]) => {
    if (!nodeIds?.length) return;
    set((state) => {
      const chain = state.buildChains[chainId];
      if (!chain) return {};

      const nextChainsByNode = { ...state.activeBuildChainsByNode };
      const nextChainNodes = { ...chain.nodes };

      nodeIds.forEach((nodeId) => {
        nextChainNodes[nodeId] = true;
        const stack = Array.isArray(nextChainsByNode[nodeId])
          ? [...nextChainsByNode[nodeId]]
          : [];
        // Keep it unique but ordered by recency (tail = most recent chain).
        const filtered = stack.filter((id) => id !== chainId);
        filtered.push(chainId);
        nextChainsByNode[nodeId] = filtered;
      });

      return {
        buildChains: {
          ...state.buildChains,
          [chainId]: { ...chain, nodes: nextChainNodes },
        },
        activeBuildChainsByNode: nextChainsByNode,
      };
    });
  },
  markChainNodeFinished: (
    chainId: string,
    nodeId: string,
    status: BuildStatus,
  ) => {
    if (!nodeId) return;
    set((state) => {
      const stack = Array.isArray(state.activeBuildChainsByNode[nodeId])
        ? state.activeBuildChainsByNode[nodeId]
        : [];
      const nextStack = stack.filter((id) => id !== chainId);

      const nextChainsByNode = { ...state.activeBuildChainsByNode };
      if (nextStack.length > 0) nextChainsByNode[nodeId] = nextStack;
      else delete nextChainsByNode[nodeId];

      // Only update terminal status if no other chain is still active for this node.
      if (nextStack.length > 0) {
        return {
          activeBuildChainsByNode: nextChainsByNode,
        };
      }

      const nextFlowBuildStatus = { ...state.flowBuildStatus };
      nextFlowBuildStatus[nodeId] = {
        ...(nextFlowBuildStatus[nodeId] ?? { status }),
        status,
      };
      if (status === BuildStatus.BUILT) {
        nextFlowBuildStatus[nodeId].timestamp =
          new Date(Date.now()).toLocaleString();
      }

      return {
        activeBuildChainsByNode: nextChainsByNode,
        flowBuildStatus: nextFlowBuildStatus,
      };
    });
  },
  finalizeBuildChain: (chainId: string) => {
    set((state) => {
      const chain = state.buildChains[chainId];
      if (!chain) return {};

      const nextChains = { ...state.buildChains };
      delete nextChains[chainId];

      const nextChainsByNode = { ...state.activeBuildChainsByNode };
      const nextFlowBuildStatus = { ...state.flowBuildStatus };

      // Remove this chain from any nodes we ever marked as part of it.
      Object.keys(chain.nodes ?? {}).forEach((nodeId) => {
        const stack = Array.isArray(nextChainsByNode[nodeId])
          ? nextChainsByNode[nodeId].filter((id) => id !== chainId)
          : [];
        if (stack.length > 0) {
          nextChainsByNode[nodeId] = stack;
          // If another chain is still active for this node, keep it "building".
          nextFlowBuildStatus[nodeId] = {
            ...(nextFlowBuildStatus[nodeId] ?? { status: BuildStatus.BUILDING }),
            status: BuildStatus.BUILDING,
          };
          return;
        }

        delete nextChainsByNode[nodeId];
        const current = nextFlowBuildStatus[nodeId];
        // If this chain ends unexpectedly (stop/abort), don't leave nodes in BUILDING/TO_BUILD.
        if (
          current?.status === BuildStatus.BUILDING ||
          current?.status === BuildStatus.TO_BUILD
        ) {
          nextFlowBuildStatus[nodeId] = {
            ...current,
            status: BuildStatus.BUILT,
            timestamp: new Date(Date.now()).toLocaleString(),
          };
        }
      });

      return {
        buildChains: nextChains,
        activeBuildChainsByNode: nextChainsByNode,
        flowBuildStatus: nextFlowBuildStatus,
      };
    });
  },
  stopLatestChainForNode: (nodeId: string) => {
    const stack = get().activeBuildChainsByNode[nodeId];
    const chainId = Array.isArray(stack) ? stack[stack.length - 1] : undefined;
    if (!chainId) return;
    const controller = get().buildChains[chainId]?.controller;
    if (!controller) return;
    try {
      controller.abort();
    } catch {
      // ignore
    }
  },
  beginBuilding: () => {
    set((state) => ({
      buildingCount: state.buildingCount + 1,
      isBuilding: true,
    }));
  },
  endBuilding: () => {
    set((state) => {
      const nextCount = Math.max(0, state.buildingCount - 1);
      return {
        buildingCount: nextCount,
        isBuilding: nextCount > 0,
      };
    });
  },
  resetBuilding: () => {
    set({
      buildingCount: 0,
      isBuilding: false,
      buildControllers: [],
      buildChains: {},
      activeBuildChainsByNode: {},
    });
  },
  stopBuilding: () => {
    // Stop all active builds (parallel builds supported).
    const controllers = get().buildControllers;
    controllers.forEach((c) => {
      try {
        c.abort();
      } catch {
        // ignore
      }
    });
    get().updateEdgesRunningByNodes(
      get().nodes.map((n) => n.id),
      false,
    );
    get().resetBuilding();
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

    // Backward-compat: older tool-generated result nodes may miss `cropPreviewOnly`.
    // Mark targets of tool edges so they keep "result node" behavior and skip
    // upgrade prompts intended for regular editable components.
    const toolEdgeTargetIds = new Set(
      edges
        .filter((edge) => String(edge?.className ?? "").includes("doubao-tool-edge"))
        .map((edge) => String(edge.target)),
    );
    nodes.forEach((node) => {
      if (node.type !== "genericNode") return;
      if (!toolEdgeTargetIds.has(String(node.id))) return;
      if (node.data?.type !== "DoubaoImageCreator") return;
      node.data.cropPreviewOnly = true;
    });

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

    // Ensure group containers are present and ordered before their children.
    // XYFlow warns (and may stutter) when parents appear after children in the nodes array.
    // We also defensively detach nodes pointing at a missing parent to avoid repeated warnings.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const repairedNodes = nodes.map((n) => {
      if (!n.parentId) return n;
      if (byId.has(n.parentId)) return n;
      // Fallback: detach from missing parent; keep the stored position as-is.
      return { ...(n as any), parentId: undefined };
    });
    const orderedNodes = sortNodesByParentDepth(
      repairedNodes.map((n) => {
        if (n.type !== "groupNode") return n;
        const style: any = { ...((n as any).style ?? {}), zIndex: -100 };
        return { ...(n as any), zIndex: -100, style };
      }),
    );

    const brokenEdges = detectBrokenEdgesEdges(orderedNodes, edges);
    if (brokenEdges.length > 0) {
      useAlertStore.getState().setErrorData({
        title: BROKEN_EDGES_WARNING,
        list: brokenEdges.map((edge) => brokenEdgeMessage(edge)),
      });
    }
    const newEdges = cleanEdges(orderedNodes, edges);
    const { inputs, outputs } = getInputsAndOutputs(orderedNodes);
    get().updateComponentsToUpdate(orderedNodes);

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
    unselectAllNodesEdges(orderedNodes, newEdges);
    if (flow?.id) {
      useTweaksStore.getState().initialSetup(orderedNodes, flow?.id);
    }
    set({
      nodes: orderedNodes,
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

    // Fast-path: group resizing emits a high-frequency stream of "dimensions" changes.
    // Avoid extra full-graph normalization/sorting work on each tick for smoother resize UX.
    const onlyDimensions = changes.length > 0 && changes.every((c) => c.type === "dimensions");
    if (onlyDimensions) {
      // Ensure group containers stay behind other nodes/edges (rarely needed, but cheap for only changed ids).
      const changedIds = new Set(
        changes
          .filter((c: any) => "id" in c)
          .map((c: any) => String(c.id)),
      );
      let needsZFix = false;
      const byId = new Map(updated.map((n) => [n.id, n]));
      for (const id of changedIds) {
        const n: any = byId.get(id);
        if (n?.type === "groupNode" && n?.zIndex !== -100) {
          needsZFix = true;
          break;
        }
      }
      if (!needsZFix) {
        set({ nodes: updated });
        return;
      }
      set({
        nodes: updated.map((n: any) => {
          if (n.type !== "groupNode") return n;
          if (n.zIndex === -100) return n;
          const style: any = { ...(n.style ?? {}), zIndex: -100 };
          return { ...n, zIndex: -100, style };
        }),
      });
      return;
    }

    // Clamp "workflow locked" nodes to remain within their parent group bounds.
    // Do this only for position-changed nodes to keep drag smooth on large graphs.
    const positionChangeIds = changes
      .filter(
        (c): c is NodeChange<AllNodeType> & { id: string } =>
          c.type === "position" && "id" in c,
      )
      .map((c) => String(c.id));

    let clamped = updated;
    if (positionChangeIds.length > 0) {
      const byId = new Map(updated.map((n) => [n.id, n]));
      const indexById = new Map(updated.map((n, idx) => [n.id, idx]));
      let next = updated;
      let changed = false;
      for (const id of positionChangeIds) {
        const n: any = byId.get(id);
        if (!n?.parentId) continue;
        if (!n?.data?.workflowLocked) continue;
        const parent: any = byId.get(n.parentId);
        if (!parent || parent.type !== "groupNode") continue;

        const parentWidth = parent.width ?? getNodeDimensions(parent).width;
        const parentHeight = parent.height ?? getNodeDimensions(parent).height;
        if (!parentWidth || !parentHeight) continue;

        const { width: childWidth, height: childHeight } = getNodeDimensions(n);
        const minX = GROUP_PADDING;
        const minY = GROUP_HEADER_HEIGHT + GROUP_PADDING;
        const maxX = Math.max(minX, parentWidth - childWidth - GROUP_PADDING);
        const maxY = Math.max(minY, parentHeight - childHeight - GROUP_PADDING);

        const nextX = Math.min(maxX, Math.max(minX, n.position.x));
        const nextY = Math.min(maxY, Math.max(minY, n.position.y));
        if (nextX === n.position.x && nextY === n.position.y) continue;

        const idx = indexById.get(id);
        if (typeof idx !== "number") continue;
        if (!changed) {
          next = [...updated];
          changed = true;
        }
        next[idx] = { ...n, position: { x: nextX, y: nextY } };
        byId.set(id, next[idx]);
      }
      clamped = changed ? next : updated;
    }

    // Normalize: we don't constrain group children with `extent: 'parent'` / `expandParent`.
    // Important: avoid cloning every nested node on every drag tick; only touch nodes that
    // actually carry these props to keep XYFlow dragging stable.
    let normalized = clamped.map((n) => {
      // Keep group containers behind edges/nodes.
      const shouldFixZ = (n as any).type === "groupNode" && (n as any).zIndex !== -100;

      if (!n.parentId) {
        if (!shouldFixZ) return n;
        const style: any = { ...((n as any).style ?? {}), zIndex: -100 };
        return { ...(n as any), zIndex: -100, style };
      }

      const hasExtent = Object.hasOwn(n as any, "extent");
      const hasExpand = Object.hasOwn(n as any, "expandParent");
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

    // If a group container was removed, detach any children still pointing at it.
    // This prevents XYFlow warnings and avoids repeated expensive internals updates.
    if (changes.some((c) => c.type === "remove")) {
      const byId = new Map(normalized.map((n) => [n.id, n]));
      let hasOrphans = false;
      for (const n of normalized) {
        if (n.parentId && !byId.has(n.parentId)) {
          hasOrphans = true;
          break;
        }
      }
      if (hasOrphans) {
        normalized = normalized.map((n) => {
          if (!n.parentId) return n;
          if (byId.has(n.parentId)) return n;
          return { ...(n as any), parentId: undefined };
        });
      }
    }

    // XYFlow derives child absolute positions from parent internals, but it may skip recomputing
    // unchanged child nodes when only the parent object changes. If a group container moves,
    // we "touch" its descendants (shallow clone) so they re-render and follow the parent.
    const nodeById = new Map(normalized.map((n) => [n.id, n]));
    const movedGroupIds = new Set(
      changes
        .filter(
          (c): c is NodeChange<AllNodeType> & { id: string } =>
            c.type === "position" &&
            "id" in c &&
            !!(nodeById.get(String(c.id)) as any),
        )
        .map((c) => String(c.id))
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

    const dissolved = dissolveSmallGroups(withoutExtent);
    const byId = new Map(dissolved.map((n) => [n.id, n]));
    const repaired = dissolved.map((n) => {
      if (!n.parentId) return n;
      if (byId.has(n.parentId)) return n;
      return { ...(n as any), parentId: undefined };
    });

    const newChange = sortNodesByParentDepth(
      repaired.map((n) => {
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

    const initialIds = new Set<string>(
      newSelection.nodes.map((n) => String((n as any).id)),
    );
    const expandedIds = new Set(initialIds);
    const queue = Array.from(initialIds);

    while (queue.length) {
      const currentId = queue.pop()!;
      const current = nodeById.get(String(currentId));
      if (!current || !isGroupContainerNode(current)) continue;
      for (const child of storeNodes) {
        if (child.parentId !== currentId) continue;
        if (expandedIds.has(child.id)) continue;
        expandedIds.add(child.id);
        queue.push(child.id);
      }
    }

    const expandedNodes = Array.from(expandedIds)
      .map((id) => nodeById.get(String(id)))
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

      // ProCamera output is a style prompt (text). If it gets dropped onto the video generator's
      // image "+" bubble, route it to the text prompt input (same behavior as TextCreation).
      if (
        targetNode?.data?.type === IMAGE_ROLE_TARGET &&
        (targetFieldName === IMAGE_ROLE_FIELD ||
          targetFieldName === "last_frame_image") &&
        resolvedSourceType === "ProCamera"
      ) {
        const promptField = targetNode?.data?.node?.template?.["prompt"];
        if (!promptField) {
          setErrorData({
            title: "Unsupported connection",
            list: [
              "ProCamera output cannot connect to first/last frame image inputs. Please connect it to the video prompt input.",
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
      const isTargetKlingV3 = ["kling v3", "kling-v3"].includes(modelName.trim().toLowerCase());
      const isVideoSourceType = (nodeType?: string) =>
        nodeType === IMAGE_ROLE_TARGET || nodeType === "UserUploadVideo";

      const isVideoBridgeEdge =
        targetFieldName === IMAGE_ROLE_FIELD &&
        isVideoSourceType(sourceNode?.data?.type) &&
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
          return isVideoSourceType(src?.data?.type);
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

        // Kling V3 (V-series): forbid any video inputs (no reference video / video editing).
        const isVideoSourceForKlingV3 =
          resolvedSourceType === "UserUploadVideo" || sourceNode?.data?.type === IMAGE_ROLE_TARGET;
        if (isTargetKlingV3 && (connectingToFirstFrame || connectingToLastFrame) && isVideoSourceForKlingV3) {
          setErrorData({
            title: "Unsupported connection",
            list: ["kling V3：不支持参考视频/视频编辑输入，请连接图片（首帧/尾帧）或移除视频连接。"],
          });
          return oldEdges;
        }

        if (connectingToLastFrame && hasExistingLastFrame) {
          setErrorData({
            title: "尾帧输入已存在",
            list: ["kling O1/O3：尾帧输入只能设置 1 个。请先清空/移除现有尾帧后再连接。"],
          });
          return oldEdges;
        }

        const videosAfter = existingVideoEdges + local.videos + (addingVideo ? 1 : 0);
        if (videosAfter > 1) {
          setErrorData({
            title: "参考视频数量超限",
            list: ["kling O1/O3：最多仅支持 1 段参考视频（MP4/MOV）。请移除多余连接或删除本地视频后再试。"],
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
              "kling O1/O3：有参考视频时图片最多 4 张（首/尾帧也计入图片数量）。",
              "请先删除多余图片/尾帧或移除参考视频后再连接。",
            ],
          });
          return oldEdges;
        }

        if (imagesAfter > maxImagesTotal) {
          setErrorData({
            title: "参考图片数量超限",
            list: [
              "kling O1/O3：无参考视频时图片最多 7 张；有参考视频时图片最多 4 张（首/尾帧也计入图片数量）。",
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
      const hasIncomingVideoSourceEdge = oldEdges.some((edge) => {
        if (edge.target !== connection.target) return false;
        let parsedTargetHandle: any = edge.data?.targetHandle;
        if (!parsedTargetHandle && edge.targetHandle) {
          try {
            parsedTargetHandle = scapeJSONParse(edge.targetHandle);
          } catch {
            parsedTargetHandle = null;
          }
        }
        const edgeTargetFieldName = parsedTargetHandle?.fieldName ?? parsedTargetHandle?.name;
        if (edgeTargetFieldName !== IMAGE_ROLE_FIELD) return false;
        const edgeVideoReferType = edge.data?.videoReferType;
        if (edgeVideoReferType === "base" || edgeVideoReferType === "feature") return true;
        const src = get().nodes.find((node) => node.id === edge.source);
        return isVideoSourceType(src?.data?.type);
      });

      if (isLastFrameEdge) {
        imageRole = requestedRole === "last" ? requestedRole : "last";
      } else if (isVideoBridgeEdge) {
        // Default to feature reference for incoming video-source connections.
        videoReferType = "feature";
      } else if (isRoleEdge) {
        const modelName = getDoubaoVideoModelName(targetNode);
        const limits = getImageRoleLimits(modelName);
        const counts = getImageRoleCounts(oldEdges, connection.target!, targetNode);
        if (hasIncomingVideoSourceEdge) {
          const maxReference = limits.maxReference ?? limits.maxTotal;
          if (counts.reference >= maxReference) {
            setErrorData({
              title: "Connection limit reached",
              list: [
                "The selected model has reached its reference image limit for this input.",
              ],
            });
            return oldEdges;
          }
          imageRole = "reference";
        } else if (requestedRole && canAddImageRole(requestedRole, counts, limits)) {
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

    // Parallel builds are supported. Track lifecycle with a per-invocation controller and a ref-counted building flag.
    const buildController = new AbortController();
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    get().registerBuildController(buildController);
    get().registerBuildChain(chainId, buildController);
    get().beginBuilding();
    const currentFlow = useFlowsManagerStore.getState().currentFlow;
    const setErrorData = useAlertStore.getState().setErrorData;

    try {

    // Tool-only edges (e.g. crop/outpaint) are used for visual lineage in the canvas UI,
    // but they should not affect actual flow execution.
    const edges = (get().edges ?? []).filter(
      (edge: any) => !(edge?.data && (edge.data as any).cropLink),
    );
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
      // Set only the build status as error without adding info to the flow pool
      get().updateBuildStatus(ids, BuildStatus.ERROR);
      throw new Error(t("Invalid components"));
    }

    const validateSubgraph = () => {};
    const handleBuildUpdate = (
      vertexBuildData: VertexBuildTypeAPI,
      status: BuildStatus,
      runId: string,
    ) => {
      const effectiveRunId = runId || vertexBuildData?.run_id || "";

      const inactivated = vertexBuildData?.inactivated_vertices ?? [];
      if (inactivated.length > 0) {
        inactivated.forEach((id) => {
          get().markChainNodeFinished(chainId, id, BuildStatus.INACTIVE);
        });
      }

      get().addDataToFlowPool(
        { ...vertexBuildData, run_id: effectiveRunId },
        vertexBuildData.id,
      );
      get().markChainNodeFinished(chainId, vertexBuildData.id, status);
    };

    // When sending a graph payload to the backend build endpoint, only include buildable nodes.
    // Some canvas-only nodes (e.g. notes/annotations) don't have `data.node` and will crash
    // graph creation on the backend with KeyError('node').
    const buildNodes = (nodesToValidate as any[])?.filter(
      (n) => Boolean(n?.data?.node),
    );
    const buildNodeIds = new Set(
      (buildNodes ?? []).map((n) => String((n as any).id)),
    );
    const buildEdges = (edgesToValidate as any[])?.filter(
      (e) =>
        buildNodeIds.has(String((e as any)?.source)) &&
        buildNodeIds.has(String((e as any)?.target)),
    );

      await buildFlowVerticesWithFallback({
        session,
        input_value,
        files,
        flowId: currentFlow!.id,
        startNodeId,
        stopNodeId,
        // Always send the current canvas graph. This keeps builds consistent even before autosave
        // flushes changes (e.g. tool-generated downstream nodes).
        nodes: buildNodes as any,
        edges: buildEdges as any,
        buildController,
        onGetOrderSuccess: () => {},
        onBuildComplete: (allNodesValid) => {
          if (!silent && allNodesValid) {
            get().setBuildInfo({ success: true });
          }
          // Clear "running" visuals only for the validated subgraph to reduce interference with parallel builds.
          get().updateEdgesRunningByNodes(
            (nodesToValidate ?? []).map((n: any) => n.id),
            false,
          );
          trackFlowBuild(get().currentFlow?.name ?? "Unknown", false, {
            flowId: get().currentFlow?.id,
          });
        },
        onBuildUpdate: handleBuildUpdate,
        onBuildError: (title: string, list: string[], elementList) => {
          const idList =
            (elementList
              ?.map((element) => element.id)
              .filter(Boolean) as string[]) ??
            (nodesToValidate ?? []).map((n: any) => n.id);
          idList.forEach((id) => {
            get().markChainNodeFinished(chainId, id, BuildStatus.ERROR);
          });
          if (get().componentsToUpdate.length > 0) {
            setErrorData({
              title:
                "There are outdated components in the flow. The error could be related to them.",
            });
          }
          get().updateEdgesRunningByNodes(idList, false);
          get().setBuildInfo({ error: list, success: false });
          useAlertStore.getState().addNotificationToHistory({
            title: title,
            type: "error",
            list: list,
          });
          // Abort this build's streaming/polling loop; other parallel builds keep running.
          try {
            buildController.abort();
          } catch {
            // ignore
          }
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
          get().markChainNodesBuilding(chainId, idList);
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
        logBuilds: get().onFlowPage,
        playgroundPage,
        eventDelivery,
      });
    } finally {
      // Clean up this invocation's tracking, even on abort or validation errors.
      get().finalizeBuildChain(chainId);
      get().unregisterBuildController(buildController);
      get().endBuilding();
    }
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
      const existing = String(edge.className ?? "").trim();
      const keep = existing
        ? existing
            .split(/\s+/)
            .filter(Boolean)
            .filter((c) => c !== "running" && c !== "not-running")
        : [];

      if (
        edge.data?.sourceHandle &&
        ids.includes(edge.data.sourceHandle.id ?? "") &&
        edge.data.sourceHandle.id !== get().stopNodeId
      ) {
        edge.animated = running;
        edge.className = [...keep, running ? "running" : "not-running"].join(" ").trim();
      } else {
        edge.animated = false;
        edge.className = [...keep, "not-running"].join(" ").trim();
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
      buildingCount: 0,
      isPending: true,
      positionDictionary: {},
      componentsToUpdate: [],
      rightClickedNodeId: null,
      buildControllers: [],
      buildChains: {},
      activeBuildChainsByNode: {},
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
