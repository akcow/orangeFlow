import { create } from "zustand";
import { cloneDeep } from "lodash";
import { api } from "@/controllers/API/api";
import type { NodeDataType } from "@/types/flow";
import { getURL } from "@/controllers/API/helpers/constants";
import { customGetAccessToken } from "@/customization/utils/custom-get-access-token";
import { getFilesDownloadUrl } from "@/utils/workflowUtils";

type AssetCover =
  | { kind: "default" }
  | { kind: "url"; url: string }
  // NOTE: assetId is a v2 file_id (UUID) for cover images.
  | { kind: "asset"; assetId: string };

export type StoredAsset = {
  id: string;
  userId: string;
  name: string;
  category: string;
  tags: string[];
  cover: AssetCover;
  data: NodeDataType;
  resourceMap?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
};

type DraftAsset =
  | { status: "idle" }
  | {
      status: "preparing" | "ready" | "error";
      data: NodeDataType;
      defaultName: string;
      cover: AssetCover;
      category: string;
      tags: string[];
      resourceMap?: Record<string, any>;
      error?: string;
    };

type AssetsStore = {
  hydrated: boolean;
  assets: StoredAsset[];
  search: string;
  draft: DraftAsset;

  hydrate: () => void;
  setSearch: (search: string) => void;

  startDraftFromNode: (nodeData: NodeDataType) => Promise<void>;
  clearDraft: () => void;

  saveDraftAsAsset: (params: {
    name: string;
    category: string;
    tags: string[];
    cover: AssetCover;
  }) => Promise<string | null>;

  updateAssetMeta: (
    id: string,
    patch: Partial<Pick<StoredAsset, "name" | "category" | "tags" | "cover">>,
  ) => Promise<void>;

  deleteAsset: (id: string) => Promise<void>;
  markUsed: (id: string) => void;
  restoreAsset: (id: string) => Promise<NodeDataType | null>;
};

const DEFAULT_COVER: AssetCover = { kind: "default" };

function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(raw: string[]): string[] {
  return Array.from(
    new Set(
      (raw ?? [])
        .map((t) => String(t ?? "").trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  );
}

function getFileNameFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : "file";
}

function getFileNameFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    const withoutQuery = u.pathname;
    return getFileNameFromPath(withoutQuery);
  } catch {
    const [clean] = url.split("?");
    return getFileNameFromPath(clean);
  }
}

function looksLikeImageFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp")
  );
}

function collectTemplateFilePaths(template: any): string[] {
  if (!template || typeof template !== "object") return [];
  const paths: string[] = [];
  for (const field of Object.values(template)) {
    if (!field || typeof field !== "object") continue;
    const maybeFilePath = (field as any).file_path;
    const maybePath = (field as any).path;

    const add = (v: any) => {
      if (typeof v === "string" && v.trim().length > 0) paths.push(v);
    };

    if (Array.isArray(maybeFilePath)) maybeFilePath.forEach(add);
    else add(maybeFilePath);

    if (Array.isArray(maybePath)) maybePath.forEach(add);
    else add(maybePath);
  }
  return paths;
}

function replaceTemplatePathsWithMapping(
  template: any,
  mapping: Record<string, { user_file_path: string }>,
) {
  if (!template || typeof template !== "object") return template;
  const next = { ...template };
  for (const [key, field] of Object.entries(next)) {
    if (!field || typeof field !== "object") continue;
    const patchField = (fieldKey: "file_path" | "path") => {
      const raw = (field as any)[fieldKey];
      const mapOne = (value: any) => {
        if (typeof value !== "string") return value;
        return mapping[value]?.user_file_path ?? value;
      };
      if (Array.isArray(raw)) {
        (field as any)[fieldKey] = raw.map(mapOne);
      } else if (raw !== undefined && raw !== null) {
        (field as any)[fieldKey] = mapOne(raw);
      }
    };
    patchField("file_path");
    patchField("path");
    (next as any)[key] = field;
  }
  return next;
}

function collectFileDownloadUrlsFromValue(value: any, out: Set<string>) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.includes("/files/download/")) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectFileDownloadUrlsFromValue(v, out));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((v) => collectFileDownloadUrlsFromValue(v, out));
  }
}

