import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { useCanvasUiStore } from "@/stores/canvasUiStore";

export default function MiniMapToggle(): JSX.Element {
  const open = useCanvasUiStore((s) => s.miniMapOpen);
  const toggle = useCanvasUiStore((s) => s.toggleMiniMapOpen);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="group flex items-center justify-center px-2 rounded-none hover:bg-muted"
      onClick={toggle}
      data-testid="minimap-toggle"
      title={open ? "收起小地图" : "展开小地图"}
    >
      <IconComponent
        name="Map"
        aria-hidden="true"
        className="text-muted-foreground group-hover:text-primary !h-5 !w-5"
      />
    </Button>
  );
}

