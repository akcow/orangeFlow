import { MiniMap } from "@xyflow/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanvasUiStore } from "@/stores/canvasUiStore";

const BASE_OFFSET_PX = 8; // matches existing `m-2` spacing in canvas panels
const CONTROLS_BAR_HEIGHT_PX = 40;
const STACK_GAP_PX = 8;
const MINI_MAP_BOTTOM_PX = BASE_OFFSET_PX + CONTROLS_BAR_HEIGHT_PX + STACK_GAP_PX;

export default function CanvasMiniMap(): JSX.Element | null {
  const isMobile = useIsMobile();
  const open = useCanvasUiStore((s) => s.miniMapOpen);

  // Mirror the reference project behavior: don't show minimap on mobile.
  if (isMobile) return null;
  if (!open) return null;

  return (
    <MiniMap
      position="bottom-left"
      pannable={true}
      zoomable={true}
      style={{
        left: BASE_OFFSET_PX,
        bottom: MINI_MAP_BOTTOM_PX,
        width: 220,
        height: 160,
      }}
      className="z-10 rounded-md border border-border bg-background shadow-sm"
      // Use theme CSS variables so minimap matches light/dark mode.
      bgColor="hsl(var(--background))"
      maskColor="hsl(var(--muted) / 0.6)"
      maskStrokeColor="hsl(var(--border))"
    />
  );
}
