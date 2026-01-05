import { create } from "zustand";
import type { DarkStoreType } from "../types/zustand/dark";

export const useDarkStore = create<DarkStoreType>((set, get) => ({
  dark: (() => {
    const stored = window.localStorage.getItem("isDark");
    return stored !== null ? JSON.parse(stored) : false;
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
