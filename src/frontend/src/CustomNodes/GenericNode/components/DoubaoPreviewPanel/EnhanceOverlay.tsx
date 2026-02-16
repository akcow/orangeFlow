import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";

export type EnhanceModelOption = {
  id: string;
  label: string;
};

type Props = {
  open: boolean;
  imageSource: string;
  modelOptions: EnhanceModelOption[];
  initialModelId?: string;
  initialResolution?: "4k" | "8k";
  initialScale?: number;
  onCancel: () => void;
  onConfirm: (payload: {
    imageSource: string;
    fileName: string;
    modelId: string;
    resolution: "4k" | "8k";
    scale: number;
  }) => void | Promise<void>;
};

function clampInt(value: number, min: number, max: number) {
  const n = Math.round(Number.isFinite(value) ? value : min);
  return Math.max(min, Math.min(max, n));
}

const JIMENG_MAX_INPUT_BYTES = 4_700_000; // docs/model/即梦智能超清接口文档.md
const JIMENG_MAX_DIM = 4096;
const JIMENG_ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 2)} MB`;
  const kb = n / 1024;
  if (kb >= 1) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  return `${Math.round(n)} B`;
}

async function readBlobImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      const width = Number(bitmap.width);
      const height = Number(bitmap.height);
      bitmap?.close?.();
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return { width, height };
      }
    }
  } catch {
    // fallback below
  }

  // Fallback: HTMLImageElement decode.
  try {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
      if (size?.width && size?.height) return size;
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

export default function EnhanceOverlay({
  open,
  imageSource,
  modelOptions,
  initialModelId,
  initialResolution = "4k",
  initialScale = 50,
  onCancel,
  onConfirm,
}: Props) {
  const mountedRef = useRef(false);
  const [isConfirming, setConfirming] = useState(false);
  const [modelId, setModelId] = useState<string>(
    initialModelId || modelOptions?.[0]?.id || "jimeng-smart-hd",
  );
  const [resolution, setResolution] = useState<"4k" | "8k">(initialResolution);
  const [scale, setScale] = useState<number>(clampInt(initialScale, 0, 100));
  const [validation, setValidation] = useState<{
    level: "checking" | "ok" | "error" | "unknown";
    status: string;
    detail: string;
    meta?: { mime: string; bytes: number; width?: number; height?: number };
  }>({ level: "checking", status: "校验中", detail: "正在读取图片信息…" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setConfirming(false);
    setModelId(initialModelId || modelOptions?.[0]?.id || "jimeng-smart-hd");
    setResolution(initialResolution || "4k");
    setScale(clampInt(initialScale ?? 50, 0, 100));
  }, [initialModelId, initialResolution, initialScale, modelOptions, open]);

  const modelLabel = useMemo(() => {
    const id = String(modelId || "").trim();
    return modelOptions?.find((o) => o.id === id)?.label || id || "jimeng-smart-hd";
  }, [modelId, modelOptions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setValidation({ level: "checking", status: "校验中", detail: "正在读取图片信息…" });

    const run = async () => {
      try {
        const resp = await fetch(imageSource);
        const blob = await resp.blob();
        const bytes = Number(blob.size || 0);
        const mime = String(blob.type || "").trim();
        const size = await readBlobImageSize(blob);
        const width = size?.width;
        const height = size?.height;

        const reasons: string[] = [];
        if (bytes > JIMENG_MAX_INPUT_BYTES) {
          reasons.push(`文件过大（${formatBytes(bytes)} > ${formatBytes(JIMENG_MAX_INPUT_BYTES)}）`);
        }
        if (mime && !JIMENG_ALLOWED_MIME.has(mime)) {
          reasons.push(`格式不支持（${mime}）`);
        }
        if (width && height && (width > JIMENG_MAX_DIM || height > JIMENG_MAX_DIM)) {
          reasons.push(`分辨率超限（${width}×${height}，最大 ${JIMENG_MAX_DIM}×${JIMENG_MAX_DIM}）`);
        }

        const meta = { mime, bytes, width, height };

        if (!mime || !width || !height) {
          const detailParts: string[] = [];
          if (!mime) detailParts.push("无法识别图片格式（mime 为空）");
          if (!width || !height) detailParts.push("无法读取图片分辨率");
          const extra = detailParts.length ? `：${detailParts.join("；")}` : "";
          const base = `已读取大小 ${formatBytes(bytes)}`;
          if (!cancelled) {
            setValidation({
              level: reasons.length ? "error" : "unknown",
              status: reasons.length ? "不符合" : "无法校验",
              detail: reasons.length ? reasons.join("；") : `${base}${extra}`,
              meta,
            });
          }
          return;
        }

        if (!cancelled) {
          if (reasons.length) {
            setValidation({ level: "error", status: "不符合", detail: reasons.join("；"), meta });
          } else {
            setValidation({
              level: "ok",
              status: "通过",
              detail: `格式 ${mime}；大小 ${formatBytes(bytes)}；分辨率 ${width}×${height}`,
              meta,
            });
          }
        }
      } catch (e) {
        if (!cancelled) {
          setValidation({
            level: "unknown",
            status: "无法校验",
            detail: "读取图片信息失败（可能是跨域限制）。",
          });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [imageSource, open]);

  const handleClose = useCallback(() => {
    if (isConfirming) return;
    onCancel();
  }, [isConfirming, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    const resolvedModelId = String(modelId || "").trim() || modelOptions?.[0]?.id || "jimeng-smart-hd";
    if (!resolvedModelId) return;
    setConfirming(true);
    try {
      await onConfirm({
        imageSource,
        fileName: "enhance.png",
        modelId: resolvedModelId,
        resolution,
        scale: clampInt(scale, 0, 100),
      });
    } finally {
      if (mountedRef.current) setConfirming(false);
    }
  }, [imageSource, isConfirming, modelId, modelOptions, onConfirm, resolution, scale]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "nodrag nopan",
        "w-full overflow-hidden rounded-2xl border bg-background/95 shadow-lg backdrop-blur",
      )}
      role="region"
      aria-label="增强抽屉"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <ForwardedIconComponent name="HD" className="h-5 w-5 text-foreground" />
          <div className="text-lg font-medium text-foreground">增强</div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          aria-label="关闭"
          title="关闭"
        >
          <ForwardedIconComponent name="X" className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border bg-background p-4">
            <div className="text-sm font-medium text-foreground">模型选择</div>
            <div className="mt-2">
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className={cn(
                  "w-full rounded-xl border bg-background px-3 py-2 text-sm text-foreground outline-none",
                  "focus:ring-2 focus:ring-primary/40",
                )}
                aria-label="增强模型选择"
              >
                {(modelOptions?.length ? modelOptions : [{ id: "jimeng-smart-hd", label: "即梦智能超清" }]).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border bg-background p-4">
            <div className="text-sm font-medium text-foreground">输出分辨率</div>
            <div className="mt-2 flex items-center gap-2">
              {(["4k", "8k"] as const).map((v) => {
                const active = resolution === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setResolution(v)}
                    className={cn(
                      "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm transition",
                      active
                        ? "bg-primary text-primary-foreground border-primary/40"
                        : "bg-muted/40 text-foreground hover:bg-muted border-border/60",
                    )}
                    aria-label={`分辨率：${v}`}
                    title={v}
                  >
                    {v.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">细节生成程度</div>
              <div className="text-sm tabular-nums text-muted-foreground">{clampInt(scale, 0, 100)}</div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={clampInt(scale, 0, 100)}
                onChange={(e) => setScale(clampInt(Number(e.target.value), 0, 100))}
                className="w-full"
                aria-label="细节生成程度"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={clampInt(scale, 0, 100)}
                onChange={(e) => setScale(clampInt(Number(e.target.value), 0, 100))}
                className={cn(
                  "w-20 rounded-xl border bg-background px-2 py-1.5 text-sm text-foreground outline-none",
                  "focus:ring-2 focus:ring-primary/40",
                )}
                aria-label="细节生成程度数值"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full text-white",
                "shadow-[0_12px_24px_rgba(46,123,255,0.35)] transition",
                isConfirming
                  ? "cursor-not-allowed bg-slate-300 shadow-none hover:bg-slate-300"
                  : "bg-[#2E7BFF] hover:bg-[#0F5CE0]",
              )}
              disabled={isConfirming}
              title="生成"
              aria-label="生成"
            >
              <ForwardedIconComponent
                name={isConfirming ? "Loader2" : "Wand2"}
                className={cn("h-4 w-4", isConfirming && "animate-spin")}
              />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4">
          <div
            className={cn(
              "mb-4 rounded-xl border px-3 py-2 text-xs transition-colors",
              validation.level === "ok" &&
                "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100",
              (validation.level === "unknown" || validation.level === "checking") &&
                "border-[#E2E7F5] bg-[#F7F9FF] text-[#2E3150] dark:border-white/15 dark:bg-white/10 dark:text-slate-100",
              validation.level === "error" &&
                "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100",
            )}
          >
            <div className="flex items-start gap-2">
              <ForwardedIconComponent
                name={
                  validation.level === "ok"
                    ? "CheckCircle2"
                    : validation.level === "error"
                      ? "AlertTriangle"
                      : validation.level === "checking"
                        ? "Loader2"
                        : "Info"
                }
                className={cn("mt-0.5 h-4 w-4", validation.level === "checking" && "animate-spin")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">上传校验</span>
                  <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-[#3C4057] dark:bg-black/30 dark:text-white">
                    {validation.status}
                  </span>
                </div>
                <div className="mt-1 leading-5 opacity-90">{validation.detail}</div>
              </div>
            </div>
          </div>

          <div className="text-sm font-medium text-foreground">说明</div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            将当前图片进行智能超清处理，默认输出 4K。当前模型：{modelLabel}。
          </div>
          <div className="mt-3 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
            <div>支持输入：JPEG/PNG，单图 ≤ 4.7MB，最大 4096×4096。</div>
          </div>
        </div>
      </div>
    </div>
  );
}
