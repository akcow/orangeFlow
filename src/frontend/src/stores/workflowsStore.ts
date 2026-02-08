import { create } from "zustand";
import { cloneDeep } from "lodash";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { customGetAccessToken } from "@/customization/utils/custom-get-access-token";
import type { AllNodeType, EdgeType } from "@/types/flow";
import {
  extractGroupSelectionForWorkflow,
  getFilesDownloadUrl,
  guessWorkflowCoverFromSelection,
  type WorkflowSelection,
} from "@/utils/workflowUtils";

type WorkflowCover =
  | { kind: "default" }
  | { kind: "url"; url: string }
  // NOTE: assetId is a v2 file_id (UUID) for cover images.
  | { kind: "asset"; assetId: string };

export type StoredWorkflow = {
  id: string;
  userId: string;
  rootGroupId: string;
  name: string;
  note: string;
  tags: string[];
  cover: WorkflowCover;
  selection: WorkflowSelection;
  resourceMap?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
};

type DraftState =
  | { status: "idle" }
  | {
      status: "preparing" | "ready" | "error";
      rootGroupId: string;
      defaultName: string;
      selection: WorkflowSelection;
      cover: WorkflowCover;
      note: string;
      tags: string[];
      resourceMap?: Record<string, any>;
      error?: string;
    };

type WorkflowsStore = {
  hydrated: boolean;
  workflows: StoredWorkflow[];
  activeTab: "recent" | "mine" | "public";
  search: string;
  draft: DraftState;

  hydrate: () => void;
  setActiveTab: (tab: WorkflowsStore["activeTab"]) => void;
  setSearch: (search: string) => void;

  startDraftFromGroup: (params: {
    groupId: string;
    nodes: AllNodeType[];
    edges: EdgeType[];
  }) => Promise<void>;
  clearDraft: () => void;

  saveDraftAsWorkflow: (params: {
    name: string;
    note: string;
    tags: string[];
    cover: WorkflowCover;
  }) => Promise<string | null>;
  updateWorkflowMeta: (
    id: string,
    patch: Partial<Pick<StoredWorkflow, "name" | "note" | "tags" | "cover">>,
  ) => Promise<void>;
  updateWorkflowFromGroup: (params: {
    workflowId: string;
    groupId: string;
    nodes: AllNodeType[];
    edges: EdgeType[];
  }) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;

  markUsed: (id: string) => void;

  materializeSelectionForUse: (params: {
    workflowId: string;
    currentFlowId: string;
  }) => Promise<WorkflowSelection | null>;
};

const DEFAULT_COVER: WorkflowCover = { kind: "default" };

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
    const out: any = {};
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
  if (!response.ok) throw new Error(`Failed to download file (${response.status})`);
  return await response.blob();
}

async function downloadUrlAsBlob(url: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = customGetAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, credentials: "include" });
  if (!response.ok) throw new Error(`Failed to download url (${response.status})`);
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

function deriveRootGroupId(selection: WorkflowSelection, fallback: string): string {
  if (fallback) return fallback;
  const maybe = selection?.nodes?.find((n: any) => String(n?.type || "").toLowerCase().includes("group"));
  return (maybe?.id as string) ?? selection?.nodes?.[0]?.id ?? "";
}

