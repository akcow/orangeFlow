import { create } from "zustand";
import type { DarkStoreType } from "../types/zustand/dark";

export const useDarkStore = create<DarkStoreType>((set, get) => ({
  dark: true, // Force dark mode
  version: "",
  latestVersion: "",
  refreshLatestVersion: (v: string) => {
    set(() => ({ latestVersion: v }));
  },
  setDark: (dark) => {
    // Ignore updates to keep it dark
    set(() => ({ dark: true }));
    window.localStorage.setItem("isDark", "true");
  },
  refreshVersion: (v) => {
    set(() => ({ version: v }));
  },
}));

// Follow system theme changes only when the user hasn't explicitly chosen a theme.
if (typeof window !== "undefined") {
  try {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (media) {
      const handler = (e: MediaQueryListEvent) => {
        const stored = window.localStorage.getItem("isDark");
        if (stored !== null) return; // user override
        useDarkStore.getState().setDark(e.matches);
        // Don't persist system-driven changes; keep following system.
        window.localStorage.removeItem("isDark");
      };

      // Initialize once in case the app loaded before state was created.
      if (window.localStorage.getItem("isDark") === null) {
        useDarkStore.getState().setDark(media.matches);
        window.localStorage.removeItem("isDark");
      }

      // Modern + legacy listeners.
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", handler);
      } else if (typeof (media as any).addListener === "function") {
        // legacy Safari/old Chromium
        (media as any).addListener(handler);
      }
    }
  } catch {
    // ignore
  }
}
