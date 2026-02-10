import { create } from "zustand";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";

export type KlingElement = {
  asset_id: string;
  element_id: number;
  element_name: string;
  element_description: string;
  tag_id: string;
  frontal_file_id: string;
  refer_file_ids: string[];
  created_at: string;
  updated_at: string;
};

export const KLING_TAG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "o_101", label: "热梗" },
  { id: "o_102", label: "人物" },
  { id: "o_103", label: "动物" },
  { id: "o_104", label: "道具" },
  { id: "o_105", label: "服饰" },
  { id: "o_106", label: "场景" },
  { id: "o_107", label: "特效" },
  { id: "o_108", label: "其他" },
];

type KlingElementsStore = {
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  custom: KlingElement[];

  hydrate: () => void;
  refreshCustom: () => Promise<void>;

  createCustom: (payload: {
    element_name: string;
    element_description: string;
    frontal_file_id: string;
    refer_file_ids: string[];
    tag_id: string;
  }) => Promise<KlingElement>;

  deleteCustom: (asset_id: string) => Promise<void>;
};

function base() {
  return getURL("KLING_ELEMENTS", {}, true);
}

function toStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => toStr(x)).filter(Boolean);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeList(value: unknown): KlingElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((x) => ({
      asset_id: toStr(x.asset_id),
      element_id: toNum(x.element_id),
      element_name: toStr(x.element_name),
      element_description: toStr(x.element_description),
      tag_id: toStr(x.tag_id),
      frontal_file_id: toStr(x.frontal_file_id),
      refer_file_ids: toStrArray(x.refer_file_ids),
      created_at: toStr(x.created_at),
      updated_at: toStr(x.updated_at),
    }))
    .filter((x) => x.asset_id && Number.isFinite(x.element_id));
}

export const useKlingElementsStore = create<KlingElementsStore>((set, get) => ({
  hydrated: false,
  loading: false,
  error: null,
  custom: [],

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    void get().refreshCustom();
  },

  refreshCustom: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<unknown>(`${base()}/custom`, {
        params: { limit: 200, offset: 0 },
      });
      const list = normalizeList(res?.data);
      set({ custom: list });
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { detail?: unknown; message?: unknown } } };
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      set({ custom: [], error: String(detail ?? err?.message ?? "加载主体失败") });
    } finally {
      set({ loading: false });
    }
  },

  createCustom: async (payload) => {
    const res = await api.post<unknown>(`${base()}/custom`, payload);
    const createdRaw = res?.data;
    const created = normalizeList([createdRaw])[0];
    if (!created) {
      throw new Error("创建主体失败：返回数据无效");
    }
    set((s) => ({
      custom: [created, ...s.custom.filter((x) => x.asset_id !== created.asset_id)],
      error: null,
    }));
    return created;
  },

  deleteCustom: async (asset_id) => {
    try {
      await api.post(`${base()}/delete`, { asset_id: String(asset_id) });
      set((s) => ({ custom: s.custom.filter((x) => x.asset_id !== String(asset_id)) }));
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { detail?: unknown; message?: unknown } } };
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      set({ error: String(detail ?? err?.message ?? "删除主体失败") });
    }
  },
}));
