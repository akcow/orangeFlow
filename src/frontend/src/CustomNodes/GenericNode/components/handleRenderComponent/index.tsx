import { type Connection, Handle, Position } from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { useDarkStore } from "@/stores/darkStore";
import useFlowStore from "@/stores/flowStore";
import { nodeColorsName } from "@/utils/styleUtils";
import {
  isValidConnection,
  scapedJSONStringfy,
} from "../../../../utils/reactflowUtils";
import { cn, groupByFamily } from "../../../../utils/utils";

const BASE_HANDLE_STYLES = {
  width: "32px",
  height: "32px",
  top: "50%",
  position: "absolute" as const,
  zIndex: 30,
  background: "transparent",
  border: "none",
} as const;

const HandleContent = memo(function HandleContent({
  isNullHandle,
  handleColor,
  accentForegroundColorName,
  isHovered,
  openHandle,
  uiVariant,
  visible,
  visualOffset,
  isTracking,
  testIdComplement,
  title,
  showNode,
  left,
  nodeId,
  onPlusPointerEnter,
  onPlusPointerMove,
  onPlusPointerLeave,
}: {
  isNullHandle: boolean;
  handleColor: string;
  accentForegroundColorName: string;
  isHovered: boolean;
  openHandle: boolean;
  uiVariant: "dot" | "plus";
  visible: boolean;
  visualOffset?: { x: number; y: number };
  isTracking?: boolean;
  testIdComplement?: string;
  title: string;
  showNode: boolean;
  left: boolean;
  nodeId: string;
  onPlusPointerEnter?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPlusPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPlusPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  // Restore animation effect
  useEffect(() => {
    if ((isHovered || openHandle) && !isNullHandle) {
      const styleSheet = document.createElement("style");
      styleSheet.id = `pulse-${nodeId}`;
      styleSheet.textContent = `
        @keyframes pulseNeon-${nodeId} {
          0% {
            box-shadow: 0 0 0 3px hsl(var(--node-ring)),
                        0 0 2px ${handleColor},
                        0 0 4px ${handleColor},
                        0 0 6px ${handleColor},
                        0 0 8px ${handleColor},
                        0 0 10px ${handleColor},
                        0 0 15px ${handleColor},
                        0 0 20px ${handleColor};
          }
          50% {
            box-shadow: 0 0 0 3px hsl(var(--node-ring)),
                        0 0 4px ${handleColor},
                        0 0 8px ${handleColor},
                        0 0 12px ${handleColor},
                        0 0 16px ${handleColor},
                        0 0 20px ${handleColor},
                        0 0 25px ${handleColor},
                        0 0 30px ${handleColor};
          }
          100% {
            box-shadow: 0 0 0 3px hsl(var(--node-ring)),
                        0 0 2px ${handleColor},
                        0 0 4px ${handleColor},
                        0 0 6px ${handleColor},
                        0 0 8px ${handleColor},
                        0 0 10px ${handleColor},
                        0 0 15px ${handleColor},
                        0 0 20px ${handleColor};
          }
        }
      `;
      document.head.appendChild(styleSheet);

      return () => {
        const existingStyle = document.getElementById(`pulse-${nodeId}`);
        if (existingStyle) {
          existingStyle.remove();
        }
      };
    }
  }, [isHovered, openHandle, isNullHandle, nodeId, handleColor]);

  const getNeonShadow = useCallback(
    (color: string, isActive: boolean) => {
      if (isNullHandle) return "none";
      if (!isActive) return `0 0 0 3px ${color}`;
      return [
        "0 0 0 1px hsl(var(--border))",
        `0 0 2px ${color}`,
        `0 0 4px ${color}`,
        `0 0 6px ${color}`,
        `0 0 8px ${color}`,
        `0 0 10px ${color}`,
        `0 0 15px ${color}`,
        `0 0 20px ${color}`,
      ].join(", ");
    },
    [isNullHandle],
  );

  const contentStyle = useMemo(
    () => ({
      background: isNullHandle ? "hsl(var(--border))" : handleColor,
      width: "10px",
      height: "10px",
      transition: "all 0.2s",
      boxShadow: getNeonShadow(
        accentForegroundColorName,
        isHovered || openHandle,
      ),
      animation:
        (isHovered || openHandle) && !isNullHandle
          ? `pulseNeon-${nodeId} 1.1s ease-in-out infinite`
          : "none",
      border: isNullHandle ? "2px solid hsl(var(--muted))" : "none",
    }),
    [
      isNullHandle,
      handleColor,
      getNeonShadow,
      accentForegroundColorName,
      isHovered,
      openHandle,
    ],
  );

  if (uiVariant === "plus") {
    const scale = visible ? 1 : 0.72;
    const size = 72;
    const offsetX = visualOffset?.x ?? 0;
    const offsetY = visualOffset?.y ?? 0;
    const tetherLength = Math.hypot(offsetX, offsetY);
    const tetherAngle = Math.atan2(offsetY, offsetX) * (180 / Math.PI);
    const showTether = Boolean(visible && isTracking && tetherLength > 1);
    return (
      <div
        data-testid={`div-handle-${testIdComplement}-${title.toLowerCase()}-${
          !showNode ? (left ? "target" : "source") : left ? "left" : "right"
        }`}
        // The "+" bubble itself is interactive and carries `source`/`target` so XYFlow's
        // `elementFromPoint()` logic resolves to the correct handle type.
        // The inner icon is `pointer-events: none` to avoid hitting the svg instead of the bubble.
        className={cn("noflow nowheel nopan noselect absolute left-1/2 top-1/2 ease-out")}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          zIndex: 999,
          opacity: visible ? 1 : 0,
          // When hidden, don't steal pointer events from the capture zones.
          pointerEvents: visible ? "auto" : "none",
          // Important: when tracking the cursor, don't animate transform; otherwise it lags behind
          // and feels like the button is "dodging" the cursor.
          transition: isTracking
            ? "opacity 200ms ease-out"
            : "transform 200ms ease-out, opacity 200ms ease-out",
          transform: `translate(-50%, -50%)`,
        }}
        onPointerEnter={onPlusPointerEnter}
        onPointerMove={onPlusPointerMove}
        onPointerLeave={onPlusPointerLeave}
      >
        {showTether && (
          <div
            aria-hidden
            className={cn("absolute left-1/2 top-1/2", isTracking ? "" : "transition-transform duration-200")}
            style={{
              width: `${tetherLength}px`,
              height: "1px",
              transformOrigin: "0 50%",
              transform: `translate(0, -50%) rotate(${tetherAngle}deg)`,
              background: "linear-gradient(90deg, hsl(var(--border) / 0.15), hsl(var(--border) / 0.55))",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.04)",
            }}
          />
        )}
        <div
          className={cn(
            "absolute left-1/2 top-1/2 cursor-crosshair rounded-full",
            left ? "target" : "source",
          )}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            transition: isTracking
              ? "opacity 200ms ease-out"
              : "transform 200ms ease-out, opacity 200ms ease-out",
            transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
            background: "hsl(var(--background) / 0.78)",
            border: "1px solid hsl(var(--border) / 0.55)",
            boxShadow: visible
              ? "0 10px 25px rgba(15,23,42,0.18)"
              : "0 0 0 rgba(0,0,0,0)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="pointer-events-none flex h-full w-full items-center justify-center">
            <ForwardedIconComponent
              name="Plus"
              className="pointer-events-none h-7 w-7"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`div-handle-${testIdComplement}-${title.toLowerCase()}-${
        !showNode ? (left ? "target" : "source") : left ? "left" : "right"
      }`}
      className="noflow nowheel nopan noselect pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full"
      style={contentStyle}
    />
  );
});