function deepMapStrings(value: any, map: (s: string) => string): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map((v) => deepMapStrings(v, map));
  if (typeof value === "object") {
    const out: any = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepMapStrings(v, map);
    }
    return out;
  }
  return value;
}

async function downloadPathAsBlob(path: string): Promise<Blob> {
  const url = getFilesDownloadUrl(path);
  const headers: Record<string, string> = {};
  const token = customGetAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to download file (${response.status})`);
  }
  return await response.blob();
}

async function downloadUrlAsBlob(url: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = customGetAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to download url (${response.status})`);
  }
  return await response.blob();
}

async function uploadUserFile(file: File): Promise<{ id: string; path: string; name: string; size: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<any>(getURL("FILES", {}, true), formData);
  return {
    id: String(response.data.id),
    path: String(response.data.path),
    name: String(response.data.name),
    size: Number(response.data.size ?? 0),
  };
}

async function buildAssetWithPackedFiles(nodeData: NodeDataType): Promise<{
  data: NodeDataType;
  resourceMap: Record<string, any>;
  coverGuess: AssetCover;
}> {
  const template = (nodeData as any)?.node?.template;
  const filePaths = Array.from(new Set(collectTemplateFilePaths(template)));

  const file_path_map: Record<string, { file_id: string; user_file_path: string }> = {};
  for (const original of filePaths) {
    const blob = await downloadPathAsBlob(original);
    const name = getFileNameFromPath(original);
    const type = (blob as any)?.type || "application/octet-stream";
    const uploaded = await uploadUserFile(new File([blob], name || "asset.bin", { type }));
    file_path_map[original] = { file_id: uploaded.id, user_file_path: uploaded.path };
  }

  // Also package any embedded /files/download/... urls inside template values.
  const url_map: Record<string, { file_id: string; user_file_path: string }> = {};
  const embeddedUrls = new Set<string>();
  if (template && typeof template === "object") {
    for (const field of Object.values(template)) {
      if (!field || typeof field !== "object" || !("value" in (field as any))) continue;
      collectFileDownloadUrlsFromValue((field as any).value, embeddedUrls);
    }
  }
  for (const originalUrl of Array.from(embeddedUrls)) {
    try {
      const blob = await downloadUrlAsBlob(originalUrl);
      const name = getFileNameFromUrl(originalUrl);
      const type = (blob as any)?.type || "application/octet-stream";
      const uploaded = await uploadUserFile(new File([blob], name || "asset.bin", { type }));
      url_map[originalUrl] = { file_id: uploaded.id, user_file_path: uploaded.path };
    } catch {
      // Best-effort: ignore URLs we can't fetch.
    }
  }

  const nextNodeData = cloneDeep(nodeData);
  if ((nextNodeData as any).node?.template) {
    (nextNodeData as any).node.template = replaceTemplatePathsWithMapping(
      (nextNodeData as any).node.template,
      Object.fromEntries(Object.entries(file_path_map).map(([k, v]) => [k, { user_file_path: v.user_file_path }])),
    );

    // Rewrite embedded URLs to v2 download-by-path URLs for the uploaded user files.
    for (const [key, field] of Object.entries((nextNodeData as any).node.template)) {
      if (!field || typeof field !== "object" || !("value" in (field as any))) continue;
      (field as any).value = deepMapStrings((field as any).value, (s) => {
        const hit = url_map[s];
        if (!hit) return s;
        return getFilesDownloadUrl(hit.user_file_path);
      });
      (nextNodeData as any).node.template[key] = field;
    }
  }

  // Prefer using the first uploaded image file as cover.
  let coverGuess: AssetCover = DEFAULT_COVER;
  const firstImage = Object.entries(file_path_map).find(([original]) => looksLikeImageFile(original));
  if (firstImage) {
    coverGuess = { kind: "asset", assetId: firstImage[1].file_id };
  }

  return {
    data: nextNodeData,
    resourceMap: {
      file_path_map,
      url_map,
    },
    coverGuess,
  };
}

