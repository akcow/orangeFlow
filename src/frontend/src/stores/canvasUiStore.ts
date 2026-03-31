import { create } from "zustand";

type CanvasReferenceSelectionState = {
  active: boolean;
  targetNodeId: string | null;
  hoveredNodeId: string | null;
};

type CanvasUiStore = {
  miniMapOpen: boolean;
  setMiniMapOpen: (open: boolean) => void;
  toggleMiniMapOpen: () => void;
  referenceSelection: CanvasReferenceSelectionState;
  startReferenceSelection: (targetNodeId: string) => void;
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
  },
  startReferenceSelection: (targetNodeId) =>
    set({
      referenceSelection: {
        active: true,
        targetNodeId,
        hoveredNodeId: null,
      },
    }),
  exitReferenceSelection: () =>
    set({
      referenceSelection: {
        active: false,
        targetNodeId: null,
        hoveredNodeId: null,
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
