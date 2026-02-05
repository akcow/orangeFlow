import { Panel, useStoreApi } from "@xyflow/react";
import { type ReactNode, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { Separator } from "@/components/ui/separator";
import useFlowStore from "@/stores/flowStore";
import CanvasControlsDropdown from "./CanvasControlsDropdown";
import HelpDropdown from "./HelpDropdown";
import MiniMapToggle from "./MiniMapToggle";

const CanvasControls = ({
  children,
  view,
}: {
  children?: ReactNode;
  view?: boolean;
}) => {
  const reactFlowStoreApi = useStoreApi();
  const isFlowLocked = useFlowStore(
    useShallow((state) => state.currentFlow?.locked),
  );

  useEffect(() => {
    const isInteractive = !isFlowLocked && !view;
    reactFlowStoreApi.setState({
      nodesDraggable: isInteractive,
      nodesConnectable: isInteractive,
      elementsSelectable: isInteractive,
    });
  }, [isFlowLocked, reactFlowStoreApi, view]);

  return (
    <Panel
      data-testid="main_canvas_controls"
      className="react-flow__controls !m-2 flex !flex-row rounded-md border border-border bg-background fill-foreground stroke-foreground text-primary [&>button]:border-0"
      position="bottom-left"
    >
      {children}
      {children && (
        <span>
          <Separator orientation="vertical" />
        </span>
      )}
      <MiniMapToggle />
      <span>
        <Separator orientation="vertical" />
      </span>
      <HelpDropdown />
      <span>
        <Separator orientation="vertical" />
      </span>
      <CanvasControlsDropdown />
    </Panel>
  );
};

export default CanvasControls;
