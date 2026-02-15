import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";

export type MultiAngleCameraView = {
  id: string;
  label: string;
  yaw: number; // 水平旋转（Yaw）
  pitch: number; // 俯仰（Pitch）
  zoom: number; // 缩放（Zoom）
  wideAngle: boolean; // 广角镜头
};

type AnglePreset = {
  id: string;
  label: string;
  yaw: number;
  pitch: number;
};

type Props = {
  open: boolean;
  imageSource: string;
  onCancel: () => void;
  onConfirm: (payload: {
    imageSource: string;
    fileName: string;
    views: Array<{
      yaw: number;
      pitch: number;
      zoom: number;
      wideAngle: boolean;
      label?: string;
    }>;
  }) => void | Promise<void>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeId() {
  // Avoid depending on crypto/randomUUID for older browsers.
  return `view_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatSignedDegrees(value: number) {
  const n = Math.round(value);
  return `${n >= 0 ? `${n}` : `${n}`}°`;
}

const ANGLE_PRESETS: AnglePreset[] = [
  { id: "front", label: "正面", yaw: 0, pitch: 0 },
  { id: "front_right", label: "右前", yaw: -45, pitch: 0 },
  { id: "right", label: "右侧", yaw: -90, pitch: 0 },
  { id: "back", label: "背面", yaw: 180, pitch: 0 },
  { id: "front_left", label: "左前", yaw: 45, pitch: 0 },
  { id: "left", label: "左侧", yaw: 90, pitch: 0 },
  { id: "top", label: "俯视", yaw: 0, pitch: 60 },
  { id: "low", label: "仰视", yaw: 0, pitch: -30 },
];

function FaceMarker({
  label,
  placement = "corner",
}: {
  label: string;
  placement?: "corner" | "center";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border text-lg font-semibold",
        placement === "corner"
          ? "absolute right-3 top-3"
          : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "bg-background/70 text-foreground shadow-sm backdrop-blur",
      )}
    >
      {label}
    </span>
  );
}

export default function MultiAngleCameraOverlay({
  open,
  imageSource,
  onCancel,
  onConfirm,
}: Props) {
  const mountedRef = useRef(false);
  const [isConfirming, setConfirming] = useState(false);

  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [wideAngle, setWideAngle] = useState(false);
  const [views, setViews] = useState<MultiAngleCameraView[]>([]);

  const [isListOpen, setListOpen] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Reset each time to keep behavior predictable.
    setYaw(0);
    setPitch(0);
    setZoom(1.0);
    setWideAngle(false);
    setViews([]);
    setListOpen(false);
  }, [open]);

  const effectiveViews = useMemo(() => {
    if (views.length) return views;
    return [
      {
        id: "current",
        label: "当前角度",
        yaw,
        pitch,
        zoom,
        wideAngle,
      },
    ];
  }, [pitch, views, wideAngle, yaw, zoom]);

  const safeCount = Math.max(1, Math.min(6, effectiveViews.length));

  const handleAddCurrentView = useCallback(() => {
    setViews((prev) => {
      const next = [...prev];
      if (next.length >= 6) return next;
      const idx = next.length + 1;
      next.push({
        id: makeId(),
        label: `机位 ${idx}`,
        yaw,
        pitch,
        zoom,
        wideAngle,
      });
      return next;
    });
  }, [pitch, wideAngle, yaw, zoom]);

  const handleRemoveView = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleClearViews = useCallback(() => setViews([]), []);

  const handleReset = useCallback(() => {
    setYaw(0);
    setPitch(0);
    setZoom(1.0);
    setWideAngle(false);
  }, []);

  const applyPreset = useCallback((preset: AnglePreset) => {
    setYaw(clamp(Number(preset.yaw), -180, 180));
    setPitch(clamp(Number(preset.pitch), -90, 90));
  }, []);

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
  } | null>(null);

  const onCubePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startYaw: yaw,
      startPitch: pitch,
    };
  }, [pitch, yaw]);

  const onCubePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const SENS = 0.45; // degrees per pixel
    const nextYaw = clamp(drag.startYaw + dx * SENS, -180, 180);
    const nextPitch = clamp(drag.startPitch - dy * SENS, -90, 90);
    setYaw(nextYaw);
    setPitch(nextPitch);
  }, []);

  const onCubePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (dragRef.current) dragRef.current.active = false;
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setConfirming(true);
    try {
      const safeViews = effectiveViews.slice(0, 6).map((v) => ({
        yaw: Math.round(v.yaw),
        pitch: Math.round(v.pitch),
        zoom: Number(v.zoom),
        wideAngle: Boolean(v.wideAngle),
        label: v.label,
      }));
      await onConfirm({
        imageSource,
        fileName: "multi-angle.png",
        views: safeViews,
      });
    } finally {
      if (mountedRef.current) setConfirming(false);
    }
  }, [effectiveViews, imageSource, isConfirming, onConfirm]);

  const handleClose = useCallback(() => {
    if (isConfirming) return;
    onCancel();
  }, [isConfirming, onCancel]);

  // NOTE: Keep all hooks above the conditional return to avoid hook order mismatches
  // when toggling `open` (React error #310 in production builds).
  const cubeScale = clamp(0.94 + (zoom - 0.5) * 0.12, 0.88, 1.28);

  if (!open) return null;

  const cubeYaw = yaw;
  const cubePitch = pitch;

  const cubeSize = 170;
  const half = cubeSize / 2;
  const depth = 56;

  return (
    <div
      className={cn(
        // Prevent ReactFlow node dragging / panning from hijacking drawer interactions.
        "nodrag nopan",
        "w-full overflow-hidden rounded-2xl border bg-background/95 shadow-lg backdrop-blur",
      )}
      role="region"
      aria-label="多角度抽屉"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="text-lg font-medium text-foreground">拖拽方块调整角度</div>
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

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[280px_1fr]">
        {/* 左侧：立方体区域 */}
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "relative flex items-center justify-center overflow-hidden rounded-2xl border",
              "bg-background",
            )}
            style={{ minHeight: 280 }}
          >
            <div
              className="relative h-[240px] w-[240px] touch-none select-none"
              onPointerDown={onCubePointerDown}
              onPointerMove={onCubePointerMove}
              onPointerUp={onCubePointerUp}
            >
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: cubeSize,
                  height: cubeSize,
                  transformStyle: "preserve-3d",
                  transform: `translate(-50%, -50%) rotateX(${cubePitch * 0.9}deg) rotateY(${cubeYaw}deg) scale(${cubeScale})`,
                  transition: dragRef.current?.active
                    ? "none"
                    : "transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                }}
              >
                <div
                  className="absolute flex items-center justify-center rounded-2xl border bg-neutral-300 dark:bg-neutral-700"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    transform: `rotateY(0deg) translateZ(${depth}px)`,
                    opacity: 0.93,
                  }}
                >
                  <FaceMarker label="F" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/60">
                      <ForwardedIconComponent
                        name="Image"
                        className="h-7 w-7 text-foreground/80"
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="absolute flex items-center justify-center rounded-2xl border bg-neutral-300 dark:bg-neutral-700"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    transform: `rotateY(180deg) translateZ(${depth}px)`,
                    opacity: 0.68,
                  }}
                >
                  <FaceMarker label="B" placement="center" />
                </div>
                <div
                  className="absolute flex items-center justify-center rounded-2xl border bg-neutral-300 dark:bg-neutral-700"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    transform: `rotateY(90deg) translateZ(${depth}px)`,
                    opacity: 0.68,
                  }}
                >
                  <FaceMarker label="R" placement="center" />
                </div>
                <div
                  className="absolute flex items-center justify-center rounded-2xl border bg-neutral-300 dark:bg-neutral-700"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    transform: `rotateY(-90deg) translateZ(${depth}px)`,
                    opacity: 0.68,
                  }}
                >
                  <FaceMarker label="L" placement="center" />
                </div>
                <div
                  className="absolute flex items-center justify-center rounded-2xl border bg-neutral-300 dark:bg-neutral-700"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    transform: `rotateX(90deg) translateZ(${depth}px)`,
                    opacity: 0.68,
                  }}
                >
                  <FaceMarker label="T" placement="center" />
                </div>
                <div
                  className="absolute flex items-center justify-center rounded-2xl border bg-neutral-300 dark:bg-neutral-700"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    transform: `rotateX(-90deg) translateZ(${depth}px)`,
                    opacity: 0.68,
                  }}
                >
                  <FaceMarker label="D" placement="center" />
                </div>
              </div>
              <div
                className="absolute left-1/2 top-1/2 rounded-full bg-foreground/10 blur-2xl"
                style={{
                  width: cubeSize * 1.1,
                  height: cubeSize * 0.35,
                  transform: `translate(-50%, ${half}px) scale(${cubeScale})`,
                  transition: dragRef.current?.active
                    ? "none"
                    : "transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          >
            <ForwardedIconComponent name="RotateCcw" className="h-4 w-4" />
            重置
          </button>
        </div>

        {/* 右侧：控件区域 */}
        <div className="flex flex-col gap-4">
          {/* 滑块控件 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-sm text-muted-foreground">水平旋转</div>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={yaw}
                onChange={(e) => setYaw(clamp(Number(e.target.value), -180, 180))}
                className="w-full"
              />
              <div className="w-14 text-right text-sm text-muted-foreground">
                {formatSignedDegrees(yaw)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-sm text-muted-foreground">俯仰</div>
              <input
                type="range"
                min={-90}
                max={90}
                step={1}
                value={pitch}
                onChange={(e) => setPitch(clamp(Number(e.target.value), -90, 90))}
                className="w-full"
              />
              <div className="w-14 text-right text-sm text-muted-foreground">
                {formatSignedDegrees(pitch)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-sm text-muted-foreground">缩放</div>
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(clamp(Number(e.target.value), 0.5, 3.0))}
                className="w-full"
              />
              <div className="w-14 text-right text-sm text-muted-foreground">
                {zoom.toFixed(1)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-20 shrink-0 whitespace-nowrap text-sm text-muted-foreground">广角镜头</div>
              <div className="flex-1" />
              <button
                type="button"
                role="switch"
                aria-checked={wideAngle}
                onClick={() => setWideAngle((v) => !v)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition",
                  wideAngle ? "bg-foreground/80" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition",
                    wideAngle ? "left-[16px]" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </div>

          {/* 角度预设 - 放在下方 */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">角度预设</div>
            <div className="flex flex-wrap gap-2">
              {ANGLE_PRESETS.map((p) => {
                const active = Math.round(yaw) === p.yaw && Math.round(pitch) === p.pitch;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                      active
                        ? "bg-primary text-primary-foreground border-primary/40"
                        : "bg-muted/40 text-foreground hover:bg-muted border-border/60",
                    )}
                    title={`${p.label}（yaw ${p.yaw}°, pitch ${p.pitch}°）`}
                    aria-label={`角度预设：${p.label}`}
                  >
                    <span className="whitespace-nowrap">{p.label}</span>
                    <span className={cn("text-xs", active ? "text-primary-foreground/85" : "text-muted-foreground")}>
                      {p.yaw}/{p.pitch}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="relative mt-auto flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition",
                "bg-muted/60 text-foreground hover:bg-muted",
              )}
              title="机位列表"
              aria-label="机位列表"
            >
              <ForwardedIconComponent name="Layers" className="h-4 w-4" />
              <span>{safeCount}</span>
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className={cn(
                "inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium transition",
                isConfirming
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              disabled={isConfirming}
              title="生成"
              aria-label="生成"
            >
              <ForwardedIconComponent name="ArrowUp" className="h-4 w-4" />
            </button>

            {isListOpen ? (
              <div className="absolute bottom-10 right-0 w-[320px] overflow-hidden rounded-xl border bg-background shadow-2xl">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div className="text-sm font-medium text-foreground">机位列表（最多 6 个）</div>
                  <button
                    type="button"
                    onClick={() => setListOpen(false)}
                    className="rounded-full p-1 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                    aria-label="关闭机位列表"
                    title="关闭"
                  >
                    <ForwardedIconComponent name="X" className="h-3 w-3" />
                  </button>
                </div>

                <div className="max-h-[220px] overflow-auto p-2">
                  {views.length ? (
                    <div className="space-y-1.5">
                      {views.map((v, idx) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {idx + 1}. {v.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              水平旋转={Math.round(v.yaw)}°, 俯仰={Math.round(v.pitch)}°
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveView(v.id)}
                            className="rounded-full p-1 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                            aria-label="删除机位"
                            title="删除"
                          >
                            <ForwardedIconComponent name="Trash2" className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      未添加机位，将按当前角度生成 1 张。
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                  <button
                    type="button"
                    onClick={handleClearViews}
                    className="rounded-full px-2 py-1 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                    disabled={!views.length}
                  >
                    清空
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCurrentView}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                    disabled={views.length >= 6}
                  >
                    <ForwardedIconComponent name="Plus" className="h-3 w-3" />
                    添加当前机位
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
