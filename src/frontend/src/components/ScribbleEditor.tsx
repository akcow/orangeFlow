import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";
import { toRenderableImageSource } from "@/CustomNodes/GenericNode/components/DoubaoPreviewPanel/helpers";

type ToolMode = "select" | "brush" | "rect" | "text";

type InnerRect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

type StrokeItem = {
  id: string;
  kind: "stroke";
  color: string;
  width: number;
  points: Point[];
};

type RectItem = {
  id: string;
  kind: "rect";
  color: string;
  width: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type TextItem = {
  id: string;
  kind: "text";
  color: string;
  fontSize: number;
  x: number;
  y: number;
  text: string;
};

type Item = StrokeItem | RectItem | TextItem;

export type ScribbleEditorHandle = {
  exportPngFile: () => Promise<
    | {
        file: File;
        objectUrl: string;
        width: number;
        height: number;
      }
    | null
  >;
  getNaturalSize: () => { w: number; h: number } | null;
};

type Props = {
  open: boolean;
  imageSource: string;
  imageFileName?: string;
  onBack?: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeContainRect(
  bounds: { width: number; height: number },
  natural: { w: number; h: number },
): InnerRect | null {
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);
  const nw = Math.max(1, natural.w);
  const nh = Math.max(1, natural.h);
  const scale = Math.min(bw / nw, bh / nh) || 1;
  const w = nw * scale;
  const h = nh * scale;
  const x = (bw - w) / 2;
  const y = (bh - h) / 2;
  return { x, y, w, h };
}

function buildStrokePath(points: Point[]) {
  if (!points.length) return "";
  const first = points[0];
  if (!first) return "";
  const parts = [`M ${first.x} ${first.y}`];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (!p) continue;
    parts.push(`L ${p.x} ${p.y}`);
  }
  return parts.join(" ");
}

