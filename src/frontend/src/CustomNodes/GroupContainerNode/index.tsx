import { NodeResizer, type NodeProps } from "@xyflow/react";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import useFlowStore from "@/stores/flowStore";
import type { GroupContainerNodeType } from "@/types/flow";
import { cn } from "@/utils/utils";
import {
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  getNodeDimensions,
} from "@/utils/groupingUtils";
import { GROUP_COLOR_OPTIONS } from "@/constants/constants";

export default function GroupContainerNode({
  id,
  data,
  selected,
}: NodeProps<GroupContainerNodeType>) {
  const setNode = useFlowStore((state) => state.setNode);
  const nodes = useFlowStore((state) => state.nodes);

  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const children = useMemo(() => nodes.filter((n) => n.parentId === id), [nodes, id]);
  const minSize = useMemo(() => {
    // Ensure the container can't be resized smaller than its contents.
    let maxX = 0;
    let maxY = GROUP_HEADER_HEIGHT + GROUP_PADDING;
    for (const child of children) {
      const { width, height } = getNodeDimensions(child);
      maxX = Math.max(maxX, child.position.x + width);
      maxY = Math.max(maxY, child.position.y + height);
    }
    return {
      minWidth: Math.max(240, maxX + GROUP_PADDING),
      minHeight: Math.max(120, maxY + GROUP_PADDING),
    };
  }, [children]);

  const debouncedResize = useMemo(
    () =>
      debounce((width: number, height: number) => {
        setNode(id, (node) => ({ ...node, width, height }));
      }, 5),
    [id, setNode],
  );

  useEffect(() => {
    if (!editing) return;
    // Focus after the input appears.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [editing]);

  const bgKeyRaw = (data as any)?.backgroundColor ?? "blue";
  const bgKey = Object.prototype.hasOwnProperty.call(GROUP_COLOR_OPTIONS, bgKeyRaw)
    ? bgKeyRaw
    : "blue";
  const bgVar = (GROUP_COLOR_OPTIONS as any)[bgKey] as string | undefined;
  const bgColor = bgVar
    ? `hsl(var(${bgVar}) / var(--group-bg-alpha))`
    : "transparent";
  const borderColor = bgVar ? `hsl(var(${bgVar}) / 0.55)` : undefined;

  return (
    <div
      style={{ backgroundColor: bgColor, borderColor }}
      className={cn(
        "relative h-full w-full rounded-xl border border-dashed",
        selected ? "ring-2 ring-indigo-400" : "",
      )}
    >
      <NodeResizer
        minWidth={minSize.minWidth}
        minHeight={minSize.minHeight}
        isVisible={!!selected}
        lineClassName="!border !border-muted-foreground"
        onResize={(_, params) => {
          debouncedResize(params.width, params.height);
        }}
        onResizeEnd={() => {
          debouncedResize.flush();
        }}
      />

      {/* Header */}
      <div
        className={cn(
          // Place the name badge outside the container (top-left).
          "absolute -top-9 left-0 z-10 flex h-8 items-center rounded-md px-2",
          "bg-background/80 backdrop-blur",
        )}
        onMouseDown={(e) => {
          // Prevent drag start when interacting with the header.
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className={cn(
              "nodrag h-7 w-48 bg-transparent text-lg outline-none",
              "focus:ring-0",
            )}
            value={data.label}
            onChange={(e) => {
              const next = e.target.value;
              setNode(id, (node) => ({ ...node, data: { ...(node.data as any), label: next } }), false);
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className="select-none text-lg font-semibold text-foreground">
            {data.label}
          </span>
        )}
      </div>
    </div>
  );
}
