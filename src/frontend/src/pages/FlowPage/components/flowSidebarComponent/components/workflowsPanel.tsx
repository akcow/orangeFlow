import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStoreApi } from "@xyflow/react";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NODE_WIDTH } from "@/constants/constants";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useFolderStore } from "@/stores/foldersStore";
import { useWorkflowsStore } from "@/stores/workflowsStore";
import { cn } from "@/utils/utils";

const DEFAULT_COVER_URL = new URL(
  "../../../../../assets/default-workflow-cover.svg",
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

export default function WorkflowsPanel({
  pendingCreateGroupId,
  onConsumePendingCreate,
  onRequestClose,
}: {
  pendingCreateGroupId?: string | null;
  onConsumePendingCreate?: () => void;
  onRequestClose?: () => void;
}) {
  const storeApi = useStoreApi();
  const navigate = useCustomNavigate();
  const setNoticeData = useAlertStore((s) => s.setNoticeData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const myCollectionId = useFolderStore((s) => s.myCollectionId);

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const setLastCopiedSelection = useFlowStore((s) => s.setLastCopiedSelection);
  const paste = useFlowStore((s) => s.paste);

  const takeSnapshot = useFlowsManagerStore((s) => s.takeSnapshot);
  const currentFlowId = useFlowsManagerStore((s) => s.currentFlowId);

  const hydrate = useWorkflowsStore((s) => s.hydrate);
  const workflows = useWorkflowsStore((s) => s.workflows);
  const activeTab = useWorkflowsStore((s) => s.activeTab);
  const setActiveTab = useWorkflowsStore((s) => s.setActiveTab);
  const search = useWorkflowsStore((s) => s.search);
  const setSearch = useWorkflowsStore((s) => s.setSearch);
  const draft = useWorkflowsStore((s) => s.draft);
  const startDraftFromGroup = useWorkflowsStore((s) => s.startDraftFromGroup);
  const clearDraft = useWorkflowsStore((s) => s.clearDraft);
  const saveDraftAsWorkflow = useWorkflowsStore((s) => s.saveDraftAsWorkflow);
  const updateWorkflowMeta = useWorkflowsStore((s) => s.updateWorkflowMeta);
  const deleteWorkflow = useWorkflowsStore((s) => s.deleteWorkflow);
  const markUsed = useWorkflowsStore((s) => s.markUsed);
  const materializeSelectionForUse = useWorkflowsStore((s) => s.materializeSelectionForUse);

  // Resolve cover asset ids into ObjectURLs (cached until unmount).
  const coverUrlCache = useRef(new Map<string, string>());
  const resolveCoverAsset = useCallback((assetId: string) => {
    return coverUrlCache.current.get(assetId) ?? null;
  }, []);

  useEffect(() => {
    hydrate();
    return () => {
      for (const url of coverUrlCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      coverUrlCache.current.clear();
    };
  }, [hydrate]);

  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Editor form state (must be declared before effects that read it to avoid TDZ errors).
  const [formName, setFormName] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formCover, setFormCover] = useState<any>({ kind: "default" });
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Prime object URLs for cover assets (best-effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getWorkflowAsset } = await import("@/utils/workflowAssetsDb");
      const assetIds = new Set<string>();
      workflows.forEach((wf) => {
        if ((wf.cover as any)?.kind === "asset" && (wf.cover as any).assetId) {
          assetIds.add(String((wf.cover as any).assetId));
        }
      });
      if ((draft as any)?.status !== "idle" && (draft as any)?.cover?.kind === "asset") {
        assetIds.add(String((draft as any).cover.assetId));
      }
      if ((formCover as any)?.kind === "asset" && (formCover as any)?.assetId) {
        assetIds.add(String((formCover as any).assetId));
      }
      for (const assetId of assetIds) {
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
      // Force rerender so new object URLs are used.
      if (!cancelled) setTick((x) => x + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows.length, draft, formCover]);

  const [_tick, setTick] = useState(0);
  void _tick;

  const selectedGroupId = useMemo(() => {
    const selectedGroups = nodes.filter((n) => n.selected && n.type === "groupNode");
    return selectedGroups.length === 1 ? selectedGroups[0]!.id : null;
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (wf: any) => {
      if (!q) return true;
      const hay = [
        wf.name,
        wf.note,
        ...(wf.tags ?? []),
      ]
        .map((v: any) => String(v ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    };
    const base =
      activeTab === "recent"
        ? workflows
            .filter((w) => Boolean(w.lastUsedAt))
            .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
        : activeTab === "public"
          ? []
          : workflows
              .slice()
              .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return base.filter(match);
  }, [activeTab, search, workflows]);

  const title = useMemo(() => {
    if (activeTab === "recent") return "最近使用";
    if (activeTab === "public") return "公开";
    return "我的工作流";
  }, [activeTab]);

  const openCreateFromSelection = useCallback(async () => {
    if (!selectedGroupId) {
      setNoticeData({ title: "请先选择一个分组后再创建工作流" });
      return;
    }
    if (!currentFlowId) {
      setErrorData({ title: "当前 Flow 未加载，无法创建工作流" });
      return;
    }
    setView("create");
    setEditingId(null);
    await startDraftFromGroup({ groupId: selectedGroupId, nodes, edges });
  }, [currentFlowId, edges, nodes, selectedGroupId, setErrorData, setNoticeData, startDraftFromGroup]);

  // If parent requests a create-from-group, run it once.
  const lastConsumedGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingCreateGroupId) return;
    if (lastConsumedGroupIdRef.current === pendingCreateGroupId) return;
    lastConsumedGroupIdRef.current = pendingCreateGroupId;
    (async () => {
      if (!currentFlowId) return;
      setView("create");
      setEditingId(null);
      await startDraftFromGroup({ groupId: pendingCreateGroupId, nodes, edges });
      onConsumePendingCreate?.();
    })();
  }, [currentFlowId, edges, nodes, onConsumePendingCreate, pendingCreateGroupId, startDraftFromGroup]);

  const resetFormFromDraft = useCallback(() => {
    if (draft.status === "idle") return;
    setFormName(draft.defaultName);
    setFormNote(draft.note ?? "");
    setFormTags(draft.tags ?? []);
    setFormCover(draft.cover ?? { kind: "default" });
  }, [draft]);

  const resetFormFromWorkflow = useCallback(
    (id: string) => {
      const wf = workflows.find((w) => w.id === id);
      if (!wf) return;
      setFormName(wf.name);
      setFormNote(wf.note);
      setFormTags(wf.tags);
      setFormCover(wf.cover);
    },
    [workflows],
  );

  useEffect(() => {
    // If we entered create view due to draft init, prime form.
    if (view === "create") {
      if (draft.status === "ready" || draft.status === "preparing" || draft.status === "error") {
        resetFormFromDraft();
      }
    }
  }, [draft, resetFormFromDraft, view]);

  const handleUploadCover = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const { putWorkflowAsset } = await import("@/utils/workflowAssetsDb");
        const assetId = `wfcover_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
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
      const name = formName.trim() || (draft.status !== "idle" ? draft.defaultName : "工作流");
      const tags = normalizeTags(formTags);

      if (view === "create") {
        const id = saveDraftAsWorkflow({
          name,
          note: formNote,
          tags,
          cover: formCover,
        });
        if (!id) throw new Error("工作流草稿未就绪");
        setView("list");
        setEditingId(null);
      } else if (view === "edit" && editingId) {
        updateWorkflowMeta(editingId, { name, note: formNote, tags, cover: formCover });
        setView("list");
        setEditingId(null);
      }
    } catch (e: any) {
      setErrorData({ title: e?.message ?? "保存失败" });
    } finally {
      setIsSaving(false);
    }
  }, [draft, editingId, formCover, formName, formNote, formTags, saveDraftAsWorkflow, setErrorData, updateWorkflowMeta, view]);

  const handlePublish = useCallback(async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (view !== "edit" || !editingId) return;

    const wf = workflows.find((w) => w.id === editingId);
    if (!wf) {
      setErrorData({ title: "未找到工作流" });
      return;
    }

    setIsPublishing(true);
    try {
      const name = formName.trim() || wf.name;
      const note = formNote ?? wf.note ?? "";
      const tags = normalizeTags(formTags.length ? formTags : (wf.tags ?? []));

      // Persist local metadata so "我的工作流"列表与本次投稿一致。
      updateWorkflowMeta(editingId, { name, note, tags, cover: formCover });

      const viewport = { zoom: 1, x: 0, y: 0 };
      const initialData = {
        nodes: wf.selection?.nodes ?? [],
        edges: wf.selection?.edges ?? [],
        viewport,
      };

      // 1) Create a new Flow that will represent this template in the community.
      const created = await api.post<any>(`${getURL("FLOWS")}/`, {
        name,
        data: initialData,
        description: note,
        is_component: false,
        folder_id: myCollectionId || null,
        icon: null,
        gradient: null,
        endpoint_name: null,
        tags: null,
        mcp_enabled: null,
      });
      const newFlowId = created?.data?.id as string | undefined;
      if (!newFlowId) throw new Error("创建 Flow 失败（缺少 id）");

      // 2) Upload any referenced assets (files embedded in template fields) into the new flow and rewrite paths.
      const materialized = await materializeSelectionForUse({
        workflowId: wf.id,
        currentFlowId: newFlowId,
      });
      if (materialized) {
        await api.patch(`${getURL("FLOWS")}/${newFlowId}`, {
          data: { nodes: materialized.nodes, edges: materialized.edges, viewport },
          description: note,
        });
      }

      // 3) Upload cover (best-effort) if it's stored as a workflow asset.
      let coverPath: string | null = null;
      if (formCover?.kind === "asset" && formCover?.assetId) {
        try {
          const { getWorkflowAsset } = await import("@/utils/workflowAssetsDb");
          const record = await getWorkflowAsset(String(formCover.assetId));
          if (record?.blob) {
            const file = new File([record.blob], record.name || "cover.png", {
              type: record.type || record.blob.type || "image/png",
            });
            const fd = new FormData();
            fd.append("file", file);
            const up = await api.post<any>(`${getURL("FILES")}/upload/${newFlowId}`, fd);
            coverPath = up?.data?.file_path ?? null;
          }
        } catch {
          // ignore cover upload failure
        }
      }

      // 4) Create community item (UNREVIEWED by default).
      await api.post(`${getURL("COMMUNITY")}/items`, {
        type: "WORKFLOW",
        flow_id: newFlowId,
        title: name,
        description: note || null,
        cover_path: coverPath,
        media_path: null,
        public_canvas: true,
        status: "UNREVIEWED",
      });

      setNoticeData({ title: "已提交审核" });
    } catch (e: any) {
      setErrorData({ title: e?.message ?? "投稿失败" });
    } finally {
      setIsPublishing(false);
    }
  }, [
    editingId,
    formCover,
    formName,
    formNote,
    formTags,
    isAuthenticated,
    materializeSelectionForUse,
    myCollectionId,
    navigate,
    setErrorData,
    setNoticeData,
    updateWorkflowMeta,
    view,
    workflows,
  ]);

  const handleUse = useCallback(
    async (id: string) => {
      if (!currentFlowId) {
        setErrorData({ title: "当前 Flow 未加载，无法使用工作流" });
        return;
      }
      try {
        const selection = await materializeSelectionForUse({
          workflowId: id,
          currentFlowId,
        });
        if (!selection) return;

        takeSnapshot();
        setLastCopiedSelection(selection);

        const { height, width, transform } = storeApi.getState();
        const zoomMultiplier = 1 / (transform?.[2] ?? 1);
        const centerX = -(transform?.[0] ?? 0) * zoomMultiplier + (width * zoomMultiplier) / 2;
        const centerY = -(transform?.[1] ?? 0) * zoomMultiplier + (height * zoomMultiplier) / 2;
        const nodeOffset = NODE_WIDTH / 2;

        paste(
          selection,
          {
            x: -nodeOffset,
            y: -nodeOffset,
            paneX: centerX,
            paneY: centerY,
          },
        );
        markUsed(id);
      } catch (e: any) {
        setErrorData({ title: e?.message ?? "应用工作流失败" });
      }
    },
    [currentFlowId, markUsed, materializeSelectionForUse, paste, setErrorData, setLastCopiedSelection, storeApi, takeSnapshot],
  );

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
  const editorTitle = view === "create" ? "创建工作流" : "编辑工作流";

  const editorStatusLine = useMemo(() => {
    if (view !== "create") return null;
    if (draft.status === "preparing") return "正在保存所选内容与资源...";
    if (draft.status === "error") return draft.error || "创建失败";
    return null;
  }, [draft, view]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[220px] flex-shrink-0 border-r border-border/50 bg-muted/20 p-3">
        <div className="mb-3 text-sm font-semibold text-foreground">导航</div>
        {(
          [
            { key: "recent", label: "最近使用", icon: "Clock" },
            { key: "mine", label: "我的工作流", icon: "Folder" },
            { key: "public", label: "公开", icon: "Globe" },
          ] as const
        ).map((item) => {
          const active = activeTab === item.key;
          return (
            <Button
              key={item.key}
              type="button"
              variant={active ? "secondary" : "ghost"}
              className={cn("mb-1 w-full justify-start gap-2 rounded-lg", !active && "text-muted-foreground")}
              onClick={() => {
                setActiveTab(item.key);
                setView("list");
                setEditingId(null);
                clearDraft();
              }}
            >
              <ForwardedIconComponent name={item.icon} className="h-4 w-4" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex h-full flex-1 flex-col overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span>{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {!showEditor && (
              <>
              <Input
                icon="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索名称/标签/描述"
                className="w-[360px]"
                inputClassName="w-full"
              />
              <Button type="button" className="rounded-full" onClick={openCreateFromSelection}>
                创建
              </Button>
              </>
            )}
            {onRequestClose && (
              <ShadTooltip content="关闭" side="left">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={onRequestClose}
                >
                  <ForwardedIconComponent name="X" className="h-5 w-5" />
                </Button>
              </ShadTooltip>
            )}
          </div>
        </div>

        {showEditor ? (
          <div className="flex flex-1 gap-6 overflow-hidden">
            <div className="w-[280px] flex-shrink-0">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-2"
                  onClick={() => {
                    setView("list");
                    setEditingId(null);
                    clearDraft();
                  }}
                >
                  <ForwardedIconComponent name="ChevronLeft" className="h-4 w-4" />
                  返回
                </Button>
                <div className="text-sm font-semibold text-foreground">{editorTitle}</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                <div className="aspect-square w-full bg-muted/10">
                  <img
                    src={coverToUrl(formCover, resolveCoverAsset)}
                    alt="cover"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <Button type="button" variant="secondary" className="w-full" onClick={handleUploadCover}>
                    上传封面
                  </Button>
                </div>
              </div>
              {editorStatusLine && (
                <div className={cn("mt-3 rounded-lg border p-3 text-xs", draft.status === "error" ? "border-destructive/40 text-destructive" : "border-border/60 text-muted-foreground")}>
                  {editorStatusLine}
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-auto pr-1">
              <div>
                <div className="mb-1 text-sm font-medium">工作流名称</div>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">备注</div>
                <Textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} className="min-h-[120px]" />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">标签</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="输入后回车或点击添加"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onAddTag();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={onAddTag}>
                    添加
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {formTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      <span>{tag}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onRemoveTag(tag)}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setView("list");
                    setEditingId(null);
                    clearDraft();
                  }}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || (view === "create" && draft.status !== "ready")}
                >
                  {isSaving ? "保存中..." : "保存"}
                </Button>
                {view === "edit" && (
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={isSaving || isPublishing}
                  >
                    {isPublishing ? "投稿中..." : "发布并投稿"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "public" ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-muted-foreground/40 p-10 text-sm text-muted-foreground">
            暂未开放
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-muted-foreground/40 p-10 text-sm text-muted-foreground">
            暂无工作流
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-4 gap-4 overflow-auto pr-1">
            {filtered.map((wf) => {
              const coverUrl = coverToUrl(wf.cover, resolveCoverAsset);
              return (
                <div
                  key={wf.id}
                  className="relative overflow-hidden rounded-xl border border-border/60 bg-muted/10"
                >
                  <div className="relative group/cover">
                    <div className="aspect-square w-full overflow-hidden rounded-t-xl bg-muted/10">
                      <img src={coverUrl} alt={wf.name} className="h-full w-full object-cover" />
                    </div>

                    {/* Hover overlay/actions should only be triggered on the cover area. */}
                    <div className="pointer-events-none absolute inset-0 rounded-t-xl bg-black/40 opacity-0 transition-opacity group-hover/cover:opacity-100" />

                    <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover/cover:opacity-100">
                      <button
                        type="button"
                        className={cn(
                          "pointer-events-auto rounded-md p-1",
                          "bg-destructive/85 text-destructive-foreground hover:bg-destructive",
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void deleteWorkflow(wf.id);
                        }}
                      >
                        <ForwardedIconComponent name="Trash2" className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="absolute left-0 top-0 z-10 flex h-full w-full items-center justify-center gap-3 rounded-t-xl opacity-0 transition-opacity group-hover/cover:opacity-100">
                      <Button
                        type="button"
                        variant="secondary"
                        className="pointer-events-auto rounded-full"
                        onClick={() => {
                          setEditingId(wf.id);
                          setView("edit");
                          resetFormFromWorkflow(wf.id);
                        }}
                      >
                        查看
                      </Button>
                      <Button
                        type="button"
                        className="pointer-events-auto rounded-full"
                        onClick={() => handleUse(wf.id)}
                      >
                        使用
                      </Button>
                    </div>
                  </div>

                  <div className="p-2">
                    <div className="truncate text-sm font-medium">{wf.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
