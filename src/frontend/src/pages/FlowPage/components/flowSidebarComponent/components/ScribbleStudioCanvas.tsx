import {
  forwardRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/utils";
import { createFileUpload } from "@/helpers/create-file-upload";

export type StudioTool =
  | "select"
  | "brush"
  | "eraser"
  | "rect"
  | "arrow"
  | "pen"
  | "text";

type Point = { x: number; y: number };
type CanvasRect = { x0: number; y0: number; w: number; h: number };
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
type ArrowItem = {
  id: string;
  kind: "arrow";
  color: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};
type PenItem = {
  id: string;
  kind: "pen";
  color: string;
  width: number;
  points: Point[];
  closed: boolean;
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
type Item = StrokeItem | RectItem | ArrowItem | PenItem | TextItem;
type ItemBounds = { minX: number; minY: number; maxX: number; maxY: number };

export type StudioLayer = {
  id: string;
  name: string;
  visible: boolean;
  bitmapSrc: string | null;
  bitmapNatural: { w: number; h: number } | null;
  center: { x: number; y: number };
  scale: number;
  flipX: boolean;
  flipY: boolean;
  items: Item[];
  isBase: boolean;
  meta?: any;
};

export type ScribbleStudioCanvasHandle = {
  exportCompositePngFile: (opts: {
    backgroundMode: "white" | "transparent";
  }) => Promise<{
    file: File;
    width: number;
    height: number;
    objectUrl: string;
  } | null>;
  getCanvasSize: () => { w: number; h: number } | null;
  resetView: () => void;
  addImageLayer: () => void;
  enterCropMode: () => void;
  confirmCrop: () => Promise<boolean>;
  cancelCrop: () => void;
  flipSelectedLayer: (axis: "x" | "y") => void;
  resetSelectedLayerFlip: () => void;
  resetSelectedLayerTransform: () => void;
  bringSelectedLayerToFront: () => void;
  sendSelectedLayerToBack: () => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
};

type Props = {
  active: boolean;
  sourceMode: "upload" | "blank";
  aspectKey: string;
  resolutionKey: string;
  backgroundMode: "white" | "transparent";
  tool: StudioTool;
  toolColor: string;
  toolWidth: number;
  textColor: string;
  textFontSize: number;
  layers: StudioLayer[];
  setLayers: (updater: any) => void;
  selectedLayerId: string;
  setSelectedLayerId: (updater: any) => void;
  onRequestToolChange?: (tool: StudioTool) => void;
  onRequestBack: () => void;
};

const TEXT_FONT_FAMILY = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial";
let textMeasureContext: CanvasRenderingContext2D | null = null;

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (textMeasureContext) return textMeasureContext;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  textMeasureContext = canvas.getContext("2d");
  return textMeasureContext;
}

function getTextLayout(item: TextItem): {
  lines: string[];
  lineHeight: number;
  contentWidth: number;
  contentHeight: number;
} {
  const text = String(item.text ?? "");
  const lines = text.split(/\r?\n/);
  if (!lines.length) lines.push("");

  const fontSize = Math.max(12, Number(item.fontSize || 12));
  const lineHeight = Math.max(18, fontSize * 1.24);
  const measureCtx = getTextMeasureContext();
  let contentWidth = Math.max(fontSize * 0.72, 1);

  if (measureCtx) {
    measureCtx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
    for (const line of lines) {
      const metrics = measureCtx.measureText(line || " ");
      const widthByBounds =
        Math.abs(metrics.actualBoundingBoxLeft || 0) +
        Math.abs(metrics.actualBoundingBoxRight || 0);
      contentWidth = Math.max(contentWidth, metrics.width, widthByBounds);
    }
  } else {
    for (const line of lines) {
      const charCount = Math.max(1, line.length);
      contentWidth = Math.max(contentWidth, charCount * fontSize * 0.62);
    }
  }

  const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
  return { lines, lineHeight, contentWidth, contentHeight };
}

function getItemBounds(item: Item): ItemBounds | null {
  if (item.kind === "stroke" || item.kind === "pen") {
    const points = item.points ?? [];
    if (!points.length) return null;
    let minX = points[0]!.x;
    let minY = points[0]!.y;
    let maxX = minX;
    let maxY = minY;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = Math.max(6, item.width / 2 + 2);
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }
  if (item.kind === "rect") {
    const minX = Math.min(item.x, item.x + item.w);
    const maxX = Math.max(item.x, item.x + item.w);
    const minY = Math.min(item.y, item.y + item.h);
    const maxY = Math.max(item.y, item.y + item.h);
    const pad = Math.max(6, item.width / 2 + 2);
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }
  if (item.kind === "arrow") {
    const minX = Math.min(item.x1, item.x2);
    const maxX = Math.max(item.x1, item.x2);
    const minY = Math.min(item.y1, item.y2);
    const maxY = Math.max(item.y1, item.y2);
    const pad = Math.max(8, item.width + 8);
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }
  const textLayout = getTextLayout(item);
  const padX = 8;
  const padY = 6;
  return {
    minX: item.x - 4,
    minY: item.y - 4,
    maxX: item.x + textLayout.contentWidth + padX + 4,
    maxY: item.y + textLayout.contentHeight + padY + 4,
  };
}

function translateItem(item: Item, dx: number, dy: number): Item {
  if (item.kind === "stroke" || item.kind === "pen") {
    return {
      ...item,
      points: (item.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  if (item.kind === "rect") {
    return { ...item, x: item.x + dx, y: item.y + dy };
  }
  if (item.kind === "arrow") {
    return {
      ...item,
      x1: item.x1 + dx,
      y1: item.y1 + dy,
      x2: item.x2 + dx,
      y2: item.y2 + dy,
    };
  }
  return { ...item, x: item.x + dx, y: item.y + dy };
}

function transformPointByBounds(
  x: number,
  y: number,
  from: ItemBounds,
  to: ItemBounds,
): Point {
  const fw = Math.max(1e-6, from.maxX - from.minX);
  const fh = Math.max(1e-6, from.maxY - from.minY);
  const tw = Math.max(1e-6, to.maxX - to.minX);
  const th = Math.max(1e-6, to.maxY - to.minY);
  return {
    x: to.minX + ((x - from.minX) / fw) * tw,
    y: to.minY + ((y - from.minY) / fh) * th,
  };
}

function scaleItemByBounds(
  item: Item,
  from: ItemBounds,
  to: ItemBounds,
): Item {
  if (item.kind === "stroke" || item.kind === "pen") {
    return {
      ...item,
      points: (item.points ?? []).map((p) =>
        transformPointByBounds(p.x, p.y, from, to),
      ),
    };
  }
  if (item.kind === "rect") {
    const p1 = transformPointByBounds(item.x, item.y, from, to);
    const p2 = transformPointByBounds(item.x + item.w, item.y + item.h, from, to);
    return { ...item, x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
  }
  if (item.kind === "arrow") {
    const p1 = transformPointByBounds(item.x1, item.y1, from, to);
    const p2 = transformPointByBounds(item.x2, item.y2, from, to);
    return { ...item, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  const p = transformPointByBounds(item.x, item.y, from, to);
  const scaleX = Math.max(0.1, (to.maxX - to.minX) / Math.max(1e-6, from.maxX - from.minX));
  const scaleY = Math.max(0.1, (to.maxY - to.minY) / Math.max(1e-6, from.maxY - from.minY));
  const scale = Math.max(0.1, Math.max(scaleX, scaleY));
  return {
    ...item,
    x: p.x,
    y: p.y,
    fontSize: Math.max(12, Math.round(item.fontSize * scale)),
  };
}

const ScribbleStudioCanvas = forwardRef<ScribbleStudioCanvasHandle, Props>(
  function ScribbleStudioCanvas(
    {
      active,
      sourceMode,
      aspectKey,
      resolutionKey,
      backgroundMode,
      tool,
      toolColor,
      toolWidth,
      textColor,
      textFontSize,
      layers,
      setLayers,
      selectedLayerId,
      setSelectedLayerId,
      onRequestToolChange,
    }: Props,
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const layersRef = useRef<StudioLayer[]>(layers);
    const selectedLayerIdRef = useRef<string>(selectedLayerId);
    const toolRef = useRef<StudioTool>(tool);

    useEffect(() => {
      layersRef.current = layers;
    }, [layers]);
    useEffect(() => {
      selectedLayerIdRef.current = selectedLayerId;
    }, [selectedLayerId]);
    useLayoutEffect(() => {
      toolRef.current = tool;
    }, [tool]);

    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

    const dragRef = useRef<null | {
      pointerId: number;
      kind:
        | {
            mode: "pan-view";
            startClient: Point;
            originViewport: { scale: number; ox: number; oy: number };
          }
        | {
            mode: "move-layer";
            startWorld: Point;
            originCenter: Point;
            layerId: string;
          }
        | {
            mode: "move-item";
            layerId: string;
            itemId: string;
            startLocal: Point;
            originItem: Item;
          }
        | {
            mode: "scale-item";
            layerId: string;
            itemId: string;
            startBounds: ItemBounds;
            anchor: Point;
            originItem: Item;
          }
        | { mode: "draw-stroke"; layerId: string; itemId: string }
        | {
            mode: "draw-rect";
            layerId: string;
            itemId: string;
            startLocal: Point;
          }
        | {
            mode: "draw-arrow";
            layerId: string;
            itemId: string;
            startLocal: Point;
          }
        | { mode: "erase" };
    }>(null);

    const penDraftRef = useRef<{ layerId: string; itemId: string } | null>(
      null,
    );
    const cropActiveRef = useRef(false);
    const [cropMode, setCropMode] = useState(false);

    const historyRef = useRef<{ stack: StudioLayer[][]; index: number }>({
      stack: [],
      index: -1,
    });
    const pushHistory = useCallback((nextLayers: StudioLayer[]) => {
      const cloned = JSON.parse(JSON.stringify(nextLayers)) as StudioLayer[];
      const { stack, index } = historyRef.current;
      const sliced = stack.slice(0, index + 1);
      sliced.push(cloned);
      historyRef.current = { stack: sliced, index: sliced.length - 1 };
    }, []);

    const checkpoint = useCallback(() => {
      pushHistory(layersRef.current);
    }, [pushHistory]);

    const undo = useCallback(() => {
      const { stack, index } = historyRef.current;
      if (index <= 0) return;
      const nextIndex = index - 1;
      const state = stack[nextIndex];
      if (!state) return;
      historyRef.current.index = nextIndex;
      setLayers(JSON.parse(JSON.stringify(state)) as StudioLayer[]);
      setSelectedLayerId((prev) => {
        const exists = (state as any[]).some((l) => l.id === prev);
        return exists ? prev : (state[state.length - 1]?.id ?? "");
      });
    }, [setLayers, setSelectedLayerId]);

    const redo = useCallback(() => {
      const { stack, index } = historyRef.current;
      if (index < 0 || index >= stack.length - 1) return;
      const nextIndex = index + 1;
      const state = stack[nextIndex];
      if (!state) return;
      historyRef.current.index = nextIndex;
      setLayers(JSON.parse(JSON.stringify(state)) as StudioLayer[]);
      setSelectedLayerId((prev) => {
        const exists = (state as any[]).some((l) => l.id === prev);
        return exists ? prev : (state[state.length - 1]?.id ?? "");
      });
    }, [setLayers, setSelectedLayerId]);

    const [viewport, setViewport] = useState<{
      scale: number;
      ox: number;
      oy: number;
    }>({
      scale: 1,
      ox: 0,
      oy: 0,
    });

    // Must be declared before callbacks/effects that reference it in dependency arrays
    // (avoids TDZ errors in production builds).
    const [cropPreview, setCropPreview] = useState<null | {
      layerId: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>(null);

    const cropDragRef = useRef<null | {
      pointerId: number;
      layerId: string;
      handle: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";
      startClient: Point;
      startRect: { x: number; y: number; w: number; h: number };
    }>(null);

    const [editingText, setEditingText] = useState<null | {
      layerId: string;
      itemId: string;
    }>(null);
    const [selectedObject, setSelectedObject] = useState<null | {
      layerId: string;
      itemId: string;
    }>(null);
    const selectedObjectRef = useRef<null | { layerId: string; itemId: string }>(
      null,
    );
    const textInputRef = useRef<HTMLTextAreaElement | null>(null);
    const shouldSelectTextRef = useRef(false);
    const [hoverCanvasEdge, setHoverCanvasEdge] = useState<
      null | "n" | "s" | "w" | "e"
    >(null);

    const canvasResizeDragRef = useRef<null | {
      pointerId: number;
      edge: "n" | "s" | "w" | "e";
      startClient: Point;
      startRect: CanvasRect;
    }>(null);

    useEffect(() => {
      selectedObjectRef.current = selectedObject;
    }, [selectedObject]);

    const baseLayer = useMemo(
      () => layers.find((l) => l.isBase) ?? null,
      [layers],
    );
    const baseNatural = baseLayer?.bitmapNatural ?? null;
    const baseBitmapKey = String(baseLayer?.bitmapSrc ?? "");

    const computePresetCanvasRect = useCallback((): CanvasRect => {
      const ratioKey = String(aspectKey || "")
        .trim()
        .toLowerCase();
      const parseRatio = (raw: string): { w: number; h: number } | null => {
        const m = raw.match(/^(\d+)\s*:\s*(\d+)$/);
        if (!m) return null;
        const w = Number(m[1]);
        const h = Number(m[2]);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
          return null;
        return { w, h };
      };
      const pickedRatio =
        ratioKey === "adaptive" ? null : parseRatio(ratioKey);

      // Upload mode:
      // - adaptive: canvas equals original image size
      // - explicit ratio: expand one dimension to match picked ratio
      if (sourceMode === "upload" && baseNatural?.w && baseNatural?.h) {
        const imgW = Math.max(1, Math.round(baseNatural.w));
        const imgH = Math.max(1, Math.round(baseNatural.h));
        if (!pickedRatio) return { x0: -imgW / 2, y0: -imgH / 2, w: imgW, h: imgH };

        const targetR = pickedRatio.w / pickedRatio.h;
        const imageR = imgW / imgH;
        let w = imgW;
        let h = imgH;
        if (imageR > targetR) {
          h = Math.max(imgH, Math.round(imgW / targetR));
        } else if (imageR < targetR) {
          w = Math.max(imgW, Math.round(imgH * targetR));
        }
        return { x0: -w / 2, y0: -h / 2, w, h };
      }

      const base =
        resolutionKey === "4K" ? 4096 : resolutionKey === "1K" ? 1280 : 2048;

      const ratio =
        pickedRatio ?? { w: 1, h: 1 };
      const r = ratio.w / ratio.h;
      const w = r >= 1 ? base : Math.max(64, Math.round(base * r));
      const h = r >= 1 ? Math.max(64, Math.round(base / r)) : base;
      return { x0: -w / 2, y0: -h / 2, w, h };
    }, [aspectKey, baseNatural?.h, baseNatural?.w, resolutionKey, sourceMode]);

    const [canvasRect, setCanvasRect] = useState<CanvasRect>({
      x0: -1024,
      y0: -1024,
      w: 2048,
      h: 2048,
    });
    const canvasRectRef = useRef<CanvasRect>(canvasRect);
    useEffect(() => {
      canvasRectRef.current = canvasRect;
    }, [canvasRect]);

    const canvasSize = useMemo(() => {
      const w = Math.max(1, Math.round(canvasRect.w));
      const h = Math.max(1, Math.round(canvasRect.h));
      return { w, h };
    }, [canvasRect.h, canvasRect.w]);

    const canvasUserResizedRef = useRef(false);
    const lastPresetKeyRef = useRef<string>("");
    const initializedViewRef = useRef(false);
    const lastViewIdentityKeyRef = useRef<string>("");

    const resetView = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const bw = Math.max(1, el.clientWidth);
      const bh = Math.max(1, el.clientHeight);
      const rect = canvasRectRef.current;
      const w = Math.max(1, rect.w);
      const h = Math.max(1, rect.h);
      // Leave more breathing room for uploaded images so toolbars/rails
      // don't feel crowded against the artwork on first load.
      const fitRatio = sourceMode === "upload" ? 0.78 : 0.9;
      const scale = Math.min(bw / w, bh / h) * fitRatio;
      const cx = rect.x0 + rect.w / 2;
      const cy = rect.y0 + rect.h / 2;
      setViewport({ scale, ox: bw / 2 - cx * scale, oy: bh / 2 - cy * scale });
    }, [sourceMode]);

    const presetKey = useMemo(() => {
      return sourceMode === "upload"
        ? `upload:${baseBitmapKey}:${baseNatural?.w ?? 0}x${baseNatural?.h ?? 0}:${aspectKey}`
        : `blank:${aspectKey}:${resolutionKey}`;
    }, [
      aspectKey,
      baseBitmapKey,
      baseNatural?.h,
      baseNatural?.w,
      resolutionKey,
      sourceMode,
    ]);

    const viewIdentityKey = useMemo(() => {
      return sourceMode === "upload"
        ? `upload:${baseBitmapKey}:${baseNatural?.w ?? 0}x${baseNatural?.h ?? 0}`
        : "blank";
    }, [baseBitmapKey, baseNatural?.h, baseNatural?.w, sourceMode]);

    useEffect(() => {
      if (!active) return;

      // Initialize/sync the canvas rect when entering the studio or when a new base image is loaded.
      // Do not override if the user already resized the canvas via handles.
      if (lastPresetKeyRef.current !== presetKey) {
        lastPresetKeyRef.current = presetKey;
        canvasUserResizedRef.current = false;
        setCanvasRect(computePresetCanvasRect());
      }

      // Keep manual zoom/pan when only changing ratio/resolution.
      // Auto-fit only when first entering, or when base source changes.
      const shouldResetView =
        !initializedViewRef.current ||
        lastViewIdentityKeyRef.current !== viewIdentityKey;
      if (!shouldResetView) return;

      initializedViewRef.current = true;
      lastViewIdentityKeyRef.current = viewIdentityKey;
      resetView();
      const id1 = window.requestAnimationFrame(() => resetView());
      const id2 = window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => resetView()),
      );
      return () => {
        window.cancelAnimationFrame(id1);
        window.cancelAnimationFrame(id2);
      };
    }, [active, computePresetCanvasRect, presetKey, resetView, viewIdentityKey]);

    useEffect(() => {
      if (!active) {
        initializedViewRef.current = false;
        lastViewIdentityKeyRef.current = "";
      }
    }, [active]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => resetView());
      ro.observe(el);
      return () => ro.disconnect();
    }, [resetView]);

    const getSelectedLayer = useCallback(() => {
      const id = selectedLayerIdRef.current;
      return layersRef.current.find((l) => l.id === id) ?? null;
    }, []);

    const worldFromClient = useCallback(
      (clientX: number, clientY: number): Point | null => {
        const el = containerRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const wx = (x - viewport.ox) / viewport.scale;
        const wy = (y - viewport.oy) / viewport.scale;
        return { x: wx, y: wy };
      },
      [viewport.ox, viewport.oy, viewport.scale],
    );

    const localFromWorld = useCallback(
      (layer: StudioLayer, world: Point): Point => {
        const signX = layer.flipX ? -1 : 1;
        const signY = layer.flipY ? -1 : 1;
        const inv = 1 / Math.max(1e-6, layer.scale);
        return {
          x: ((world.x - layer.center.x) * inv) / signX,
          y: ((world.y - layer.center.y) * inv) / signY,
        };
      },
      [],
    );

    const worldFromLocal = useCallback(
      (layer: StudioLayer, local: Point): Point => {
        const signX = layer.flipX ? -1 : 1;
        const signY = layer.flipY ? -1 : 1;
        return {
          x: layer.center.x + local.x * layer.scale * signX,
          y: layer.center.y + local.y * layer.scale * signY,
        };
      },
      [],
    );

    const clientFromWorld = useCallback(
      (world: Point): Point => {
        return {
          x: viewport.ox + world.x * viewport.scale,
          y: viewport.oy + world.y * viewport.scale,
        };
      },
      [viewport.ox, viewport.oy, viewport.scale],
    );

    const worldToLocalForSelected = useCallback(
      (world: Point): { layer: StudioLayer; local: Point } | null => {
        const layer = getSelectedLayer();
        if (!layer) return null;
        return { layer, local: localFromWorld(layer, world) };
      },
      [getSelectedLayer, localFromWorld],
    );

    const distance = useCallback((a: Point, b: Point) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }, []);

    const hitTestLayerAtWorld = useCallback(
      (world: Point): StudioLayer | null => {
        // Top-most first (later layers render above).
        for (let i = layersRef.current.length - 1; i >= 0; i -= 1) {
          const layer = layersRef.current[i];
          if (!layer?.visible) continue;
          const local = localFromWorld(layer, world);

          // Bitmap hit test.
          if (layer.bitmapSrc) {
            const iw = layer.bitmapNatural?.w ?? 0;
            const ih = layer.bitmapNatural?.h ?? 0;
            if (iw > 0 && ih > 0) {
              if (Math.abs(local.x) <= iw / 2 && Math.abs(local.y) <= ih / 2)
                return layer;
            }
          }

          // Vector hit test (approximate; good enough for selecting/moving like PPT).
          for (const it of layer.items ?? []) {
            if (it.kind === "text") {
              const r = Math.max(28, it.fontSize * 0.8);
              if (distance({ x: it.x, y: it.y }, local) <= r) return layer;
              continue;
            }
            if (it.kind === "rect") {
              const minX = Math.min(it.x, it.x + it.w) - 10;
              const maxX = Math.max(it.x, it.x + it.w) + 10;
              const minY = Math.min(it.y, it.y + it.h) - 10;
              const maxY = Math.max(it.y, it.y + it.h) + 10;
              if (
                local.x >= minX &&
                local.x <= maxX &&
                local.y >= minY &&
                local.y <= maxY
              )
                return layer;
              continue;
            }
            if (it.kind === "arrow") {
              const ax = it.x1;
              const ay = it.y1;
              const bx = it.x2;
              const by = it.y2;
              const px = local.x;
              const py = local.y;
              const abx = bx - ax;
              const aby = by - ay;
              const apx = px - ax;
              const apy = py - ay;
              const ab2 = abx * abx + aby * aby || 1;
              const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
              const cx = ax + abx * t;
              const cy = ay + aby * t;
              const d = Math.hypot(px - cx, py - cy);
              if (d <= Math.max(12, it.width) + 6) return layer;
              continue;
            }
            if (it.kind === "stroke") {
              const hit =
                it.points?.some(
                  (p) => distance(p, local) <= Math.max(12, it.width) + 6,
                ) ?? false;
              if (hit) return layer;
              continue;
            }
            if (it.kind === "pen") {
              const hit =
                it.points?.some(
                  (p) => distance(p, local) <= Math.max(12, it.width) + 6,
                ) ?? false;
              if (hit) return layer;
              continue;
            }
          }
        }
        return null;
      },
      [distance, localFromWorld],
    );

    const hitTestItemAtWorld = useCallback(
      (world: Point): { layer: StudioLayer; item: Item } | null => {
        for (let i = layersRef.current.length - 1; i >= 0; i -= 1) {
          const layer = layersRef.current[i];
          if (!layer?.visible) continue;
          const local = localFromWorld(layer, world);
          const items = layer.items ?? [];
          for (let j = items.length - 1; j >= 0; j -= 1) {
            const item = items[j]!;
            const bounds = getItemBounds(item);
            if (!bounds) continue;
            if (
              local.x >= bounds.minX &&
              local.x <= bounds.maxX &&
              local.y >= bounds.minY &&
              local.y <= bounds.maxY
            ) {
              return { layer, item };
            }
          }
        }
        return null;
      },
      [localFromWorld],
    );

    // Must be declared before any hook dependency arrays that reference it;
    // otherwise production builds can throw "Cannot access 'x' before initialization".
    const nextId = useCallback((prefix: string) => {
      return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
    }, []);

    const createVectorLayer = useCallback(
      (name: string): string => {
        const id = nextId("layer");
        const layer: StudioLayer = {
          id,
          name,
          visible: true,
          bitmapSrc: null,
          bitmapNatural: null,
          center: { x: 0, y: 0 },
          scale: 1,
          flipX: false,
          flipY: false,
          items: [],
          isBase: false,
        };
        setLayers((prev: StudioLayer[]) => [...prev, layer]);
        setSelectedLayerId(id);
        return id;
      },
      [nextId, setLayers, setSelectedLayerId],
    );

    const eraseAt = useCallback(
      (layerId: string, local: Point, radius: number) => {
        setLayers((prev: StudioLayer[]) => {
          const next = prev.map((l) => {
            if (l.id !== layerId) return l;
            const items = l.items ?? [];
            const out: Item[] = [];
            for (const it of items) {
              if (it.kind === "stroke") {
                const segments: Point[][] = [];
                let seg: Point[] = [];
                for (const p of it.points) {
                  if (distance(p, local) <= radius) {
                    if (seg.length >= 2) segments.push(seg);
                    seg = [];
                  } else {
                    seg.push(p);
                  }
                }
                if (seg.length >= 2) segments.push(seg);
                for (const s of segments) {
                  out.push({
                    ...it,
                    id: nextId("stroke"),
                    points: s,
                  });
                }
                continue;
              }
              if (it.kind === "arrow") {
                // If the eraser touches the segment, delete the whole arrow.
                const ax = it.x1;
                const ay = it.y1;
                const bx = it.x2;
                const by = it.y2;
                const px = local.x;
                const py = local.y;
                const abx = bx - ax;
                const aby = by - ay;
                const apx = px - ax;
                const apy = py - ay;
                const ab2 = abx * abx + aby * aby || 1;
                const t = Math.max(
                  0,
                  Math.min(1, (apx * abx + apy * aby) / ab2),
                );
                const cx = ax + abx * t;
                const cy = ay + aby * t;
                const d = Math.hypot(px - cx, py - cy);
                if (d <= radius) continue;
                out.push(it);
                continue;
              }
              if (it.kind === "rect") {
                const minX = Math.min(it.x, it.x + it.w) - radius;
                const maxX = Math.max(it.x, it.x + it.w) + radius;
                const minY = Math.min(it.y, it.y + it.h) - radius;
                const maxY = Math.max(it.y, it.y + it.h) + radius;
                if (
                  local.x >= minX &&
                  local.x <= maxX &&
                  local.y >= minY &&
                  local.y <= maxY
                )
                  continue;
                out.push(it);
                continue;
              }
              if (it.kind === "pen") {
                const hit =
                  it.points?.some((p) => distance(p, local) <= radius) ?? false;
                if (hit) continue;
                out.push(it);
                continue;
              }
              if (it.kind === "text") {
                if (distance({ x: it.x, y: it.y }, local) <= radius * 1.5)
                  continue;
                out.push(it);
                continue;
              }
              out.push(it);
            }
            return { ...l, items: out };
          });
          return next;
        });
      },
      [distance, nextId, setLayers],
    );

    const eraseAtWorld = useCallback(
      (world: Point, radius: number) => {
        setLayers((prev: StudioLayer[]) => {
          const next = prev.map((layer) => {
            if (!layer?.visible) return layer;
            const local = localFromWorld(layer, world);
            // Inline the erase logic to avoid multiple setState calls per pointer move.
            const items = layer.items ?? [];
            const out: Item[] = [];
            for (const it of items) {
              if (it.kind === "stroke") {
                const segments: Point[][] = [];
                let seg: Point[] = [];
                for (const p of it.points) {
                  if (distance(p, local) <= radius) {
                    if (seg.length >= 2) segments.push(seg);
                    seg = [];
                  } else {
                    seg.push(p);
                  }
                }
                if (seg.length >= 2) segments.push(seg);
                for (const s of segments) {
                  out.push({
                    ...it,
                    id: nextId("stroke"),
                    points: s,
                  });
                }
                continue;
              }
              if (it.kind === "arrow") {
                const ax = it.x1;
                const ay = it.y1;
                const bx = it.x2;
                const by = it.y2;
                const px = local.x;
                const py = local.y;
                const abx = bx - ax;
                const aby = by - ay;
                const apx = px - ax;
                const apy = py - ay;
                const ab2 = abx * abx + aby * aby || 1;
                const t = Math.max(
                  0,
                  Math.min(1, (apx * abx + apy * aby) / ab2),
                );
                const cx = ax + abx * t;
                const cy = ay + aby * t;
                const d = Math.hypot(px - cx, py - cy);
                if (d <= radius) continue;
                out.push(it);
                continue;
              }
              if (it.kind === "rect") {
                const minX = Math.min(it.x, it.x + it.w) - radius;
                const maxX = Math.max(it.x, it.x + it.w) + radius;
                const minY = Math.min(it.y, it.y + it.h) - radius;
                const maxY = Math.max(it.y, it.y + it.h) + radius;
                if (
                  local.x >= minX &&
                  local.x <= maxX &&
                  local.y >= minY &&
                  local.y <= maxY
                )
                  continue;
                out.push(it);
                continue;
              }
              if (it.kind === "pen") {
                const hit =
                  it.points?.some((p) => distance(p, local) <= radius) ?? false;
                if (hit) continue;
                out.push(it);
                continue;
              }
              if (it.kind === "text") {
                if (distance({ x: it.x, y: it.y }, local) <= radius * 1.5)
                  continue;
                out.push(it);
                continue;
              }
              out.push(it);
            }
            return { ...layer, items: out };
          });
          return next;
        });
      },
      [distance, localFromWorld, nextId, setLayers],
    );

    const ensureImage = useCallback(
      async (src: string): Promise<HTMLImageElement | null> => {
        const cache = imageCacheRef.current;
        if (cache.has(src)) return cache.get(src)!;
        const img = new Image();
        img.crossOrigin = "anonymous";
        const ok = await new Promise<boolean>((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
        });
        if (!ok) return null;
        cache.set(src, img);
        return img;
      },
      [],
    );

    const drawItems = useCallback(
      (ctx: CanvasRenderingContext2D, items: Item[]) => {
        for (const item of items) {
          if (!item) continue;
          if (item.kind === "stroke") {
            if (!item.points?.length) continue;
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(item.points[0]!.x, item.points[0]!.y);
            for (let i = 1; i < item.points.length; i += 1) {
              const p = item.points[i]!;
              ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
          } else if (item.kind === "rect") {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.strokeRect(item.x, item.y, item.w, item.h);
          } else if (item.kind === "arrow") {
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(item.x1, item.y1);
            ctx.lineTo(item.x2, item.y2);
            ctx.stroke();
            // Arrow head
            const dx = item.x2 - item.x1;
            const dy = item.y2 - item.y1;
            const ang = Math.atan2(dy, dx);
            const head = Math.max(10, item.width * 2.2);
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(item.x2, item.y2);
            ctx.lineTo(
              item.x2 - head * Math.cos(ang - Math.PI / 7),
              item.y2 - head * Math.sin(ang - Math.PI / 7),
            );
            ctx.lineTo(
              item.x2 - head * Math.cos(ang + Math.PI / 7),
              item.y2 - head * Math.sin(ang + Math.PI / 7),
            );
            ctx.closePath();
            ctx.fill();
          } else if (item.kind === "pen") {
            if (!item.points?.length) continue;
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(item.points[0]!.x, item.points[0]!.y);
            for (let i = 1; i < item.points.length; i += 1) {
              const p = item.points[i]!;
              ctx.lineTo(p.x, p.y);
            }
            if (item.closed) ctx.closePath();
            ctx.stroke();
          } else if (item.kind === "text") {
            const layout = getTextLayout(item);
            ctx.fillStyle = item.color;
            ctx.font = `${Math.max(12, item.fontSize)}px ${TEXT_FONT_FAMILY}`;
            ctx.textBaseline = "top";
            layout.lines.forEach((line, idx) => {
              ctx.fillText(line, item.x, item.y + idx * layout.lineHeight);
            });
          }
        }
      },
      [],
    );

    const drawScene = useCallback(
      async (
        ctx: CanvasRenderingContext2D,
        opts: {
          forExport: boolean;
          width: number;
          height: number;
          backgroundMode: "white" | "transparent";
          viewport?: { scale: number; ox: number; oy: number };
        },
      ) => {
        const { forExport, width, height } = opts;
        const vp = opts.viewport ?? viewport;
        const rect = canvasRectRef.current;
        const x0 = rect.x0;
        const y0 = rect.y0;
        const cw = rect.w;
        const ch = rect.h;
        const cx = x0 + cw / 2;
        const cy = y0 + ch / 2;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        if (!forExport) {
          const isDark =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("dark");
          ctx.fillStyle = isDark ? "#0b0d10" : "#d8dade";
          ctx.fillRect(0, 0, width, height);
        }

        // World transform
        // For exports, center the current canvas rect (which may have asymmetric padding) onto the output bitmap.
        const ox = forExport ? width / 2 - cx : vp.ox;
        const oy = forExport ? height / 2 - cy : vp.oy;
        const sc = forExport ? 1 : vp.scale;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(sc, sc);

        // Canvas background (in world coords)
        if (opts.backgroundMode === "white") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x0, y0, cw, ch);
        } else {
          if (!forExport) {
            // simple checkerboard (display only; exports must preserve transparency)
            const cell = 64;
            for (let y = 0; y < ch; y += cell) {
              for (let x = 0; x < cw; x += cell) {
                const on = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
                ctx.fillStyle = on ? "#e5e7eb" : "#9ca3af";
                ctx.fillRect(x0 + x, y0 + y, cell, cell);
              }
            }
          }
        }

        // Border
        if (!forExport) {
          ctx.strokeStyle = "rgba(255,255,255,0.22)";
          ctx.lineWidth = 2 / Math.max(1e-6, sc);
          ctx.strokeRect(x0, y0, cw, ch);
        }

        // Clip all drawing to the canvas bounds (matches editor behavior).
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, cw, ch);
        ctx.clip();

        for (const layer of layersRef.current) {
          if (!layer?.visible) continue;
          ctx.save();
          ctx.translate(layer.center.x, layer.center.y);
          const sx = layer.scale * (layer.flipX ? -1 : 1);
          const sy = layer.scale * (layer.flipY ? -1 : 1);
          ctx.scale(sx, sy);

          if (layer.bitmapSrc) {
            const img = await ensureImage(layer.bitmapSrc);
            if (img) {
              const iw =
                layer.bitmapNatural?.w ?? img.naturalWidth ?? img.width;
              const ih =
                layer.bitmapNatural?.h ?? img.naturalHeight ?? img.height;
              ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
            }
          }

          drawItems(ctx, layer.items ?? []);

          // Crop mode UI is drawn via HTML overlay (so we can support interactive handles).
          ctx.restore();
        }

        ctx.restore(); // clip
        ctx.restore();
      },
      [drawItems, ensureImage, viewport],
    );

    const exportCompositePngFile = useCallback(
      async (opts: { backgroundMode: "white" | "transparent" }) => {
        const w = canvasSize.w;
        const h = canvasSize.h;
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const ctx = out.getContext("2d");
        if (!ctx) return null;

        await drawScene(ctx, {
          forExport: true,
          width: w,
          height: h,
          backgroundMode: opts.backgroundMode,
        });

        const blob: Blob | null = await new Promise((resolve) =>
          out.toBlob(resolve, "image/png"),
        );
        if (!blob) return null;
        const file = new File([blob], "scribble.png", { type: "image/png" });
        const objectUrl = URL.createObjectURL(blob);
        return { file, width: w, height: h, objectUrl };
      },
      [canvasSize.h, canvasSize.w, drawScene],
    );

    // Draw loop (triggered by state/props changes)
    useEffect(() => {
      const el = canvasRef.current;
      const wrap = containerRef.current;
      if (!el || !wrap) return;
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const bw = Math.max(1, wrap.clientWidth);
      const bh = Math.max(1, wrap.clientHeight);
      if (
        el.width !== Math.round(bw * dpr) ||
        el.height !== Math.round(bh * dpr)
      ) {
        el.width = Math.round(bw * dpr);
        el.height = Math.round(bh * dpr);
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const vpPx = {
        ox: viewport.ox * dpr,
        oy: viewport.oy * dpr,
        scale: viewport.scale * dpr,
      };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      void drawScene(ctx, {
        forExport: false,
        width: el.width,
        height: el.height,
        backgroundMode,
        viewport: vpPx,
      });
    }, [
      backgroundMode,
      canvasSize.h,
      canvasSize.w,
      drawScene,
      layers,
      viewport,
    ]);

    const checkpointSoon = useCallback(() => {
      // Wait for React state to flush before snapshotting.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => checkpoint());
      });
    }, [checkpoint]);

    const removeSelectedObject = useCallback(() => {
      const target = selectedObjectRef.current;
      if (!target) return;

      const prevLayers = layersRef.current;
      let didDelete = false;
      let removedLayerId = "";
      const nextLayers: StudioLayer[] = [];

      for (const layer of prevLayers) {
        if (layer.id !== target.layerId) {
          nextLayers.push(layer);
          continue;
        }
        const nextItems = (layer.items ?? []).filter((it) => {
          const hit = it.id === target.itemId;
          if (hit) didDelete = true;
          return !hit;
        });
        const shouldDropLayer =
          didDelete &&
          !layer.isBase &&
          !String(layer.bitmapSrc || "").trim() &&
          nextItems.length === 0;
        if (shouldDropLayer) {
          removedLayerId = layer.id;
          continue;
        }
        nextLayers.push({ ...layer, items: nextItems });
      }

      if (!didDelete) return;
      layersRef.current = nextLayers;
      setLayers(nextLayers);
      setSelectedObject(null);
      setEditingText((current) => {
        if (!current) return current;
        if (
          current.layerId === target.layerId &&
          current.itemId === target.itemId
        ) {
          return null;
        }
        return current;
      });
      setSelectedLayerId((current) => {
        if (removedLayerId && current === removedLayerId) {
          return nextLayers[nextLayers.length - 1]?.id ?? "";
        }
        const exists = nextLayers.some((l) => l.id === current);
        return exists ? current : (nextLayers[nextLayers.length - 1]?.id ?? "");
      });
      checkpointSoon();
    }, [checkpointSoon, setLayers, setSelectedLayerId]);

    const updateSelectedLayer = useCallback(
      (updater: (layer: StudioLayer) => StudioLayer) => {
        const id = selectedLayerIdRef.current;
        if (!id) return;
        setLayers((prev: StudioLayer[]) =>
          prev.map((l) => (l.id === id ? updater(l) : l)),
        );
      },
      [setLayers],
    );

    const flipSelectedLayer = useCallback(
      (axis: "x" | "y") => {
        updateSelectedLayer((l) => ({
          ...l,
          flipX: axis === "x" ? !l.flipX : l.flipX,
          flipY: axis === "y" ? !l.flipY : l.flipY,
        }));
        checkpointSoon();
      },
      [checkpointSoon, updateSelectedLayer],
    );

    const resetSelectedLayerFlip = useCallback(() => {
      updateSelectedLayer((l) => ({ ...l, flipX: false, flipY: false }));
      checkpointSoon();
    }, [checkpointSoon, updateSelectedLayer]);

    const resetSelectedLayerTransform = useCallback(() => {
      updateSelectedLayer((l) => ({
        ...l,
        center: { x: 0, y: 0 },
        scale: l.scale,
        flipX: false,
        flipY: false,
      }));
      checkpointSoon();
    }, [checkpointSoon, updateSelectedLayer]);

    const bringSelectedLayerToFront = useCallback(() => {
      const id = selectedLayerIdRef.current;
      if (!id) return;
      setLayers((prev: StudioLayer[]) => {
        const idx = prev.findIndex((l) => l.id === id);
        if (idx < 0) return prev;
        const next = prev.slice();
        const [item] = next.splice(idx, 1);
        next.push(item!);
        return next;
      });
      checkpointSoon();
    }, [checkpointSoon, setLayers]);

    const sendSelectedLayerToBack = useCallback(() => {
      const id = selectedLayerIdRef.current;
      if (!id) return;
      setLayers((prev: StudioLayer[]) => {
        const idx = prev.findIndex((l) => l.id === id);
        if (idx < 0) return prev;
        const next = prev.slice();
        const [item] = next.splice(idx, 1);
        const baseIndex = next.findIndex((l) => l.isBase);
        const insertAt = baseIndex >= 0 ? baseIndex + 1 : 0;
        next.splice(insertAt, 0, item!);
        return next;
      });
      checkpointSoon();
    }, [checkpointSoon, setLayers]);

    const addImageLayer = useCallback(async () => {
      const files = await createFileUpload({
        multiple: false,
        accept: "image/*",
      });
      const file = files[0];
      if (!file) return;
      const id = nextId("layer");
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = objectUrl;
      });
      const natural =
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { w: img.naturalWidth, h: img.naturalHeight }
          : null;

      // Keep image layers at 1:1 by default; users can resize/move with the select tool.
      const initialScale = 1;

      setLayers((prev: StudioLayer[]) => [
        ...prev,
        {
          id,
          name: file.name || "图片",
          visible: true,
          bitmapSrc: objectUrl,
          bitmapNatural: natural,
          center: { x: 0, y: 0 },
          scale: initialScale,
          flipX: false,
          flipY: false,
          items: [],
          isBase: false,
        },
      ]);
      setSelectedLayerId(id);
      checkpointSoon();
    }, [checkpointSoon, nextId, setLayers, setSelectedLayerId]);

    const applyCrop = useCallback(
      async (
        layerId: string,
        rect: { x: number; y: number; w: number; h: number },
      ) => {
        const layer = layersRef.current.find((l) => l.id === layerId) ?? null;
        if (!layer?.bitmapSrc) return;
        const img = await ensureImage(layer.bitmapSrc);
        if (!img) return;
        const iw = layer.bitmapNatural?.w ?? img.naturalWidth ?? img.width;
        const ih = layer.bitmapNatural?.h ?? img.naturalHeight ?? img.height;

        const left = Math.min(rect.x, rect.x + rect.w);
        const top = Math.min(rect.y, rect.y + rect.h);
        const w = Math.abs(rect.w);
        const h = Math.abs(rect.h);
        if (w < 2 || h < 2) return;

        // Local coords are centered at (0, 0), so shift by half-size to get source pixels.
        const sx = Math.max(0, Math.min(iw, left + iw / 2));
        const sy = Math.max(0, Math.min(ih, top + ih / 2));
        const sw = Math.max(1, Math.min(iw - sx, w));
        const sh = Math.max(1, Math.min(ih - sy, h));

        const out = document.createElement("canvas");
        out.width = Math.round(sw);
        out.height = Math.round(sh);
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
        const dataUrl = out.toDataURL("image/png");

        setLayers((prev: StudioLayer[]) =>
          prev.map((l) =>
            l.id === layerId
              ? {
                  ...l,
                  bitmapSrc: dataUrl,
                  bitmapNatural: { w: out.width, h: out.height },
                  center: { x: 0, y: 0 },
                  scale: 1,
                  flipX: false,
                  flipY: false,
                }
              : l,
          ),
        );
      },
      [ensureImage, setLayers],
    );

    const cancelCrop = useCallback(() => {
      cropActiveRef.current = false;
      cropDragRef.current = null;
      setCropMode(false);
      setCropPreview(null);
    }, []);

    const enterCropMode = useCallback(() => {
      const selected = getSelectedLayer();
      if (!selected?.bitmapSrc) return;
      cropActiveRef.current = true;
      cropDragRef.current = null;
      setCropMode(true);
      setCropPreview(null);

      // Initialize a centered crop window once we know the image dimensions.
      void (async () => {
        const img = await ensureImage(selected.bitmapSrc!);
        const iw =
          selected.bitmapNatural?.w ?? img?.naturalWidth ?? img?.width ?? 0;
        const ih =
          selected.bitmapNatural?.h ?? img?.naturalHeight ?? img?.height ?? 0;
        if (!iw || !ih) return;
        // Represent rect in layer-local coords (origin at image center).
        const w = Math.max(32, Math.round(iw * 0.7));
        const h = Math.max(32, Math.round(ih * 0.7));
        setCropPreview({ layerId: selected.id, x: -w / 2, y: -h / 2, w, h });
      })();
    }, [ensureImage, getSelectedLayer]);

    const confirmCrop = useCallback(async (): Promise<boolean> => {
      const selected = getSelectedLayer();
      const rect = cropPreview;
      if (!selected?.bitmapSrc || !rect || rect.layerId !== selected.id)
        return false;
      await applyCrop(selected.id, rect);
      cancelCrop();
      checkpointSoon();
      return true;
    }, [applyCrop, cancelCrop, checkpointSoon, cropPreview, getSelectedLayer]);

    const startCropDrag = useCallback(
      (handle: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e") =>
        (e: ReactPointerEvent) => {
          if (!cropMode || !cropPreview) return;
          e.preventDefault();
          e.stopPropagation();
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          cropDragRef.current = {
            pointerId: e.pointerId,
            layerId: cropPreview.layerId,
            handle,
            startClient: { x: e.clientX, y: e.clientY },
            startRect: {
              x: cropPreview.x,
              y: cropPreview.y,
              w: cropPreview.w,
              h: cropPreview.h,
            },
          };
        },
      [cropMode, cropPreview],
    );

    const startCanvasResize = useCallback(
      (edge: "n" | "s" | "w" | "e") => (e: ReactPointerEvent) => {
        if (!active) return;
        if (cropMode) return;
        e.preventDefault();
        e.stopPropagation();
        setHoverCanvasEdge(edge);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        canvasResizeDragRef.current = {
          pointerId: e.pointerId,
          edge,
          startClient: { x: e.clientX, y: e.clientY },
          startRect: canvasRectRef.current,
        };
      },
      [active, cropMode],
    );

    const finalizeTextEdit = useCallback(
      (opts: { layerId: string; itemId: string; cancel?: boolean }) => {
        const { layerId, itemId, cancel } = opts;
        setEditingText(null);
        setLayers((prev: StudioLayer[]) => {
          let removedLayer = false;
          const next = prev
            .map((l) => {
              if (l.id !== layerId) return l;
              const items = (l.items ?? []).map((it) => it);
              const idx = items.findIndex(
                (it) => it.kind === "text" && it.id === itemId,
              );
              if (idx < 0) return l;
              const it = items[idx] as TextItem;
              const text = String((it as any)?.text ?? "").trim();
              if (cancel || !text) {
                items.splice(idx, 1);
              } else {
                items[idx] = { ...it, text };
              }
              const updated = { ...l, items };
              // If this was an auto-created text-only layer and ends up empty, drop it to avoid clutter.
              if (
                !updated.isBase &&
                !updated.bitmapSrc &&
                (updated.items?.length ?? 0) === 0
              ) {
                removedLayer = true;
                return null as any;
              }
              return updated;
            })
            .filter(Boolean) as StudioLayer[];

          if (removedLayer) {
            const currentSelected = selectedLayerIdRef.current;
            if (!next.some((l) => l.id === currentSelected)) {
              setSelectedLayerId(next[next.length - 1]?.id ?? "");
            }
          }
          return next;
        });
        checkpointSoon();
      },
      [checkpointSoon, setLayers, setSelectedLayerId],
    );

    const handlePointerDown = useCallback(
      (e: ReactPointerEvent) => {
        if (!active) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;

        const targetEl = e.target as HTMLElement | null;
        if (
          targetEl?.closest("textarea") ||
          targetEl?.closest("input") ||
          targetEl?.closest("[contenteditable='true']")
        ) {
          return;
        }

        const world = worldFromClient(e.clientX, e.clientY);
        if (!world) return;

        const selected = getSelectedLayer();
        const mode = toolRef.current;
        const rect = canvasRectRef.current;
        const insideCanvas =
          world.x >= rect.x0 &&
          world.x <= rect.x0 + rect.w &&
          world.y >= rect.y0 &&
          world.y <= rect.y0 + rect.h;

        // While cropping we only allow moving one layer.
        if (cropMode || mode === "select") {
          if (insideCanvas === false) {
            setSelectedObject(null);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            dragRef.current = {
              pointerId: e.pointerId,
              kind: {
                mode: "pan-view",
                startClient: { x: e.clientX, y: e.clientY },
                originViewport: {
                  scale: viewport.scale,
                  ox: viewport.ox,
                  oy: viewport.oy,
                },
              },
            };
            return;
          }

          const hitItem = hitTestItemAtWorld(world);
          if (hitItem) {
            const { layer, item } = hitItem;
            if (selectedLayerIdRef.current !== layer.id) {
              setSelectedLayerId(layer.id);
            }
            setSelectedObject({ layerId: layer.id, itemId: item.id });
            const local = localFromWorld(layer, world);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            dragRef.current = {
              pointerId: e.pointerId,
              kind: {
                mode: "move-item",
                layerId: layer.id,
                itemId: item.id,
                startLocal: local,
                originItem: JSON.parse(JSON.stringify(item)) as Item,
              },
            };
            return;
          }

          const fallbackLayer =
            selected ?? layersRef.current[layersRef.current.length - 1] ?? null;
          const hit = hitTestLayerAtWorld(world) ?? fallbackLayer;
          if (!hit) return;
          setSelectedObject(null);
          if (selected && hit.id !== selected.id) {
            setSelectedLayerId(hit.id);
          }
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          dragRef.current = {
            pointerId: e.pointerId,
            kind: {
              mode: "move-layer",
              startWorld: world,
              originCenter: { x: hit.center.x, y: hit.center.y },
              layerId: hit.id,
            },
          };
          return;
        }

        // Vector tools operate in world coordinates so each action can live on its own layer.
        const local = { x: world.x, y: world.y };

        if (mode === "brush") {
          const layerId = createVectorLayer("画笔");
          const id = nextId("stroke");
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) =>
              l.id === layerId
                ? {
                    ...l,
                    items: [
                      ...(l.items ?? []),
                      {
                        id,
                        kind: "stroke",
                        color: toolColor,
                        width: Math.max(1, toolWidth),
                        points: [local],
                      },
                    ],
                  }
                : l,
            ),
          );
          dragRef.current = {
            pointerId: e.pointerId,
            kind: { mode: "draw-stroke", layerId, itemId: id },
          };
          return;
        }

        if (mode === "rect") {
          const layerId = createVectorLayer("矩形");
          const id = nextId("rect");
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) =>
              l.id === layerId
                ? {
                    ...l,
                    items: [
                      ...(l.items ?? []),
                      {
                        id,
                        kind: "rect",
                        color: toolColor,
                        width: 6,
                        x: local.x,
                        y: local.y,
                        w: 0,
                        h: 0,
                      },
                    ],
                  }
                : l,
            ),
          );
          dragRef.current = {
            pointerId: e.pointerId,
            kind: { mode: "draw-rect", layerId, itemId: id, startLocal: local },
          };
          return;
        }

        if (mode === "arrow") {
          const layerId = createVectorLayer("箭头");
          const id = nextId("arrow");
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) =>
              l.id === layerId
                ? {
                    ...l,
                    items: [
                      ...(l.items ?? []),
                      {
                        id,
                        kind: "arrow",
                        color: toolColor,
                        width: 6,
                        x1: local.x,
                        y1: local.y,
                        x2: local.x,
                        y2: local.y,
                      },
                    ],
                  }
                : l,
            ),
          );
          dragRef.current = {
            pointerId: e.pointerId,
            kind: {
              mode: "draw-arrow",
              layerId,
              itemId: id,
              startLocal: local,
            },
          };
          return;
        }

        if (mode === "eraser") {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          eraseAtWorld(world, 24);
          dragRef.current = { pointerId: e.pointerId, kind: { mode: "erase" } };
          return;
        }

        if (mode === "text") {
          const layerId = nextId("layer");
          const itemId = nextId("text");
          const layer: StudioLayer = {
            id: layerId,
            name: "文本",
            visible: true,
            bitmapSrc: null,
            bitmapNatural: null,
            center: { x: 0, y: 0 },
            scale: 1,
            flipX: false,
            flipY: false,
            items: [
              {
                id: itemId,
                kind: "text",
                color: textColor,
                fontSize: Math.max(12, textFontSize),
                x: local.x,
                y: local.y,
                text: "文本",
              },
            ],
            isBase: false,
          };
          setLayers((prev: StudioLayer[]) => [...prev, layer]);
          setSelectedLayerId(layerId);
          shouldSelectTextRef.current = true;
          setEditingText({ layerId, itemId });
          setSelectedObject({ layerId, itemId });
          onRequestToolChange?.("select");
          return;
        }

        if (mode === "pen") {
          const draft = penDraftRef.current;
          if (!draft) {
            const layerId = createVectorLayer("形状");
            const id = nextId("pen");
            penDraftRef.current = { layerId, itemId: id };
            setLayers((prev: StudioLayer[]) =>
              prev.map((l) =>
                l.id === layerId
                  ? {
                      ...l,
                      items: [
                        ...(l.items ?? []),
                        {
                          id,
                          kind: "pen",
                          color: toolColor,
                          width: 6,
                          points: [local],
                          closed: false,
                        },
                      ],
                    }
                  : l,
              ),
            );
          } else {
            setLayers((prev: StudioLayer[]) =>
              prev.map((l) => {
                if (l.id !== draft.layerId) return l;
                const items = (l.items ?? []).map((it) => {
                  if (it.kind === "pen" && it.id === draft.itemId) {
                    return { ...it, points: [...it.points, local] };
                  }
                  return it;
                });
                return { ...l, items };
              }),
            );
          }
        }
      },
      [
        active,
        createVectorLayer,
        cropMode,
        eraseAtWorld,
        getSelectedLayer,
        hitTestItemAtWorld,
        hitTestLayerAtWorld,
        localFromWorld,
        nextId,
        onRequestToolChange,
        setLayers,
        setSelectedObject,
        setSelectedLayerId,
        textColor,
        textFontSize,
        toolColor,
        toolWidth,
        viewport.ox,
        viewport.oy,
        viewport.scale,
        worldFromClient,
      ],
    );

    const handlePointerMove = useCallback(
      (e: ReactPointerEvent) => {
        const resizeDrag = canvasResizeDragRef.current;
        if (resizeDrag && resizeDrag.pointerId === e.pointerId) {
          const minSize = 64;
          const dx =
            (e.clientX - resizeDrag.startClient.x) /
            Math.max(1e-6, viewport.scale);
          const dy =
            (e.clientY - resizeDrag.startClient.y) /
            Math.max(1e-6, viewport.scale);
          const start = resizeDrag.startRect;
          const right = start.x0 + start.w;
          const bottom = start.y0 + start.h;
          let next: CanvasRect = { ...start };

          if (resizeDrag.edge === "w") {
            let x0 = Math.round(start.x0 + dx);
            let w = Math.round(right - x0);
            if (w < minSize) {
              w = minSize;
              x0 = Math.round(right - w);
            }
            next = { ...next, x0, w };
          } else if (resizeDrag.edge === "e") {
            const w = Math.max(minSize, Math.round(start.w + dx));
            next = { ...next, w };
          } else if (resizeDrag.edge === "n") {
            let y0 = Math.round(start.y0 + dy);
            let h = Math.round(bottom - y0);
            if (h < minSize) {
              h = minSize;
              y0 = Math.round(bottom - h);
            }
            next = { ...next, y0, h };
          } else if (resizeDrag.edge === "s") {
            const h = Math.max(minSize, Math.round(start.h + dy));
            next = { ...next, h };
          }

          canvasUserResizedRef.current = true;
          setCanvasRect(next);
          return;
        }

        // Update hover edge (show resize handles only when the cursor approaches the canvas border).
        if (
          !cropMode &&
          !editingText &&
          !dragRef.current &&
          !cropDragRef.current
        ) {
          const el = containerRef.current;
          if (el) {
            const r = el.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            const rect = canvasRectRef.current;
            const tl = clientFromWorld({ x: rect.x0, y: rect.y0 });
            const br = clientFromWorld({
              x: rect.x0 + rect.w,
              y: rect.y0 + rect.h,
            });
            const left = Math.min(tl.x, br.x);
            const right = Math.max(tl.x, br.x);
            const top = Math.min(tl.y, br.y);
            const bottom = Math.max(tl.y, br.y);
            const t = 14;
            const withinY = y >= top - t && y <= bottom + t;
            const withinX = x >= left - t && x <= right + t;
            let edge: typeof hoverCanvasEdge = null;
            if (withinY && Math.abs(x - left) <= t) edge = "w";
            else if (withinY && Math.abs(x - right) <= t) edge = "e";
            else if (withinX && Math.abs(y - top) <= t) edge = "n";
            else if (withinX && Math.abs(y - bottom) <= t) edge = "s";
            if (edge !== hoverCanvasEdge) setHoverCanvasEdge(edge);
          }
        } else if (hoverCanvasEdge) {
          setHoverCanvasEdge(null);
        }

        const cropDrag = cropDragRef.current;
        if (cropDrag && cropDrag.pointerId === e.pointerId) {
          const layer =
            layersRef.current.find((l) => l.id === cropDrag.layerId) ?? null;
          if (!layer) return;
          const imgW = layer.bitmapNatural?.w ?? 0;
          const imgH = layer.bitmapNatural?.h ?? 0;
          if (!imgW || !imgH) return;

          const signX = layer.flipX ? -1 : 1;
          const signY = layer.flipY ? -1 : 1;
          const dxWorld =
            (e.clientX - cropDrag.startClient.x) /
            Math.max(1e-6, viewport.scale);
          const dyWorld =
            (e.clientY - cropDrag.startClient.y) /
            Math.max(1e-6, viewport.scale);
          const dxLocal = dxWorld / Math.max(1e-6, layer.scale) / signX;
          const dyLocal = dyWorld / Math.max(1e-6, layer.scale) / signY;

          const minSize = 32;
          let next = { ...cropDrag.startRect };

          const applyClamp = () => {
            const w = Math.max(minSize, Math.min(imgW, next.w));
            const h = Math.max(minSize, Math.min(imgH, next.h));
            const x = Math.max(-imgW / 2, Math.min(imgW / 2 - w, next.x));
            const y = Math.max(-imgH / 2, Math.min(imgH / 2 - h, next.y));
            next = { x, y, w, h };
          };

          if (cropDrag.handle === "move") {
            next.x = cropDrag.startRect.x + dxLocal;
            next.y = cropDrag.startRect.y + dyLocal;
            applyClamp();
            setCropPreview({ layerId: cropDrag.layerId, ...next });
            return;
          }

          if (cropDrag.handle === "nw") {
            next.x = cropDrag.startRect.x + dxLocal;
            next.y = cropDrag.startRect.y + dyLocal;
            next.w = cropDrag.startRect.w - dxLocal;
            next.h = cropDrag.startRect.h - dyLocal;
          } else if (cropDrag.handle === "ne") {
            next.y = cropDrag.startRect.y + dyLocal;
            next.w = cropDrag.startRect.w + dxLocal;
            next.h = cropDrag.startRect.h - dyLocal;
          } else if (cropDrag.handle === "sw") {
            next.x = cropDrag.startRect.x + dxLocal;
            next.w = cropDrag.startRect.w - dxLocal;
            next.h = cropDrag.startRect.h + dyLocal;
          } else if (cropDrag.handle === "se") {
            next.w = cropDrag.startRect.w + dxLocal;
            next.h = cropDrag.startRect.h + dyLocal;
          } else if (cropDrag.handle === "n") {
            next.y = cropDrag.startRect.y + dyLocal;
            next.h = cropDrag.startRect.h - dyLocal;
          } else if (cropDrag.handle === "s") {
            next.h = cropDrag.startRect.h + dyLocal;
          } else if (cropDrag.handle === "w") {
            next.x = cropDrag.startRect.x + dxLocal;
            next.w = cropDrag.startRect.w - dxLocal;
          } else if (cropDrag.handle === "e") {
            next.w = cropDrag.startRect.w + dxLocal;
          }

          // Preserve the anchored corner/edge when enforcing min size.
          if (next.w < minSize) {
            const delta = minSize - next.w;
            if (["nw", "sw", "w"].includes(cropDrag.handle)) next.x -= delta;
            next.w = minSize;
          }
          if (next.h < minSize) {
            const delta = minSize - next.h;
            if (["nw", "ne", "n"].includes(cropDrag.handle)) next.y -= delta;
            next.h = minSize;
          }

          applyClamp();
          setCropPreview({ layerId: cropDrag.layerId, ...next });
          return;
        }

        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const kind = drag.kind;

        if (kind.mode === "pan-view") {
          const dx = e.clientX - kind.startClient.x;
          const dy = e.clientY - kind.startClient.y;
          setViewport({
            scale: kind.originViewport.scale,
            ox: kind.originViewport.ox + dx,
            oy: kind.originViewport.oy + dy,
          });
          return;
        }

        const world = worldFromClient(e.clientX, e.clientY);
        if (!world) return;

        if (kind.mode === "move-item") {
          const layer =
            layersRef.current.find((l) => l.id === kind.layerId) ?? null;
          if (!layer) return;
          const local = localFromWorld(layer, world);
          const dx = local.x - kind.startLocal.x;
          const dy = local.y - kind.startLocal.y;
          const nextItem = translateItem(kind.originItem, dx, dy);
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) => {
              if (l.id !== kind.layerId) return l;
              const items = (l.items ?? []).map((it) =>
                it.id === kind.itemId ? nextItem : it,
              );
              return { ...l, items };
            }),
          );
          return;
        }

        if (kind.mode === "scale-item") {
          const layer =
            layersRef.current.find((l) => l.id === kind.layerId) ?? null;
          if (!layer) return;
          const local = localFromWorld(layer, world);
          const minSize = 6;
          let minX = Math.min(kind.anchor.x, local.x);
          let maxX = Math.max(kind.anchor.x, local.x);
          let minY = Math.min(kind.anchor.y, local.y);
          let maxY = Math.max(kind.anchor.y, local.y);
          if (maxX - minX < minSize) {
            if (local.x < kind.anchor.x) minX = maxX - minSize;
            else maxX = minX + minSize;
          }
          if (maxY - minY < minSize) {
            if (local.y < kind.anchor.y) minY = maxY - minSize;
            else maxY = minY + minSize;
          }
          const nextBounds: ItemBounds = { minX, minY, maxX, maxY };
          const nextItem = scaleItemByBounds(
            kind.originItem,
            kind.startBounds,
            nextBounds,
          );
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) => {
              if (l.id !== kind.layerId) return l;
              const items = (l.items ?? []).map((it) =>
                it.id === kind.itemId ? nextItem : it,
              );
              return { ...l, items };
            }),
          );
          return;
        }

        if (kind.mode === "move-layer") {
          const dx = world.x - kind.startWorld.x;
          const dy = world.y - kind.startWorld.y;
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) =>
              l.id === kind.layerId
                ? {
                    ...l,
                    center: {
                      x: kind.originCenter.x + dx,
                      y: kind.originCenter.y + dy,
                    },
                  }
                : l,
            ),
          );
          return;
        }

        if (kind.mode === "erase") {
          eraseAtWorld(world, 24);
          return;
        }

        const layer = layersRef.current.find((l) => l.id === kind.layerId) ?? null;
        if (!layer) return;
        const local = localFromWorld(layer, world);

        if (kind.mode === "draw-stroke") {
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) => {
              if (l.id !== kind.layerId) return l;
              const items = (l.items ?? []).map((it) => {
                if (it.kind === "stroke" && it.id === kind.itemId) {
                  return { ...it, points: [...it.points, local] };
                }
                return it;
              });
              return { ...l, items };
            }),
          );
          return;
        }

        if (kind.mode === "draw-rect") {
          const { startLocal } = kind;
          const x = startLocal.x;
          const y = startLocal.y;
          const w = local.x - startLocal.x;
          const h = local.y - startLocal.y;
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) => {
              if (l.id !== kind.layerId) return l;
              const items = (l.items ?? []).map((it) => {
                if (it.kind === "rect" && it.id === kind.itemId) {
                  return { ...it, x, y, w, h };
                }
                return it;
              });
              return { ...l, items };
            }),
          );
          return;
        }

        if (kind.mode === "draw-arrow") {
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) => {
              if (l.id !== kind.layerId) return l;
              const items = (l.items ?? []).map((it) => {
                if (it.kind === "arrow" && it.id === kind.itemId) {
                  return { ...it, x2: local.x, y2: local.y };
                }
                return it;
              });
              return { ...l, items };
            }),
          );
          return;
        }
      },
      [
        clientFromWorld,
        cropMode,
        editingText,
        eraseAtWorld,
        hoverCanvasEdge,
        localFromWorld,
        setLayers,
        setViewport,
        viewport.scale,
        worldFromClient,
      ],
    );

    const handlePointerUp = useCallback(
      (e: ReactPointerEvent) => {
        const resizeDrag = canvasResizeDragRef.current;
        if (resizeDrag && resizeDrag.pointerId === e.pointerId) {
          canvasResizeDragRef.current = null;
          setHoverCanvasEdge(null);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          return;
        }

        const cropDrag = cropDragRef.current;
        if (cropDrag && cropDrag.pointerId === e.pointerId) {
          cropDragRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          return;
        }

        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        checkpointSoon();
      },
      [checkpointSoon],
    );

    const handleWheel = useCallback((e: ReactWheelEvent) => {
      const el = containerRef.current;
      if (!el) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const prevScale = Math.max(1e-6, viewport.scale);
      const worldX = (cursorX - viewport.ox) / prevScale;
      const worldY = (cursorY - viewport.oy) / prevScale;

      const zoomBase = Math.exp(-e.deltaY * 0.0016);
      const nextScale = Math.max(0.1, Math.min(8, prevScale * zoomBase));

      setViewport({
        scale: nextScale,
        ox: cursorX - worldX * nextScale,
        oy: cursorY - worldY * nextScale,
      });
    }, [viewport.ox, viewport.oy, viewport.scale]);

    useEffect(() => {
      if (!active) return;
      const onKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (
          target?.closest("input") ||
          target?.closest("textarea") ||
          target?.closest("[contenteditable='true']")
        ) {
          return;
        }
        if (e.key === "Escape") {
          if (cropMode) {
            cancelCrop();
            return;
          }
          if (editingText) {
            // Cancel editing; caller may delete empty items on blur/commit.
            setEditingText(null);
            return;
          }
          const draft = penDraftRef.current;
          if (draft) {
            penDraftRef.current = null;
            setLayers((prev: StudioLayer[]) =>
              prev.map((l) =>
                l.id === draft.layerId
                  ? {
                      ...l,
                      items: (l.items ?? []).filter(
                        (it) => it.id !== draft.itemId,
                      ),
                    }
                  : l,
              ),
            );
            checkpointSoon();
          }
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (cropMode || editingText) return;
          if (toolRef.current !== "select") return;
          if (!selectedObjectRef.current) return;
          e.preventDefault();
          removeSelectedObject();
          return;
        }
        if (e.key === "Enter") {
          const draft = penDraftRef.current;
          if (!draft) return;
          penDraftRef.current = null;
          setLayers((prev: StudioLayer[]) =>
            prev.map((l) => {
              if (l.id !== draft.layerId) return l;
              const items = (l.items ?? []).map((it) =>
                it.kind === "pen" && it.id === draft.itemId
                  ? { ...it, closed: true }
                  : it,
              );
              return { ...l, items };
            }),
          );
          checkpointSoon();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [
      active,
      cancelCrop,
      checkpointSoon,
      cropMode,
      editingText,
      removeSelectedObject,
      setLayers,
    ]);

    const editingTextarea = useMemo(() => {
      if (!editingText) return null;
      const layer = layers.find((l) => l.id === editingText.layerId) ?? null;
      if (!layer) return null;
      const item = (layer.items ?? []).find(
        (it) => it.kind === "text" && it.id === editingText.itemId,
      ) as TextItem | undefined;
      if (!item) return null;
      const world = worldFromLocal(layer, { x: item.x, y: item.y });
      const screen = clientFromWorld(world);
      return {
        layerId: layer.id,
        itemId: item.id,
        text: String(item.text ?? ""),
        style: {
          left: `${Math.round(screen.x)}px`,
          top: `${Math.round(screen.y)}px`,
          width: "360px",
        } as CSSProperties,
      };
    }, [clientFromWorld, editingText, layers, worldFromLocal]);

    useEffect(() => {
      if (!selectedObject) return;
      const layer = layers.find((l) => l.id === selectedObject.layerId) ?? null;
      if (!layer) {
        setSelectedObject(null);
        return;
      }
      const exists = (layer.items ?? []).some((it) => it.id === selectedObject.itemId);
      if (!exists) setSelectedObject(null);
    }, [layers, selectedObject]);

    const selectedItemOverlay = useMemo(() => {
      if (!selectedObject) return null;
      const layer = layers.find((l) => l.id === selectedObject.layerId) ?? null;
      if (!layer) return null;
      const item = (layer.items ?? []).find((it) => it.id === selectedObject.itemId) ?? null;
      if (!item) return null;
      const bounds = getItemBounds(item);
      if (!bounds) return null;

      const corners = {
        nw: clientFromWorld(worldFromLocal(layer, { x: bounds.minX, y: bounds.minY })),
        ne: clientFromWorld(worldFromLocal(layer, { x: bounds.maxX, y: bounds.minY })),
        sw: clientFromWorld(worldFromLocal(layer, { x: bounds.minX, y: bounds.maxY })),
        se: clientFromWorld(worldFromLocal(layer, { x: bounds.maxX, y: bounds.maxY })),
      };
      const left = Math.min(corners.nw.x, corners.ne.x, corners.sw.x, corners.se.x);
      const right = Math.max(corners.nw.x, corners.ne.x, corners.sw.x, corners.se.x);
      const top = Math.min(corners.nw.y, corners.ne.y, corners.sw.y, corners.se.y);
      const bottom = Math.max(corners.nw.y, corners.ne.y, corners.sw.y, corners.se.y);
      return {
        layer,
        item,
        bounds,
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      };
    }, [clientFromWorld, layers, selectedObject, worldFromLocal]);

    const startScaleSelectedItem = useCallback(
      (handle: "nw" | "ne" | "sw" | "se") => (e: ReactPointerEvent) => {
        const selected = selectedObjectRef.current;
        if (!selected) return;
        const layer =
          layersRef.current.find((l) => l.id === selected.layerId) ?? null;
        if (!layer) return;
        const item =
          (layer.items ?? []).find((it) => it.id === selected.itemId) ?? null;
        if (!item) return;
        const startBounds = getItemBounds(item);
        if (!startBounds) return;

        const anchor =
          handle === "nw"
            ? { x: startBounds.maxX, y: startBounds.maxY }
            : handle === "ne"
              ? { x: startBounds.minX, y: startBounds.maxY }
              : handle === "sw"
                ? { x: startBounds.maxX, y: startBounds.minY }
                : { x: startBounds.minX, y: startBounds.minY };

        e.preventDefault();
        e.stopPropagation();
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        dragRef.current = {
          pointerId: e.pointerId,
          kind: {
            mode: "scale-item",
            layerId: layer.id,
            itemId: item.id,
            startBounds,
            anchor,
            originItem: JSON.parse(JSON.stringify(item)) as Item,
          },
        };
      },
      [],
    );

    const editingTextKey = editingTextarea
      ? `${editingTextarea.layerId}:${editingTextarea.itemId}`
      : "";

    useEffect(() => {
      if (!editingTextKey) return;
      const id = window.requestAnimationFrame(() => {
        const input = textInputRef.current;
        if (!input) return;
        input.focus();
        if (shouldSelectTextRef.current) {
          input.select();
          shouldSelectTextRef.current = false;
        }
      });
      return () => window.cancelAnimationFrame(id);
    }, [editingTextKey]);

    useEffect(() => {
      if (!selectedObject) return;
      if (selectedObject.layerId === selectedLayerId) return;
      setSelectedObject(null);
    }, [selectedLayerId, selectedObject]);

    const handleDoubleClick = useCallback(
      (e: ReactMouseEvent) => {
        if (!active) return;
        if (cropMode) return;
        if (editingText) return;
        const world = worldFromClient(e.clientX, e.clientY);
        if (!world) return;
        // Hit test text items top-most first.
        for (let i = layersRef.current.length - 1; i >= 0; i -= 1) {
          const layer = layersRef.current[i];
          if (!layer?.visible) continue;
          const local = localFromWorld(layer, world);
          for (const it of layer.items ?? []) {
            if (it.kind !== "text") continue;
            const r = Math.max(28, it.fontSize * 0.8);
            if (distance({ x: it.x, y: it.y }, local) <= r) {
              setSelectedLayerId(layer.id);
              setSelectedObject({ layerId: layer.id, itemId: it.id });
              setEditingText({ layerId: layer.id, itemId: it.id });
              return;
            }
          }
        }
      },
      [
        active,
        cropMode,
        distance,
        editingText,
        localFromWorld,
        setSelectedLayerId,
        worldFromClient,
      ],
    );

    useImperativeHandle(ref, () => ({
      exportCompositePngFile,
      getCanvasSize: () => canvasSize,
      resetView,
      addImageLayer,
      enterCropMode,
      confirmCrop,
      cancelCrop,
      flipSelectedLayer,
      resetSelectedLayerFlip,
      resetSelectedLayerTransform,
      bringSelectedLayerToFront,
      sendSelectedLayerToBack,
      checkpoint,
      undo,
      redo,
    }));

    return (
      <div
        ref={containerRef}
        className={cn(
          "nodrag relative h-full w-full overflow-hidden",
          "select-none",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onPointerLeave={() => {
          // Hide resize handles when the cursor leaves the canvas area.
          // If we're actively resizing, pointer-capture should keep events flowing anyway.
          if (canvasResizeDragRef.current) return;
          setHoverCanvasEdge(null);
        }}
        onDoubleClick={handleDoubleClick}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Canvas resize handles (for asymmetric padding / frame adjustment). */}
        {!cropMode &&
          !editingText &&
          hoverCanvasEdge &&
          (() => {
            const rect = canvasRect;
            const tl = clientFromWorld({ x: rect.x0, y: rect.y0 });
            const br = clientFromWorld({
              x: rect.x0 + rect.w,
              y: rect.y0 + rect.h,
            });
            const left = Math.round(Math.min(tl.x, br.x));
            const right = Math.round(Math.max(tl.x, br.x));
            const top = Math.round(Math.min(tl.y, br.y));
            const bottom = Math.round(Math.max(tl.y, br.y));
            const wPx = Math.max(1, right - left);
            const hPx = Math.max(1, bottom - top);
            const inset = 18;
            const thick = 10;
            const outsideGap = 6;
            const halfW = Math.max(24, Math.round((wPx - inset * 2) * 0.5));
            const halfH = Math.max(24, Math.round((hPx - inset * 2) * 0.5));
            const topBarLeft = left + Math.round((wPx - halfW) / 2);
            const sideBarTop = top + Math.round((hPx - halfH) / 2);
            const isN = hoverCanvasEdge === "n";
            const isS = hoverCanvasEdge === "s";
            const isW = hoverCanvasEdge === "w";
            const isE = hoverCanvasEdge === "e";
            return (
              <div className="pointer-events-none absolute inset-0 z-[9]">
                {/* Top */}
                <div
                  className={cn(
                    "pointer-events-auto absolute rounded-full bg-white/90 shadow",
                    "opacity-90 transition-opacity",
                    "cursor-ns-resize",
                    !isN && "hidden",
                  )}
                  style={{
                    left: topBarLeft,
                    top: top - thick - outsideGap,
                    width: halfW,
                    height: thick,
                  }}
                  onPointerDown={startCanvasResize("n")}
                  role="presentation"
                />
                {/* Bottom */}
                <div
                  className={cn(
                    "pointer-events-auto absolute rounded-full bg-white/90 shadow",
                    "opacity-90 transition-opacity",
                    "cursor-ns-resize",
                    !isS && "hidden",
                  )}
                  style={{
                    left: topBarLeft,
                    top: bottom + outsideGap,
                    width: halfW,
                    height: thick,
                  }}
                  onPointerDown={startCanvasResize("s")}
                  role="presentation"
                />
                {/* Left */}
                <div
                  className={cn(
                    "pointer-events-auto absolute rounded-full bg-white/90 shadow",
                    "opacity-90 transition-opacity",
                    "cursor-ew-resize",
                    !isW && "hidden",
                  )}
                  style={{
                    left: left - thick - outsideGap,
                    top: sideBarTop,
                    width: thick,
                    height: halfH,
                  }}
                  onPointerDown={startCanvasResize("w")}
                  role="presentation"
                />
                {/* Right */}
                <div
                  className={cn(
                    "pointer-events-auto absolute rounded-full bg-white/90 shadow",
                    "opacity-90 transition-opacity",
                    "cursor-ew-resize",
                    !isE && "hidden",
                  )}
                  style={{
                    left: right + outsideGap,
                    top: sideBarTop,
                    width: thick,
                    height: halfH,
                  }}
                  onPointerDown={startCanvasResize("e")}
                  role="presentation"
                />
              </div>
            );
          })()}

        {cropMode &&
          cropPreview &&
          (() => {
            const layer =
              layers.find((l) => l.id === cropPreview.layerId) ?? null;
            if (!layer || !layer.bitmapSrc) return null;
            const iw = layer.bitmapNatural?.w ?? 0;
            const ih = layer.bitmapNatural?.h ?? 0;
            if (!iw || !ih) return null;
            const leftLocal = cropPreview.x;
            const topLocal = cropPreview.y;
            const wLocal = cropPreview.w;
            const hLocal = cropPreview.h;
            const tlWorld = worldFromLocal(layer, {
              x: leftLocal,
              y: topLocal,
            });
            const tl = clientFromWorld(tlWorld);
            const wPx = Math.max(
              1,
              Math.round(Math.abs(wLocal) * layer.scale * viewport.scale),
            );
            const hPx = Math.max(
              1,
              Math.round(Math.abs(hLocal) * layer.scale * viewport.scale),
            );
            const left = Math.round(tl.x);
            const top = Math.round(tl.y);

            return (
              <div className="pointer-events-none absolute inset-0 z-10">
                {/* Keep crop overlay below UI toolbars/rails (prevents the top bar from looking grayed-out). */}
                {/* Mask */}
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute left-0 right-0 top-0 bg-black/55"
                    style={{ height: top }}
                  />
                  <div
                    className="absolute left-0 bg-black/55"
                    style={{ top, width: left, height: hPx }}
                  />
                  <div
                    className="absolute right-0 bg-black/55"
                    style={{ top, left: left + wPx, height: hPx }}
                  />
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-black/55"
                    style={{ top: top + hPx }}
                  />
                </div>

                {/* Crop rect + handles */}
                <div
                  className="pointer-events-auto absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
                  style={{ left, top, width: wPx, height: hPx }}
                  onPointerDown={(ev) => {
                    // Prevent canvas interactions when grabbing the crop box.
                    ev.preventDefault();
                    ev.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    className="absolute inset-0 cursor-move bg-transparent"
                    aria-label="Move crop box"
                    onPointerDown={startCropDrag("move")}
                  />
                  {[
                    [
                      "nw",
                      "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
                    ],
                    [
                      "ne",
                      "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
                    ],
                    [
                      "sw",
                      "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
                    ],
                    [
                      "se",
                      "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
                    ],
                    [
                      "n",
                      "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
                    ],
                    [
                      "s",
                      "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
                    ],
                    [
                      "w",
                      "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
                    ],
                    [
                      "e",
                      "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
                    ],
                  ].map(([handle, cls]) => (
                    <div
                      key={handle as string}
                      className={cn(
                        "absolute h-3 w-3 rounded-sm border border-white bg-white/10 backdrop-blur",
                        cls as string,
                      )}
                      onPointerDown={startCropDrag(handle as any)}
                      role="presentation"
                    />
                  ))}
                </div>
              </div>
            );
          })()}

        {!cropMode && !editingTextarea && tool === "select" && selectedItemOverlay && (
          <div className="pointer-events-none absolute inset-0 z-[18]">
            <div
              className="absolute rounded-md border-2 border-[#2E7BFF] shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
              style={{
                left: `${Math.round(selectedItemOverlay.left)}px`,
                top: `${Math.round(selectedItemOverlay.top)}px`,
                width: `${Math.round(selectedItemOverlay.width)}px`,
                height: `${Math.round(selectedItemOverlay.height)}px`,
              }}
            />
            {[
              {
                key: "nw",
                className:
                  "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
              },
              {
                key: "ne",
                className:
                  "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
              },
              {
                key: "sw",
                className:
                  "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
              },
              {
                key: "se",
                className:
                  "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
              },
            ].map((handle) => (
              <button
                key={handle.key}
                type="button"
                className={cn(
                  "pointer-events-auto absolute h-3 w-3 rounded border border-white bg-[#2E7BFF] shadow",
                  handle.className,
                )}
                style={{
                  left:
                    handle.key === "ne" || handle.key === "se"
                      ? `${Math.round(
                          selectedItemOverlay.left + selectedItemOverlay.width,
                        )}px`
                      : `${Math.round(selectedItemOverlay.left)}px`,
                  top:
                    handle.key === "sw" || handle.key === "se"
                      ? `${Math.round(
                          selectedItemOverlay.top + selectedItemOverlay.height,
                        )}px`
                      : `${Math.round(selectedItemOverlay.top)}px`,
                }}
                onPointerDown={startScaleSelectedItem(handle.key as any)}
                aria-label="Scale object"
              />
            ))}
            <button
              type="button"
              className="pointer-events-auto absolute h-6 rounded-md border border-rose-400/60 bg-background/90 px-2 text-[11px] font-medium text-rose-500 shadow hover:bg-background"
              style={{
                left: `${Math.round(
                  selectedItemOverlay.left + selectedItemOverlay.width - 42,
                )}px`,
                top: `${Math.round(selectedItemOverlay.top - 28)}px`,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeSelectedObject();
              }}
            >
              Del
            </button>
          </div>
        )}

        {editingTextarea && (
          <textarea
            ref={textInputRef}
            autoFocus
            className={cn(
              "pointer-events-auto absolute z-50 min-h-[60px] resize-y rounded-xl border",
              "bg-white/90 p-2 text-slate-900 shadow outline-none focus:ring-2 focus:ring-[#2E7BFF]/30",
              "dark:bg-neutral-900/85 dark:text-slate-50",
              "select-text",
            )}
            style={editingTextarea.style}
            placeholder="输入文字..."
            value={editingTextarea.text}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onChange={(e) => {
              const v = e.target.value;
              setLayers((prev: StudioLayer[]) =>
                prev.map((l) =>
                  l.id === editingTextarea.layerId
                    ? {
                        ...l,
                        items: (l.items ?? []).map((it) =>
                          it.kind === "text" && it.id === editingTextarea.itemId
                            ? { ...it, text: v }
                            : it,
                        ),
                      }
                    : l,
                ),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                finalizeTextEdit({
                  layerId: editingTextarea.layerId,
                  itemId: editingTextarea.itemId,
                });
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                finalizeTextEdit({
                  layerId: editingTextarea.layerId,
                  itemId: editingTextarea.itemId,
                  cancel: true,
                });
              }
            }}
            onBlur={() =>
              finalizeTextEdit({
                layerId: editingTextarea.layerId,
                itemId: editingTextarea.itemId,
              })
            }
          />
        )}
      </div>
    );
  },
);

export default ScribbleStudioCanvas;