const HandleRenderComponent = memo(function HandleRenderComponent({
  left,
  tooltipTitle = "",
  proxy,
  id,
  title,
  myData,
  colors,
  setFilterEdge,
  showNode,
  testIdComplement,
  nodeId,
  colorName,
  uiVariant = "dot",
  visible,
  visualOffset,
  handleStyle,
  wrapperStyle,
  wrapperClassName,
  isTracking,
  onPlusPointerEnter,
  onPlusPointerMove,
  onPlusPointerLeave,
  clickMode = "filter",
  onMenuRequest,
}: {
  left: boolean;
  tooltipTitle?: string;
  proxy?: any;
  id: any;
  title: string;
  myData: any;
  colors: string[];
  setFilterEdge: (edges: any) => void;
  showNode: boolean;
  testIdComplement?: string;
  nodeId: string;
  colorName?: string[];
  uiVariant?: "dot" | "plus";
  visible?: boolean;
  visualOffset?: { x: number; y: number };
  handleStyle?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
  wrapperClassName?: string;
  isTracking?: boolean;
  onPlusPointerEnter?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPlusPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPlusPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void;
  clickMode?: "filter" | "menu" | "none";
  onMenuRequest?: (payload: {
    x: number;
    y: number;
    kind: "input" | "output";
    nodeId: string;
    handleId: string;
    handlePayload: any;
    title: string;
  }) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);

  const isLocked = useFlowStore(
    useShallow((state) => state.currentFlow?.locked),
  );

  const edges = useFlowStore((state) => state.edges);

  const {
    setHandleDragging,
    setFilterType,
    setFilterComponent,
    handleDragging,
    filterType,
    onConnect,
  } = useFlowStore(
    useCallback(
      (state) => ({
        setHandleDragging: state.setHandleDragging,
        setFilterType: state.setFilterType,
        setFilterComponent: state.setFilterComponent,
        handleDragging: state.handleDragging,
        filterType: state.filterType,
        onConnect: state.onConnect,
      }),
      [],
    ),
  );

  const dark = useDarkStore((state) => state.dark);

  const myId = useMemo(
    () => scapedJSONStringfy(proxy ? { ...id, proxy } : id),
    [id, proxy],
  );

  const getConnection = (semiConnection: {
    source?: string;
    sourceHandle?: string;
    target?: string;
    targetHandle?: string;
  }) => ({
    source: semiConnection.source ?? nodeId,
    sourceHandle: semiConnection.sourceHandle ?? myId,
    target: semiConnection.target ?? nodeId,
    targetHandle: semiConnection.targetHandle ?? myId,
  });

  const {
    sameNode,
    ownHandle,
    openHandle,
    filterOpenHandle,
    filterPresent,
    currentFilter,
    isNullHandle,
    handleColor,
    accentForegroundColorName,
  } = useMemo(() => {
    const sameDraggingNode =
      (!left ? handleDragging?.target : handleDragging?.source) === nodeId;
    const sameFilterNode =
      (!left ? filterType?.target : filterType?.source) === nodeId;

    const ownDraggingHandle =
      handleDragging &&
      (left ? handleDragging?.target : handleDragging?.source) &&
      (left ? handleDragging.targetHandle : handleDragging.sourceHandle) ===
        myId;

    const ownFilterHandle =
      filterType &&
      (left ? filterType?.target : filterType?.source) === nodeId &&
      (left ? filterType.targetHandle : filterType.sourceHandle) === myId;

    const draggingOpenHandle =
      handleDragging &&
      (left ? handleDragging.source : handleDragging.target) &&
      !ownDraggingHandle
        ? isValidConnection(getConnection(handleDragging))
        : false;

    const filterOpenHandle =
      filterType &&
      (left ? filterType.source : filterType.target) &&
      !ownFilterHandle
        ? isValidConnection(getConnection(filterType))
        : false;

    const openHandle = filterOpenHandle || draggingOpenHandle;
    const filterPresent = handleDragging || filterType;

    const connectedEdge = edges.find(
      (edge) => edge.target === nodeId && edge.targetHandle === myId,
    );
    const outputType = connectedEdge?.data?.sourceHandle?.output_types?.[0];
    const connectedColor = (outputType && nodeColorsName[outputType]) || "gray";

    const isNullHandle =
      filterPresent && !(openHandle || ownDraggingHandle || ownFilterHandle);

    // Create a Set from colorName to remove duplicates
    const colorNameSet = new Set(colorName || []);
    const uniqueColorCount = colorNameSet.size;
    const firstUniqueColor =
      colorName && colorName.length > 0 ? colorName[0] : "";

    const handleColorName = connectedEdge
      ? connectedColor
      : uniqueColorCount > 1
        ? "secondary-foreground"
        : "datatype-" + firstUniqueColor;

    const handleColor = isNullHandle
      ? dark
        ? "hsl(var(--accent-gray))"
        : "hsl(var(--accent-gray-foreground)"
      : connectedEdge
        ? "hsl(var(--datatype-" + connectedColor + "))"
        : uniqueColorCount > 1
          ? "hsl(var(--secondary-foreground))"
          : "hsl(var(--datatype-" + firstUniqueColor + "))";

    const accentForegroundColorName = connectedEdge
      ? "hsl(var(--datatype-" + connectedColor + "-foreground))"
      : uniqueColorCount > 1
        ? "hsl(var(--input))"
        : "hsl(var(--datatype-" + firstUniqueColor + "-foreground))";

    const currentFilter = left
      ? {
          targetHandle: myId,
          target: nodeId,
          source: undefined,
          sourceHandle: undefined,
          type: tooltipTitle,
          color: handleColorName,
        }
      : {
          sourceHandle: myId,
          source: nodeId,
          target: undefined,
          targetHandle: undefined,
          type: tooltipTitle,
          color: handleColorName,
        };

    return {
      sameNode: sameDraggingNode || sameFilterNode,
      ownHandle: ownDraggingHandle || ownFilterHandle,
      accentForegroundColorName,
      openHandle,
      filterOpenHandle,
      filterPresent,
      currentFilter,
      isNullHandle,
      handleColor,
    };
  }, [
    left,
    handleDragging,
    filterType,
    nodeId,
    myId,
    dark,
    colors,
    colorName,
    tooltipTitle,
    edges,
  ]);

  const resolvedVisible = visible ?? true;
  const hasAnyInteraction = Boolean(filterPresent) || openHandle || ownHandle || isHovered;
  const shouldAllowPointerEvents = !isLocked && (resolvedVisible || hasAnyInteraction);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      // XYFlow starts "box select" / selection drag on `pointerdown` (before `mousedown`).
      // For menu-mode handles (our preview "+" bubbles), prevent that side-effect.
      if (clickMode !== "menu") return;
      if (event.button !== 0) return;
      event.stopPropagation();
    },
    [clickMode],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button === 0) {
        clickStartRef.current = { x: event.clientX, y: event.clientY };
        // For menu-mode handles, only show the connection line when a real drag occurs.
        // This prevents a "real" connection line from appearing while the menu is open.
        if (clickMode === "menu") {
          // Prevent node selection / multi-select grouping side-effects on mousedown.
          event.stopPropagation();
          const start = { x: event.clientX, y: event.clientY };
          let draggingStarted = false;

          const handleMouseMove = (moveEvent: MouseEvent) => {
            if (draggingStarted) return;
            const dx = moveEvent.clientX - start.x;
            const dy = moveEvent.clientY - start.y;
            if (dx * dx + dy * dy > 36) {
              draggingStarted = true;
              setHandleDragging(currentFilter);
            }
          };

          const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            if (draggingStarted) {
              setHandleDragging(undefined);
            }
          };

          document.addEventListener("mousemove", handleMouseMove);
          document.addEventListener("mouseup", handleMouseUp);
          return;
        }

        setHandleDragging(currentFilter);
        const handleMouseUp = () => {
          setHandleDragging(undefined);
          document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mouseup", handleMouseUp);
      }
    },
    [clickMode, currentFilter, setHandleDragging],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      // Preserve drag-to-connect UX: don't treat a drag as a click.
      const start = clickStartRef.current;
      if (start) {
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (dx * dx + dy * dy > 36) {
          return;
        }
      }

      if (clickMode === "none") return;

      if (clickMode === "menu") {
        event.preventDefault();
        event.stopPropagation();
        onMenuRequest?.({
          x: event.clientX,
          y: event.clientY,
          kind: left ? "input" : "output",
          nodeId,
          handleId: myId,
          handlePayload: proxy ? { ...id, proxy } : id,
          title,
        });
        return;
      }

      const nodes = useFlowStore.getState().nodes;
      setFilterEdge(groupByFamily(myData, tooltipTitle!, left, nodes!));
      setFilterType(currentFilter);
      setFilterComponent("");
      if (filterOpenHandle && filterType) {
        onConnect(getConnection(filterType));
        setFilterType(undefined);
        setFilterEdge([]);
        setFilterComponent("");
      }
    },
    [
      clickMode,
      currentFilter,
      filterOpenHandle,
      filterType,
      id,
      left,
      myData,
      myId,
      nodeId,
      onConnect,
      onMenuRequest,
      proxy,
      setFilterComponent,
      setFilterEdge,
      setFilterType,
      title,
      tooltipTitle,
    ],
  );

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => e.preventDefault(),
    [],
  );

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <Handle
        type={left ? "target" : "source"}
        position={left ? Position.Left : Position.Right}
        id={myId}
        isValidConnection={(connection) =>
          isLocked ? false : isValidConnection(connection as Connection)
        }
        className={cn(
          "group/handle z-50 transition-all",
          !showNode && "no-show",
        )}
        style={{
          ...BASE_HANDLE_STYLES,
          ...(handleStyle ?? {}),
          // Preview "+" handles need to sit above the node body so the canvas can detect them via elementFromPoint.
          zIndex: uiVariant === "plus" ? 999 : BASE_HANDLE_STYLES.zIndex,
          pointerEvents: shouldAllowPointerEvents ? "auto" : "none",
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onPointerDown={handlePointerDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-testid={`handle-${testIdComplement}-${title.toLowerCase()}-${
          !showNode ? (left ? "target" : "source") : left ? "left" : "right"
        }`}
      >
        <HandleContent
          isNullHandle={isNullHandle ?? false}
          handleColor={handleColor}
          accentForegroundColorName={accentForegroundColorName}
          isHovered={isHovered}
          openHandle={openHandle}
          uiVariant={uiVariant}
          visible={resolvedVisible || hasAnyInteraction}
          visualOffset={visualOffset}
          isTracking={isTracking}
          testIdComplement={testIdComplement}
          title={title}
          showNode={showNode}
          left={left}
          nodeId={nodeId}
          onPlusPointerEnter={onPlusPointerEnter}
          onPlusPointerMove={onPlusPointerMove}
          onPlusPointerLeave={onPlusPointerLeave}
        />
      </Handle>
    </div>
  );
});

export default HandleRenderComponent;
