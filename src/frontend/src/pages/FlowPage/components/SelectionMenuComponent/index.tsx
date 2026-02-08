import { NodeToolbar } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { motion } from "framer-motion";
import { Button } from "../../../../components/ui/button";
import { useWorkflowsStore } from "../../../../stores/workflowsStore";
import useAlertStore from "../../../../stores/alertStore";
import { GROUP_COLOR_OPTIONS } from "../../../../constants/constants";
import { GradientGroup } from "../../../../icons/GradientSparkles";
import useFlowStore from "../../../../stores/flowStore";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { cn } from "../../../../utils/utils";

const DEFAULT_COVER_URL = new URL(
  "../../../../assets/default-workflow-cover.svg",
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

function GroupColorPickerButtons({
  groupId,
  currentColor,
  setNode,
}: {
  groupId: string;
  currentColor: string;
  setNode: (id: string, updater: any) => void;
}) {
  return (
    <div className="flew-row flex gap-3">
      {Object.entries(GROUP_COLOR_OPTIONS).map(([color, cssVar]) => (
        <Button
          unstyled
          key={color}
          onClick={() => {
            setNode(groupId, (old: any) => ({
              ...old,
              data: {
                ...old.data,
                backgroundColor: color,
              },
            }));
          }}
        >
          <div
            className={
              "h-4 w-4 rounded-full hover:border hover:border-ring " +
              (currentColor === color ? "border-2 border-blue-500" : "") +
              (!cssVar ? " border" : "")
            }
            style={{
              backgroundColor: cssVar ? `hsl(var(${cssVar}))` : "#00000000",
            }}
          />
        </Button>
      ))}
    </div>
  );
}

export default function SelectionMenu({
  onGroup,
  onUngroup,
  onCreateWorkflow,
  nodes,
  isVisible,
  lastSelection,
}: {
  onGroup: () => void;
  onUngroup: (groupId?: string) => void;
  onCreateWorkflow?: (groupId: string) => void;
  nodes: any;
  isVisible: boolean;
  lastSelection: any;
}) {
  const unselectAll = useFlowStore((state) => state.unselectAll);
  const setNode = useFlowStore((state) => state.setNode);
  const allNodes = useFlowStore((state) => state.nodes);
  const allEdges = useFlowStore((state) => state.edges);
  const setNoticeData = useAlertStore((s) => s.setNoticeData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const hydrateWorkflows = useWorkflowsStore((s) => s.hydrate);
  const workflows = useWorkflowsStore((s) => s.workflows);
  const updateWorkflowFromGroup = useWorkflowsStore((s) => s.updateWorkflowFromGroup);
  const [cachedSelection, setCachedSelection] = useState(lastSelection);
  const [isOpen, setIsOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastNodes, setLastNodes] = useState(nodes);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);

  // Resolve cover asset ids into ObjectURLs (cached until unmount).
  const coverUrlCache = useRef(new Map<string, string>());
  const resolveCoverAsset = useCallback((assetId: string) => {
    return coverUrlCache.current.get(assetId) ?? null;
  }, []);

  useHotkeys("esc", unselectAll, { preventDefault: true });

  const mode = useMemo(() => {
    const count = cachedSelection?.nodes?.length ?? 0;
    if (count === 1 && cachedSelection?.nodes?.[0]?.type === "groupNode") {
      return "ungroup" as const;
    }
    if (count > 1) return "group" as const;
    return "none" as const;
  }, [cachedSelection]);

  useEffect(() => {
    if (isVisible && lastSelection?.nodes?.length > 0) {
      setCachedSelection(lastSelection);
    }
  }, [isVisible, lastSelection]);

  // nodes get saved to not be gone after the toolbar closes
  useEffect(() => {
    if (isVisible && nodes && nodes.length > 0) {
      setLastNodes(nodes);
    }
  }, [nodes, isVisible]);

  // transition starts after and ends before the toolbar closes
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isVisible) {
      setIsOpen(true);
      timeoutId = setTimeout(() => {
        setIsTransitioning(true);
      }, 50);
    } else {
      setIsTransitioning(false);
      timeoutId = setTimeout(() => {
        setIsOpen(false);
      }, 500);
    }
    return () => clearTimeout(timeoutId);
  }, [isVisible]);

  // Prime object URLs for cover assets (best-effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!updateOpen) return;
      const assetIds = new Set<string>();
      workflows.forEach((wf: any) => {
        if ((wf.cover as any)?.kind === "asset" && (wf.cover as any).assetId) {
          assetIds.add(String((wf.cover as any).assetId));
        }
      });
      for (const assetId of assetIds) {
        if (cancelled) return;
        if (coverUrlCache.current.has(assetId)) continue;
        try {
          const res = await api.get(`${getURL("FILES", {}, true)}/${assetId}`, {
            responseType: "blob",
          });
          const url = URL.createObjectURL(res.data as Blob);
          coverUrlCache.current.set(assetId, url);
        } catch {
        }
      }
      if (!cancelled) setTick((x) => x + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateOpen, workflows.length]);

  const [_tick, setTick] = useState(0);
  void _tick;

  useEffect(() => {
    return () => {
      for (const url of coverUrlCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      coverUrlCache.current.clear();
    };
  }, []);

  const groupContext = useMemo(() => {
    const groupId = cachedSelection?.nodes?.[0]?.id as string | undefined;
    if (!groupId) return { groupId: null, isWorkflowInstance: false, appliedWorkflowId: null };
    const group = allNodes.find((n: any) => n.id === groupId) as any;
    const appliedWorkflowId = (group?.data as any)?.appliedWorkflowId as string | undefined;
    return {
      groupId,
      isWorkflowInstance: Boolean(appliedWorkflowId),
      appliedWorkflowId: appliedWorkflowId ?? null,
    };
  }, [allNodes, cachedSelection]);

  const openUpdatePicker = useCallback(() => {
    hydrateWorkflows();
    const preferred = groupContext.appliedWorkflowId ?? (workflows[0]?.id ?? null);
    setSelectedUpdateId(preferred);
  }, [groupContext.appliedWorkflowId, hydrateWorkflows, workflows]);

  const confirmUpdate = useCallback(async () => {
    if (!groupContext.groupId || !selectedUpdateId) return;
    try {
      setUpdating(true);
      await updateWorkflowFromGroup({
        workflowId: selectedUpdateId,
        groupId: groupContext.groupId,
        nodes: allNodes as any,
        edges: allEdges as any,
      });

      const wf = workflows.find((w: any) => w.id === selectedUpdateId) as any;
      if (wf) {
        // Keep the canvas group "linked" to the updated workflow for subsequent updates.
        setNode(groupContext.groupId, (old: any) => ({
          ...old,
          data: {
            ...old.data,
            label: wf.name,
            appliedWorkflowId: wf.id,
            appliedWorkflowName: wf.name,
            appliedWorkflowUpdatedAt: wf.updatedAt,
          },
        }));
      }

      setNoticeData({ title: "工作流已更新" });
      setUpdateOpen(false);
    } catch (e: any) {
      setErrorData({ title: e?.message ?? "更新工作流失败" });
    } finally {
      setUpdating(false);
    }
  }, [allEdges, allNodes, groupContext.groupId, selectedUpdateId, setErrorData, setNode, setNoticeData, updateWorkflowFromGroup, workflows]);

  const sortedWorkflows = useMemo(() => {
    return workflows
      .slice()
      .sort((a: any, b: any) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  }, [workflows]);

  const onUpdateOpenChange = useCallback(
    (next: boolean) => {
      if (next) openUpdatePicker();
      setUpdateOpen(next);
    },
    [openUpdatePicker],
  );

  return (
    <NodeToolbar
      isVisible={isOpen}
      offset={20}
      nodeId={lastNodes && lastNodes.length > 0 ? lastNodes.map((n) => n.id) : []}
    >
      <div
        className={
          "duration-400 h-10 rounded-md border border-indigo-300 bg-background px-2.5 text-primary shadow-inner transition-all ease-in-out" +
          (isTransitioning ? " opacity-100" : " opacity-0")
        }
      >
        {mode === "group" ? (
          <div className="flex h-full items-center">
            <Button
              unstyled
              className="flex h-full items-center gap-2 text-sm"
              onClick={onGroup}
              data-testid="group-node"
            >
              <GradientGroup
                strokeWidth={1.5}
                size={22}
                className="text-primary"
              />
              分组
            </Button>
          </div>
        ) : mode === "ungroup" ? (
          <div className="flex h-full items-center gap-4">
            {(() => {
              const groupId = cachedSelection?.nodes?.[0]?.id as string | undefined;
              if (!groupId) return null;
              const group = allNodes.find((n: any) => n.id === groupId) as any;
              const bgKeyRaw = group?.data?.backgroundColor ?? "blue";
              const bgKey = Object.prototype.hasOwnProperty.call(GROUP_COLOR_OPTIONS, bgKeyRaw)
                ? bgKeyRaw
                : "blue";
              const bgVar = (GROUP_COLOR_OPTIONS as any)[bgKey] as string | undefined;
              return (
                <Popover>
                  <ShadTooltip content="颜色选择" side="top">
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="颜色选择"
                        className="h-6 w-6 rounded-full border border-border shadow-sm hover:ring-2 hover:ring-indigo-300"
                        style={{ backgroundColor: bgVar ? `hsl(var(${bgVar}))` : "#00000000" }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </PopoverTrigger>
                  </ShadTooltip>
                  <PopoverContent
                    side="top"
                    className="w-fit px-2 py-2"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GroupColorPickerButtons
                      groupId={groupId}
                      currentColor={bgKey}
                      setNode={setNode}
                    />
                  </PopoverContent>
                </Popover>
              );
            })()}

            <Button
              unstyled
              className="flex h-full items-center gap-2 text-sm"
              onClick={() => onUngroup?.(cachedSelection?.nodes?.[0]?.id)}
              data-testid="ungroup-node"
            >
              <GradientGroup
                strokeWidth={1.5}
                size={22}
                className="text-primary"
              />
              解散
            </Button>

            <Button
              unstyled
              className="flex h-full items-center gap-2 text-sm"
              onClick={() => {
                const groupId = cachedSelection?.nodes?.[0]?.id as string | undefined;
                if (!groupId) return;
                onCreateWorkflow?.(groupId);
              }}
              data-testid="create-workflow-from-group"
            >
              <ForwardedIconComponent name="Workflow" className="h-5 w-5 text-primary" />
              创建工作流
            </Button>

            <Popover open={updateOpen} onOpenChange={onUpdateOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  unstyled
                  type="button"
                  className="flex h-full items-center gap-2 text-sm"
                  data-testid="update-workflow-from-group"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ForwardedIconComponent name="RefreshCw" className="h-5 w-5 text-primary" />
                  更新工作流
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                className="w-[360px] p-3"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-foreground">更新工作流</div>
                  {groupContext.isWorkflowInstance ? (
                    <div className="text-xs text-muted-foreground">当前分组已绑定工作流</div>
                  ) : null}
                </div>

                {sortedWorkflows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-muted-foreground/40 p-6 text-center text-xs text-muted-foreground">
                    暂无工作流
                  </div>
                ) : (
                  <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                    {sortedWorkflows.map((wf: any) => {
                      const isSelected = wf.id === selectedUpdateId;
                      const isApplied = wf.id === groupContext.appliedWorkflowId;
                      const coverUrl = coverToUrl(wf.cover, resolveCoverAsset);
                      return (
                        <motion.button
                          key={wf.id}
                          type="button"
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className={cn(
                            "w-full rounded-lg border border-border/60 bg-muted/10 p-2 text-left",
                            "transition-colors hover:bg-muted/20",
                            isSelected && "border-indigo-400 ring-2 ring-indigo-300/40",
                          )}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUpdateId(wf.id);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-10 w-10 overflow-hidden rounded-md border border-border/60 bg-muted/10">
                              <img
                                src={coverUrl}
                                alt={wf.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-foreground">
                                {wf.name}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {isApplied ? "当前绑定" : "点击选择"}
                              </div>
                            </div>
                            {isSelected ? (
                              <ForwardedIconComponent
                                name="Check"
                                className="h-4 w-4 text-indigo-500"
                              />
                            ) : null}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setUpdateOpen(false)}
                    disabled={updating}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void confirmUpdate()}
                    disabled={updating || !selectedUpdateId || sortedWorkflows.length === 0}
                  >
                    {updating ? "更新中..." : "更新"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </div>
    </NodeToolbar>
  );
}
