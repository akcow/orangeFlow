import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStoreApi } from "@xyflow/react";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NODE_WIDTH } from "@/constants/constants";
import useAlertStore from "@/stores/alertStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { cn } from "@/utils/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select-custom";

const DEFAULT_COVER_URL = new URL(
    "../../../../../assets/default-workflow-cover.svg", // Using same default cover or a specific one for assets if available
    import.meta.url,
).toString();

function coverToUrl(cover: any, resolveAsset: (assetId: string) => string | null): string {
    if (!cover || typeof cover !== "object") return DEFAULT_COVER_URL;
    if (cover.kind === "url" && cover.url) return cover.url;
    if (cover.kind === "asset" && cover.assetId) {
        const url = resolveAsset(cover.assetId);
        return url ?? DEFAULT_COVER_URL;
    }
    return DEFAULT_COVER_URL;
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

const DEFAULT_CATEGORIES = ["人物", "场景", "物品", "风格", "音效", "其他"];

export default function AssetsPanel({
    onRequestClose,
}: {
    onRequestClose?: () => void;
}) {
    const storeApi = useStoreApi();
    const setNoticeData = useAlertStore((s) => s.setNoticeData);
    const setErrorData = useAlertStore((s) => s.setErrorData);

    const paste = useFlowStore((s) => s.paste);
    // const addComponent = useFlowStore((s) => s.addComponent); // Removed to fix lint
    // Actually we can just use `paste` or `addNode`. Since it is a single node with data.
    // Existing `addComponent` is a hook `useAddComponent`.
    // `paste` expects a selection (nodes + edges).

    const takeSnapshot = useFlowsManagerStore((s) => s.takeSnapshot);

    const hydrate = useAssetsStore((s) => s.hydrate);
    const assets = useAssetsStore((s) => s.assets);
    const search = useAssetsStore((s) => s.search);
    const setSearch = useAssetsStore((s) => s.setSearch);
    const draft = useAssetsStore((s) => s.draft);
    const clearDraft = useAssetsStore((s) => s.clearDraft);
    const saveDraftAsAsset = useAssetsStore((s) => s.saveDraftAsAsset);
    const updateAssetMeta = useAssetsStore((s) => s.updateAssetMeta);
    const deleteAsset = useAssetsStore((s) => s.deleteAsset);
    const markUsed = useAssetsStore((s) => s.markUsed);

    // Cover cache logic (same as WorkflowsPanel)
    const coverUrlCache = useRef(new Map<string, string>());
    const resolveCoverAsset = useCallback((assetId: string) => {
        return coverUrlCache.current.get(assetId) ?? null;
    }, []);

    useEffect(() => {
        hydrate();
        return () => {
            for (const url of Array.from(coverUrlCache.current.values())) {
                URL.revokeObjectURL(url);
            }
            coverUrlCache.current.clear();
        };
    }, [hydrate]);

    const [activeTab, setActiveTab] = useState<"mine" | "public">("mine"); // Assets usually don't have "Recent" tab requirement in prompt, but let's keep it simple.
    const [view, setView] = useState<"list" | "create" | "edit">("list");
    const [editingId, setEditingId] = useState<string | null>(null);

    // Editor form state
    const [formName, setFormName] = useState("");
    const [formCategory, setFormCategory] = useState("其他");
    const [isCustomCategory, setIsCustomCategory] = useState(false);
    const [formTags, setFormTags] = useState<string[]>([]);
    const [formCover, setFormCover] = useState<any>({ kind: "default" });
    const [tagInput, setTagInput] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Compute all available categories from default + existing assets
    const allCategories = useMemo(() => {
        const used = assets.map(a => a.category).filter(Boolean);
        return Array.from(new Set([...DEFAULT_CATEGORIES, ...used]));
    }, [assets]);

    // Prime object URLs
    const [_tick, setTick] = useState(0);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { getWorkflowAsset } = await import("@/utils/workflowAssetsDb");
            const assetIds = new Set<string>();
            assets.forEach((a) => {
                if ((a.cover as any)?.kind === "asset" && (a.cover as any).assetId) {
                    assetIds.add(String((a.cover as any).assetId));
                }
            });
            if ((draft as any)?.status !== "idle" && (draft as any)?.cover?.kind === "asset") {
                assetIds.add(String((draft as any).cover.assetId));
            }
            if ((formCover as any)?.kind === "asset" && (formCover as any)?.assetId) {
                assetIds.add(String((formCover as any).assetId));
            }
            for (const assetId of Array.from(assetIds)) {
                if (cancelled) return;
                if (coverUrlCache.current.has(assetId)) continue;
                try {
                    const record = await getWorkflowAsset(assetId);
                    if (!record) continue;
                    const url = URL.createObjectURL(record.blob);
                    coverUrlCache.current.set(assetId, url);
                } catch {
                }
            }
            if (!cancelled) setTick((x) => x + 1);
        })();
        return () => { cancelled = true; };
    }, [assets.length, draft, formCover]);

    const title = activeTab === "public" ? "公共资产" : "我的资产";

    const filtered = useMemo(() => {
        if (activeTab === "public") return []; // Not implemented
        const q = search.trim().toLowerCase();
        return assets.filter((a) => {
            if (!q) return true;
            const hay = [a.name, a.category, ...(a.tags ?? [])].map(v => v.toLowerCase()).join(" ");
            return hay.includes(q);
        }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }, [activeTab, search, assets]);

    // Enter create view if draft is ready
    useEffect(() => {
        if (draft.status === "ready" || draft.status === "preparing") {
            setView("create");
            setFormName(draft.defaultName);
            setFormCategory(draft.category || "其他");
            setIsCustomCategory(false);
            setFormTags(draft.tags || []);
            setFormCover(draft.cover || { kind: "default" });
        }
    }, [draft]);

    const resetFormFromAsset = useCallback((id: string) => {
        const asset = assets.find((a) => a.id === id);
        if (!asset) return;
        setFormName(asset.name);
        setFormCategory(asset.category);
        setIsCustomCategory(false);
        setFormTags(asset.tags);
        setFormCover(asset.cover);
    }, [assets]);

    const handleUploadCover = useCallback(async () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const { putWorkflowAsset } = await import("@/utils/workflowAssetsDb");
                const assetId = `acover_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
                await putWorkflowAsset({
                    id: assetId,
                    blob: file,
                    name: file.name || "cover.png",
                    type: file.type || "image/png",
                    size: file.size,
                    createdAt: new Date().toISOString(),
                });
                const url = URL.createObjectURL(file);
                coverUrlCache.current.set(assetId, url);
                setFormCover({ kind: "asset", assetId });
                setTick((x) => x + 1);
            } catch (e: any) {
                setErrorData({ title: e?.message ?? "封面上传失败" });
            }
        };
        input.click();
    }, [setErrorData]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            const name = formName.trim() || "未命名资产";
            const tags = normalizeTags(formTags);

            if (view === "create") {
                const id = saveDraftAsAsset({
                    name,
                    category: formCategory,
                    tags,
                    cover: formCover
                });
                if (!id) throw new Error("资产草稿未就绪");
                setView("list");
                setEditingId(null);
            } else if (view === "edit" && editingId) {
                updateAssetMeta(editingId, { name, category: formCategory, tags, cover: formCover });
                setView("list");
                setEditingId(null);
            }
        } catch (e: any) {
            setErrorData({ title: e?.message ?? "保存失败" });
        } finally {
            setIsSaving(false);
        }
    }, [draft, editingId, formCover, formName, formCategory, formTags, saveDraftAsAsset, updateAssetMeta, view, setErrorData]);

    const restoreAsset = useAssetsStore((s) => s.restoreAsset);

    const handleUse = useCallback(async (id: string) => {
        try {
            const restoredData = await restoreAsset(id);
            if (!restoredData) return;

            takeSnapshot();
            const { height, width, transform } = storeApi.getState();
            const zoomMultiplier = 1 / (transform?.[2] ?? 1);
            const centerX = -(transform?.[0] ?? 0) * zoomMultiplier + (width * zoomMultiplier) / 2;
            const centerY = -(transform?.[1] ?? 0) * zoomMultiplier + (height * zoomMultiplier) / 2;
            const nodeOffset = NODE_WIDTH / 2;

            const node = {
                id: `node_${Date.now()}`,
                type: "genericNode",
                position: { x: 0, y: 0 },
                data: restoredData,
                selected: true,
            };

            // Propagate asset name to node display name
            if (node.data.node) {
                // If the asset name differs from the original node name, use it.
                // We need the asset name.
                const asset = assets.find(a => a.id === id);
                if (asset) {
                    node.data.node.display_name = asset.name;
                }
            }

            paste(
                { nodes: [node], edges: [] },
                {
                    x: -nodeOffset,
                    y: -nodeOffset,
                    paneX: centerX,
                    paneY: centerY,
                }
            );
            markUsed(id);
            setNoticeData({ title: "资产已添加到画布" });
        } catch (e: any) {
            setErrorData({ title: e?.message ?? "应用资产失败" });
        }
    }, [assets, paste, markUsed, storeApi, takeSnapshot, setErrorData, setNoticeData]);

    // Helper to deep copy and set position
    const onAddTag = useCallback(() => {
        const next = tagInput.trim();
        if (!next) return;
        setFormTags((prev) => normalizeTags([...prev, next]));
        setTagInput("");
    }, [tagInput]);

    const onRemoveTag = useCallback((tag: string) => {
        setFormTags((prev) => prev.filter((t) => t !== tag));
    }, []);

    const showEditor = view === "create" || view === "edit";
    const editorTitle = view === "create" ? "创建资产" : "编辑资产";

    // Drag start handler
    const onDragStart = (event: React.DragEvent, asset: any) => {
        // Similar to SidebarDraggableComponent
        // We need to pass the node data.
        // But we need to materialize it first? 
        // ReactFlow's onDrop handler expects "Main" types or "Files". 
        // If we drag a "CustomComponent" (saved asset), we might want to handle it specially.
        // Or we can just use the standard "genericNode" type and pass the asset data.
        // The `Page` component `onDrop` handles `genericNode`.

        const data = { type: asset.data.type, node: asset.data.node };
        var crt = event.currentTarget.cloneNode(true) as HTMLElement;
        crt.style.position = "absolute";
        crt.style.width = "215px";
        crt.style.top = "-500px";
        crt.style.right = "-500px";
        crt.classList.add("cursor-grabbing");
        document.body.appendChild(crt);
        event.dataTransfer.setDragImage(crt, 0, 0);
        event.dataTransfer.setData("genericNode", JSON.stringify(data));
        // NOTE: usage of "genericNode" key is consistent with FlowSidebarComponent
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* Sidebar Navigation */}
            <div className="w-[120px] flex-shrink-0 border-r border-border/50 bg-muted/20 p-2">
                <div className="mb-4 px-2 text-sm font-semibold text-foreground">资产库</div>
                <Button
                    variant={activeTab === "public" ? "secondary" : "ghost"}
                    className="mb-1 w-full justify-start text-sm"
                    onClick={() => { setActiveTab("public"); setView("list"); setEditingId(null); }}
                >
                    公共资产
                </Button>
                <Button
                    variant={activeTab === "mine" ? "secondary" : "ghost"}
                    className="mb-1 w-full justify-start text-sm"
                    onClick={() => { setActiveTab("mine"); setView("list"); setEditingId(null); }}
                >
                    我的资产
                </Button>
                <div className="mt-4 px-2 text-xs text-muted-foreground">分类</div>
                <div className="flex flex-wrap gap-1 p-1">
                    {allCategories.map(c => (
                        <Badge key={c} variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setSearch(c)}>
                            {c}
                        </Badge>
                    ))}
                </div>

            </div>

            {/* Main Content */}
            <div className="flex h-full flex-1 flex-col overflow-hidden p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold">{title}</div>
                    <div className="flex items-center gap-2">
                        {!showEditor && (
                            <Input
                                icon="Search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="搜索..."
                                className="w-[240px]"
                            />
                        )}
                        {onRequestClose && (
                            <Button variant="ghost" size="icon" onClick={onRequestClose}>
                                <ForwardedIconComponent name="X" className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                </div>

                {showEditor ? (
                    <div className="flex flex-1 gap-6 overflow-hidden">
                        <div className="w-[240px] flex-shrink-0">
                            <div className="mb-3">
                                <Button variant="ghost" onClick={() => { setView("list"); clearDraft(); }} className="gap-2 pl-0">
                                    <ForwardedIconComponent name="ChevronLeft" className="h-4 w-4" />
                                    返回
                                </Button>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                                <div className="aspect-square w-full bg-muted/10">
                                    <img src={coverToUrl(formCover, resolveCoverAsset)} className="h-full w-full object-cover" />
                                </div>
                                <div className="p-2">
                                    <Button variant="secondary" className="w-full" onClick={handleUploadCover}>更换封面</Button>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-4 overflow-auto pr-1">
                            <div>
                                <div className="mb-1 text-sm font-medium">名称 *</div>
                                <Input value={formName} onChange={e => setFormName(e.target.value)} />
                            </div>
                            <div>
                                <div className="mb-1 text-sm font-medium">分类 *</div>
                                {isCustomCategory ? (
                                    <div className="flex gap-2">
                                        <Input
                                            value={formCategory}
                                            onChange={e => setFormCategory(e.target.value)}
                                            placeholder="输入新分类名称"
                                            autoFocus
                                        />
                                        <Button variant="ghost" onClick={() => { setIsCustomCategory(false); setFormCategory("其他"); }}>取消</Button>
                                    </div>
                                ) : (
                                    <Select
                                        value={allCategories.includes(formCategory) ? formCategory : "custom"}
                                        onValueChange={(val) => {
                                            if (val === "custom") {
                                                setIsCustomCategory(true);
                                                setFormCategory("");
                                            } else {
                                                setFormCategory(val);
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="选择分类" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                            <SelectItem value="custom" className="text-muted-foreground italic">+ 新建分类...</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            <div>
                                <div className="mb-1 text-sm font-medium">标签</div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && onAddTag()}
                                        placeholder="输入后回车"
                                    />
                                    <Button variant="secondary" onClick={onAddTag}>添加</Button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {formTags.map(t => (
                                        <Badge key={t} variant="secondary">
                                            {t} <span className="ml-1 cursor-pointer" onClick={() => onRemoveTag(t)}>×</span>
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => { setView("list"); clearDraft(); }}>取消</Button>
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? "保存中..." : (view === "edit" ? "更新" : "创建")}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        {filtered.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-muted-foreground">暂无资产</div>
                        ) : (
                            <div className="grid grid-cols-4 gap-4">
                                {filtered.map(asset => (
                                    <div key={asset.id}
                                        className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/10 transition hover:shadow-md"
                                        draggable
                                        onDragStart={(e) => onDragStart(e, asset)}
                                    >
                                        <div className="aspect-square w-full bg-muted/10">
                                            <img src={coverToUrl(asset.cover, resolveCoverAsset)} className="h-full w-full object-cover" />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition group-hover:opacity-100">
                                            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => { setEditingId(asset.id); setView("edit"); resetFormFromAsset(asset.id); }}>编辑</Button>
                                            <Button size="sm" className="rounded-full" onClick={() => handleUse(asset.id)}>使用</Button>
                                        </div>
                                        <div className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100">
                                            <Button size="icon" variant="destructive" className="h-6 w-6 rounded-md shadow-sm" onClick={(e) => { e.stopPropagation(); deleteAsset(asset.id); }}>
                                                <ForwardedIconComponent name="Trash2" className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <div className="p-2">
                                            <div className="truncate text-sm font-medium">{asset.name}</div>
                                            <div className="text-xs text-muted-foreground">{asset.category}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
