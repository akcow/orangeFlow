import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasUiStore } from "@/stores/canvasUiStore";
import useFlowStore from "@/stores/flowStore";
import type { GroupContainerNodeType } from "@/types/flow";
import { cn } from "@/utils/utils";
import {
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  getNodeDimensions,
} from "@/utils/groupingUtils";
import { GROUP_COLOR_OPTIONS } from "@/constants/constants";

function CornerArc({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  // A quarter-circle arc (drawn in a fixed viewBox). We render it slightly outside the group so it
  // looks like the reference "corner arc" handle, without showing any actual drag points.
  const size = 48;
  const r = 20;
  const pad = 4;

  const ext = 10; // Extension length for the bracket ends

  // Hand-tuned paths per corner to avoid SVG arc sweep ambiguity.
  const paths: Record<typeof corner, string> = {
    // Top-left: from top edge -> left edge
    tl: `M ${r + pad + ext} ${pad} L ${r + pad} ${pad} A ${r} ${r} 0 0 0 ${pad} ${r + pad} L ${pad} ${r + pad + ext}`,
    // Top-right: from top edge -> right edge
    tr: `M ${size - r - pad - ext} ${pad} L ${size - r - pad} ${pad} A ${r} ${r} 0 0 1 ${size - pad} ${r + pad} L ${size - pad} ${r + pad + ext}`,
    // Bottom-left: from bottom edge -> left edge (fixed direction)
    bl: `M ${r + pad + ext} ${size - pad} L ${r + pad} ${size - pad} A ${r} ${r} 0 0 1 ${pad} ${size - r - pad} L ${pad} ${size - r - pad - ext}`,
    // Bottom-right: from bottom edge -> right edge
    br: `M ${size - r - pad - ext} ${size - pad} L ${size - r - pad} ${size - pad} A ${r} ${r} 0 0 0 ${size - pad} ${size - r - pad} L ${size - pad} ${size - r - pad - ext}`,
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-12 w-12"
      aria-hidden="true"
    >
      <path
        d={paths[corner]}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function GroupContainerNode({
  id,
  data,
  selected,
}: NodeProps<GroupContainerNodeType>) {
  const setNode = useFlowStore((state) => state.setNode);
  const nodes = useFlowStore((state) => state.nodes);
  const referenceSelectionActive = useCanvasUiStore(
    (state) => state.referenceSelection.active,
  );

  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSizeRef = useRef<{ width: number; height: number } | null>(null);

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

  useEffect(() => {
    if (!editing) return;
    // Focus after the input appears.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [editing]);

  const bgKeyRaw = (data as any)?.backgroundColor ?? "blue";
  const bgKey = Object.hasOwn(GROUP_COLOR_OPTIONS, bgKeyRaw)
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
        "relative h-full w-full rounded-xl border border-dashed !overflow-visible",
        referenceSelectionActive &&
          "pointer-events-none opacity-35 blur-[3px] saturate-[0.72]",
        selected ? "ring-2 ring-indigo-400" : "",
      )}
    >
      {/* Corner arc visuals (no visible drag points). */}
      {selected && !referenceSelectionActive && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute -left-4 -top-4 text-black drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
            <CornerArc corner="tl" />
          </div>
          <div className="absolute -right-4 -top-4 text-black drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
            <CornerArc corner="tr" />
          </div>
          <div className="absolute -left-4 -bottom-4 text-black drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
            <CornerArc corner="bl" />
          </div>
          <div className="absolute -right-4 -bottom-4 text-black drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">
            <CornerArc corner="br" />
          </div>
        </div>
      )}

      <NodeResizer
        minWidth={minSize.minWidth}
        minHeight={minSize.minHeight}
        isVisible={Boolean(selected) && !referenceSelectionActive}
        lineClassName="!border !border-muted-foreground"
        // 130x130 invisible hit-area (user wants much larger resize affordance).
        // NOTE: we use handleStyle to force dimensions and z-index to ensure it sits on top.
        handleStyle={{ width: 130, height: 130 }}
        handleClassName="!bg-transparent !border-0 !shadow-none !opacity-0 !z-50 pointer-events-auto"
        onResize={(_, params) => {
          // Let XYFlow update the node dimensions for UI smoothness; we only persist on resize end.
          pendingSizeRef.current = { width: params.width, height: params.height };
        }}
        onResizeEnd={() => {
          const next = pendingSizeRef.current;
          pendingSizeRef.current = null;
          if (!next) return;
          // Commit the final size once at the end so history/autosave stays clean.
          setNode(id, (node) => ({ ...node, width: next.width, height: next.height }));
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
              "nodrag h-8 w-64 bg-transparent text-2xl font-bold outline-none",
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
          <span className={cn(
            "select-none text-2xl font-bold transition-all duration-200 inline-block",
            selected ? "text-blue-600 scale-110" : "text-foreground"
          )}>
            {data.label}
          </span>
        )}
      </div>
    </div>
  );
}
