import { NodeToolbar } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "../../../../components/ui/button";
import { GROUP_COLOR_OPTIONS } from "../../../../constants/constants";
import { GradientGroup } from "../../../../icons/GradientSparkles";
import useFlowStore from "../../../../stores/flowStore";

function GroupColorPickerButtons({
  groupId,
  currentColor,
  setNode,
}: {
  groupId: string;
  currentColor: string;
  setNode: (id: string, updater: any) => void;
}) {
  return (
    <div className="flew-row flex gap-3">
      {Object.entries(GROUP_COLOR_OPTIONS).map(([color, cssVar]) => (
        <Button
          unstyled
          key={color}
          onClick={() => {
            setNode(groupId, (old: any) => ({
              ...old,
              data: {
                ...old.data,
                backgroundColor: color,
              },
            }));
          }}
        >
          <div
            className={
              "h-4 w-4 rounded-full hover:border hover:border-ring " +
              (currentColor === color ? "border-2 border-blue-500" : "") +
              (!cssVar ? " border" : "")
            }
            style={{
              backgroundColor: cssVar ? `hsl(var(${cssVar}))` : "#00000000",
            }}
          />
        </Button>
      ))}
    </div>
  );
}

export default function SelectionMenu({
  onGroup,
  onUngroup,
  nodes,
  isVisible,
  lastSelection,
}: {
  onGroup: () => void;
  onUngroup: (groupId?: string) => void;
  nodes: any;
  isVisible: boolean;
  lastSelection: any;
}) {
  const unselectAll = useFlowStore((state) => state.unselectAll);
  const setNode = useFlowStore((state) => state.setNode);
  const allNodes = useFlowStore((state) => state.nodes);
  const [isOpen, setIsOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastNodes, setLastNodes] = useState(nodes);

  useHotkeys("esc", unselectAll, { preventDefault: true });

  const mode = useMemo(() => {
    const count = lastSelection?.nodes?.length ?? 0;
    if (count === 1 && lastSelection?.nodes?.[0]?.type === "groupNode") {
      return "ungroup" as const;
    }
    if (count > 1) return "group" as const;
    return "none" as const;
  }, [lastSelection]);

  // nodes get saved to not be gone after the toolbar closes
  useEffect(() => {
    setLastNodes(nodes);
  }, [isOpen]);

  // transition starts after and ends before the toolbar closes
  useEffect(() => {
    if (isVisible) {
      setIsOpen(true);
      setTimeout(() => {
        setIsTransitioning(true);
      }, 50);
    } else {
      setIsTransitioning(false);
      setTimeout(() => {
        setIsOpen(false);
      }, 500);
    }
  }, [isVisible]);

  return (
    <NodeToolbar
      isVisible={isOpen}
      offset={5}
      nodeId={lastNodes && lastNodes.length > 0 ? lastNodes.map((n) => n.id) : []}
    >
      <div
        className={
          "duration-400 h-10 rounded-md border border-indigo-300 bg-background px-2.5 text-primary shadow-inner transition-all ease-in-out" +
          (isTransitioning ? " opacity-100" : " opacity-0")
        }
      >
        {mode === "group" ? (
          <div className="flex h-full items-center">
            <Button
              unstyled
              className="flex h-full items-center gap-2 text-sm"
              onClick={onGroup}
              data-testid="group-node"
            >
              <GradientGroup
                strokeWidth={1.5}
                size={22}
                className="text-primary"
              />
              分组
            </Button>
          </div>
        ) : mode === "ungroup" ? (
          <div className="flex h-full items-center gap-4">
            {(() => {
              const groupId = lastSelection?.nodes?.[0]?.id as string | undefined;
              if (!groupId) return null;
              const group = allNodes.find((n: any) => n.id === groupId) as any;
              const bgKeyRaw = group?.data?.backgroundColor ?? "blue";
              const bgKey = Object.prototype.hasOwnProperty.call(GROUP_COLOR_OPTIONS, bgKeyRaw)
                ? bgKeyRaw
                : "blue";
              const bgVar = (GROUP_COLOR_OPTIONS as any)[bgKey] as string | undefined;
              return (
                <Popover>
                  <ShadTooltip content="颜色选择" side="top">
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="颜色选择"
                        className="h-6 w-6 rounded-full border border-border shadow-sm hover:ring-2 hover:ring-indigo-300"
                        style={{ backgroundColor: bgVar ? `hsl(var(${bgVar}))` : "#00000000" }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </PopoverTrigger>
                  </ShadTooltip>
                  <PopoverContent
                    side="top"
                    className="w-fit px-2 py-2"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GroupColorPickerButtons
                      groupId={groupId}
                      currentColor={bgKey}
                      setNode={setNode}
                    />
                  </PopoverContent>
                </Popover>
              );
            })()}

            <Button
              unstyled
              className="flex h-full items-center gap-2 text-sm"
              onClick={() => onUngroup?.(lastSelection?.nodes?.[0]?.id)}
              data-testid="ungroup-node"
            >
              <GradientGroup
                strokeWidth={1.5}
                size={22}
                className="text-primary"
              />
              解散
            </Button>
          </div>
        ) : null}
      </div>
    </NodeToolbar>
  );
}
