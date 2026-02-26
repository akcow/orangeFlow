import type { StudioLayer } from "./ScribbleStudioCanvas";

type LayerItem = StudioLayer["items"][number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const TEXT_FONT_FAMILY = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial";
let textMeasureContext: CanvasRenderingContext2D | null = null;

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (textMeasureContext) return textMeasureContext;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  textMeasureContext = canvas.getContext("2d");
  return textMeasureContext;
}

function getTextLayout(item: any): {
  lines: string[];
  lineHeight: number;
  contentWidth: number;
  contentHeight: number;
} {
  const text = String(item?.text ?? "");
  const lines = text.split(/\r?\n/);
  if (!lines.length) lines.push("");

  const fontSize = Math.max(12, Number(item?.fontSize || 12));
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

function getItemBounds(item: LayerItem): Bounds | null {
  if (!item) return null;
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
    const pad = Math.max(6, (item as any).width / 2 + 2);
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
  const textLayout = getTextLayout(item as any);
  const padX = 8;
  const padY = 6;
  return {
    minX: (item as any).x - 4,
    minY: (item as any).y - 4,
    maxX: (item as any).x + textLayout.contentWidth + padX + 4,
    maxY: (item as any).y + textLayout.contentHeight + padY + 4,
  };
}

function drawItem(ctx: CanvasRenderingContext2D, item: LayerItem) {
  if (!item) return;
  if (item.kind === "stroke") {
    if (!item.points?.length) return;
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
    return;
  }

  if (item.kind === "rect") {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.strokeRect(item.x, item.y, item.w, item.h);
    return;
  }

  if (item.kind === "arrow") {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(item.x1, item.y1);
    ctx.lineTo(item.x2, item.y2);
    ctx.stroke();

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
    return;
  }

  if (item.kind === "pen") {
    if (!item.points?.length) return;
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
    return;
  }

  if (item.kind === "text") {
    const layout = getTextLayout(item);
    ctx.fillStyle = item.color;
    ctx.font = `${Math.max(12, item.fontSize)}px ${TEXT_FONT_FAMILY}`;
    ctx.textBaseline = "top";
    layout.lines.forEach((line, idx) => {
      ctx.fillText(line, item.x, item.y + idx * layout.lineHeight);
    });
  }
}

export function getLayerThumbnailSrc(layer: StudioLayer, size = 120): string {
  const bitmapSrc = String(layer?.bitmapSrc || "").trim();
  if (bitmapSrc) return bitmapSrc;

  if (typeof document === "undefined") return "";
  const items = (layer?.items ?? []) as LayerItem[];
  if (!items.length) return "";

  const boundsList = items
    .map((item) => getItemBounds(item))
    .filter(Boolean) as Bounds[];
  if (!boundsList.length) return "";

  let minX = boundsList[0]!.minX;
  let minY = boundsList[0]!.minY;
  let maxX = boundsList[0]!.maxX;
  let maxY = boundsList[0]!.maxY;
  for (const b of boundsList) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }

  const padding = 14;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const fit = Math.max(1, size - 4);
  const scale = Math.min(fit / (contentW + padding * 2), fit / (contentH + padding * 2));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);
  for (const item of items) {
    drawItem(ctx, item);
  }
  ctx.restore();

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}
