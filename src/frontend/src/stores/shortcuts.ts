import { create } from "zustand";
import { toCamelCase } from "@/utils/utils";
import { defaultShortcuts } from "../constants/constants";
import type { shortcutsStoreType } from "../types/store";

export const useShortcutsStore = create<shortcutsStoreType>((set, get) => ({
  shortcuts: defaultShortcuts,
  setShortcuts: (newShortcuts) => {
    set({ shortcuts: newShortcuts });
  },
  outputInspection: "o",
  play: "p",
  flow: "mod+shift+b",
  undo: "mod+z",
  redo: "mod+y",
  redoAlt: "mod+shift+z",
  openPlayground: "mod+k",
  advancedSettings: "mod+shift+a",
  minimize: "mod+.",
  code: "space",
  copy: "mod+c",
  duplicate: "mod+d",
  componentShare: "mod+shift+s",
  docs: "mod+shift+d",
  changesSave: "mod+s",
  saveComponent: "mod+alt+s",
  delete: "backspace",
  group: "mod+g",
  cut: "mod+x",
  paste: "mod+v",
  api: "r",
  update: "mod+u",
  download: "mod+j",
  freezePath: "mod+shift+f",
  toolMode: "mod+shift+m",
  toggleSidebar: "mod+b",
  searchComponentsSidebar: "/",
  updateUniqueShortcut: (name, combination) => {
    set({
      [name]: combination,
    });
  },
  getShortcutsFromStorage: () => {
    const savedShortcuts = localStorage.getItem("langflow-shortcuts");
    if (!savedShortcuts) return;

    // Avoid a hard crash (white screen) when localStorage has corrupted/invalid JSON.
    try {
      const savedArr = JSON.parse(savedShortcuts);
      if (!Array.isArray(savedArr)) {
        throw new Error("langflow-shortcuts is not an array");
      }

      savedArr.forEach(({ name, shortcut }) => {
        const shortcutName = toCamelCase(name);
        set({
          [shortcutName]: shortcut,
        });
      });
      get().setShortcuts(savedArr);
    } catch (e) {
      // Reset bad data and fall back to defaults.
      console.warn("Failed to load shortcuts from localStorage; resetting.", e);
      localStorage.removeItem("langflow-shortcuts");
    }
  },
}));

useShortcutsStore.getState().getShortcutsFromStorage();
