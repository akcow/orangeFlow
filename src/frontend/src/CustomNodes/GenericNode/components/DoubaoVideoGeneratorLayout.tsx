import { useMemo, useState, type ReactNode } from "react";
import DoubaoPreviewPanel from "./DoubaoPreviewPanel";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import RenderInputParameters from "./RenderInputParameters";
import { cn } from "@/utils/utils";
import type { NodeDataType } from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { track } from "@/customization/utils/analytics";
import { findLastNode } from "@/utils/reactflowUtils";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  buildRangeOptions,
} from "./DoubaoParameterButton";

const CONTROL_FIELDS = [
  { name: "model_name", icon: "Sparkles", widthClass: "basis-[220px] grow" },
  { name: "resolution", icon: "Monitor", widthClass: "basis-[140px]" },
  { name: "duration", icon: "Timer", widthClass: "basis-[110px]" },
] as const;

const PROMPT_NAME = "prompt";
const DEFAULT_DURATION_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type Props = {
  data: NodeDataType;
  types: any;
  isToolMode: boolean;
  buildStatus: BuildStatus;
  outputsSection?: ReactNode;
};

export default function DoubaoVideoGeneratorLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  outputsSection,
}: Props) {
  const template = data.node?.template ?? {};
  const customFields = new Set<string>([
    PROMPT_NAME,
    ...CONTROL_FIELDS.map((item) => item.name),
  ]);

  const [isRunHovering, setRunHovering] = useState(false);
  const buildFlow = useFlowStore((state) => state.buildFlow);
  const isBuilding = useFlowStore((state) => state.isBuilding);
  const stopBuilding = useFlowStore((state) => state.stopBuilding);
  const clearFlowPoolForNodes = useFlowStore(
    (state) => state.clearFlowPoolForNodes,
  );
  const eventDeliveryConfig = useUtilityStore((state) => state.eventDelivery);

  const nodeIdForRun = data.node?.flow?.data
    ? (findLastNode(data.node.flow.data!)?.id ?? data.id)
    : data.id;

  const isBusy = buildStatus === BuildStatus.BUILDING || isBuilding;

  const handleRun = () => {
    clearFlowPoolForNodes([nodeIdForRun]);
    if (buildStatus === BuildStatus.BUILDING && isRunHovering) {
      stopBuilding();
      return;
    }
    if (isBusy) return;
    buildFlow({
      stopNodeId: data.id,
      eventDelivery: eventDeliveryConfig,
    });
    track("Flow Build - Clicked", { stopNodeId: data.id });
  };

  const runIconName =
    buildStatus === BuildStatus.BUILDING
      ? isRunHovering
        ? "Square"
        : "Loader2"
      : "Play";

  const controlConfigs = useMemo(() => {
    return CONTROL_FIELDS.map((field) => {
      const templateField = template[field.name];
      if (!templateField) return null;

      let options: Array<string | number> =
        templateField.options ?? templateField.list ?? [];

      if (field.name === "duration") {
        const rangeOptions = buildRangeOptions(templateField);
        options = rangeOptions.length ? rangeOptions : DEFAULT_DURATION_OPTIONS;
      }

      return {
        ...field,
        template: templateField,
        options,
        value: templateField.value,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [template]);

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#6F768F]">
          <span>描述你想要生成的视频，按需切换模型、分辨率与时长。</span>
        </div>

        <div className="mt-5 flex flex-col gap-5 rounded-[26px] border border-[#EEF1F9] bg-[#F9FAFF] p-5">
          <div className="relative flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <DoubaoPreviewPanel
                nodeId={data.id}
                componentName={data.type}
                appearance="videoGenerator"
              />
            </div>
            {outputsSection && (
              <div className="absolute left-full top-1/2 hidden translate-x-6 -translate-y-1/2 lg:block">
                {outputsSection}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-[20px] border border-[#E6EAF7] bg-white p-4 text-sm text-[#3C4057] shadow-[0_18px_35px_rgba(15,23,42,0.07)]">
            <div
              className={cn(
                "rounded-[12px] border border-[#E8ECF6] bg-[#FDFEFE] p-3",
                "[&_.primary-input]:bg-transparent",
                "[&_.primary-input]:text-[#1C202D]",
                "[&_.primary-input]:text-sm",
                "[&_.primary-input]:placeholder:text-[#9CA3C0]",
                "[&_.text-muted-foreground]:text-[#8D92A8]",
              )}
            >
              <RenderInputParameters
                data={data}
                types={types}
                isToolMode={isToolMode}
                showNode
                shownOutputs={[]}
                showHiddenOutputs={false}
                filterFields={[PROMPT_NAME]}
                filterMode="include"
                fieldOverrides={{
                  [PROMPT_NAME]: {
                    placeholder:
                      "描述你想要生成的内容，并在下方调整生成参数。（按下 Enter 生成，Shift+Enter 换行）",
                  },
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {controlConfigs.map((config) => (
                <DoubaoParameterButton key={config.name} data={data} config={config} />
              ))}

              <button
                type="button"
                className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2E7BFF] text-white shadow-[0_12px_24px_rgba(46,123,255,0.35)] transition hover:bg-[#0F5CE0]"
                onClick={handleRun}
                onMouseEnter={() => setRunHovering(true)}
                onMouseLeave={() => setRunHovering(false)}
              >
                <ForwardedIconComponent
                  name={runIconName}
                  className={cn(
                    "h-4 w-4",
                    runIconName === "Loader2" && "animate-spin",
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#ECEFF6] bg-white p-5 shadow-sm">
        <RenderInputParameters
          data={data}
          types={types}
          isToolMode={isToolMode}
          showNode
          shownOutputs={[]}
          showHiddenOutputs={false}
          filterFields={Array.from(customFields)}
          filterMode="exclude"
        />
      </div>
    </div>
  );
}
