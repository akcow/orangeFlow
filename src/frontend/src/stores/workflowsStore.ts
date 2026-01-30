import { create } from "zustand";
import { cloneDeep } from "lodash";
import { api } from "@/controllers/API/api";
import { customGetAccessToken } from "@/customization/utils/custom-get-access-token";
import type { AllNodeType, EdgeType } from "@/types/flow";
import { getLocalStorage, setLocalStorage } from "@/utils/local-storage-util";
import { getWorkflowAsset, putWorkflowAsset, deleteWorkflowAsset } from "@/utils/workflowAssetsDb";
import { getURL } from "@/controllers/API/helpers/constants";
import {
  extractGroupSelectionForWorkflow,
  getFilesDownloadUrl,
  guessWorkflowCoverFromSelection,
  type WorkflowSelection,
} from "@/utils/workflowUtils";

type WorkflowCover =
  | { kind: "default" }
  | { kind: "url"; url: string }
  | { kind: "asset"; assetId: string };

export type StoredWorkflow = {
  id: string;
  rootGroupId: string;
  name: string;
  note: string;
  tags: string[];
  cover: WorkflowCover;
  selection: WorkflowSelection;
  // If we found file-download URLs embedded in template values (e.g. draft_output),
  // we store a copy of the resource and can rewrite to fresh URLs when applying.
  urlAssetMap?: Record<string, string>; // originalUrl -> assetId
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
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
      urlAssetMap?: Record<string, string>;
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
  }) => string | null;
  updateWorkflowMeta: (
    id: string,
    patch: Partial<Pick<StoredWorkflow, "name" | "note" | "tags" | "cover">>,
  ) => void;
  deleteWorkflow: (id: string) => Promise<void>;

  markUsed: (id: string) => void;

  materializeSelectionForUse: (params: {
    workflowId: string;
    currentFlowId: string;
  }) => Promise<WorkflowSelection | null>;
};

const STORAGE_KEY = "lf_workflows_library_v1";
const COUNTER_KEY = "lf_workflows_counter_v1";
const DEFAULT_COVER: WorkflowCover = { kind: "default" };

function nowIso() {
  return new Date().toISOString();
}