function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function normalizeFileName(raw: string | undefined) {
  const base = String(raw ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_");
  if (!base) return "annotated.png";
  const withoutExt = base.replace(/\.[^/.]+$/, "");
  return `${withoutExt || "image"}_annotated.png`;
}

function deepCloneItems(items: Item[]): Item[] {
  return items.map((item) => {
    if (item.kind === "stroke") {
      return { ...item, points: item.points.map((p) => ({ x: p.x, y: p.y })) };
    }
    return { ...(item as any) };
  });
}

const COLORS = [
  "#FFC533",
  "#FF7A00",
  "#FF2D7A",
  "#FF0033",
  "#7C3AED",
  "#1D4ED8",
  "#FFFFFF",
  "#111827",
];

const ScribbleEditor = forwardRef<ScribbleEditorHandle, Props>(function ScribbleEditor(
  { open, imageSource, imageFileName, onBack }: Props,
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [renderUrl, setRenderUrl] = useState<string>("");
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [innerRect, setInnerRect] = useState<InnerRect | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [strokeWidth, setStrokeWidth] = useState<number>(10);
  const [fontSize, setFontSize] = useState<number>(32);
  const [color, setColor] = useState<string>(COLORS[0] ?? "#FF0033");

  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isExporting, setExporting] = useState(false);

  const historyRef = useRef<{ stack: Item[][]; index: number }>({ stack: [[]], index: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Drag/gesture state stored in a ref to avoid re-rendering on every pointer move.
  const dragRef = useRef<
    | null
    | {
        pointerId: number;
        kind:
          | { mode: "draw-stroke"; id: string }
          | { mode: "draw-rect"; id: string; start: Point }
          | { mode: "move"; id: string; start: Point; origin: any }
          | { mode: "resize-rect"; id: string; handle: string; start: Point; origin: RectItem };
      }
  >(null);

  const updateUndoState = useCallback(() => {
    const { stack, index } = historyRef.current;
    setCanUndo(index > 0);
    setCanRedo(index >= 0 && index < stack.length - 1);
  }, []);

  const pushHistory = useCallback(
    (next: Item[]) => {
      const { stack, index } = historyRef.current;
      const sliced = stack.slice(0, index + 1);
      sliced.push(deepCloneItems(next));
      historyRef.current = { stack: sliced, index: sliced.length - 1 };
      updateUndoState();
    },
    [updateUndoState],
  );

  const handleUndo = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index <= 0) return;
    const nextIndex = index - 1;
    historyRef.current.index = nextIndex;
    setItems(deepCloneItems(stack[nextIndex] ?? []));
    setSelectedId(null);
    setEditingTextId(null);
    updateUndoState();
  }, [updateUndoState]);

  const handleRedo = useCallback(() => {
    const { stack, index } = historyRef.current;
    if (index >= stack.length - 1) return;
    const nextIndex = index + 1;
    historyRef.current.index = nextIndex;
    setItems(deepCloneItems(stack[nextIndex] ?? []));
    setSelectedId(null);
    setEditingTextId(null);
    updateUndoState();
  }, [updateUndoState]);

  const getBounds = useCallback(() => {
    const el = rootRef.current;
    if (!el) return { width: 0, height: 0 };
    return { width: el.clientWidth, height: el.clientHeight };
  }, []);

  // Load the image into a renderable URL (object URL for data/remote images).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let revoke: undefined | (() => void);

    const run = async () => {
      try {
        const { url, revoke: revokeFn } = await toRenderableImageSource(imageSource);
        if (cancelled) return;
        revoke = revokeFn;
        setRenderUrl(url);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (cancelled) return;
          setNaturalSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        };
        img.onerror = () => {
          if (cancelled) return;
          setNaturalSize(null);
        };
        img.src = url;
      } catch {
        if (cancelled) return;
        setNaturalSize(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [imageSource, open]);

  // Start fresh on every entry (or when the base image changes).
  useEffect(() => {
    if (!open) return;
    setItems([]);
    setSelectedId(null);
    setEditingTextId(null);
    historyRef.current = { stack: [[]], index: 0 };
    setCanUndo(false);
    setCanRedo(false);
  }, [imageSource, open]);

  const initLayout = useCallback(() => {
    if (!open) return;
    const bounds = getBounds();
    const natural = naturalSize;
    if (!bounds.width || !bounds.height || !natural) return;
    const rect = computeContainRect(bounds, natural);
    if (!rect) return;
    setInnerRect(rect);
  }, [getBounds, naturalSize, open]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => initLayout());
    return () => window.cancelAnimationFrame(id);
  }, [initLayout, open, renderUrl]);

  useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => initLayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [initLayout, open]);

  const surfaceCssStyle = useMemo(() => {
    if (!innerRect) return undefined;
    return {
      left: `${innerRect.x}px`,
      top: `${innerRect.y}px`,
      width: `${innerRect.w}px`,
      height: `${innerRect.h}px`,
    } as any;
  }, [innerRect]);

  const pointFromEvent = useCallback(
    (event: ReactPointerEvent | React.MouseEvent) => {
      const svg = svgRef.current;
      const natural = naturalSize;
      if (!svg || !natural) return null;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = ((event.clientX - rect.left) / rect.width) * natural.w;
      const y = ((event.clientY - rect.top) / rect.height) * natural.h;
      return { x: clamp(x, 0, natural.w), y: clamp(y, 0, natural.h) };
    },
    [naturalSize],
  );

  const selectedItem = useMemo(
    () => (selectedId ? items.find((it) => it.id === selectedId) ?? null : null),
    [items, selectedId],
  );

  // Keep controls in sync with selected item.
  useEffect(() => {
    if (!selectedItem) return;
    if (selectedItem.kind === "text") {
      setColor(selectedItem.color);
      setFontSize(selectedItem.fontSize);
      return;
    }
    setColor(selectedItem.color);
    setStrokeWidth(selectedItem.width);
  }, [selectedItem]);

  const setSelected = useCallback((id: string | null) => {
    setSelectedId(id);
    setEditingTextId(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== selectedId);
      pushHistory(next);
      return next;
    });
    setSelected(null);
  }, [pushHistory, selectedId, setSelected]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (target as any)?.isContentEditable) return;

      if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [deleteSelected, handleRedo, handleUndo, open]);

  const commitTextEdit = useCallback(
    (id: string, nextText: string) => {
      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === id && it.kind === "text" ? { ...it, text: nextText } : it,
        );
        pushHistory(next);
        return next;
      });
      setEditingTextId(null);
    },
    [pushHistory],
  );

  const handleClear = useCallback(() => {
    setItems([]);
    setSelected(null);
    setEditingTextId(null);
    pushHistory([]);
  }, [pushHistory, setSelected]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      const p = pointFromEvent(event);
      if (!p) return;

      const target = event.target as HTMLElement | null;
      const itemId = target?.getAttribute?.("data-annotate-id") || null;
      const resizeHandle = target?.getAttribute?.("data-annotate-handle") || null;

      if (toolMode === "select" && itemId && resizeHandle) {
        const rectItem = items.find(
          (it) => it.id === itemId && it.kind === "rect",
        ) as RectItem | undefined;
        if (!rectItem) return;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          kind: {
            mode: "resize-rect",
            id: itemId,
            handle: resizeHandle,
            start: p,
            origin: { ...rectItem },
          },
        };
        setSelected(itemId);
        return;
      }

      if (toolMode === "select") {
        if (itemId) {
          const item = items.find((it) => it.id === itemId);
          if (!item) return;
          setSelected(itemId);
          if (item.kind === "rect" || item.kind === "text") {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              kind: { mode: "move", id: itemId, start: p, origin: { ...item } },
            };
          }
        } else {
          setSelected(null);
        }
        return;
      }

      if (toolMode === "brush") {
        const id = nextId("stroke");
        const stroke: StrokeItem = {
          id,
          kind: "stroke",
          color,
          width: strokeWidth,
          points: [p],
        };
        setItems((prev) => [...prev, stroke]);
        setSelected(id);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, kind: { mode: "draw-stroke", id } };
        return;
      }

      if (toolMode === "rect") {
        const id = nextId("rect");
        const rect: RectItem = {
          id,
          kind: "rect",
          color,
          width: strokeWidth,
          x: p.x,
          y: p.y,
          w: 1,
          h: 1,
        };
        setItems((prev) => [...prev, rect]);
        setSelected(id);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          kind: { mode: "draw-rect", id, start: p },
        };
        return;
      }

      if (toolMode === "text") {
        const id = nextId("text");
        const text: TextItem = {
          id,
          kind: "text",
          color,
          fontSize,
          x: p.x,
          y: p.y,
          text: "",
        };
        setItems((prev) => [...prev, text]);
        setSelected(id);
        setEditingTextId(id);
      }
    },
    [color, fontSize, items, open, pointFromEvent, setSelected, strokeWidth, toolMode],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const p = pointFromEvent(event);
      if (!p) return;

      if (drag.kind.mode === "draw-stroke") {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== drag.kind.id || it.kind !== "stroke") return it;
            const pts = it.points;
            const last = pts[pts.length - 1];
            if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return it;
            return { ...it, points: [...pts, p] };
          }),
        );
        return;
      }

      if (drag.kind.mode === "draw-rect") {
        const start = drag.kind.start;
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== drag.kind.id || it.kind !== "rect") return it;
            const x1 = start.x;
            const y1 = start.y;
            const x2 = p.x;
            const y2 = p.y;
            const x = Math.min(x1, x2);
            const y = Math.min(y1, y2);
            const w = Math.max(1, Math.abs(x2 - x1));
            const h = Math.max(1, Math.abs(y2 - y1));
            return { ...it, x, y, w, h };
          }),
        );
        return;
      }

      if (drag.kind.mode === "move") {
        const { id, start, origin } = drag.kind;
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== id) return it;
            const dx = p.x - start.x;
            const dy = p.y - start.y;
            if (it.kind === "rect") {
              const nx = clamp(
                origin.x + dx,
                0,
                Math.max(0, (naturalSize?.w ?? 0) - origin.w),
              );
              const ny = clamp(
                origin.y + dy,
                0,
                Math.max(0, (naturalSize?.h ?? 0) - origin.h),
              );
              return { ...it, x: nx, y: ny };
            }
            if (it.kind === "text") {
              const nx = clamp(origin.x + dx, 0, naturalSize?.w ?? origin.x);
              const ny = clamp(origin.y + dy, 0, naturalSize?.h ?? origin.y);
              return { ...it, x: nx, y: ny };
            }
            return it;
          }),
        );
        return;
      }

      if (drag.kind.mode === "resize-rect") {
        const { id, start, origin, handle } = drag.kind;
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        const minSize = 6;
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== id || it.kind !== "rect") return it;
            let x = origin.x;
            let y = origin.y;
            let w = origin.w;
            let h = origin.h;
            if (handle.includes("e")) w = Math.max(minSize, origin.w + dx);
            if (handle.includes("s")) h = Math.max(minSize, origin.h + dy);
            if (handle.includes("w")) {
              const nextW = Math.max(minSize, origin.w - dx);
              const nextX = origin.x + (origin.w - nextW);
              x = clamp(nextX, 0, naturalSize?.w ?? nextX);
              w = clamp(nextW, minSize, (naturalSize?.w ?? nextW) - x);
            }
            if (handle.includes("n")) {
              const nextH = Math.max(minSize, origin.h - dy);
              const nextY = origin.y + (origin.h - nextH);
              y = clamp(nextY, 0, naturalSize?.h ?? nextY);
              h = clamp(nextH, minSize, (naturalSize?.h ?? nextH) - y);
            }
            return { ...it, x, y, w, h };
          }),
        );
      }
    },
    [naturalSize, pointFromEvent],
  );

  const commitDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setItems((prev) => {
      pushHistory(prev);
      return prev;
    });
  }, [pushHistory]);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      commitDrag();
    },
    [commitDrag],
  );

  const renderHandles = useMemo(() => {
    const it = selectedItem;
    if (!it || it.kind !== "rect") return null;
    const hs = 10;
    const handles = [
      { key: "nw", x: it.x, y: it.y },
      { key: "ne", x: it.x + it.w, y: it.y },
      { key: "sw", x: it.x, y: it.y + it.h },
      { key: "se", x: it.x + it.w, y: it.y + it.h },
    ];
    return (
      <>
        <rect
          x={it.x}
          y={it.y}
          width={it.w}
          height={it.h}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={2}
          strokeDasharray="6 4"
          pointerEvents="none"
        />
        {handles.map((h) => (
          <circle
            key={h.key}
            cx={h.x}
            cy={h.y}
            r={hs}
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={2}
            data-annotate-id={it.id}
            data-annotate-handle={h.key}
            style={{ cursor: "nwse-resize" }}
          />
        ))}
      </>
    );
  }, [selectedItem]);

  const exportPngFile = useCallback(async () => {
    if (isExporting) return null;
    if (!naturalSize || !renderUrl) return null;
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = naturalSize.w;
      canvas.height = naturalSize.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("img_load_failed"));
        img.src = renderUrl;
      });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      for (const it of items) {
        if (it.kind === "stroke") {
          if (it.points.length < 2) continue;
          ctx.beginPath();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = it.color;
          ctx.lineWidth = Math.max(1, it.width);
          ctx.moveTo(it.points[0]!.x, it.points[0]!.y);
          for (let i = 1; i < it.points.length; i += 1) {
            const p = it.points[i]!;
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        } else if (it.kind === "rect") {
          ctx.strokeStyle = it.color;
          ctx.lineWidth = Math.max(1, it.width);
          ctx.strokeRect(it.x, it.y, it.w, it.h);
        } else if (it.kind === "text") {
          const text = String(it.text ?? "").trim();
          if (!text) continue;
          ctx.fillStyle = it.color;
          ctx.font = `${Math.max(8, Math.round(it.fontSize))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
          ctx.textBaseline = "top";
          const lines = text.split(/\r?\n/);
          const lineH = Math.max(10, Math.round(it.fontSize * 1.2));
          lines.forEach((line, idx) => ctx.fillText(line, it.x, it.y + idx * lineH));
        }
      }

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("blob_failed"))),
          "image/png",
          0.92,
        );
      });
      const fileName = normalizeFileName(imageFileName);
      const file = new File([blob], fileName, { type: "image/png" });
      const objectUrl = URL.createObjectURL(blob);
      return {
        file,
        objectUrl,
        width: naturalSize.w,
        height: naturalSize.h,
      };
    } finally {
      setExporting(false);
    }
  }, [imageFileName, isExporting, items, naturalSize, renderUrl]);

  useImperativeHandle(
    ref,
    () => ({
      exportPngFile,
      getNaturalSize: () => naturalSize,
    }),
    [exportPngFile, naturalSize],
  );

  const editingText = editingTextId
    ? (items.find((it) => it.id === editingTextId && it.kind === "text") as TextItem | undefined)
    : undefined;

  const editingTextareaStyle = useMemo(() => {
    if (!innerRect || !naturalSize || !editingText) return undefined;
    const scaleX = innerRect.w / naturalSize.w;
    const scaleY = innerRect.h / naturalSize.h;
    const left = innerRect.x + editingText.x * scaleX;
    const top = innerRect.y + editingText.y * scaleY;
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(160, innerRect.w * 0.45)}px`,
      fontSize: `${Math.max(12, Math.round(editingText.fontSize * scaleY))}px`,
      lineHeight: 1.25,
    } as any;
  }, [editingText, innerRect, naturalSize]);

  if (!open) return null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-border bg-background">
      <div
        ref={rootRef}
        className="pointer-events-auto absolute inset-0"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {innerRect && naturalSize && (
          <div className="absolute" style={surfaceCssStyle}>
            <img
              src={renderUrl}
              alt="base"
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
            <svg
              ref={svgRef}
              className="absolute inset-0 h-full w-full touch-none select-none"
              viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              role="presentation"
            >
              {items.map((it) => {
                if (it.kind === "stroke") {
                  return (
                    <path
                      key={it.id}
                      d={buildStrokePath(it.points)}
                      fill="none"
                      stroke={it.color}
                      strokeWidth={Math.max(1, it.width)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.98}
                      data-annotate-id={it.id}
                      style={{ pointerEvents: "none" }}
                    />
                  );
                }
                if (it.kind === "rect") {
                  return (
                    <rect
                      key={it.id}
                      x={it.x}
                      y={it.y}
                      width={it.w}
                      height={it.h}
                      fill="none"
                      stroke={it.color}
                      strokeWidth={Math.max(1, it.width)}
                      data-annotate-id={it.id}
                      style={{ cursor: toolMode === "select" ? "move" : "default" }}
                    />
                  );
                }
                return (
                  <text
                    key={it.id}
                    x={it.x}
                    y={it.y}
                    fill={it.color}
                    fontSize={Math.max(8, Math.round(it.fontSize))}
                    fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
                    dominantBaseline="hanging"
                    data-annotate-id={it.id}
                    style={{ userSelect: "none", cursor: toolMode === "select" ? "move" : "default" }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(it.id);
                      setEditingTextId(it.id);
                    }}
                  >
                    {String(it.text ?? "")}
                  </text>
                );
              })}
              {renderHandles}
            </svg>
          </div>
        )}

        <div
          data-annotate-editor-wrap="doubao"
          className="pointer-events-auto absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full pb-3"
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border border-[#E3E8F5] bg-white/95 px-4 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
              "dark:border-white/20 dark:bg-neutral-800/90 dark:bg-gradient-to-b dark:from-white/5 dark:to-white/0 dark:backdrop-blur-2xl dark:ring-1 dark:ring-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
            )}
            aria-label="标注工具栏"
          >
            <button
              type="button"
              aria-label="取消标注"
              className="flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur border-border/60 bg-background/60 text-foreground hover:bg-muted/70 dark:bg-background/35"
              onClick={onBack}
              disabled={!onBack || isExporting}
            >
              <ForwardedIconComponent name="ChevronLeft" className="h-5 w-5" />
            </button>
            <div className="mx-1 h-6 w-px bg-[#E3E8F5] dark:bg-white/15" />
            <button
              type="button"
              aria-label="选择"
              title="选择"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "select"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              onClick={() => setToolMode("select")}
            >
              <ForwardedIconComponent name="MousePointer2" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="画笔"
              title="画笔"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "brush"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              onClick={() => setToolMode("brush")}
            >
              <ForwardedIconComponent name="Brush" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="方框"
              title="方框"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "rect"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              onClick={() => setToolMode("rect")}
            >
              <ForwardedIconComponent name="Square" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="文字"
              title="文字"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                toolMode === "text"
                  ? "bg-slate-100 text-[#3C4258] dark:bg-white/10 dark:text-white"
                  : "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10",
              )}
              onClick={() => setToolMode("text")}
            >
              <ForwardedIconComponent name="Type" className="h-5 w-5" />
            </button>
            <div className="mx-1 h-6 w-px bg-[#E3E8F5] dark:bg-white/15" />
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`颜色 ${c}`}
                  className={cn(
                    "h-7 w-7 rounded-full border shadow-sm transition",
                    color === c
                      ? "border-[#2E7BFF] ring-2 ring-[#2E7BFF]/30"
                      : "border-[#E3E8F5] hover:border-[#C7D2F4]",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    setColor(c);
                    if (!selectedItem) return;
                    setItems((prev) => {
                      const next = prev.map((it) =>
                        it.id === selectedItem.id ? { ...it, color: c } : it,
                      );
                      pushHistory(next);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
            <div className="mx-1 h-6 w-px bg-[#E3E8F5] dark:bg-white/15" />
            {toolMode !== "text" ? (
              <div className="flex items-center gap-2">
                <ForwardedIconComponent name="Minus" className="h-4 w-4 text-[#3C4258] opacity-70 dark:text-white/85" />
                <input
                  type="range"
                  min={2}
                  max={72}
                  step={1}
                  value={strokeWidth}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStrokeWidth(v);
                  }}
                  className="w-28 accent-[#2E7BFF]"
                  aria-label="线宽"
                  disabled={toolMode === "select"}
                />
                <ForwardedIconComponent name="Plus" className="h-4 w-4 text-[#3C4258] opacity-70 dark:text-white/85" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ForwardedIconComponent name="Minus" className="h-4 w-4 text-[#3C4258] opacity-70 dark:text-white/85" />
                <input
                  type="range"
                  min={12}
                  max={110}
                  step={1}
                  value={fontSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setFontSize(v);
                    if (!selectedItem || selectedItem.kind !== "text") return;
                    setItems((prev) => {
                      const next = prev.map((it) =>
                        it.id === selectedItem.id ? { ...it, fontSize: v } : it,
                      );
                      pushHistory(next);
                      return next;
                    });
                  }}
                  className="w-28 accent-[#2E7BFF]"
                  aria-label="字号"
                />
                <ForwardedIconComponent name="Plus" className="h-4 w-4 text-[#3C4258] opacity-70 dark:text-white/85" />
              </div>
            )}
            <div className="mx-1 h-6 w-px bg-[#E3E8F5] dark:bg-white/15" />
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                canUndo
                  ? "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                  : "cursor-not-allowed text-[#A0A6BC] opacity-60 dark:text-slate-500",
              )}
              aria-label="撤销"
              title="撤销"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              <ForwardedIconComponent name="Undo2" className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition",
                canRedo
                  ? "text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                  : "cursor-not-allowed text-[#A0A6BC] opacity-60 dark:text-slate-500",
              )}
              aria-label="重做"
              title="重做"
              onClick={handleRedo}
              disabled={!canRedo}
            >
              <ForwardedIconComponent name="Redo2" className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="ml-1 flex h-10 items-center gap-2 rounded-full px-3 text-sm transition text-[#3C4258] hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
              aria-label="清空"
              title="清空"
              onClick={handleClear}
              disabled={isExporting}
            >
              <ForwardedIconComponent name="Trash2" className="h-4 w-4" />
              <span className="whitespace-nowrap hidden sm:inline">清空</span>
            </button>
            <button
              type="button"
              aria-label="完成标注"
              title="完成"
              className={cn(
                "hidden ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition",
                "bg-foreground text-background hover:opacity-95",
                isExporting && "opacity-70",
              )}
              onClick={() => void 0}
              disabled={true}
            >
              <ForwardedIconComponent
                name={isExporting ? "Loader2" : "Check"}
                className={cn("h-5 w-5", isExporting && "animate-spin")}
              />
            </button>
          </div>
        </div>
      </div>

      {editingText && editingTextareaStyle && (
        <textarea
          autoFocus
          className="pointer-events-auto absolute z-[2600] min-h-[60px] resize-y rounded-xl border bg-white/90 p-2 text-slate-900 shadow outline-none focus:ring-2 focus:ring-primary/30 dark:bg-neutral-900/85 dark:text-slate-50"
          style={editingTextareaStyle}
          placeholder="输入文字..."
          value={editingText.text}
          onChange={(e) => {
            const v = e.target.value;
            setItems((prev) =>
              prev.map((it) =>
                it.id === editingText.id && it.kind === "text" ? { ...it, text: v } : it,
              ),
            );
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commitTextEdit(editingText.id, String(editingText.text ?? ""));
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditingTextId(null);
            }
          }}
          onBlur={() => commitTextEdit(editingText.id, String(editingText.text ?? ""))}
        />
      )}
    </div>
  );
});

ScribbleEditor.displayName = "ScribbleEditor";

export default ScribbleEditor;
