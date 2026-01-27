import { Background } from "@xyflow/react";
import { memo } from "react";
import CanvasControls from "@/components/core/canvasControlsComponent/CanvasControls";

export const MemoizedBackground = memo(() => (
  <Background size={2} gap={20} className="" />
));

interface MemoizedCanvasControlsProps {
  setIsAddingNote: (value: boolean) => void;
  shadowBoxWidth: number;
  shadowBoxHeight: number;
}

export const MemoizedCanvasControls = memo(
  ({
    setIsAddingNote,
    shadowBoxWidth,
    shadowBoxHeight,
  }: MemoizedCanvasControlsProps) => {
    return (
      <CanvasControls>
      </CanvasControls>
    );
  },
);

export const MemoizedSidebarTrigger = memo(() => {
  // Sidebar trigger is removed in favor of the centered floating toolbar.
  return null;
});
