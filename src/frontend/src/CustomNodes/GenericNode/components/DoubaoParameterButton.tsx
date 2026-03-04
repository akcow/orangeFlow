import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import type { handleOnNewValueType } from "../../hooks/use-handle-new-value";

export type DoubaoControlConfig = {
  name: string;
  icon: string;
  options: Array<string | number>;
  template: any;
  value: any;
  widthClass?: string;
  tooltip?: string;
  disabledOptions?: Array<string | number>;
  footer?: ReactNode;
  handleOnNewValueOptions?: (
    nextValue: string | number,
  ) => Parameters<handleOnNewValueType>[1];
};

export const DOUBAO_CONFIG_TOOLTIP = "参数选择说明";

export const DOUBAO_CONTROL_HINTS: Record<string, string> = {
  model_name: "模型类型选择",
  resolution: "画面清晰度",
  aspect_ratio: "画面宽高比",
  image_count: "生成张数",
  duration: "视频生成时长",
  voice_type: "音色风格选择",
};

export function DoubaoParameterButton({
  data,
  config,
}: {
  data: NodeDataType;
  config: DoubaoControlConfig;
}) {
  const { name, icon, options, template, value, widthClass, tooltip, disabledOptions, footer } = config;
  const [open, setOpen] = useState(false);
  const { handleOnNewValue } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name,
  });

  // Radix Tooltip opens on focus by default. After selecting a dropdown option, focus returns
  // to the trigger button, which can leave the tooltip "stuck" visible. We explicitly blur
  // on close/selection so the tooltip behaves like hover-only in this interaction.
  const blurActiveElement = () => {
    if (typeof document === "undefined") return;
    const el = document.activeElement;
    if (el && el instanceof HTMLElement) el.blur();
  };

  const disabledOptionSet = useMemo(() => {
    return new Set((disabledOptions ?? []).map((option) => String(option)));
  }, [disabledOptions]);
  const optionsMeta = useMemo(() => {
    return Array.isArray(template?.options_metadata) ? template.options_metadata : [];
  }, [template?.options_metadata]);
  const visibleOptions = useMemo(() => {
    return options
      .map((option, index) => ({
        option,
        meta: optionsMeta[index],
      }))
      .filter(({ option }) => !disabledOptionSet.has(String(option)));
  }, [options, optionsMeta, disabledOptionSet]);
  const enabledOptionStrings = useMemo(() => {
    return new Set(visibleOptions.map(({ option }) => String(option)));
  }, [visibleOptions]);
  const displayBaseValue = value ?? template?.value;
  const storedValue = template?.value ?? value;
  const displayValueString =
    displayBaseValue === undefined || displayBaseValue === null
      ? ""
      : String(displayBaseValue);
  const storedValueString =
    storedValue === undefined || storedValue === null ? "" : String(storedValue);
  const hasDisabledOptions = Boolean(disabledOptions?.length);
  const effectiveValue =
    hasDisabledOptions && !enabledOptionStrings.has(displayValueString)
      ? visibleOptions[0]?.option ?? displayBaseValue
      : displayBaseValue;
  const displayValue = formatControlValue(name, effectiveValue);

  const handleSelect = (nextValue: string) => {
    if (disabledOptionSet.has(nextValue)) return;
    const parsed =
      typeof template.value === "number" ? Number(nextValue) : nextValue;
    handleOnNewValue(
      { value: parsed },
      config.handleOnNewValueOptions?.(parsed),
    );
    // Defer so we run after Radix closes the menu and restores focus.
    setTimeout(blurActiveElement, 0);
  };

  useEffect(() => {
    if (!hasDisabledOptions) return;
    if (!visibleOptions.length) return;
    if (enabledOptionStrings.has(storedValueString)) return;
    const nextValue = visibleOptions[0]?.option;
    if (nextValue === undefined) return;
    if (String(nextValue) === storedValueString) return;
    handleOnNewValue({ value: nextValue }, { skipSnapshot: true });
  }, [
    storedValueString,
    enabledOptionStrings,
    handleOnNewValue,
    hasDisabledOptions,
    visibleOptions,
  ]);

  const buildOptionTooltip = (meta: any, optionLabel: string) => {
    if (!meta || typeof meta !== "object") return null;
    const descriptionRaw = String(meta.description ?? "").trim();
    const voiceEffectRaw = String(meta.voice_effect ?? meta.effect ?? "").trim();
    const description = descriptionRaw && descriptionRaw !== "-" ? descriptionRaw : "";
    const voiceEffect = voiceEffectRaw && voiceEffectRaw !== "-" ? voiceEffectRaw : "";
    const voice = String(meta.voice ?? "").trim();
    const languages = String(meta.languages ?? "").trim();
    const detailLine =
      name === "voice_type"
        ? (voiceEffect || description) && `音色效果: ${voiceEffect || description}`
        : description
          ? `描述: ${description}`
          : null;
    const lines = [
      `${template?.display_name || formatControlValue(name, name)}: ${optionLabel}`,
      detailLine,
      voice ? `voice: ${voice}` : null,
      languages ? `语言: ${languages}` : null,
    ].filter(Boolean) as string[];
    // Only show tooltip when we have extra info besides the title line
    return lines.length > 1 ? lines.join("\n") : null;
  };

  if (!visibleOptions.length) return null;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setTimeout(blurActiveElement, 0);
        }
      }}
    >
      <ShadTooltip
        content={
          <span className="text-xs">
            {tooltip || template?.display_name || formatControlValue(name, name)}
          </span>
        }
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // Prevent focus on pointer interaction; otherwise Radix Tooltip may open on focus
            // and appear "stuck" after selecting a dropdown option.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            className={cn(
              "flex h-11 flex-1 items-center justify-between rounded-full border border-[#E0E5F6] bg-[#F4F6FB] px-4 text-left text-sm font-medium text-[#2E3150] dark:border-white/15 dark:bg-white/10 dark:text-white",
              widthClass ?? "basis-[140px]",
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <ForwardedIconComponent
                name={icon}
                className="h-4 w-4 text-[#7D85A8] dark:text-slate-300"
              />
              <span className="truncate">{displayValue || "未选择"}</span>
            </span>
            <ForwardedIconComponent
              name="ChevronDown"
              className={cn(
                "h-4 w-4 flex-shrink-0 text-[#8D94B3] transition-transform duration-200 ease-out dark:text-slate-400",
                open && "rotate-180",
              )}
            />
          </button>
        </DropdownMenuTrigger>
      </ShadTooltip>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-56 overflow-auto"
        // Prevent Radix from restoring focus to the trigger on close; otherwise the tooltip can
        // open via focus and appear "stuck" after picking an option.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuRadioGroup
          value={String(effectiveValue ?? "")}
          onValueChange={handleSelect}
        >
          {visibleOptions.map(({ option, meta }) => {
            const optionLabel = formatControlValue(name, option);
            const tooltipContent = buildOptionTooltip(meta, optionLabel);
            return (
              <ShadTooltip
                key={String(option)}
                content={tooltipContent}
                delayDuration={300}
                styleClasses="whitespace-pre-wrap"
              >
                <DropdownMenuRadioItem
                  value={String(option)}
                  className="text-sm"
                >
                  {optionLabel}
                </DropdownMenuRadioItem>
              </ShadTooltip>
            );
          })}
        </DropdownMenuRadioGroup>
        {footer ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              // Let the footer manage interactions (e.g. switches) without closing the menu.
              onSelect={(event) => event.preventDefault()}
              className="cursor-default px-0 py-0 focus:bg-transparent"
            >
              <div className="w-full px-2 py-1.5">{footer}</div>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function formatControlValue(name: string, value: any): string {
  if (value === undefined || value === null) return "";
  if (name === "model_name") {
    const main = String(value).split("(")[0];
    const cleaned = main
      .replaceAll("旗舰", "")
      .replaceAll("灵动", "")
      .replace(/\s+/g, " ")
      .trim();
    let display = cleaned.endsWith(".") ? cleaned.slice(0, -1).trim() : cleaned;
    if (display.startsWith("Seedream") && display.length > 0) {
      display = display.slice(0, -1).trimEnd();
    }
    return display;
  }
  if (name === "resolution") {
    const raw = String(value).trim();
    if (!raw) return "";
    if (raw.toLowerCase().startsWith("auto")) return "Auto";

    // Keep only the leading "512px/1K/2K/4K" label (strip any suffix like "（推荐）").
    const match = raw.match(/^(512px|1K|2K|4K)/i);
    if (match) {
      const normalized = match[1]!;
      return normalized.toLowerCase() === "512px" ? "512px" : normalized.toUpperCase();
    }

    // Video resolutions typically use "720p/1080p" labels; normalize to "720P/1080P".
    if (/^\d+p$/i.test(raw)) return raw.toUpperCase();

    return raw;
  }
  if (name === "aspect_ratio") {
    const raw = String(value).trim();
    if (!raw) return "";
    if (raw.toLowerCase() === "adaptive") return "自适应";
    return raw;
  }
  if (name === "image_count") {
    return `${value}X`;
  }
  if (name === "duration") {
    return `${value}s`;
  }
  return String(value);
}

export function buildRangeOptions(templateField: any): number[] {
  const rangeSpec = templateField?.range_spec;
  if (!rangeSpec) return [];
  const min = rangeSpec.min ?? 1;
  const max = rangeSpec.max ?? min;
  const step = rangeSpec.step ?? 1;
  const options: number[] = [];
  for (let value = min; value <= max; value += step) {
    options.push(value);
  }
  return options;
}
