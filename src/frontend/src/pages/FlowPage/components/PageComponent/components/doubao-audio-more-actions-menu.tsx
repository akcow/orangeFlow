import { cloneDeep } from "lodash";
import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useShortcutsStore } from "@/stores/shortcuts";
import { useAssetsStore } from "@/stores/assetsStore";
import ToolbarSelectItem from "../../nodeToolbarComponent/toolbarSelectItem";

type DoubaoAudioMoreActionsMenuProps = {
  nodeId: string;
  open: boolean;
  position: { x: number; y: number };
  onOpenChange: (open: boolean) => void;
};

export default function DoubaoAudioMoreActionsMenu({
  nodeId,
  open,
  position,
  onOpenChange,
}: DoubaoAudioMoreActionsMenuProps) {
  const shortcuts = useShortcutsStore((state) => state.shortcuts);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const deleteNode = useFlowStore((state) => state.deleteNode);
  const paste = useFlowStore((state) => state.paste);
  const setLastCopiedSelection = useFlowStore((state) => state.setLastCopiedSelection);

  const triggerStyle = useMemo(
    () =>
      ({
        position: "fixed",
        left: position.x,
        top: position.y,
        width: 1,
        height: 1,
        pointerEvents: "none",
      }) as const,
    [position.x, position.y],
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden style={triggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        // Make the menu's top-left corner feel anchored to the cursor.
        side="right"
        align="start"
        sideOffset={2}
        alignOffset={2}
        className="w-56 origin-top-left zoom-in-95"
      >
        <DropdownMenuItem
          onSelect={() => {
            const nodes = useFlowStore.getState().nodes;
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            const nodeData = cloneDeep(node.data);
            useAssetsStore.getState().startDraftFromNode(nodeData as any).then(() => {
              window.dispatchEvent(new Event("lf:open-assets-panel"));
            });
          }}
        >
          <ToolbarSelectItem
            value={"添加为资产"}
            icon={"Save"}
            dataTestId="save-as-asset-button-modal"
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const nodes = useFlowStore.getState().nodes;
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            paste(
              { nodes: [node], edges: [] },
              {
                x: 50,
                y: 10,
                paneX: node.position.x,
                paneY: node.position.y,
              },
            );
          }}
        >
          <ToolbarSelectItem
            shortcut={shortcuts.find((obj) => obj.name === "Duplicate")?.shortcut!}
            value={"克隆"}
            icon={"Copy"}
            dataTestId="copy-button-modal"
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const nodes = useFlowStore.getState().nodes;
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            setLastCopiedSelection({ nodes: cloneDeep([node]), edges: [] });
          }}
        >
          <ToolbarSelectItem
            shortcut={shortcuts.find((obj) => obj.name === "Copy")?.shortcut!}
            value={"复制"}
            icon={"Clipboard"}
            dataTestId="copy-button-modal"
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="focus:bg-red-400/[.20]"
          onSelect={() => {
            takeSnapshot();
            deleteNode(nodeId);
          }}
        >
          <ToolbarSelectItem
            value={"删除"}
            icon={"Trash2"}
            dataTestId="delete-button-modal"
            style="text-status-red"
            shortcut={shortcuts.find((obj) => obj.name === "Delete")?.shortcut!}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

