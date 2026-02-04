import { Popover, PopoverContentWithoutPortal, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";
import {
  formatControlValue,
  type DoubaoControlConfig,
} from "./DoubaoParameterButton";

type ResolutionAspectButtonProps = {
  data: NodeDataType;
  resolutionConfig: DoubaoControlConfig;
  aspectRatioConfig: DoubaoControlConfig;
  isNanoBanana?: boolean;
  disabled?: boolean;
  widthClass?: string;
};

const RESOLUTION_LABEL_ORDER = ["1K", "2K", "4K", "Auto"] as const;
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
    hasDisabledOptions: Boolean(config.disabledOptions?.length),
    disabledSet,
  };
}

function resolveEffectiveValue(config: DoubaoControlConfig, visible: any[], enabledSet: Set<string>) {
  const baseValue = config.value ?? config.template?.value;
  const baseString = baseValue === undefined || baseValue === null ? "" : String(baseValue);
  if (!config.disabledOptions?.length) return baseValue;
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

export default function DoubaoImageCreatorResolutionAspectButton({
  data,
  resolutionConfig,
  aspectRatioConfig,
  isNanoBanana = false,
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

  const resolution = useMemo(() => buildVisibleOptions(resolutionConfig), [resolutionConfig]);
  const aspectRatio = useMemo(() => buildVisibleOptions(aspectRatioConfig), [aspectRatioConfig]);

  // Keep values valid when model or other constraints change (mirrors DoubaoParameterButton behavior).
  useEffect(() => {
    if (!resolution.hasDisabledOptions) return;
    if (!resolution.visible.length) return;
    const stored = resolutionConfig.template?.value ?? resolutionConfig.value;
    const storedString = stored === undefined || stored === null ? "" : String(stored);
    if (!storedString) return;
    if (resolution.enabledSet.has(storedString)) return;
    handleResolutionChange({ value: resolution.visible[0] }, { skipSnapshot: true });
  }, [
    handleResolutionChange,
    resolution.enabledSet,
    resolution.hasDisabledOptions,
    resolution.visible,
    resolutionConfig.template?.value,
    resolutionConfig.value,
  ]);

  useEffect(() => {
    if (!aspectRatio.hasDisabledOptions) return;
    if (!aspectRatio.visible.length) return;
    const stored = aspectRatioConfig.template?.value ?? aspectRatioConfig.value;
    const storedString = stored === undefined || stored === null ? "" : String(stored);
    if (!storedString) return;
    if (aspectRatio.enabledSet.has(storedString)) return;
    handleAspectRatioChange({ value: aspectRatio.visible[0] }, { skipSnapshot: true });
  }, [
    aspectRatio.enabledSet,
    aspectRatio.hasDisabledOptions,
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
  const resolutionLabel =
    isNanoBanana && resolutionLabelRaw === "Auto" ? "Auto(1K)" : resolutionLabelRaw;
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

      <PopoverContentWithoutPortal
        side="top"
        align="start"
        sideOffset={10}
        className={cn(
          "noflow nowheel nopan nodelete nodrag",
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
                      {isNanoBanana && label === "Auto" ? "Auto(1K)" : label}
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
          </div>
        </div>
      </PopoverContentWithoutPortal>
    </Popover>
  );
}
