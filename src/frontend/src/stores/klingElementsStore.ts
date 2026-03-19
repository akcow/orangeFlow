import { create } from "zustand";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";

export type KlingElement = {
  asset_id: string;
  element_id: number;
  element_name: string;
  element_description: string;
  tag_id: string;
  reference_type: "image_refer" | "video_refer" | string;
  preview_file_id: string;
  frontal_file_id: string;
  refer_file_ids: string[];
  video_file_id: string;
  element_voice_id: string;
  created_at: string;
  updated_at: string;
};

export type KlingPresetElement = {
  element_id: number;
  element_name: string;
  element_description: string;
  reference_type: string;
  frontal_image: string;
};

export const KLING_TAG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "o_101", label: "动物" },
  { id: "o_102", label: "宠物" },
  { id: "o_103", label: "美食" },
  { id: "o_104", label: "服饰" },
  { id: "o_105", label: "人物" },
  { id: "o_106", label: "品牌" },
  { id: "o_107", label: "场景" },
  { id: "o_108", label: "其他" },
];

type KlingElementsStore = {
  hydrated: boolean;
  customLoading: boolean;
  presetsLoading: boolean;
  customError: string | null;
  presetsError: string | null;
  custom: KlingElement[];
  presets: KlingPresetElement[];

  hydrate: () => void;
  refreshCustom: () => Promise<void>;
  refreshPresets: () => Promise<void>;

  createCustom: (payload: {
    element_name: string;
    element_description: string;
    reference_type?: "image_refer" | "video_refer";
    frontal_file_id?: string;
    refer_file_ids?: string[];
    video_file_id?: string;
    tag_id: string;
    element_voice_id?: string;
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
      reference_type: toStr(x.reference_type) || "image_refer",
      preview_file_id: toStr(x.preview_file_id),
      frontal_file_id: toStr(x.frontal_file_id),
      refer_file_ids: toStrArray(x.refer_file_ids),
      video_file_id: toStr(x.video_file_id),
      element_voice_id: toStr(x.element_voice_id),
      created_at: toStr(x.created_at),
      updated_at: toStr(x.updated_at),
    }))
    .filter((x) => x.asset_id && Number.isFinite(x.element_id));
}

function normalizePresets(value: unknown): KlingPresetElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((x) => ({
      element_id: toNum(x.element_id),
      element_name: toStr(x.element_name),
      element_description: toStr(x.element_description),
      reference_type: toStr(x.reference_type),
      frontal_image: toStr(x.frontal_image),
    }))
    .filter((x) => Number.isFinite(x.element_id) && x.element_id > 0 && Boolean(x.element_name));
}

export const useKlingElementsStore = create<KlingElementsStore>((set, get) => ({
  hydrated: false,
  customLoading: false,
  presetsLoading: false,
  customError: null,
  presetsError: null,
  custom: [],
  presets: [],

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    void get().refreshCustom();
    void get().refreshPresets();
  },

  refreshCustom: async () => {
    set({ customLoading: true, customError: null });
    try {
      const res = await api.get<unknown>(`${base()}/custom`, {
        params: { limit: 200, offset: 0 },
      });
      const list = normalizeList(res?.data);
      set({ custom: list });
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { detail?: unknown; message?: unknown } } };
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      set({ custom: [], customError: String(detail ?? err?.message ?? "加载我的主体失败") });
    } finally {
      set({ customLoading: false });
    }
  },

  refreshPresets: async () => {
    set({ presetsLoading: true, presetsError: null });
    try {
      const res = await api.get<unknown>(`${base()}/presets`, {
        params: { page_num: 1, page_size: 200 },
      });
      const list = normalizePresets(res?.data);
      set({ presets: list });
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { detail?: unknown; message?: unknown } } };
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      set({ presets: [], presetsError: String(detail ?? err?.message ?? "加载官方主体失败") });
    } finally {
      set({ presetsLoading: false });
    }
  },

  createCustom: async (payload) => {
    const res = await api.post<unknown>(`${base()}/custom`, payload);
    const createdRaw = res?.data;
    const created = normalizeList([createdRaw])[0];
    if (!created) {
      throw new Error("创建主体失败：返回结果缺少有效主体数据");
    }
    set((s) => ({
      custom: [created, ...s.custom.filter((x) => x.asset_id !== created.asset_id)],
      customError: null,
    }));
    return created;
  },

  deleteCustom: async (asset_id) => {
    try {
      await api.post(`${base()}/delete`, { asset_id: String(asset_id) });
      set((s) => ({
        custom: s.custom.filter((x) => x.asset_id !== String(asset_id)),
      }));
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { detail?: unknown; message?: unknown } } };
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      set({ customError: String(detail ?? err?.message ?? "删除主体失败") });
    }
  },
}));
