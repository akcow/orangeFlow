import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import type { handleOnNewValueType } from "../../hooks/use-handle-new-value";
import {
  getModelOptionVisualMeta,
  type ModelOptionScope,
} from "./modelOptionVisualMeta";

type OptionMeta = Record<string, unknown> | undefined;
type TemplateLike = {
  value?: unknown;
  display_name?: string;
  options_metadata?: OptionMeta[];
};
type RangeSpecLike = {
  min?: number;
  max?: number;
  step?: number;
};

function getMetaString(meta: OptionMeta, key: string): string {
  if (!meta) return "";
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

export type DoubaoControlConfig = {
  name: string;
  icon: string;
  options: Array<string | number>;
  template?: TemplateLike | null;
  value: unknown;
  widthClass?: string;
  tooltip?: string;
  disabledOptions?: Array<string | number>;
  footer?: ReactNode;
  handleOnNewValueOptions?: (
    nextValue: string | number,
  ) => Parameters<handleOnNewValueType>[1];
};

export const DOUBAO_CONFIG_TOOLTIP = "\u53c2\u6570\u9009\u62e9\u8bf4\u660e";

export const DOUBAO_CONTROL_HINTS: Record<string, string> = {
  model_name: "\u6a21\u578b\u7c7b\u578b\u9009\u62e9",
  resolution: "\u753b\u9762\u6e05\u6670\u5ea6",
  aspect_ratio: "\u753b\u9762\u5bbd\u9ad8\u6bd4",
  image_count: "\u751f\u6210\u5f20\u6570",
  duration: "\u89c6\u9891\u751f\u6210\u65f6\u957f",
  voice_type: "\u97f3\u8272\u98ce\u683c\u9009\u62e9",
};

const BANANA_BASE_MARQUEE_DURATION_SECONDS = 8.8;
const DEFAULT_BANANA_DESCRIPTION = "更快更便宜的图片生成/编辑模型";
const DEFAULT_BANANA_DESCRIPTION_LENGTH = DEFAULT_BANANA_DESCRIPTION.trim().length;

export function DoubaoParameterButton({
  data,
  config,
}: {
  data: NodeDataType;
  config: DoubaoControlConfig;
}) {
  const {
    name,
    icon,
    options,
    template,
    value,
    widthClass,
    tooltip,
    disabledOptions,
    footer,
  } = config;
  const isModelSelector = name === "model_name";
  const modelOptionScope: ModelOptionScope = useMemo(() => {
    if (data.type === "DoubaoImageCreator") return "image";
    if (data.type === "DoubaoVideoGenerator") return "video";
    if (data.type === "TextCreation") return "text";
    return "unknown";
  }, [data.type]);
  const [open, setOpen] = useState(false);
  const [hoveredModelOption, setHoveredModelOption] = useState<string | null>(
    null,
  );
  const { handleOnNewValue } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name,
  });

  // Radix Tooltip opens on focus by default. After selecting an option, focus returns to
  // the trigger button, which can leave the tooltip visible. Blur on close/selection.
  const blurActiveElement = () => {
    if (typeof document === "undefined") return;
    const el = document.activeElement;
    if (el && el instanceof HTMLElement) el.blur();
  };

  const disabledOptionSet = useMemo(() => {
    return new Set((disabledOptions ?? []).map((option) => String(option)));
  }, [disabledOptions]);

  const optionsMeta = useMemo<OptionMeta[]>(() => {
    return Array.isArray(template?.options_metadata)
      ? template.options_metadata
      : [];
  }, [template?.options_metadata]);

  const resolvedOptionsMeta = useMemo<OptionMeta[]>(() => {
    if (!isModelSelector) return optionsMeta;
    return options.map((option, index) => {
      const backendMeta = optionsMeta[index];
      const fallbackMeta = getModelOptionVisualMeta(
        String(option),
        modelOptionScope,
      );
      const backendDescription = getMetaString(backendMeta, "description").trim();
      const backendIcon = getMetaString(backendMeta, "icon").trim();

      return {
        ...fallbackMeta,
        ...(backendMeta && typeof backendMeta === "object" ? backendMeta : {}),
        icon: backendIcon || fallbackMeta.icon,
        description: backendDescription || fallbackMeta.description,
      };
    });
  }, [isModelSelector, modelOptionScope, options, optionsMeta]);

  const visibleOptions = useMemo(() => {
    return options
      .map((option, index) => ({
        option,
        meta: resolvedOptionsMeta[index],
      }))
      .filter(({ option }) => !disabledOptionSet.has(String(option)));
  }, [options, resolvedOptionsMeta, disabledOptionSet]);

  const bananaDescriptionLength = useMemo(() => {
    if (!isModelSelector) return DEFAULT_BANANA_DESCRIPTION_LENGTH;

    for (const { option, meta } of visibleOptions) {
      if (!String(option).toLowerCase().includes("banana")) continue;
      const description = getMetaString(meta, "description").trim();
      if (description.length > 0) return description.length;
    }

    return DEFAULT_BANANA_DESCRIPTION_LENGTH;
  }, [isModelSelector, visibleOptions]);

  const getMarqueeDurationStyle = (description: string): CSSProperties => {
    const descriptionLength = Math.max(description.trim().length, 1);
    const ratio = descriptionLength / Math.max(bananaDescriptionLength, 1);
    const duration = BANANA_BASE_MARQUEE_DURATION_SECONDS * ratio;

    return {
      "--doubao-model-desc-marquee-duration": `${duration.toFixed(2)}s`,
    } as CSSProperties;
  };

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
  const effectiveValue =
    displayValueString && !enabledOptionStrings.has(displayValueString)
      ? visibleOptions[0]?.option ?? displayBaseValue
      : displayBaseValue;
  const displayValue = formatControlValue(name, effectiveValue);

  const handleSelect = (nextValue: string) => {
    if (disabledOptionSet.has(nextValue)) return;

    const parsed =
      typeof template?.value === "number" ? Number(nextValue) : nextValue;
    handleOnNewValue(
      { value: parsed },
      config.handleOnNewValueOptions?.(parsed),
    );
    // Defer so we run after Radix closes the menu and restores focus.
    setTimeout(blurActiveElement, 0);
  };

  useEffect(() => {
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
    visibleOptions,
  ]);

  useEffect(() => {
    if (!isModelSelector) return;
    if (!open) setHoveredModelOption(null);
  }, [isModelSelector, open]);

  const buildOptionTooltip = (meta: OptionMeta, optionLabel: string) => {
    if (isModelSelector) return null;
    if (!meta || typeof meta !== "object") return null;

    const descriptionRaw = getMetaString(meta, "description").trim();
    const voiceEffectRaw =
      getMetaString(meta, "voice_effect").trim() ||
      getMetaString(meta, "effect").trim();
    const description = descriptionRaw && descriptionRaw !== "-" ? descriptionRaw : "";
    const voiceEffect = voiceEffectRaw && voiceEffectRaw !== "-" ? voiceEffectRaw : "";
    const voice = getMetaString(meta, "voice").trim();
    const languages = getMetaString(meta, "languages").trim();
    const detailLine =
      name === "voice_type"
        ? (voiceEffect || description) && `\u97f3\u8272\u6548\u679c: ${voiceEffect || description}`
        : description
          ? `\u63cf\u8ff0: ${description}`
          : null;
    const lines = [
      `${template?.display_name || formatControlValue(name, name)}: ${optionLabel}`,
      detailLine,
      voice ? `\u97f3\u8272: ${voice}` : null,
      languages ? `\u8bed\u8a00: ${languages}` : null,
    ].filter(Boolean) as string[];
    // Only show tooltip when we have extra info besides the title line.
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
              isModelSelector
                ? "flex h-11 flex-1 items-center justify-between rounded-full border border-[#E0E5F6] bg-[#F4F6FB] px-4 text-left text-sm font-medium text-[#2E3150] transition dark:border-white/15 dark:bg-white/10 dark:text-white"
                : "flex h-11 flex-1 items-center justify-between rounded-full border border-[#E0E5F6] bg-[#F4F6FB] px-4 text-left text-sm font-medium text-[#2E3150] dark:border-white/15 dark:bg-white/10 dark:text-white",
              widthClass ?? "basis-[140px]",
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <ForwardedIconComponent
                name={icon}
                className={cn(
                  "h-4 w-4",
                  isModelSelector
                    ? "text-[#7D85A8] dark:text-slate-300"
                    : "text-[#7D85A8] dark:text-slate-300",
                )}
              />
              <span className="truncate">{displayValue || "\u672a\u9009\u62e9"}</span>
            </span>
            <ForwardedIconComponent
              name="ChevronDown"
              className={cn(
                isModelSelector
                  ? "h-4 w-4 flex-shrink-0 text-[#8D94B3] transition-transform duration-200 ease-out dark:text-slate-400"
                  : "h-4 w-4 flex-shrink-0 text-[#8D94B3] transition-transform duration-200 ease-out dark:text-slate-400",
                open && "rotate-180",
              )}
            />
          </button>
        </DropdownMenuTrigger>
      </ShadTooltip>
      <DropdownMenuContent
        align="start"
        className={cn(
          isModelSelector ? "max-h-[380px] w-[336px] p-1" : "max-h-72 w-56 overflow-auto",
        )}
        // Prevent Radix from restoring focus to the trigger on close; otherwise the tooltip can
        // open via focus and appear "stuck" after picking an option.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        {isModelSelector ? (
          <div className="max-h-[372px] overflow-y-auto pr-1">
            <DropdownMenuRadioGroup
              value={String(effectiveValue ?? "")}
              onValueChange={handleSelect}
              onMouseLeave={() => {
                setHoveredModelOption(null);
              }}
            >
              {visibleOptions.map(({ option, meta }) => {
                const optionValue = String(option);
                const optionLabel = formatControlValue(name, option);
                const iconName =
                  meta && typeof meta === "object" && meta.icon
                    ? String(meta.icon)
                    : "Sparkles";
                const description = getMetaString(meta, "description");
                const isHovering = hoveredModelOption === optionValue;

                return (
                  <DropdownMenuRadioItem
                    key={optionValue}
                    value={optionValue}
                    className={cn(
                      "group mb-1 rounded-xl border border-transparent py-2.5 pl-3.5 pr-2 text-sm transition-all duration-200 ease-out [&>span:first-child]:hidden",
                      "hover:translate-x-[1px] hover:bg-accent/45 focus:translate-x-[1px] focus:bg-accent/45",
                    )}
                    onMouseEnter={() => {
                      setHoveredModelOption(optionValue);
                    }}
                    onFocus={() => {
                      setHoveredModelOption(optionValue);
                    }}
                  >
                    <div className="flex w-full gap-2.5">
                      <span
                          className={cn(
                            "mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/70 transition-transform duration-200",
                            isHovering && "scale-[1.03]",
                          )}
                      >
                        <ForwardedIconComponent
                          name={iconName}
                          className="h-4 w-4 text-muted-foreground"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {optionLabel}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block overflow-hidden text-xs leading-5 text-muted-foreground transition-[max-height,opacity,transform,margin] duration-200 ease-out",
                            isHovering
                              ? "max-h-10 opacity-100 translate-y-0"
                              : "max-h-0 opacity-0 -translate-y-1",
                          )}
                        >
                          <span className="doubao-model-desc-marquee-mask">
                            <span
                              className={cn(
                                "doubao-model-desc-marquee-track",
                                isHovering &&
                                  description.trim().length > 0 &&
                                  "doubao-model-desc-marquee-track--running",
                              )}
                              style={getMarqueeDurationStyle(description)}
                            >
                              <span>{description}</span>
                              <span aria-hidden="true">{description}</span>
                            </span>
                          </span>
                        </span>
                      </span>
                    </div>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </div>
        ) : (
          <DropdownMenuRadioGroup
            value={String(effectiveValue ?? "")}
            onValueChange={handleSelect}
          >
            {visibleOptions.map(({ option, meta }) => {
              const optionValue = String(option);
              const optionLabel = formatControlValue(name, option);
              const tooltipContent = buildOptionTooltip(meta, optionLabel);
              const optionItem = (
                <DropdownMenuRadioItem
                  key={optionValue}
                  value={optionValue}
                  className="text-sm"
                >
                  {optionLabel}
                </DropdownMenuRadioItem>
              );

              if (!tooltipContent) return optionItem;

              return (
                <ShadTooltip
                  key={optionValue}
                  content={tooltipContent}
                  delayDuration={300}
                  styleClasses="whitespace-pre-wrap"
                >
                  {optionItem}
                </ShadTooltip>
              );
            })}
          </DropdownMenuRadioGroup>
        )}

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

export function formatControlValue(name: string, value: unknown): string {
  if (value === undefined || value === null) return "";

  if (name === "model_name") {
    const main = String(value).split("(")[0];
    const cleaned = main
      .replaceAll("\u65d7\u8230", "")
      .replaceAll("\u7075\u52a8", "")
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
    if (raw.toLowerCase().startsWith("auto")) return "\u81ea\u52a8";

    // Keep only the leading "512px/1K/2K/4K" label (strip suffixes like "(recommended)").
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
    if (raw.toLowerCase() === "adaptive") return "\u81ea\u9002\u5e94";
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

export function buildRangeOptions(templateField: unknown): number[] {
  const field = (templateField ?? {}) as { range_spec?: RangeSpecLike };
  const rangeSpec = field.range_spec;
  if (!rangeSpec) return [];
  const min = rangeSpec.min ?? 1;
  const max = rangeSpec.max ?? min;
  const step = rangeSpec.step ?? 1;
  const options: number[] = [];
  for (let current = min; current <= max; current += step) {
    options.push(current);
  }
  return options;
}
