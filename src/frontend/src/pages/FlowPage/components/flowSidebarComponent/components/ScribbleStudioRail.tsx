import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";

export type RailContextAction = {
  key: string;
  label: string;
  iconName?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: (id: string) => void;
};

type Props = {
  side: "left" | "right";
  title: string;
  items: Array<{ id: string; thumbnailSrc: string; label: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
  contextActions: RailContextAction[];
};

export default function ScribbleStudioRail({
  side,
  title,
  items,
  selectedId,
  onSelect,
  contextActions,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    targetId: string;
  }>({
    open: false,
    x: 0,
    y: 0,
    targetId: "",
  });
  const menuDims = useMemo(
    () => ({ w: 220, h: Math.max(1, contextActions.length) * 49 }),
    [contextActions.length],
  );

  const openMenu = (e: ReactMouseEvent | MouseEvent, targetId: string) => {
    e.preventDefault();
    const x = "clientX" in e ? e.clientX : 0;
    const y = "clientY" in e ? e.clientY : 0;
    setMenu({
      open: true,
      x,
      y,
      targetId: targetId || "",
    });
  };

  // Initialize selection when first items appear.
  // Do not force-correct an "invalid" id here, otherwise parent updates
  // (new/duplicate layer selection) can be overridden for one render tick.
  useEffect(() => {
    if (items.length === 0) return;
    if (!selectedId) onSelect(items[0]!.id);
  }, [items, onSelect, selectedId]);

  useEffect(() => {
    if (!menu.open) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      const menuEl = menuRef.current;
      if (!el && !menuEl) return;
      const target = e.target as Node | null;
      if (target && el?.contains(target)) return;
      if (target && menuEl?.contains(target)) return;
      setMenu((m) => ({ ...m, open: false }));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu((m) => ({ ...m, open: false }));
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu.open]);

  const selectedIndex = useMemo(() => {
    const idx = items.findIndex((it) => it.id === selectedId);
    return Math.max(0, idx);
  }, [items, selectedId]);
  const selected = items[selectedIndex] ?? null;
  const canSelectUp = Boolean(selected) && selectedIndex > 0;
  const canSelectDown = Boolean(selected) && selectedIndex < items.length - 1;

  const targetIndex = useMemo(
    () =>
      Math.max(
        0,
        items.findIndex((it) => it.id === menu.targetId),
      ),
    [items, menu.targetId],
  );
  const target = items[targetIndex] ?? null;
  const canUp = targetIndex > 0;
  const canDown = targetIndex >= 0 && targetIndex < items.length - 1;

  const menuActions = useMemo(() => {
    const ordered = [
      ...contextActions.filter((a) => a.key === "new-layer"),
      ...contextActions.filter((a) => a.key !== "new-layer"),
    ];
    return ordered.map((a) => {
      const dynamicDisabled =
        a.disabled ||
        (a.key === "move-up" && !canUp) ||
        (a.key === "move-down" && !canDown) ||
        (a.key !== "new-layer" && !target);
      return { ...a, disabled: dynamicDisabled };
    });
  }, [canDown, canUp, contextActions, target]);

  const menuPosition = useMemo(() => {
    const offset = side === "left" ? 8 : -228;
    const rawLeft = menu.x + offset;
    const rawTop = menu.y;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const left = Math.min(
      Math.max(8, rawLeft),
      Math.max(8, vw - menuDims.w - 8),
    );
    const top = Math.min(Math.max(8, rawTop), Math.max(8, vh - menuDims.h - 8));
    return { left, top };
  }, [menu.x, menu.y, menuDims.h, menuDims.w, side]);

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex h-[420px] w-[84px] flex-col items-center justify-between overflow-hidden rounded-2xl",
          "border border-border bg-popover/80 text-popover-foreground backdrop-blur",
          "shadow-[0_18px_40px_rgba(0,0,0,0.18)]",
        )}
        aria-label={title}
        title={title}
        role="region"
        onContextMenu={(e) => {
          // Support right-click on the whole rail (including "blank" area).
          // Keep menu available even without a target so "new-layer" can still be used.
          const fallbackTarget = selected?.id || items[0]?.id || "";
          openMenu(e, fallbackTarget);
        }}
      >
        <button
          type="button"
          className={cn(
            "mt-2 h-9 w-9 rounded-xl",
            canSelectUp ? "hover:bg-muted/60" : "cursor-not-allowed opacity-40",
          )}
          disabled={!canSelectUp}
          onClick={() => {
            if (!canSelectUp) return;
            onSelect(items[selectedIndex - 1]!.id);
          }}
          aria-label="Previous"
          title="Previous"
        >
          <ForwardedIconComponent
            name="ChevronUp"
            className="mx-auto h-5 w-5 opacity-80"
          />
        </button>

        <button
          type="button"
          className={cn(
            "my-2 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border-2 border-dashed",
            selected
              ? "border-[#2E7BFF]/70 bg-background/60"
              : "border-border/60 bg-muted/20",
          )}
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onSelect(selected.id);
          }}
          onContextMenu={(e) => {
            openMenu(e, selected?.id || "");
          }}
          aria-label={selected?.label || title}
          title={selected?.label || title}
        >
          {selected?.thumbnailSrc ? (
            <img
              src={selected.thumbnailSrc}
              alt={selected.label}
              className="h-[60px] w-[60px] rounded-xl object-cover"
              draggable={false}
            />
          ) : (
            <div className="h-[60px] w-[60px] rounded-xl bg-[conic-gradient(from_90deg,#ffffff_0_25%,#1f2937_0_50%,#ffffff_0_75%,#1f2937_0)] bg-[length:16px_16px]" />
          )}
        </button>

        <button
          type="button"
          className={cn(
            "mb-2 h-9 w-9 rounded-xl",
            canSelectDown
              ? "hover:bg-muted/60"
              : "cursor-not-allowed opacity-40",
          )}
          disabled={!canSelectDown}
          onClick={() => {
            if (!canSelectDown) return;
            onSelect(items[selectedIndex + 1]!.id);
          }}
          aria-label="Next"
          title="Next"
        >
          <ForwardedIconComponent
            name="ChevronDown"
            className="mx-auto h-5 w-5 opacity-80"
          />
        </button>
      </div>

      {menu.open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[2600] w-[220px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              // Avoid bubbling to the browser context menu while our menu is open.
              e.preventDefault();
            }}
            role="menu"
          >
            {menuActions.map((a, idx) => (
              <button
                key={a.key}
                type="button"
                disabled={a.disabled}
                onClick={() => {
                  setMenu((m) => ({ ...m, open: false }));
                  if (a.key === "new-layer") {
                    a.onClick(target?.id ?? "");
                    return;
                  }
                  if (!target) return;
                  a.onClick(target.id);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-3 text-left text-sm",
                  idx > 0 && "border-t border-border/50",
                  a.danger
                    ? "text-destructive hover:bg-muted"
                    : "text-foreground/80 hover:bg-muted",
                  a.disabled &&
                    "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                {a.iconName ? (
                  <ForwardedIconComponent
                    name={a.iconName as any}
                    className="h-4 w-4 shrink-0 opacity-80"
                  />
                ) : null}
                <span>{a.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
