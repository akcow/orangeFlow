import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";
import { Switch } from "@/components/ui/switch";
import {
  formatControlValue,
  type DoubaoControlConfig,
} from "./DoubaoParameterButton";

type ResolutionAspectButtonProps = {
  data: NodeDataType;
  resolutionConfig: DoubaoControlConfig;
  aspectRatioConfig: DoubaoControlConfig;
  disabled?: boolean;
  widthClass?: string;
};

const RESOLUTION_LABEL_ORDER = ["512px", "1K", "2K", "3K", "4K", "Auto"] as const;
const RESOLUTION_ALLOWED = new Set<string>(RESOLUTION_LABEL_ORDER);

function parseAspectRatio(value: string): { w: number; h: number } | null {
  const raw = value.trim().toLowerCase();
  if (!raw || raw === "adaptive") return null;
  const match = raw.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

function buildVisibleOptions(config: DoubaoControlConfig) {
  const options = config.options ?? [];
  const disabledSet = new Set((config.disabledOptions ?? []).map((opt) => String(opt)));
  const visible = options.filter((opt) => !disabledSet.has(String(opt)));
  return {
    visible,
    enabledSet: new Set(visible.map((opt) => String(opt))),
  };
}

function resolveEffectiveValue(config: DoubaoControlConfig, visible: any[], enabledSet: Set<string>) {
  const baseValue = config.value ?? config.template?.value;
  const baseString = baseValue === undefined || baseValue === null ? "" : String(baseValue);
  if (!baseString) return baseValue;
  if (baseString && enabledSet.has(baseString)) return baseValue;
  return visible[0] ?? baseValue;
}

function buildResolutionChoices(visibleOptions: Array<string | number>) {
  // Prefer the first raw option per display label, since some models include suffixes like "2K（推荐）".
  const choices = new Map<string, string | number>();
  for (const opt of visibleOptions) {
    const label = formatControlValue("resolution", opt);
    if (!label || !RESOLUTION_ALLOWED.has(label)) continue;
    if (!choices.has(label)) choices.set(label, opt);
  }
  return RESOLUTION_LABEL_ORDER.filter((label) => choices.has(label)).map((label) => ({
    label,
    value: choices.get(label)!,
  }));
}

function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return fallback;
    if (["1", "true", "yes", "y", "on"].includes(v)) return true;
    if (["0", "false", "no", "n", "off"].includes(v)) return false;
  }
  return Boolean(value);
}

