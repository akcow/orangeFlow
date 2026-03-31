import { create } from "zustand";

type CanvasReferenceSelectionImageRole = "first" | "reference" | "last";

type CanvasReferenceSelectionState = {
  active: boolean;
  targetNodeId: string | null;
  hoveredNodeId: string | null;
  preferredFieldName: string | null;
  preferredImageRole: CanvasReferenceSelectionImageRole | null;
  hoverLabel: string | null;
};

type StartReferenceSelectionOptions = {
  preferredFieldName?: string | null;
  preferredImageRole?: CanvasReferenceSelectionImageRole | null;
  hoverLabel?: string | null;
};

type CanvasUiStore = {
  miniMapOpen: boolean;
  setMiniMapOpen: (open: boolean) => void;
  toggleMiniMapOpen: () => void;
  referenceSelection: CanvasReferenceSelectionState;
  startReferenceSelection: (
    targetNodeId: string,
    options?: StartReferenceSelectionOptions,
  ) => void;
  exitReferenceSelection: () => void;
  setReferenceSelectionHoveredNode: (nodeId: string | null) => void;
};

export const useCanvasUiStore = create<CanvasUiStore>((set) => ({
  miniMapOpen: false,
  setMiniMapOpen: (open) => set({ miniMapOpen: open }),
  toggleMiniMapOpen: () => set((s) => ({ miniMapOpen: !s.miniMapOpen })),
  referenceSelection: {
    active: false,
    targetNodeId: null,
    hoveredNodeId: null,
    preferredFieldName: null,
    preferredImageRole: null,
    hoverLabel: null,
  },
  startReferenceSelection: (targetNodeId, options) =>
    set({
      referenceSelection: {
        active: true,
        targetNodeId,
        hoveredNodeId: null,
        preferredFieldName: options?.preferredFieldName ?? null,
        preferredImageRole: options?.preferredImageRole ?? null,
        hoverLabel: options?.hoverLabel ?? null,
      },
    }),
  exitReferenceSelection: () =>
    set({
      referenceSelection: {
        active: false,
        targetNodeId: null,
        hoveredNodeId: null,
        preferredFieldName: null,
        preferredImageRole: null,
        hoverLabel: null,
      },
    }),
  setReferenceSelectionHoveredNode: (nodeId) =>
    set((state) => ({
      referenceSelection: {
        ...state.referenceSelection,
        hoveredNodeId: nodeId,
      },
    })),
}));