function getNextDefaultWorkflowName(): string {
  const raw = getLocalStorage(COUNTER_KEY);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  setLocalStorage(COUNTER_KEY, String(next));
  return `工作流${next}`;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function makeId(prefix: string) {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  return `${prefix}_${rnd}`;
}

type AssetRef = { workflowAssetId: string; name?: string; originalPath?: string };

function isAssetRef(value: unknown): value is AssetRef {
  return Boolean(value) && typeof value === "object" && "workflowAssetId" in (value as any);
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

function replaceTemplatePathsWithAssetRefs(
  template: any,
  mapping: Map<string, { assetId: string; name: string }>,
) {
  if (!template || typeof template !== "object") return template;
  const next = { ...template };
  for (const [key, field] of Object.entries(next)) {
    if (!field || typeof field !== "object") continue;
    const patchField = (fieldKey: "file_path" | "path") => {
      const raw = (field as any)[fieldKey];
      const mapOne = (value: any) => {
        if (typeof value !== "string") return value;
        const hit = mapping.get(value);
        if (!hit) return value;
        const ref: AssetRef = {
          workflowAssetId: hit.assetId,
          name: hit.name,
          originalPath: value,
        };
        return ref;
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

async function downloadPathAsBlob(path: string): Promise<Blob> {
  const url = getFilesDownloadUrl(path);
  const headers: Record<string, string> = {};
  const token = customGetAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to download asset (${response.status})`);
  }
  return await response.blob();
}

async function downloadUrlAsBlob(url: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = customGetAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to download asset url (${response.status})`);
  }
  return await response.blob();
}

function normalizeCoverFromGuess(guess: string | null): WorkflowCover {
  if (!guess) return DEFAULT_COVER;
  return { kind: "url", url: guess };
}

function extractFileDownloadPathFromUrl(url: string): string | null {
  const marker = "/files/download/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length);
  const [path] = rest.split("?");
  return path ? decodeURIComponent(path) : null;
}

function findFirstImagePathInSelection(selection: WorkflowSelection): string | null {
  for (const node of selection.nodes) {
    const template = (node as any)?.data?.node?.template;
    for (const path of collectTemplateFilePaths(template)) {
      if (looksLikeImageFile(path)) return path;
    }
  }
  return null;
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

function replaceTemplateValueUrls(template: any, replacements: Map<string, string>) {
  if (!template || typeof template !== "object" || replacements.size === 0) return template;
  const next = cloneDeep(template);
  const replaceValue = (value: any): any => {
    if (typeof value === "string") return replacements.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replaceValue);
    if (value && typeof value === "object") {
      const out: any = Array.isArray(value) ? [] : {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = replaceValue(v);
      }
      return out;
    }
    return value;
  };
  for (const field of Object.values(next)) {
    if (!field || typeof field !== "object") continue;
    if ("value" in (field as any)) {
      (field as any).value = replaceValue((field as any).value);
    }
  }
  return next;
}

function deepCollectAssetRefs(value: any, out: Set<string>) {
  if (!value) return;
  if (isAssetRef(value)) {
    out.add(value.workflowAssetId);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => deepCollectAssetRefs(v, out));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((v) => deepCollectAssetRefs(v, out));
  }
}

async function uploadAssetToFlow(assetId: string, flowId: string): Promise<string> {
  const record = await getWorkflowAsset(assetId);
  if (!record) throw new Error("Missing workflow asset");
  const file = new File([record.blob], record.name, {
    type: record.type || record.blob.type || "application/octet-stream",
  });
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<any>(`${getURL("FILES")}/upload/${flowId}`, formData);
  const serverPath = response?.data?.file_path;
  if (!serverPath) throw new Error("Upload succeeded but file_path missing");
  return serverPath as string;
}

function materializeTemplateWithUploads(
  template: any,
  uploadByAssetId: (assetId: string) => Promise<string>,
): Promise<any> {
  if (!template || typeof template !== "object") return Promise.resolve(template);
  const next = cloneDeep(template);

  const maybeReplace = async (field: any, fieldKey: "file_path" | "path") => {
    const raw = field?.[fieldKey];
    const mapOne = async (entry: any) => {
      if (isAssetRef(entry)) {
        return await uploadByAssetId(entry.workflowAssetId);
      }
      return entry;
    };
    if (Array.isArray(raw)) {
      field[fieldKey] = await Promise.all(raw.map(mapOne));
    } else if (raw !== undefined && raw !== null) {
      field[fieldKey] = await mapOne(raw);
    }
  };

  const jobs: Promise<void>[] = [];
  for (const field of Object.values(next)) {
    if (!field || typeof field !== "object") continue;
    jobs.push(
      (async () => {
        await maybeReplace(field, "file_path");
        await maybeReplace(field, "path");
      })(),
    );
  }
  return Promise.all(jobs).then(() => next);
}

function persistWorkflows(workflows: StoredWorkflow[]) {
  setLocalStorage(STORAGE_KEY, JSON.stringify(workflows));
}

function setSelectionRootGroupLabel(selection: WorkflowSelection, rootGroupId: string, label: string) {
  const idx = selection.nodes.findIndex((n) => n.id === rootGroupId);
  if (idx === -1) return;
  const node = selection.nodes[idx] as any;
  selection.nodes[idx] = {
    ...node,
    data: { ...(node?.data ?? {}), label },
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
    const raw = safeJsonParse<any[]>(
      getLocalStorage(STORAGE_KEY),
      [],
    );

    // Backward-compatible migration: early versions didn't store rootGroupId.
    const workflows = (raw ?? []).map((wf: any) => {
      if (!wf || typeof wf !== "object") return wf;
      if (!wf.rootGroupId) {
        const maybeGroup = wf.selection?.nodes?.find?.((n: any) => n?.type === "groupNode");
        wf.rootGroupId = maybeGroup?.id ?? wf.selection?.nodes?.[0]?.id ?? "";
      }
      return wf as StoredWorkflow;
    });

    // Persist migrated records so later actions don't depend on inference.
    persistWorkflows(workflows);
    set({ workflows, hydrated: true });
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setSearch: (search) => set({ search }),

  startDraftFromGroup: async ({ groupId, nodes, edges }) => {
    const selection = extractGroupSelectionForWorkflow(groupId, nodes, edges);
    if (!selection) {
      set({
        draft: {
          status: "error",
          rootGroupId: groupId,
          defaultName: "工作流",
          selection: { nodes: [], edges: [] },
          cover: DEFAULT_COVER,
          note: "",
          tags: [],
          error: "请选择一个分组",
        },
      });
      return;
    }

    const defaultName = getNextDefaultWorkflowName();

    set({
      draft: {
        status: "preparing",
        rootGroupId: groupId,
        defaultName,
        selection,
        cover: DEFAULT_COVER,
        note: "",
        tags: [],
        urlAssetMap: {},
      },
    });

    try {
      // Download & store file assets referenced by template fields.
      const allPaths = new Set<string>();
      selection.nodes.forEach((n) => {
        const template = (n as any)?.data?.node?.template;
        collectTemplateFilePaths(template).forEach((p) => allPaths.add(p));
      });

      const mapping = new Map<string, { assetId: string; name: string }>();
      for (const path of allPaths) {
        const blob = await downloadPathAsBlob(path);
        const assetId = makeId("wfa");
        const name = getFileNameFromPath(path);
        await putWorkflowAsset({
          id: assetId,
          blob,
          name,
          type: blob.type || "application/octet-stream",
          size: blob.size,
          createdAt: nowIso(),
        });
        mapping.set(path, { assetId, name });
      }

      // Also copy any embedded /files/download/... urls inside template values (e.g. draft_output)
      // so previews remain valid when applying the workflow to another flow.
      const urlAssetMap: Record<string, string> = {};
      const embeddedUrls = new Set<string>();
      for (const node of selection.nodes) {
        const template = (node as any)?.data?.node?.template;
        if (!template || typeof template !== "object") continue;
        // Only scan values; file_path/path are already handled above.
        for (const field of Object.values(template)) {
          if (!field || typeof field !== "object") continue;
          if (!("value" in (field as any))) continue;
          collectFileDownloadUrlsFromValue((field as any).value, embeddedUrls);
        }
      }
      for (const url of embeddedUrls) {
        try {
          const blob = await downloadUrlAsBlob(url);
          const assetId = makeId("wfu");
          const name = getFileNameFromUrl(url);
          await putWorkflowAsset({
            id: assetId,
            blob,
            name,
            type: blob.type || "application/octet-stream",
            size: blob.size,
            createdAt: nowIso(),
          });
          urlAssetMap[url] = assetId;
        } catch {
          // Best effort; if a single url is not downloadable, keep it as-is.
        }
      }

      const nextSelection: WorkflowSelection = {
        nodes: selection.nodes.map((node) => {
          const nextNode = cloneDeep(node);
          const template = (nextNode as any)?.data?.node?.template;
          if (template) {
            let nextTemplate = replaceTemplatePathsWithAssetRefs(template, mapping);
            // Keep embedded URLs unchanged for now; we only rewrite them on apply (after upload).
            (nextNode as any).data.node.template = nextTemplate;
          }
          return nextNode;
        }),
        edges: cloneDeep(selection.edges),
      };

      // Cover: prefer generated/selected images; fallback to first image asset; else default.
      const previewGuess = guessWorkflowCoverFromSelection(selection.nodes);
      let cover: WorkflowCover = normalizeCoverFromGuess(previewGuess);
      if (cover.kind === "url" && cover.url && urlAssetMap[cover.url]) {
        cover = { kind: "asset", assetId: urlAssetMap[cover.url]! };
      } else if (cover.kind === "url" && cover.url) {
        const path = extractFileDownloadPathFromUrl(cover.url);
        if (path && mapping.get(path)) {
          cover = { kind: "asset", assetId: mapping.get(path)!.assetId };
        }
      }
      if (cover.kind === "default" || (cover.kind === "url" && !cover.url)) {
        const imagePath = findFirstImagePathInSelection(selection);
        if (imagePath && mapping.get(imagePath)) {
          cover = { kind: "asset", assetId: mapping.get(imagePath)!.assetId };
        }
      }

      set((state) => {
        if (state.draft.status === "idle") return state;
        return {
          draft: {
            ...state.draft,
            status: "ready",
            selection: nextSelection,
            cover,
            urlAssetMap,
          } as DraftState,
        };
      });
    } catch (e: any) {
      set((state) => {
        if (state.draft.status === "idle") return state;
        return {
          draft: {
            ...state.draft,
            status: "error",
            error: e?.message ?? "创建工作流失败",
          } as DraftState,
        };
      });
    }
  },

  clearDraft: () => {
    const draft = get().draft;
    set({ draft: { status: "idle" } });

    // If user cancels draft creation, clean up the downloaded temp assets.
    // (Saved workflows manage their own assets through deleteWorkflow.)
    if (draft.status === "idle") return;
    const assetIds = new Set<string>();
    deepCollectAssetRefs((draft as any).selection, assetIds);
    const cover = (draft as any).cover as WorkflowCover | undefined;
    if (cover?.kind === "asset") assetIds.add(cover.assetId);
    Object.values((draft as any).urlAssetMap ?? {}).forEach((id: string) => assetIds.add(id));
    assetIds.forEach((id) => {
      deleteWorkflowAsset(id).catch(() => {});
    });
  },

  saveDraftAsWorkflow: ({ name, note, tags, cover }) => {
    const draft = get().draft;
    if (draft.status === "idle") return null;
    if (!draft.selection?.nodes?.length) return null;

    const id = makeId("wf");
    const ts = nowIso();
    const finalName = name.trim() || draft.defaultName;
    const selection = cloneDeep(draft.selection);
    setSelectionRootGroupLabel(selection, draft.rootGroupId, finalName);
    const record: StoredWorkflow = {
      id,
      rootGroupId: draft.rootGroupId,
      name: finalName,
      note,
      tags,
      cover,
      selection,
      urlAssetMap: draft.urlAssetMap ?? {},
      createdAt: ts,
      updatedAt: ts,
      lastUsedAt: undefined,
    };

    set((state) => {
      const workflows = [record, ...state.workflows];
      persistWorkflows(workflows);
      return { workflows, draft: { status: "idle" } };
    });
    return id;
  },

  updateWorkflowMeta: (id, patch) => {
    set((state) => {
      const workflows = state.workflows.map((wf) => {
        if (wf.id !== id) return wf;
        const next = { ...wf, ...patch, updatedAt: nowIso() } as StoredWorkflow;
        if (typeof patch.name === "string") {
          const nextSelection = cloneDeep(next.selection);
          setSelectionRootGroupLabel(nextSelection, next.rootGroupId, next.name);
          next.selection = nextSelection;
        }
        return next;
      });
      persistWorkflows(workflows);
      return { workflows };
    });
  },

  deleteWorkflow: async (id) => {
    const wf = get().workflows.find((w) => w.id === id);
    if (!wf) return;

    // Best-effort cleanup of assets.
    const assetIds = new Set<string>();
    deepCollectAssetRefs(wf.selection, assetIds);
    if (wf.cover.kind === "asset") assetIds.add(wf.cover.assetId);
    Object.values(wf.urlAssetMap ?? {}).forEach((assetId) => assetIds.add(assetId));
    for (const assetId of assetIds) {
      try {
        await deleteWorkflowAsset(assetId);
      } catch {
      }
    }

    set((state) => {
      const workflows = state.workflows.filter((w) => w.id !== id);
      persistWorkflows(workflows);
      return { workflows };
    });
  },

  markUsed: (id) => {
    set((state) => {
      const workflows = state.workflows.map((wf) =>
        wf.id === id ? { ...wf, lastUsedAt: nowIso() } : wf,
      );
      persistWorkflows(workflows);
      return { workflows };
    });
  },

  materializeSelectionForUse: async ({ workflowId, currentFlowId }) => {
    const wf = get().workflows.find((w) => w.id === workflowId);
    if (!wf) return null;

    const uploadCache = new Map<string, Promise<string>>();
    const uploadByAssetId = (assetId: string) => {
      if (!uploadCache.has(assetId)) {
        uploadCache.set(assetId, uploadAssetToFlow(assetId, currentFlowId));
      }
      return uploadCache.get(assetId)!;
    };

    const next: WorkflowSelection = {
      nodes: [],
      edges: cloneDeep(wf.selection.edges),
    };

    const urlReplacements = new Map<string, string>();
    for (const [originalUrl, assetId] of Object.entries(wf.urlAssetMap ?? {})) {
      try {
        const serverPath = await uploadByAssetId(assetId);
        urlReplacements.set(originalUrl, getFilesDownloadUrl(serverPath));
      } catch {
      }
    }

    for (const node of wf.selection.nodes) {
      const nextNode = cloneDeep(node);
      if (nextNode.id === wf.rootGroupId) {
        (nextNode as any).data = { ...((nextNode as any).data ?? {}), label: wf.name };
      }
      const template = (nextNode as any)?.data?.node?.template;
      if (template) {
        const uploadedTemplate = await materializeTemplateWithUploads(
          template,
          uploadByAssetId,
        );
        (nextNode as any).data.node.template = replaceTemplateValueUrls(
          uploadedTemplate,
          urlReplacements,
        );
      }
      next.nodes.push(nextNode);
    }
    return next;
  },
}));
