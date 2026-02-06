import { Panel } from "@xyflow/react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { useCanvasAssistantStore } from "@/stores/canvasAssistantStore";

export default function CanvasAssistantLauncher(): JSX.Element {
  const open = useCanvasAssistantStore((s) => s.open);
  const setOpen = useCanvasAssistantStore((s) => s.setOpen);

  return (
    <Panel position="bottom-right" className="!m-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="group h-11 w-11 rounded-full border border-border/40 bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg hover:from-sky-300 hover:to-blue-500"
        onClick={() => {
          setOpen(!open);
        }}
        title={open ? "\u6536\u8d77\u5bf9\u8bdd" : "\u6253\u5f00\u5bf9\u8bdd"}
        data-testid="canvas-assistant-launcher"
      >
        <IconComponent
          name="Sparkles"
          aria-hidden="true"
          className="text-white !h-5 !w-5"
        />
      </Button>
    </Panel>
  );
}
