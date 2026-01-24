import { useEffect, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n/t";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { cn } from "@/utils/utils";

export default function NodeName({
  display_name,
  selected,
  nodeId,
  showNode,
  beta,
  legacy,
  editNameDescription,
  toggleEditNameDescription,
  setHasChangedNodeDescription,
}: {
  display_name?: string;
  selected?: boolean;
  nodeId: string;
  showNode: boolean;
  beta: boolean;
  legacy?: boolean;
  editNameDescription: boolean;
  toggleEditNameDescription: () => void;
  setHasChangedNodeDescription: (hasChanged: boolean) => void;
}) {
  const [nodeName, setNodeName] = useState<string>(display_name ?? "");
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const setNode = useFlowStore((state) => state.setNode);

  useEffect(() => {
    // Snapshot when entering edit mode (for undo/redo), regardless of selection state.
    if (editNameDescription) {
      takeSnapshot();
    }
  }, [editNameDescription, takeSnapshot]);

  useEffect(() => {
    setNodeName(display_name ?? "");
  }, [display_name]);

  const handleBlur = () => {
    if (nodeName?.trim() !== "") {
      setNodeName(nodeName);
      setNode(nodeId, (old) => ({
        ...old,
        data: {
          ...old.data,
          node: {
            ...old.data.node,
            display_name: nodeName,
          },
        },
      }));
    } else {
      setNodeName(display_name ?? "");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleBlur();
      toggleEditNameDescription();
    }
    if (e.key === "Escape") {
      setNodeName(display_name ?? "");
      toggleEditNameDescription();
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNodeName(e.target.value);
    setHasChangedNodeDescription(true);
  };

  const startEditing = (e: React.MouseEvent) => {
    if (!showNode || editNameDescription) return;
    // `useChangeOnUnfocus` will immediately close the editor while the node is unselected.
    // When the title is clicked on an unselected node, selection updates may land *after*
    // we toggle edit mode. Ensure the node is selected first, then enter edit mode.
    if (!selected) {
      useFlowStore.getState().setNodes((nodes) =>
        nodes.map((node) => ({ ...node, selected: node.id === nodeId })),
      );
      window.requestAnimationFrame(() => toggleEditNameDescription());
      return;
    }
    toggleEditNameDescription();
  };

  return editNameDescription ? (
    <div className="w-full">
      <Input
        onBlur={handleBlur}
        value={nodeName}
        autoFocus
        onChange={onChange}
        data-testid={`input-title-${display_name}`}
        onKeyDown={handleKeyDown}
        className="px-2 py-0"
      />
    </div>
  ) : (
    <div className="group my-px flex flex-1 items-center gap-2 overflow-hidden">
      <div
        data-testid={"title-" + display_name}
        className={cn(
          "nodoubleclick nodrag truncate font-medium text-primary",
          showNode ? "cursor-text" : "cursor-default",
        )}
        onClick={startEditing}
      >
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm")}>
            {display_name}
          </span>
          {legacy && (
            <div className="shrink-0">
              <div className="flex items-center text-xxs justify-center rounded-sm border border-accent-amber text-accent-amber-foreground px-1">
                {t("Legacy")}
              </div>
            </div>
          )}
        </div>
      </div>
      {beta && (
        <div className="shrink-0">
          <ShadTooltip content={t("Beta component")}>
            <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-accent-purple-foreground p-0.5">
              <ForwardedIconComponent
                name="FlaskConical"
                className="text-accent-purple-foreground"
              />
            </div>
          </ShadTooltip>
        </div>
      )}
    </div>
  );
}