export default function DoubaoImageCreatorResolutionAspectButton({
  data,
  resolutionConfig,
  aspectRatioConfig,
  disabled = false,
  widthClass,
}: ResolutionAspectButtonProps) {
  const { handleOnNewValue: handleResolutionChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "resolution",
  });
  const { handleOnNewValue: handleAspectRatioChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "aspect_ratio",
  });
  const { handleOnNewValue: handleViduIsRecChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "vidu_is_rec",
  });
  const { handleOnNewValue: handleViduAudioChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "vidu_audio",
  });
  const { handleOnNewValue: handleMultiTurnChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "enable_multi_turn",
  });
  const { handleOnNewValue: handleOnlineSearchChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "enable_google_search",
  });
  const { handleOnNewValue: handleKlingO3SeriesModeChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "kling_o3_series_mode",
  });

  const template: any = (data.node as any)?.template ?? {};
  const modelRaw = String(template?.model_name?.value ?? template?.model_name?.default ?? "")
    .trim()
    .toLowerCase();
  const isKlingO3 = modelRaw === "kling o3";
  const isVidu = modelRaw.startsWith("vidu");
  const isNanoBanana2 = modelRaw === "nano banana 2";
  const isNanoBananaPro = modelRaw === "nano banana pro";
  const isLegacyNanoBanana = modelRaw === "nano banana";
  const supportsGeminiFeatureButtons = isNanoBanana2 || isNanoBananaPro || isLegacyNanoBanana;
  const klingO3SeriesField = template?.kling_o3_series_mode ?? null;
  const klingO3SeriesEnabled = parseBool(klingO3SeriesField?.value, false);
  const imageCountValue = (() => {
    const raw = template?.image_count?.value;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  const viduIsRecField = template?.vidu_is_rec ?? null;
  const viduAudioField = template?.vidu_audio ?? null;
  const viduIsRecValue = Boolean(viduIsRecField?.value ?? viduIsRecField?.default ?? false);
  const viduAudioValue = Boolean(viduAudioField?.value ?? viduAudioField?.default ?? true);
  const multiTurnField = template?.enable_multi_turn ?? null;
  const onlineSearchField = template?.enable_google_search ?? null;
  const multiTurnFieldVisible = Boolean(multiTurnField && multiTurnField.show !== false);
  const onlineSearchFieldVisible = Boolean(onlineSearchField && onlineSearchField.show !== false);
  const multiTurnEnabled = parseBool(multiTurnField?.value ?? multiTurnField?.default ?? false, false);
  const onlineSearchEnabled = parseBool(
    onlineSearchField?.value ?? onlineSearchField?.default ?? false,
    false,
  );

  const firstFrameField = template?.first_frame_image ?? null;
  const hasFirstFrame = (() => {
    const values = firstFrameField?.value;
    const filePaths = firstFrameField?.file_path;
    const anyNonEmpty = (v: any) => {
      if (v === undefined || v === null) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (typeof v === "object") {
        const maybeUrl = v?.url ?? v?.image_url ?? v?.value;
        if (typeof maybeUrl === "string" && maybeUrl.trim()) return true;
      }
      return false;
    };
    if (Array.isArray(values) && values.some(anyNonEmpty)) return true;
    if (anyNonEmpty(values)) return true;
    if (Array.isArray(filePaths) && filePaths.some(anyNonEmpty)) return true;
    if (anyNonEmpty(filePaths)) return true;
    return false;
  })();

  const resolution = useMemo(() => buildVisibleOptions(resolutionConfig), [resolutionConfig]);
  const aspectRatio = useMemo(() => buildVisibleOptions(aspectRatioConfig), [aspectRatioConfig]);

  // Keep values valid when model or other constraints change (mirrors DoubaoParameterButton behavior).
  useEffect(() => {
    if (!resolution.visible.length) return;
    const stored = resolutionConfig.template?.value ?? resolutionConfig.value;
    const storedString = stored === undefined || stored === null ? "" : String(stored);
    if (!storedString) return;
    if (resolution.enabledSet.has(storedString)) return;
    handleResolutionChange({ value: resolution.visible[0] }, { skipSnapshot: true });
  }, [
    handleResolutionChange,
    resolution.enabledSet,
    resolution.visible,
    resolutionConfig.template?.value,
    resolutionConfig.value,
  ]);

  useEffect(() => {
    if (!aspectRatio.visible.length) return;
    const stored = aspectRatioConfig.template?.value ?? aspectRatioConfig.value;
    const storedString = stored === undefined || stored === null ? "" : String(stored);
    if (!storedString) return;
    if (aspectRatio.enabledSet.has(storedString)) return;
    handleAspectRatioChange({ value: aspectRatio.visible[0] }, { skipSnapshot: true });
  }, [
    aspectRatio.enabledSet,
    aspectRatio.visible,
    aspectRatioConfig.template?.value,
    aspectRatioConfig.value,
    handleAspectRatioChange,
  ]);

  const effectiveResolutionValue = useMemo(
    () => resolveEffectiveValue(resolutionConfig, resolution.visible, resolution.enabledSet),
    [resolutionConfig, resolution.enabledSet, resolution.visible],
  );
  const effectiveAspectRatioValue = useMemo(
    () => resolveEffectiveValue(aspectRatioConfig, aspectRatio.visible, aspectRatio.enabledSet),
    [aspectRatioConfig, aspectRatio.enabledSet, aspectRatio.visible],
  );

  const resolutionLabelRaw = formatControlValue("resolution", effectiveResolutionValue);
  const resolutionLabel = resolutionLabelRaw;
  const aspectRatioLabel = formatControlValue("aspect_ratio", effectiveAspectRatioValue);
  const triggerLabel =
    aspectRatioLabel && resolutionLabel
      ? `${aspectRatioLabel} · ${resolutionLabel}`
      : aspectRatioLabel || resolutionLabel || "未选择";

  const resolutionChoices = useMemo(
    () => buildResolutionChoices(resolution.visible),
    [resolution.visible],
  );
  const currentResolutionLabel = formatControlValue(
    "resolution",
    resolutionConfig.value ?? resolutionConfig.template?.value,
  );

  const aspectOptionsRaw = aspectRatio.visible.map((opt) => {
    const raw = String(opt);
    const iconRatio = parseAspectRatio(raw);
    const label = formatControlValue("aspect_ratio", opt);
    const isAdaptive = raw.trim().toLowerCase() === "adaptive";
    return { opt, raw, label, iconRatio, isAdaptive };
  });
  // Match the reference layout: "自适应" stays at the far-left and occupies two rows.
  const aspectOptions = [
    ...aspectOptionsRaw.filter((opt) => opt.isAdaptive),
    ...aspectOptionsRaw.filter((opt) => !opt.isAdaptive),
  ];
  const currentAspectRaw = String(aspectRatioConfig.value ?? aspectRatioConfig.template?.value ?? "");

  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ShadTooltip
        content={<span className="text-xs">画面参数</span>}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => {
              // Keep tooltip hover-only behavior; avoid focus "sticking" after interactions.
              event.preventDefault();
            }}
            className={cn(
              "flex h-11 flex-none items-center justify-between rounded-full border border-[#E0E5F6] bg-[#F4F6FB] px-4 text-left text-sm font-medium text-[#2E3150] dark:border-white/15 dark:bg-white/10 dark:text-white",
              disabled && "cursor-not-allowed opacity-60",
              widthClass ?? "basis-[150px]",
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <ForwardedIconComponent
                name={aspectRatioConfig.icon ?? "Square"}
                className="h-4 w-4 text-[#7D85A8] dark:text-slate-300"
              />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ForwardedIconComponent
              name="ChevronDown"
              className={cn(
                "h-4 w-4 flex-shrink-0 text-[#8D94B3] transition-transform duration-200 ease-out dark:text-slate-400",
                open && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>
      </ShadTooltip>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className={cn(
          "noflow nowheel nopan nodelete nodrag",
          "z-[10000]",
          "w-[440px] rounded-[24px] border border-[#E6E9F4] bg-white p-5 shadow-[0_25px_50px_rgba(15,23,42,0.15)]",
          "dark:border-white/20 dark:bg-neutral-800/90 dark:backdrop-blur-2xl dark:shadow-[0_25px_50px_rgba(0,0,0,0.35)]",
        )}
        onCloseAutoFocus={(event) => {
          // Avoid restoring focus to the trigger; keeps tooltips from opening on focus.
          event.preventDefault();
        }}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
              画质
            </div>
            <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
              <div className="flex gap-1">
                {resolutionChoices.map(({ label, value }) => {
                  const selected = currentResolutionLabel === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        handleResolutionChange({ value });
                      }}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                        selected
                          ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                          : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
              比例
            </div>
            <div className="grid grid-flow-row-dense grid-cols-5 gap-2 auto-rows-[58px]">
              {aspectOptions.map(({ opt, raw, label, iconRatio, isAdaptive }) => {
                const selected = raw === currentAspectRaw;
                const boxSize = 18;
                let w = boxSize;
                let h = boxSize;
                if (iconRatio) {
                  if (iconRatio.w >= iconRatio.h) {
                    w = boxSize;
                    h = Math.max(6, Math.round((boxSize * iconRatio.h) / iconRatio.w));
                  } else {
                    h = boxSize;
                    w = Math.max(6, Math.round((boxSize * iconRatio.w) / iconRatio.h));
                  }
                }
                return (
                  <button
                    key={raw}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      handleAspectRatioChange({ value: opt });
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-[14px] px-2 py-2 text-xs transition",
                      "bg-[#F4F6FB] text-[#2E3150] hover:bg-[#E9EEFF] dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/15",
                      selected && "ring-2 ring-[#2E7BFF] dark:ring-[#6AA6FF]",
                      isAdaptive && "row-span-2",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {iconRatio ? (
                      <div
                        className="rounded-[3px] border border-current opacity-70"
                        style={{ width: `${w}px`, height: `${h}px` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <div
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border border-dashed border-current opacity-70"
                        aria-hidden="true"
                      />
                    )}
                    <div className="leading-none">{label}</div>
                  </button>
                );
              })}
            </div>

            {isKlingO3 && klingO3SeriesField && (
              <div
                className={cn(
                  "mt-3 flex items-center justify-between rounded-[14px] bg-[#F4F6FB] px-4 py-3 dark:bg-white/10",
                  disabled && "opacity-70",
                )}
              >
                <ShadTooltip
                  content={
                    <span className="whitespace-pre-wrap text-xs">
                      {"组图模式（result_type=series）：使用 series_amount=生成张数。\n关闭则为单图模式（result_type=single）：使用 n=生成张数。"}
                    </span>
                  }
                >
                  <div className="min-w-0 pr-3">
                    <div className="truncate text-sm font-medium text-[#2E3150] dark:text-white/90">
                      组图模式
                    </div>
                    <div className="truncate text-xs text-[#7D85A8] dark:text-slate-300">
                      {imageCountValue > 1 ? (klingO3SeriesEnabled ? "已开启" : "已关闭") : "生成张数需 ≥ 2"}
                    </div>
                  </div>
                </ShadTooltip>
                <Switch
                  checked={klingO3SeriesEnabled}
                  disabled={disabled || imageCountValue < 2}
                  onCheckedChange={(next) => {
                    if (disabled || imageCountValue < 2) return;
                    handleKlingO3SeriesModeChange({ value: next });
                  }}
                />
              </div>
            )}
          </div>

          {(multiTurnFieldVisible || onlineSearchFieldVisible) && (
            <div className="space-y-4">
              {supportsGeminiFeatureButtons && multiTurnFieldVisible && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                    多轮对话
                    <ShadTooltip content="开启：自动带上历史；关闭：单轮生成。">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[11px] opacity-60">
                        ?
                      </span>
                    </ShadTooltip>
                  </div>
                  <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          handleMultiTurnChange({ value: true });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          multiTurnEnabled
                            ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                            : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        开启
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          handleMultiTurnChange({ value: false });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          !multiTurnEnabled
                            ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                            : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {onlineSearchFieldVisible && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                    联网搜索
                    <ShadTooltip content="开启：允许联网搜索；关闭：不联网。">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[11px] opacity-60">
                        ?
                      </span>
                    </ShadTooltip>
                  </div>
                  <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          handleOnlineSearchChange({ value: true });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          onlineSearchEnabled
                            ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                            : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        开启
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          handleOnlineSearchChange({ value: false });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          !onlineSearchEnabled
                            ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                            : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isVidu && (viduIsRecField || viduAudioField) && (
            <div className="space-y-3 border-t border-[#E6E9F4] pt-4 dark:border-white/10">
              <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
                生成配置
              </div>

              {viduIsRecField && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-[14px] bg-[#F4F6FB] px-4 py-3 dark:bg-white/10",
                    (disabled || !hasFirstFrame) && "opacity-70",
                  )}
                >
                  <ShadTooltip
                    content={
                      <span className="whitespace-pre-wrap text-xs">
                        {String(viduIsRecField?.info || "仅 Vidu 图生视频（img2video）生效，需要先上传首帧图。")}
                      </span>
                    }
                  >
                    <div className="min-w-0 pr-3">
                      <div className="truncate text-sm font-medium text-[#2E3150] dark:text-white/90">
                        {String(viduIsRecField?.display_name || "推荐提示词")}
                      </div>
                      <div className="truncate text-xs text-[#7D85A8] dark:text-slate-300">
                        {hasFirstFrame ? "仅图生视频生效（将忽略 prompt）" : "需要先上传首帧图"}
                      </div>
                    </div>
                  </ShadTooltip>
                  <Switch
                    checked={viduIsRecValue}
                    disabled={disabled || !hasFirstFrame}
                    onCheckedChange={(next) => {
                      if (disabled || !hasFirstFrame) return;
                      handleViduIsRecChange({ value: next });
                    }}
                  />
                </div>
              )}

              {viduAudioField && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-[14px] bg-[#F4F6FB] px-4 py-3 dark:bg-white/10",
                    disabled && "opacity-70",
                  )}
                >
                  <ShadTooltip
                    content={
                      <span className="whitespace-pre-wrap text-xs">
                        {String(viduAudioField?.info || "是否输出带音频的视频。")}
                      </span>
                    }
                  >
                    <div className="min-w-0 pr-3">
                      <div className="truncate text-sm font-medium text-[#2E3150] dark:text-white/90">
                        {String(viduAudioField?.display_name || "生成音频")}
                      </div>
                      <div className="truncate text-xs text-[#7D85A8] dark:text-slate-300">
                        {viduAudioValue ? "输出带音频" : "输出静音视频"}
                      </div>
                    </div>
                  </ShadTooltip>
                  <Switch
                    checked={viduAudioValue}
                    disabled={disabled}
                    onCheckedChange={(next) => {
                      if (disabled) return;
                      handleViduAudioChange({ value: next });
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
