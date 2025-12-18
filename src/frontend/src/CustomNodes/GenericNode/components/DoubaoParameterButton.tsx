import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";
import ShadTooltip from "@/components/common/shadTooltipComponent";

export type DoubaoControlConfig = {
  name: string;
  icon: string;
  options: Array<string | number>;
  template: any;
  value: any;
  widthClass?: string;
  tooltip?: string;
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
  const { name, icon, options, template, value, widthClass, tooltip } = config;
  const { handleOnNewValue } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name,
  });

  const displayValue = formatControlValue(name, value);

  const handleSelect = (nextValue: string) => {
    const parsed =
      typeof template.value === "number" ? Number(nextValue) : nextValue;
    handleOnNewValue({ value: parsed });
  };

  if (!options?.length) return null;

  return (
    <DropdownMenu>
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
              className="h-4 w-4 flex-shrink-0 text-[#8D94B3] dark:text-slate-400"
            />
          </button>
        </DropdownMenuTrigger>
      </ShadTooltip>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-56 overflow-auto"
      >
        <DropdownMenuRadioGroup
          value={String(value ?? "")}
          onValueChange={handleSelect}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={String(option)}
              className="text-sm"
            >
              {formatControlValue(name, option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function formatControlValue(name: string, value: any): string {
  if (value === undefined || value === null) return "";
  if (name === "model_name") {
    const main = String(value).split("(")[0];
    return main.trim();
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
