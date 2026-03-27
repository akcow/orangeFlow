import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";
import { formatControlValue, type DoubaoControlConfig } from "./DoubaoParameterButton";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useUpdateNodeInternals } from "@xyflow/react";

type Props = {
  data: NodeDataType;
  generationModeConfig?: DoubaoControlConfig | null;
  onGenerationModeSelect?: (value: string | number) => void;
  aspectRatioConfig?: DoubaoControlConfig | null;
  resolutionConfig?: DoubaoControlConfig | null;
  durationConfig?: DoubaoControlConfig | null;
  enableAudioField?: any; // template.enable_audio (BoolInput)
  showAudioToggle?: boolean;
  disabled?: boolean;
  widthClass?: string;
};

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

function buildOptionSets(config?: DoubaoControlConfig | null) {
  const options = config?.options ?? [];
  const disabledSet = new Set((config?.disabledOptions ?? []).map((opt) => String(opt)));
  const visible = options.filter((opt) => !disabledSet.has(String(opt)));
  return { visible, enabledSet: new Set(visible.map((opt) => String(opt))), disabledSet };
}

function resolveEffectiveValue(
  config?: DoubaoControlConfig | null,
  visible: any[] = [],
  enabledSet?: Set<string>,
) {
  if (!config) return undefined;
  const baseValue = config.value ?? config.template?.value;
  const baseString = baseValue === undefined || baseValue === null ? "" : String(baseValue);
  if (!baseString) return baseValue;
  if (baseString && enabledSet?.has(baseString)) return baseValue;
  return visible[0] ?? baseValue;
}

function formatGenerationModeLabel(value: unknown): string {
  const labels: Record<string, string> = {
    text: "文生视频",
    first_frame: "首帧",
    first_last_frame: "首尾帧",
    reference_image: "参考",
    reference_video: "参考视频",
    video_edit: "视频编辑",
  };
  const key = String(value ?? "").trim();
  return labels[key] ?? key;
}