function normalizeAssetFromApi(raw: any): StoredAsset {
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    name: String(raw.name ?? ""),
    category: String(raw.category ?? "其他"),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    cover: (raw.cover as any) ?? DEFAULT_COVER,
    data: raw.data as NodeDataType,
    resourceMap: (raw.resource_map as any) ?? {},
    createdAt: String(raw.created_at ?? nowIso()),
    updatedAt: String(raw.updated_at ?? nowIso()),
    lastUsedAt: raw.last_used_at ?? null,
  };
}

export const useAssetsStore = create<AssetsStore>((set, get) => ({
  hydrated: false,
  assets: [],
  search: "",
  draft: { status: "idle" },

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    void (async () => {
      try {
        const res = await api.get<any[]>(getURL("ASSETS_LIBRARY", {}, true), {
          params: { limit: 200, offset: 0 },
        });
        set({ assets: (res.data ?? []).map(normalizeAssetFromApi) });
      } catch {
        // Keep UI functional even if library is unavailable.
        set({ assets: [] });
      }
    })();
  },

  setSearch: (search) => set({ search }),

  startDraftFromNode: async (nodeData) => {
    const prefix = "我的资产";
    const existing = get().assets;
    let maxN = 0;
    for (const a of existing) {
      if (!a.name.startsWith(prefix)) continue;
      const n = Number.parseInt(a.name.slice(prefix.length), 10);
      if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
    }
    const nextName = `${prefix}${maxN + 1}`;

    set({
      draft: {
        status: "preparing",
        data: nodeData,
        defaultName: nextName,
        cover: DEFAULT_COVER,
        category: "其他",
        tags: [],
        resourceMap: {},
      },
    });

    try {
      const prepared = await buildAssetWithPackedFiles(nodeData);
      set((state) => {
        if (state.draft.status !== "preparing") return state;
        return {
          ...state,
          draft: {
            ...state.draft,
            status: "ready",
            data: prepared.data,
            cover: prepared.coverGuess,
            resourceMap: prepared.resourceMap,
          } as DraftAsset,
        };
      });
    } catch (e: any) {
      set((state) => {
        if (state.draft.status === "idle") return state;
        return {
          ...state,
          draft: {
            ...state.draft,
            status: "error",
            error: e?.message ?? "创建资产失败",
          } as DraftAsset,
        };
      });
    }
  },

  clearDraft: () => set({ draft: { status: "idle" } }),

  saveDraftAsAsset: async ({ name, category, tags, cover }) => {
    const draft = get().draft;
    if (draft.status !== "ready") return null;
    const payload = {
      name: name.trim() || "未命名资产",
      category: category || "其他",
      tags: normalizeTags(tags),
      cover: cover ?? DEFAULT_COVER,
      data: draft.data,
      resource_map: draft.resourceMap ?? {},
    };
    const res = await api.post<any>(getURL("ASSETS_LIBRARY", {}, true), payload);
    const saved = normalizeAssetFromApi(res.data);
    set((state) => ({
      assets: [saved, ...state.assets.filter((a) => a.id !== saved.id)],
      draft: { status: "idle" },
    }));
    return saved.id;
  },

  updateAssetMeta: async (id, patch) => {
    const payload: any = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.tags !== undefined) payload.tags = normalizeTags(patch.tags);
    if (patch.cover !== undefined) payload.cover = patch.cover;
    const res = await api.put<any>(`${getURL("ASSETS_LIBRARY", {}, true)}/${id}`, payload);
    const updated = normalizeAssetFromApi(res.data);
    set((state) => ({
      assets: state.assets.map((a) => (a.id === id ? updated : a)),
    }));
  },

  deleteAsset: async (id) => {
    await api.delete(`${getURL("ASSETS_LIBRARY", {}, true)}/${id}`);
    set((state) => ({ assets: state.assets.filter((a) => a.id !== id) }));
  },

  markUsed: (id) => {
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === id ? { ...a, lastUsedAt: nowIso(), updatedAt: nowIso() } : a,
      ),
    }));
    void api.post(`${getURL("ASSETS_LIBRARY", {}, true)}/${id}/mark_used`).catch(() => {});
  },

  restoreAsset: async (id) => {
    const hit = get().assets.find((a) => a.id === id);
    if (!hit) return null;
    return cloneDeep(hit.data);
  },
}));

