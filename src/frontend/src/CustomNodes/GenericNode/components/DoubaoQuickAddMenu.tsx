import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { type ReactFlowState, useStore } from "@xyflow/react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";

type QuickAddItem = {
  key: string;
  label: string;
  icon: string;
  onSelect: () => void;
};

export default function DoubaoQuickAddMenu({
  open,
  position,
  title,
  items,
  onOpenChange,
}: {
  open: boolean;
  position: { x: number; y: number };
  title: string;
  items: QuickAddItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);

  const menuScale = useMemo(() => {
    const MIN_FIXED_UI_ZOOM = 0.57;
    const zoom = canvasZoom || 1;
    // Menu is rendered in a portal (not inside the ReactFlow transform),
    // so we only shrink it when the canvas zoom is below the clamp threshold.
    return Math.min(1, zoom / MIN_FIXED_UI_ZOOM);
  }, [canvasZoom]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      onOpenChange(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    // Capture so we close before other handlers (matches Radix "dismissable layer" feel).
    document.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [open, onOpenChange]);

  const outerStyle = useMemo(
    () =>
      ({
        position: "fixed",
        left: position.x,
        top: position.y,
        transform: `scale(${menuScale})`,
        transformOrigin: "top left",
        zIndex: 9999,
      }) as CSSProperties,
    [menuScale, position.x, position.y],
  );

  if (!open) return null;

  return createPortal(
    <div style={outerStyle}>
      <div
        ref={menuRef}
        className={cn(
          "w-60 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          // Open animation (inner element so it doesn't fight the segmented scaling transform).
          "origin-top-left animate-in fade-in-0 zoom-in-95",
        )}
      >
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
        <div className="h-px bg-border" />
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              )}
              onClick={() => {
                item.onSelect();
                onOpenChange(false);
              }}
            >
              <ForwardedIconComponent name={item.icon} className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