export default function DoubaoVideoGeneratorResolutionAspectDurationButton({
  data,
  generationModeConfig,
  onGenerationModeSelect,
  aspectRatioConfig,
  resolutionConfig,
  durationConfig,
  enableAudioField,
  showAudioToggle = false,
  disabled = false,
  widthClass,
}: Props) {
  const { handleOnNewValue: handleGenerationModeChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "generation_mode",
  });
  const { handleOnNewValue: handleAspectRatioChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "aspect_ratio",
  });
  const { handleOnNewValue: handleResolutionChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "resolution",
  });
  const { handleOnNewValue: handleDurationChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "duration",
  });
  const { handleOnNewValue: handleEnableAudioChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "enable_audio",
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
  const { handleOnNewValue: handleKlingShotTypeChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: "kling_shot_type",
  });

  const setNode = useFlowStore((state) => state.setNode);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const updateNodeInternals = useUpdateNodeInternals();

  const template: any = (data.node as any)?.template ?? {};
  const modelRaw = String(template?.model_name?.value ?? template?.model_name?.default ?? "")
    .trim()
    .toLowerCase();
  const isVidu = modelRaw.startsWith("vidu");
  const isKlingO3 = modelRaw === "kling o3" || modelRaw === "kling-v3-omni";
  const isKlingV3 = modelRaw === "kling v3" || modelRaw === "kling-v3";
  const isKlingMultiShotModel = isKlingO3 || isKlingV3;
  const klingMultiShotField = template?.kling_multi_shot ?? null;
  const klingShotTypeField = template?.kling_shot_type ?? null;
  const klingMultiShotEnabled = useMemo(() => {
    const raw = klingMultiShotField?.value ?? klingMultiShotField?.default ?? false;
    if (raw === true) return true;
    if (raw === false) return false;
    const s = String(raw).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }, [klingMultiShotField?.default, klingMultiShotField?.value]);
  const klingShotType = useMemo(() => {
    const raw = klingShotTypeField?.value ?? klingShotTypeField?.default ?? "";
    const s = String(raw ?? "").trim().toLowerCase();
    if (s === "customize" || s === "intelligence") return s;
    return "intelligence";
  }, [klingShotTypeField?.default, klingShotTypeField?.value]);

  // NOTE: We update both kling_multi_shot and kling_shot_type in a single state write.
  // Using useHandleOnNewValue twice in one click will race on stale `node` props and can
  // end up overwriting the first change (making the toggle look "not working").
  const applyKlingMultiShot = (enabled: boolean) => {
    takeSnapshot();
    setNode(
      data.id,
      (oldNode) => {
        const current = (oldNode.data as any)?.node ?? {};
        const currentTemplate = (current.template ?? {}) as any;
        const nextTemplate: any = { ...currentTemplate };

        const existingMultiShot = nextTemplate.kling_multi_shot ?? { name: "kling_multi_shot" };
        nextTemplate.kling_multi_shot = { ...existingMultiShot, value: enabled };

        if (enabled) {
          const existingShotType = nextTemplate.kling_shot_type ?? { name: "kling_shot_type" };
          nextTemplate.kling_shot_type = { ...existingShotType, value: "intelligence" };
        }

        const nextNodeClass = { ...current, template: nextTemplate };
        return {
          ...oldNode,
          data: { ...(oldNode.data as any), node: nextNodeClass },
        } as any;
      },
      true,
      () => updateNodeInternals(data.id),
    );
  };
  const selectedGenerationMode = useMemo(() => {
    const raw = generationModeConfig?.value ?? generationModeConfig?.template?.value ?? "";
    return String(raw ?? "").trim() || "text";
  }, [
    generationModeConfig?.value,
    generationModeConfig?.template?.value,
  ]);
  const isText2VideoMode = Boolean(isVidu && selectedGenerationMode === "text");
  const isReferenceVideoMode = Boolean(isVidu && selectedGenerationMode === "reference_video");
  const shouldLockAspectToAdaptive = Boolean(
    isVidu &&
      (selectedGenerationMode === "first_frame" ||
        selectedGenerationMode === "first_last_frame"),
  );
  const viduIsRecField = template?.vidu_is_rec ?? null;
  const viduAudioField = template?.vidu_audio ?? null;
  const viduIsRecValue = Boolean(viduIsRecField?.value ?? viduIsRecField?.default ?? false);
  const viduAudioValue = Boolean(viduAudioField?.value ?? viduAudioField?.default ?? true);

  const generationMode = useMemo(
    () => buildOptionSets(generationModeConfig),
    [generationModeConfig],
  );
  const aspectRatio = useMemo(() => {
    const base = buildOptionSets(aspectRatioConfig);
    if (!isVidu) return base;

    if (shouldLockAspectToAdaptive) {
      const visible = ["adaptive"];
      return { visible, enabledSet: new Set(visible), disabledSet: new Set<string>() };
    }

    if (isReferenceVideoMode || isText2VideoMode) {
      const visible = ["16:9", "9:16", "4:3", "3:4", "1:1"];
      return { visible, enabledSet: new Set(visible), disabledSet: new Set<string>() };
    }

    return base;
  }, [aspectRatioConfig, isReferenceVideoMode, isText2VideoMode, isVidu, shouldLockAspectToAdaptive]);
  const resolution = useMemo(() => buildOptionSets(resolutionConfig), [resolutionConfig]);
  const duration = useMemo(() => buildOptionSets(durationConfig), [durationConfig]);

  const effectiveGenerationModeValue = useMemo(
    () => resolveEffectiveValue(generationModeConfig, generationMode.visible, generationMode.enabledSet),
    [generationMode.enabledSet, generationMode.visible, generationModeConfig],
  );
  const effectiveAspectRatioValue = useMemo(
    () => resolveEffectiveValue(aspectRatioConfig, aspectRatio.visible, aspectRatio.enabledSet),
    [aspectRatioConfig, aspectRatio.enabledSet, aspectRatio.visible],
  );
  const effectiveResolutionValue = useMemo(
    () => resolveEffectiveValue(resolutionConfig, resolution.visible, resolution.enabledSet),
    [resolutionConfig, resolution.enabledSet, resolution.visible],
  );
  const effectiveDurationValue = useMemo(
    () => resolveEffectiveValue(durationConfig, duration.visible, duration.enabledSet),
    [durationConfig, duration.enabledSet, duration.visible],
  );

  const aspectRatioLabel =
    shouldLockAspectToAdaptive
      ? "自适应"
      : aspectRatioConfig
        ? formatControlValue("aspect_ratio", effectiveAspectRatioValue)
        : "";
  const generationModeLabel = generationModeConfig
    ? formatGenerationModeLabel(effectiveGenerationModeValue)
    : "";
  const resolutionLabel = resolutionConfig
    ? formatControlValue("resolution", effectiveResolutionValue)
    : "";
  const durationLabel = durationConfig
    ? formatControlValue("duration", effectiveDurationValue)
    : "";

  const audioEnabled = Boolean(enableAudioField?.value ?? enableAudioField?.default ?? true);

  const triggerLabel = [generationModeLabel, aspectRatioLabel, resolutionLabel, durationLabel]
    .filter(Boolean)
    .join(" · ") || "未选择";

  const [open, setOpen] = useState(false);

  const aspectOptionsRaw = aspectRatioConfig
    ? aspectRatio.visible.map((opt) => {
        const raw = String(opt);
        return {
          raw,
          opt,
          label: formatControlValue("aspect_ratio", opt),
          ratio: parseAspectRatio(raw),
          isAdaptive: raw.trim().toLowerCase() === "adaptive",
        };
      })
    : [];
  // Match the image creator layout: "自适应" stays at the far-left and occupies two rows when present.
  const aspectOptions = [
    ...aspectOptionsRaw.filter((opt) => opt.isAdaptive),
    ...aspectOptionsRaw.filter((opt) => !opt.isAdaptive),
  ];
  const currentAspectRaw = String(effectiveAspectRatioValue ?? "");

  const resolutionOptions = resolutionConfig
    ? resolution.visible.map((opt) => ({
        raw: String(opt),
        opt,
        label: formatControlValue("resolution", opt),
      }))
    : [];
  const currentResolutionRaw = String(effectiveResolutionValue ?? "");

  const durationOptions = durationConfig
    ? duration.visible
        .map((opt) => Number(opt))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
    : [];
  const currentDuration = Number(effectiveDurationValue ?? "");

  const supportsAudioUi = showAudioToggle && enableAudioField;
  const supportsViduRecUi = Boolean(
    isVidu && selectedGenerationMode === "first_frame" && Boolean(viduIsRecField),
  );
  // Requirement: hide Vidu audio toggle in text2video mode.
  const supportsViduAudioUi = Boolean(
    isVidu &&
      (selectedGenerationMode === "first_frame" || selectedGenerationMode === "first_last_frame") &&
      Boolean(viduAudioField),
  );
  const showAudioIcon = supportsAudioUi || supportsViduAudioUi;
  const audioIconEnabled = supportsAudioUi ? audioEnabled : viduAudioValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ShadTooltip content={<span className="text-xs">生成参数</span>}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            className={cn(
              "flex h-11 flex-none items-center justify-between rounded-full border border-[#E0E5F6] bg-[#F4F6FB] px-4 text-left text-sm font-medium text-[#2E3150] dark:border-white/15 dark:bg-white/10 dark:text-white",
              disabled && "cursor-not-allowed opacity-60",
              widthClass ?? "basis-[260px]",
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <ForwardedIconComponent
                name="RectangleHorizontal"
                className="h-4 w-4 text-[#7D85A8] dark:text-slate-300"
              />
              <span className="truncate">{triggerLabel}</span>
              {showAudioIcon && (
                <span className="relative inline-flex items-center justify-center text-[#7D85A8] dark:text-slate-300">
                  <ForwardedIconComponent
                    name="Music"
                    className={cn(
                      "h-4 w-4 flex-shrink-0 transition-opacity duration-200 ease-out",
                      !audioIconEnabled && "opacity-80",
                    )}
                  />
                  {/* When audio is disabled, show an animated diagonal slash (top-left -> bottom-right). */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45"
                  >
                    <span
                      className={cn(
                        "block h-[2px] w-[18px] rounded-full bg-current transition-[transform,opacity] duration-400 ease-out will-change-transform",
                        audioIconEnabled ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100",
                      )}
                      style={{ transformOrigin: "left" }}
                    />
                  </span>
                </span>
              )}
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
          "w-[460px] rounded-[24px] border border-[#E6E9F4] bg-white p-5 shadow-[0_25px_50px_rgba(15,23,42,0.15)]",
          "dark:border-white/20 dark:bg-neutral-800/90 dark:backdrop-blur-2xl dark:shadow-[0_25px_50px_rgba(0,0,0,0.35)]",
        )}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div className="space-y-4">
          {generationModeConfig && generationMode.visible.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
                生成方式
              </div>
              <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(generationMode.visible.length, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {generationMode.visible.map((opt) => {
                    const raw = String(opt);
                    const selected = raw === String(effectiveGenerationModeValue ?? "");
                    return (
                      <button
                        key={raw}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          if (onGenerationModeSelect) {
                            onGenerationModeSelect(opt);
                            return;
                          }
                          handleGenerationModeChange({ value: opt });
                        }}
                        className={cn(
                          "min-w-0 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          selected
                            ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                            : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {formatGenerationModeLabel(opt)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {aspectRatioConfig && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
                比例
              </div>
              {shouldLockAspectToAdaptive ? (
                <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                        "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]",
                      )}
                    >
                      自适应
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-flow-row-dense grid-cols-5 gap-2 auto-rows-[58px]">
                  {aspectOptions.map(({ raw, opt, label, ratio, isAdaptive }) => {
                    const selected = raw === currentAspectRaw;
                    const boxSize = 18;
                    let w = boxSize;
                    let h = boxSize;
                    if (ratio) {
                      if (ratio.w >= ratio.h) {
                        w = boxSize;
                        h = Math.max(6, Math.round((boxSize * ratio.h) / ratio.w));
                      } else {
                        h = boxSize;
                        w = Math.max(6, Math.round((boxSize * ratio.w) / ratio.h));
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
                        {ratio ? (
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
              )}
            </div>
          )}

          {(supportsViduRecUi || supportsViduAudioUi) && (
            <div className="space-y-3">
              {supportsViduRecUi && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                    推荐提示词
                    <ShadTooltip content="开启后将忽略自定义 prompt，由系统自动推荐提示词（仅图生视频）。">
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
                          handleViduIsRecChange({ value: true });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          viduIsRecValue
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
                          handleViduIsRecChange({ value: false });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          !viduIsRecValue
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

              {supportsViduAudioUi && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                    生成音频
                    <ShadTooltip content="Vidu：开启=输出带台词/背景音；关闭=输出静音视频。">
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
                          handleViduAudioChange({ value: true });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          viduAudioValue
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
                          handleViduAudioChange({ value: false });
                        }}
                        className={cn(
                          "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          !viduAudioValue
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

          {resolutionConfig && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
                清晰度
              </div>
              <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
                <div className="flex gap-1">
                  {resolutionOptions.map(({ raw, opt, label }) => {
                  const selected = raw === currentResolutionRaw;
                  return (
                    <button
                      key={raw}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        handleResolutionChange({ value: opt });
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
          )}

          {durationConfig && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[#2E3150] dark:text-white/90">
                生成时长
              </div>
              <div className="rounded-[18px] bg-[#EEF2FF] p-1 dark:bg-white/10">
                <div
                  className={cn(
                    durationOptions.length > 3
                      ? "grid grid-flow-row-dense grid-cols-5 gap-1"
                      : "flex gap-1",
                    // Seedance supports many durations; avoid horizontal overflow.
                    durationOptions.length > 10 && "max-h-[160px] overflow-y-auto pr-1",
                  )}
                >
                  {durationOptions.map((option) => {
                    const selected = Number.isFinite(currentDuration) && option === currentDuration;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          handleDurationChange({ value: option });
                        }}
                        className={cn(
                          durationOptions.length > 3
                            ? "w-full rounded-[14px] px-2 py-2 text-center text-sm font-medium transition"
                            : "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                          selected
                            ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                            : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {formatControlValue("duration", option)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {supportsAudioUi && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                生成音频
                <ShadTooltip content="仅部分模型支持。Seedance 1.5 pro：开启/关闭=是否生成音频；Wan 2.5/2.6：开启=自动配音/或使用上游音频；关闭=强制静音。">
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
                      handleEnableAudioChange({ value: true });
                    }}
                    className={cn(
                      "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                      audioEnabled
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
                      handleEnableAudioChange({ value: false });
                    }}
                    className={cn(
                      "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                      !audioEnabled
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

          {isKlingMultiShotModel && klingMultiShotField && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                多镜头模式
                <ShadTooltip content="kling O3/V3：开启后为多镜头模式；可选“智能分镜”（用 prompt）或“自定义分镜”（用 multi_prompt）。自定义分镜时长之和需等于总时长。">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[11px] opacity-60">
                    ?
                  </span>
                </ShadTooltip>
              </div>
              <div className="space-y-2">
                <div className="rounded-full bg-[#EEF2FF] p-1 dark:bg-white/10">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        applyKlingMultiShot(true);
                      }}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                        klingMultiShotEnabled
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
                        applyKlingMultiShot(false);
                      }}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                        !klingMultiShotEnabled
                          ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                          : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      关闭
                    </button>
                  </div>
                </div>
                <div className="text-xs text-[#5E6484] dark:text-slate-300">
                  关闭=单镜头（使用 prompt）；开启=多镜头（支持智能分镜/自定义分镜）。
                </div>
              </div>
              {klingMultiShotEnabled && klingShotTypeField && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#2E3150] dark:text-white/90">
                    {"\u5206\u955c\u65b9\u5f0f"}
                  </div>
                  <div className="flex rounded-full bg-white/70 p-1 dark:bg-white/10">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        handleKlingShotTypeChange({ value: "intelligence" });
                      }}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                        klingShotType === "intelligence"
                          ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                          : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {"\u667a\u80fd\u5206\u955c"}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        handleKlingShotTypeChange({ value: "customize" });
                      }}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-center text-sm font-medium transition",
                        klingShotType === "customize"
                          ? "bg-[#2E7BFF] text-white shadow-[0_10px_20px_rgba(46,123,255,0.25)]"
                          : "text-[#2E3150] hover:bg-white/70 dark:text-white/90 dark:hover:bg-white/10",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {"\u81ea\u5b9a\u4e49\u5206\u955c"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