async function packSelectionResources(params: {
  selection: WorkflowSelection;
}): Promise<{ selection: WorkflowSelection; resourceMap: Record<string, any>; coverGuess: WorkflowCover }> {
  const original = params.selection;
  const allFilePaths: string[] = [];
  for (const n of original.nodes ?? []) {
    const template = (n as any)?.data?.node?.template;
    collectTemplateFilePaths(template).forEach((p) => allFilePaths.push(p));
  }
  const uniqueFilePaths = Array.from(new Set(allFilePaths));

  const file_path_map: Record<string, { file_id: string; user_file_path: string }> = {};
  for (const originalPath of uniqueFilePaths) {
    const blob = await downloadPathAsBlob(originalPath);
    const name = getFileNameFromPath(originalPath);
    const type = (blob as any)?.type || "application/octet-stream";
    const uploaded = await uploadUserFile(new File([blob], name || "asset.bin", { type }));
    file_path_map[originalPath] = { file_id: uploaded.id, user_file_path: uploaded.path };
  }

  // Embedded /files/download/... URLs inside template values.
  const embeddedUrls = new Set<string>();
  for (const n of original.nodes ?? []) {
    const template = (n as any)?.data?.node?.template;
    if (!template || typeof template !== "object") continue;
    for (const field of Object.values(template)) {
      if (!field || typeof field !== "object" || !("value" in (field as any))) continue;
      collectFileDownloadUrlsFromValue((field as any).value, embeddedUrls);
    }
  }

  const url_map: Record<string, { file_id: string; user_file_path: string }> = {};
  for (const originalUrl of Array.from(embeddedUrls)) {
    try {
      const blob = await downloadUrlAsBlob(originalUrl);
      const name = getFileNameFromUrl(originalUrl);
      const type = (blob as any)?.type || "application/octet-stream";
      const uploaded = await uploadUserFile(new File([blob], name || "asset.bin", { type }));
      url_map[originalUrl] = { file_id: uploaded.id, user_file_path: uploaded.path };
    } catch {
      // ignore
    }
  }

  const nextSelection = cloneDeep(original);
  for (const node of nextSelection.nodes ?? []) {
    const template = (node as any)?.data?.node?.template;
    if (template && typeof template === "object") {
      (node as any).data.node.template = replaceTemplatePathsWithMapping(
        template,
        Object.fromEntries(
          Object.entries(file_path_map).map(([k, v]) => [k, { user_file_path: v.user_file_path }]),
        ),
      );

      // rewrite embedded urls
      for (const [key, field] of Object.entries((node as any).data.node.template)) {
        if (!field || typeof field !== "object" || !("value" in (field as any))) continue;
        (field as any).value = deepMapStrings((field as any).value, (s) => {
          const hit = url_map[s];
          if (!hit) return s;
          return getFilesDownloadUrl(hit.user_file_path);
        });
        (node as any).data.node.template[key] = field;
      }
    }
  }

  // Cover guess: prefer first uploaded image file; else fallback to existing heuristic.
  let coverGuess: WorkflowCover = DEFAULT_COVER;
  const firstImage = Object.entries(file_path_map).find(([originalPath]) => looksLikeImageFile(originalPath));
  if (firstImage) {
    coverGuess = { kind: "asset", assetId: firstImage[1].file_id };
  } else {
    const guess = guessWorkflowCoverFromSelection(nextSelection.nodes ?? []);
    if (guess) coverGuess = { kind: "url", url: guess };
  }

  return {
    selection: nextSelection,
    resourceMap: { file_path_map, url_map },
    coverGuess,
  };
}

function normalizeWorkflowFromApi(raw: any): StoredWorkflow {
  const selection = raw.selection as WorkflowSelection;
  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    rootGroupId: deriveRootGroupId(selection, ""),
    name: String(raw.name ?? ""),
    note: String(raw.note ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    cover: (raw.cover as any) ?? DEFAULT_COVER,
    selection,
    resourceMap: (raw.resource_map as any) ?? {},
    createdAt: String(raw.created_at ?? nowIso()),
    updatedAt: String(raw.updated_at ?? nowIso()),
    lastUsedAt: raw.last_used_at ?? null,
  };
}

