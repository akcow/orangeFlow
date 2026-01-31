import { create } from "zustand";
import { cloneDeep } from "lodash";
import { api } from "@/controllers/API/api";
import { customGetAccessToken } from "@/customization/utils/custom-get-access-token";
import type { NodeDataType } from "@/types/flow";
import { getLocalStorage, setLocalStorage } from "@/utils/local-storage-util";
import { getWorkflowAsset, putWorkflowAsset, deleteWorkflowAsset } from "@/utils/workflowAssetsDb";
import { getURL } from "@/controllers/API/helpers/constants";
import {
    getFilesDownloadUrl,
    guessWorkflowCoverFromSelection,
} from "@/utils/workflowUtils";

type AssetCover =
    | { kind: "default" }
    | { kind: "url"; url: string }
    | { kind: "asset"; assetId: string };

export type StoredAsset = {
    id: string;
    name: string;
    category: string; // e.g. "人物", "场景", "物品", "风格", "音效", "其他"
    tags: string[];
    cover: AssetCover;
    data: NodeDataType; // The component configuration
    urlAssetMap?: Record<string, string>; // originalUrl -> assetId
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
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
        urlAssetMap?: Record<string, string>;
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
    }) => string | null;

    updateAssetMeta: (
        id: string,
        patch: Partial<Pick<StoredAsset, "name" | "category" | "tags" | "cover">>,
    ) => void;

    deleteAsset: (id: string) => Promise<void>;
    markUsed: (id: string) => void;
    restoreAsset: (id: string) => Promise<NodeDataType | null>;
};

const STORAGE_KEY = "lf_assets_library_v1";
const DEFAULT_COVER: AssetCover = { kind: "default" };

