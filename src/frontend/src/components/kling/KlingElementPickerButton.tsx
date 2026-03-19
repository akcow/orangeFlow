import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";
import { type KlingElement, type KlingPresetElement, useKlingElementsStore } from "@/stores/klingElementsStore";
import KlingElementCreateDialog from "./KlingElementCreateDialog";

function presetToElement(p: KlingPresetElement): KlingElement {
  // Downstream (nodes) only need element_id; fill the rest to satisfy the type.
  return {
    asset_id: `preset:${p.element_id}`,
    element_id: p.element_id,
    element_name: p.element_name,
    element_description: p.element_description,
    tag_id: "",
    reference_type: p.reference_type || "",
    preview_file_id: "",
    frontal_file_id: "",
    refer_file_ids: [],
    video_file_id: "",
    element_voice_id: "",
    created_at: "",
    updated_at: "",
  };
}

export default function KlingElementPickerButton({
  disabled,
  selectedElementIds,
  onPick,
}: {
  disabled?: boolean;
  selectedElementIds: number[];
  onPick: (
    elements: KlingElement[],
    options?: { skipSnapshot?: boolean },
  ) => void;
}) {
  const hydrate = useKlingElementsStore((s) => s.hydrate);
  const customLoading = useKlingElementsStore((s) => s.customLoading);
  const presetsLoading = useKlingElementsStore((s) => s.presetsLoading);
  const customError = useKlingElementsStore((s) => s.customError);
  const presetsError = useKlingElementsStore((s) => s.presetsError);
  const custom = useKlingElementsStore((s) => s.custom);
  const presets = useKlingElementsStore((s) => s.presets);

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const didSnapshotRef = useRef(false);
  const loading = customLoading || presetsLoading;
  const error = customError ?? presetsError;

  useEffect(() => {
    setPendingIds(Array.isArray(selectedElementIds) ? [...selectedElementIds] : []);
  }, [selectedElementIds]);

  const tooltip = useMemo(() => {
    const ids = Array.isArray(selectedElementIds) ? selectedElementIds : [];
    if (!ids.length) return "选择主体";
    const byId = new Map<number, KlingElement>();
    for (const el of [...custom, ...presets.map(presetToElement)]) {
      if (typeof el?.element_id === "number") byId.set(el.element_id, el);
    }
    const labels = ids.map((id) => byId.get(id)?.element_name ?? String(id));
    if (labels.length === 1) return `主体：${labels[0]}`;
    const prefix = labels.slice(0, 3).join("、");
    return `已选择 ${labels.length} 个主体：${prefix}${labels.length > 3 ? "…" : ""}`;
  }, [custom, presets, selectedElementIds]);

  const onOpenMenu = useCallback(() => {
    hydrate();
    setPendingIds(Array.isArray(selectedElementIds) ? [...selectedElementIds] : []);
    didSnapshotRef.current = false;
  }, [hydrate]);

  const applyPending = useCallback(
    (nextIds: number[]) => {
      const nextElements = (() => {
        const byId = new Map<number, KlingElement>();
        for (const el of [...custom, ...presets.map(presetToElement)]) {
          if (typeof el?.element_id === "number") byId.set(el.element_id, el);
        }
        return nextIds.map((id) => byId.get(id)).filter(Boolean) as KlingElement[];
      })();

      const skipSnapshot = didSnapshotRef.current;
      onPick(nextElements, { skipSnapshot });
      didSnapshotRef.current = true;
    },
    [custom, presets, onPick],
  );

  const toggleId = useCallback(
    (id: number) => {
      setPendingIds((prev) => {
        const nextIds = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        applyPending(nextIds);
        return nextIds;
      });
    },
    [applyPending],
  );

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && onOpenMenu()}>
        <ShadTooltip content={tooltip} side="top">
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={disabled}
              className={cn(
                "h-11 w-11 rounded-full border border-[#E0E5F6] bg-[#F4F6FB] text-[#2E3150] hover:bg-[#E9EEFF]",
                "dark:border-white/15 dark:bg-white/10 dark:text-white",
                (selectedElementIds?.length ?? 0) > 0 && "border-[#2E7BFF]/60 bg-[#E9EEFF] dark:bg-white/15",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <ForwardedIconComponent name="UserRound" className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </ShadTooltip>

        <DropdownMenuContent align="start" className="min-w-[260px]">
          {error && (
            <div className="px-2 py-1 text-xs text-red-600">
              {String(error)}
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-xs text-muted-foreground">
            我的主体（已选 {pendingIds.length}）
          </DropdownMenuLabel>
          {custom.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {loading ? "加载中..." : "暂无主体"}
            </div>
          ) : (
            custom.slice(0, 50).map((el) => (
              <DropdownMenuCheckboxItem
                key={el.element_id}
                checked={pendingIds.includes(el.element_id)}
                onCheckedChange={() => toggleId(el.element_id)}
                onSelect={(e) => e.preventDefault()}
              >
                {el.element_name}
              </DropdownMenuCheckboxItem>
            ))
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            官方主体
          </DropdownMenuLabel>
          {presets.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {loading ? "加载中..." : "暂无主体"}
            </div>
          ) : (
            presets.slice(0, 50).map((p) => (
              <DropdownMenuCheckboxItem
                key={`preset-${p.element_id}`}
                checked={pendingIds.includes(p.element_id)}
                onCheckedChange={() => toggleId(p.element_id)}
                onSelect={(e) => e.preventDefault()}
              >
                {p.element_name}
              </DropdownMenuCheckboxItem>
            ))
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)} disabled={disabled}>
            <ForwardedIconComponent name="Plus" className="mr-2 h-4 w-4" />
            新建主体
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

        <KlingElementCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(el) => {
            setPendingIds((prev) => {
              const nextIds = prev.includes(el.element_id) ? prev : [...prev, el.element_id];
              const byId = new Map<number, KlingElement>();
              for (const item of [...custom, ...presets.map(presetToElement)]) {
                if (typeof item?.element_id === "number") byId.set(item.element_id, item);
              }
              byId.set(el.element_id, el);
              const nextElements = nextIds.map((id) => byId.get(id)).filter(Boolean) as KlingElement[];
              const skipSnapshot = didSnapshotRef.current;
              onPick(nextElements, { skipSnapshot });
              didSnapshotRef.current = true;
              return nextIds;
            });
          }}
        />
      </>
  );
}
