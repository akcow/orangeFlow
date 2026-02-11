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
  flowShare: "mod+shift+b",
  undo: "mod+z",
  redo: "mod+y",
  redoAlt: "mod+shift+z",
  advancedSettings: "mod+shift+a",
  minimize: "mod+.",
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
  update: "mod+u",
  download: "mod+j",
  freezePath: "mod+shift+f",
  toolMode: "mod+shift+m",
  toggleSidebar: "mod+b",
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

      const savedByName = new Map<string, any>();
      savedArr.forEach((item) => {
        if (item && typeof item.name === "string") {
          savedByName.set(item.name, item);
        }
      });

      // Only keep shortcuts we still support, and always keep the current display_name
      // from defaults (avoids stale/incorrect labels in localStorage).
      const merged = defaultShortcuts.map((def) => {
        const saved = savedByName.get(def.name);
        return {
          name: def.name,
          display_name: def.display_name,
          shortcut:
            saved && typeof saved.shortcut === "string"
              ? String(saved.shortcut)
              : def.shortcut,
        };
      });

      merged.forEach(({ name, shortcut }) => {
        const shortcutName = toCamelCase(name);
        set({ [shortcutName]: shortcut });
      });

      get().setShortcuts(merged);
      // Rewrite persisted shortcuts to drop removed/unknown actions.
      localStorage.setItem("langflow-shortcuts", JSON.stringify(merged));
    } catch (e) {
      // Reset bad data and fall back to defaults.
      console.warn("Failed to load shortcuts from localStorage; resetting.", e);
      localStorage.removeItem("langflow-shortcuts");
    }
  },
}));

useShortcutsStore.getState().getShortcutsFromStorage();
