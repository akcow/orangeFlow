import { Panel } from "@xyflow/react";
import { memo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import ExportModal from "@/modals/exportModal";
import { useShortcutsStore } from "../../../stores/shortcuts";
import { cn, isThereModal } from "../../../utils/utils";
import FlowToolbarOptions from "./components/flow-toolbar-options";

const FlowToolbar = memo(function FlowToolbar(): JSX.Element {
  const preventDefault = true;
  const [openExportModal, setOpenExportModal] = useState<boolean>(false);
  const handleShareWShortcut = (_e: KeyboardEvent) => {
    if (isThereModal() && !openExportModal) return;
    setOpenExportModal((oldState) => !oldState);
  };

  const flow = useShortcutsStore((state) => state.flowShare);

  useHotkeys(flow, handleShareWShortcut, { preventDefault });

  return (
    <>
      <Panel className="!top-auto !m-2" position="top-right">
        <div
          className={cn(
            "hover:shadow-round-btn-shadow flex h-11 items-center justify-center gap-7 rounded-md border bg-background px-1.5 shadow transition-all",
          )}
        >
          <FlowToolbarOptions />
        </div>
      </Panel>
      <ExportModal open={openExportModal} setOpen={setOpenExportModal} />
    </>
  );
});

export default FlowToolbar;
