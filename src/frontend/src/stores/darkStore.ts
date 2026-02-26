import { create } from "zustand";
import type { DarkStoreType } from "../types/zustand/dark";

export const useDarkStore = create<DarkStoreType>((set, get) => ({
  dark: (() => {
    // Default to system preference when the user has never explicitly set a theme.
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("isDark");
    if (stored === null) {
      try {
        return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      } catch {
        return false;
      }
    }
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn("Failed to parse isDark from localStorage; resetting.", e);
      window.localStorage.removeItem("isDark");
      return false;
    }
  })(),
  version: "",
  latestVersion: "",
  refreshLatestVersion: (v: string) => {
    set(() => ({ latestVersion: v }));
  },
  setDark: (dark) => {
    set(() => ({ dark: dark }));
    window.localStorage.setItem("isDark", dark.toString());
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
        // @ts-expect-error legacy Safari/old Chromium
        media.addListener(handler);
      }
    }
  } catch {
    // ignore
  }
}
