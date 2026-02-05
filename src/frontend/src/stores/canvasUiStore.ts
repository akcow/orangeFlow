import { create } from "zustand";

type CanvasUiStore = {
  miniMapOpen: boolean;
  setMiniMapOpen: (open: boolean) => void;
  toggleMiniMapOpen: () => void;
};

export const useCanvasUiStore = create<CanvasUiStore>((set) => ({
  miniMapOpen: false,
  setMiniMapOpen: (open) => set({ miniMapOpen: open }),
  toggleMiniMapOpen: () => set((s) => ({ miniMapOpen: !s.miniMapOpen })),
}));