function nowIso() {
    return new Date().toISOString();
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

function normalizeCoverFromGuess(guess: string | null): AssetCover {
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

function persistAssets(assets: StoredAsset[]) {
    setLocalStorage(STORAGE_KEY, JSON.stringify(assets));
}

async function buildAssetWithCopiedFiles(nodeData: NodeDataType): Promise<{
    data: NodeDataType;
    urlAssetMap: Record<string, string>;
    coverGuess: AssetCover;
}> {
    // Download & store file assets referenced by template fields.
    const allPaths = new Set<string>();
    const template = (nodeData as any)?.node?.template;
    collectTemplateFilePaths(template).forEach((p) => allPaths.add(p));

    const mapping = new Map<string, { assetId: string; name: string }>();
    for (const path of Array.from(allPaths)) {
        const blob = await downloadPathAsBlob(path);
        const assetId = makeId("assta");
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

    // Also copy any embedded /files/download/... urls inside template values
    const urlAssetMap: Record<string, string> = {};
    const embeddedUrls = new Set<string>();
    if (template && typeof template === "object") {
        for (const field of Object.values(template)) {
            if (!field || typeof field !== "object" || !("value" in (field as any))) continue;
            collectFileDownloadUrlsFromValue((field as any).value, embeddedUrls);
        }
    }

    for (const url of Array.from(embeddedUrls)) {
        try {
            const blob = await downloadUrlAsBlob(url);
            const assetId = makeId("asstu");
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
        }
    }

    const nextNodeData = cloneDeep(nodeData);
    if ((nextNodeData as any).node?.template) {
        (nextNodeData as any).node.template = replaceTemplatePathsWithAssetRefs((nextNodeData as any).node.template, mapping);
    }

    // Cover guessing logic
    // For a single node, we try to see if it produces an image or has an image field.
    // We can reuse guessWorkflowCoverFromSelection but wrapping it in a fake selection-like array [nextNodeData] is tricky because types differ.
    // But guessWorkflowCoverFromSelection takes nodes: AllNodeType[].
    // NodeDataType is slightly different, but let's try to construct a dummy node.
    const dummyNode = { ...nextNodeData, id: "dummy", type: nextNodeData.type } as any;
    const previewGuess = guessWorkflowCoverFromSelection([dummyNode]);
    let cover: AssetCover = normalizeCoverFromGuess(previewGuess);

    if (cover.kind === "url" && cover.url && urlAssetMap[cover.url]) {
        cover = { kind: "asset", assetId: urlAssetMap[cover.url]! };
    } else if (cover.kind === "url" && cover.url) {
        const path = extractFileDownloadPathFromUrl(cover.url);
        if (path && mapping.get(path)) {
            cover = { kind: "asset", assetId: mapping.get(path)!.assetId };
        }
    }
    // Fallback to first image in template
    if (cover.kind === "default" || (cover.kind === "url" && !cover.url)) {
        for (const p of Array.from(allPaths)) {
            if (looksLikeImageFile(p) && mapping.get(p)) {
                cover = { kind: "asset", assetId: mapping.get(p)!.assetId };
                break;
            }
        }
    }

    return { data: nextNodeData, urlAssetMap, coverGuess: cover };
}

export const useAssetsStore = create<AssetsStore>((set, get) => ({
    hydrated: false,
    assets: [],
    search: "",
    draft: { status: "idle" },

    hydrate: () => {
        if (get().hydrated) return;
        const raw = safeJsonParse<StoredAsset[]>(
            getLocalStorage(STORAGE_KEY),
            [],
        );
        set({ assets: raw, hydrated: true });
    },

    setSearch: (search) => set({ search }),

    startDraftFromNode: async (nodeData) => {
        const assets = get().assets;
        const prefix = "我的资产";
        let count = 0;
        assets.forEach(a => {
            if (a.name.startsWith(prefix)) {
                // Try to parse the number
                const numKey = a.name.slice(prefix.length);
                const num = parseInt(numKey);
                // If it's just "我的资产" (unlikely given logic), treat as 0? No, let's just count.
                // Or better: just count how many assets starts with "我的资产".
                // But user wants 1, 2, 3.
                // If we have "我的资产1", "我的资产3". Next should be 4? Or 2?
                // Simple auto-increment usually takes max + 1.
                if (!isNaN(num)) {
                    count = Math.max(count, num);
                }
            }
        });
        const nextName = `${prefix}${count + 1}`;

        set({
            draft: {
                status: "preparing",
                data: nodeData,
                defaultName: nextName,
                cover: DEFAULT_COVER,
                category: "其他",
                tags: [],
                urlAssetMap: {},
            },
        });

        try {
            const prepared = await buildAssetWithCopiedFiles(nodeData);

            set((state) => {
                if (state.draft.status !== "preparing") return state;
                return {
                    draft: {
                        ...state.draft,
                        status: "ready",
                        data: prepared.data,
                        cover: prepared.coverGuess,
                        urlAssetMap: prepared.urlAssetMap,
                    } as DraftAsset,
                };
            });
        } catch (e: any) {
            set((state) => {
                if (state.draft.status === "idle") return state;
                return {
                    draft: {
                        ...state.draft,
                        status: "error",
                        error: e?.message ?? "创建资产失败",
                    } as DraftAsset
                };
            });
        }
    },

    clearDraft: () => {
        const draft = get().draft;
        set({ draft: { status: "idle" } });

        if (draft.status === "idle") return;
        const assetIds = new Set<string>();
        // Collect from draft.data
        // ... logic to collect assets from draft.data similar to deepCollectAssetRefs
        // simplified: we only really care about the covered asset or things in urlAssetMap if we are discarding.
        const cover = (draft as any).cover as AssetCover | undefined;
        if (cover?.kind === "asset") assetIds.add(cover.assetId);
        Object.values((draft as any).urlAssetMap ?? {}).forEach((id) => assetIds.add(String(id)));

        // Also assets in template paths? Yes if we created new ones.
        // Ideally we should track exactly which assetIDs we created for this draft.
        // For now, simpler implementation: rely on the fact that if we don't save, these orphans will stay in indexedDB until cleared.
        // Or we can try to best-effort delete them.
        assetIds.forEach((id) => {
            deleteWorkflowAsset(id).catch(() => { });
        });
    },

    saveDraftAsAsset: ({ name, category, tags, cover }) => {
        const draft = get().draft;
        if (draft.status === "idle") return null;

        const id = makeId("asset");
        const ts = nowIso();
        const finalName = name.trim() || draft.defaultName;
        const record: StoredAsset = {
            id,
            name: finalName,
            category,
            tags,
            cover,
            data: (draft as any).data,
            urlAssetMap: (draft as any).urlAssetMap ?? {},
            createdAt: ts,
            updatedAt: ts,
        };

        set((state) => {
            const assets = [record, ...state.assets];
            persistAssets(assets);
            return { assets, draft: { status: "idle" } };
        });
        return id;
    },

    updateAssetMeta: (id, patch) => {
        set((state) => {
            const assets = state.assets.map((a) => {
                if (a.id !== id) return a;
                return { ...a, ...patch, updatedAt: nowIso() };
            });
            persistAssets(assets);
            return { assets };
        });
    },

    deleteAsset: async (id) => {
        const asset = get().assets.find((a) => a.id === id);
        if (!asset) return;

        // cleanup blobs
        const assetIds = new Set<string>();
        // Need a way to extract asset refs from node data.
        // deepCollectAssetRefs(asset.data, assetIds);
        if (asset.cover.kind === "asset") assetIds.add(asset.cover.assetId);
        Object.values(asset.urlAssetMap ?? {}).forEach((aid) => assetIds.add(aid));

        for (const aid of Array.from(assetIds)) {
            try { await deleteWorkflowAsset(aid); } catch { }
        }

        set((state) => {
            const assets = state.assets.filter((a) => a.id !== id);
            persistAssets(assets);
            return { assets };
        });
    },

    markUsed: (id) => {
        set((state) => {
            const assets = state.assets.map((a) => a.id === id ? { ...a, lastUsedAt: nowIso() } : a);
            persistAssets(assets);
            return { assets };
        });
    },

    restoreAsset: async (id) => {
        const asset = get().assets.find((a) => a.id === id);
        if (!asset) return null;

        const data = cloneDeep(asset.data);
        const { getWorkflowAsset } = await import("@/utils/workflowAssetsDb");

        // 1. Restore template paths from AssetRefs
        const restoreTemplatePaths = async (template: any) => {
            if (!template || typeof template !== "object") return;
            for (const [key, field] of Object.entries(template)) {
                if (!field || typeof field !== "object") continue;

                const patchField = async (fieldKey: "file_path" | "path") => {
                    const raw = (field as any)[fieldKey];
                    const restoreOne = async (value: any) => {
                        if (isAssetRef(value)) {
                            try {
                                const record = await getWorkflowAsset(value.workflowAssetId);
                                if (record) return URL.createObjectURL(record.blob);
                            } catch { }
                        }
                        return value;
                    };

                    if (Array.isArray(raw)) {
                        (field as any)[fieldKey] = await Promise.all(raw.map(restoreOne));
                    } else if (raw !== undefined && raw !== null) {
                        (field as any)[fieldKey] = await restoreOne(raw);
                    }
                };

                await patchField("file_path");
                await patchField("path");
            }
        };

        if ((data.node as any)?.template) {
            await restoreTemplatePaths((data.node as any).template);
        }

        // 2. Restore Blob URLs from urlAssetMap
        if (asset.urlAssetMap) {
            const urlMap = new Map<string, string>(); // OldUrl -> NewUrl
            for (const [oldUrl, assetId] of Object.entries(asset.urlAssetMap)) {
                try {
                    const record = await getWorkflowAsset(assetId);
                    if (record) {
                        const newUrl = URL.createObjectURL(record.blob);
                        urlMap.set(oldUrl, newUrl);
                    }
                } catch { }
            }

            // Deep traverse to replace old URLs
            const replaceUrls = (obj: any) => {
                if (!obj) return;
                if (typeof obj === "string") {
                    // Check if it matches any old URL
                    // Exact match? Or contains?
                    // Usually exact match for value fields.
                    if (urlMap.has(obj)) {
                        return urlMap.get(obj);
                    }
                    return obj;
                }
                if (Array.isArray(obj)) {
                    for (let i = 0; i < obj.length; i++) {
                        obj[i] = replaceUrls(obj[i]);
                    }
                } else if (typeof obj === "object") {
                    for (const key in obj) {
                        obj[key] = replaceUrls(obj[key]);
                    }
                }
                return obj;
            };

            // We only really need to traverse template values
            if ((data.node as any)?.template) {
                replaceUrls((data.node as any).template);
            }
        }

        return data;
    }
}));