export const useWorkflowsStore = create<WorkflowsStore>((set, get) => ({
  hydrated: false,
  workflows: [],
  activeTab: "mine",
  search: "",
  draft: { status: "idle" },

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    void (async () => {
      try {
        const res = await api.get<any[]>(getURL("WORKFLOWS_LIBRARY", {}, true), {
          params: { limit: 200, offset: 0 },
        });
        set({ workflows: (res.data ?? []).map(normalizeWorkflowFromApi) });
      } catch {
        set({ workflows: [] });
      }
    })();
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearch: (search) => set({ search }),

  startDraftFromGroup: async ({ groupId, nodes, edges }) => {
    const selection = extractGroupSelectionForWorkflow({ groupId, nodes, edges });
    const defaultName = `工作流 ${new Date().toLocaleString()}`;

    set({
      draft: {
        status: "preparing",
        rootGroupId: groupId,
        defaultName,
        selection,
        cover: DEFAULT_COVER,
        note: "",
        tags: [],
        resourceMap: {},
      },
    });

    try {
      const packed = await packSelectionResources({ selection });
      set((state) => {
        if (state.draft.status !== "preparing") return state;
        return {
          ...state,
          draft: {
            ...state.draft,
            status: "ready",
            selection: packed.selection,
            cover: packed.coverGuess,
            resourceMap: packed.resourceMap,
          } as DraftState,
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
            error: e?.message ?? "创建工作流失败",
          } as DraftState,
        };
      });
    }
  },

  clearDraft: () => set({ draft: { status: "idle" } }),

  saveDraftAsWorkflow: async ({ name, note, tags, cover }) => {
    const draft = get().draft;
    if (draft.status !== "ready") return null;
    const payload = {
      name: name.trim() || "未命名工作流",
      note: note ?? "",
      tags: normalizeTags(tags),
      cover: cover ?? DEFAULT_COVER,
      selection: draft.selection,
      resource_map: draft.resourceMap ?? {},
    };
    const res = await api.post<any>(getURL("WORKFLOWS_LIBRARY", {}, true), payload);
    const saved = normalizeWorkflowFromApi(res.data);
    set((state) => ({
      workflows: [saved, ...state.workflows.filter((w) => w.id !== saved.id)],
      draft: { status: "idle" },
    }));
    return saved.id;
  },

  updateWorkflowMeta: async (id, patch) => {
    const payload: any = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.note !== undefined) payload.note = patch.note;
    if (patch.tags !== undefined) payload.tags = normalizeTags(patch.tags);
    if (patch.cover !== undefined) payload.cover = patch.cover;
    const res = await api.put<any>(`${getURL("WORKFLOWS_LIBRARY", {}, true)}/${id}`, payload);
    const updated = normalizeWorkflowFromApi(res.data);
    set((state) => ({
      workflows: state.workflows.map((w) => (w.id === id ? updated : w)),
    }));
  },

  updateWorkflowFromGroup: async ({ workflowId, groupId, nodes, edges }) => {
    const selection = extractGroupSelectionForWorkflow({ groupId, nodes, edges });
    const packed = await packSelectionResources({ selection });
    const payload = { selection: packed.selection, resource_map: packed.resourceMap };
    const res = await api.put<any>(`${getURL("WORKFLOWS_LIBRARY", {}, true)}/${workflowId}`, payload);
    const updated = normalizeWorkflowFromApi(res.data);
    set((state) => ({
      workflows: state.workflows.map((w) => (w.id === workflowId ? updated : w)),
    }));
  },

  deleteWorkflow: async (id) => {
    await api.delete(`${getURL("WORKFLOWS_LIBRARY", {}, true)}/${id}`);
    set((state) => ({ workflows: state.workflows.filter((w) => w.id !== id) }));
  },

  markUsed: (id) => {
    set((state) => ({
      workflows: state.workflows.map((w) =>
        w.id === id ? { ...w, lastUsedAt: nowIso(), updatedAt: nowIso() } : w,
      ),
    }));
    void api.post(`${getURL("WORKFLOWS_LIBRARY", {}, true)}/${id}/mark_used`).catch(() => {});
  },

  materializeSelectionForUse: async ({ workflowId }) => {
    const wf = get().workflows.find((w) => w.id === workflowId);
    if (!wf) return null;
    return cloneDeep(wf.selection);
  },
}));

