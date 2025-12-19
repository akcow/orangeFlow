import { useMemo, useState } from "react";
import DoubaoPreviewPanel from "./DoubaoPreviewPanel";
import RenderInputParameters from "./RenderInputParameters";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { BuildStatus } from "@/constants/enums";
import type { NodeDataType } from "@/types/flow";
import useFlowStore from "@/stores/flowStore";
import { useUtilityStore } from "@/stores/utilityStore";
import { findLastNode } from "@/utils/reactflowUtils";
import { track } from "@/customization/utils/analytics";
import { cn } from "@/utils/utils";
import { useTypesStore } from "@/stores/typesStore";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import {
  DoubaoParameterButton,
  type DoubaoControlConfig,
  DOUBAO_CONTROL_HINTS,
  DOUBAO_CONFIG_TOOLTIP,
} from "./DoubaoParameterButton";
import HandleRenderComponent from "./handleRenderComponent";

const CONTROL_FIELDS = [
  { name: "voice_type", icon: "Mic", widthClass: "basis-[240px] grow" },
] as const;

const PROMPT_FIELD = "text";
type Props = {
  data: NodeDataType;
  types: any;
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
};

export default function DoubaoAudioLayout({
  data,
  types,
  isToolMode,
  buildStatus,
  selected = false,
}: Props) {
  const template = data.node?.template ?? {};
  const showExpanded = Boolean(selected);

  const [isRunHovering, setRunHovering] = useState(false);
  const buildFlow = useFlowStore((state) => state.buildFlow);
  const isBuilding = useFlowStore((state) => state.isBuilding);
  const stopBuilding = useFlowStore((state) => state.stopBuilding);
  const clearFlowPoolForNodes = useFlowStore(
    (state) => state.clearFlowPoolForNodes,
  );
  const eventDelivery = useUtilityStore((state) => state.eventDelivery);
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const typeData = useTypesStore((state) => state.data);

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
      eventDelivery,
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

      const options: Array<string | number> =
        templateField.options ?? templateField.list ?? [];

      const tooltipText =
        DOUBAO_CONTROL_HINTS[field.name] ?? DOUBAO_CONFIG_TOOLTIP;
      return {
        ...field,
        template: templateField,
        options,
        value: templateField.value,
        tooltip: tooltipText,
      };
    }).filter(Boolean) as Array<DoubaoControlConfig>;
  }, [template]);

  const previewOutputHandles = useMemo(() => {
    const outputs = data.node?.outputs ?? [];
    return outputs
      .filter((output) => !output.hidden)
      .map((output) => {
        const colors = getNodeOutputColors(output, data, types);
        const colorName = getNodeOutputColorsName(output, data, types);
        const resolvedType = output.selected ?? output.types?.[0] ?? "Data";
        return {
          id: {
            output_types: [resolvedType],
            id: data.id,
            dataType: data.type,
            name: output.name,
          },
          colors,
          colorName,
          tooltip:
            output.selected ?? output.types?.[0] ?? output.display_name ?? "音频输出",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data.id, data.node?.outputs, data.type, types]);

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="rounded-[32px] border border-[#E6E9F4] bg-white p-6 shadow-[0_25px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-[0_25px_50px_rgba(0,0,0,0.55)]">

        <div className="mt-5 flex flex-col gap-5">
          <div className="relative flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <DoubaoPreviewPanel
                nodeId={data.id}
                componentName={data.type}
                appearance="audioCreator"
              />
            </div>
            {previewOutputHandles.length > 0 && (
              <div className="absolute left-full top-1/2 hidden -translate-y-1/2 pl-6 lg:flex lg:flex-col lg:items-start">
                {previewOutputHandles.map((handle, index) => (
                  <div
                    key={`${handle.id.name ?? "audio"}-${index}`}
                    className="mb-3 last:mb-0"
                  >
                    <HandleRenderComponent
                      left={false}
                      tooltipTitle={handle.tooltip}
                      id={handle.id}
                      title={handle.title}
                      nodeId={data.id}
                      myData={typeData}
                      colors={handle.colors}
                      setFilterEdge={setFilterEdge}
                      showNode={true}
                      testIdComplement={`${data.type?.toLowerCase()}-preview-output`}
                      proxy={handle.proxy}
                      colorName={handle.colorName}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {showExpanded && (
          <div className="space-y-3 text-sm text-[#3C4057] dark:text-slate-100">
            <div
              className={cn(
                "rounded-[12px] p-3",
                "[&_.primary-input]:bg-transparent",
                "[&_.primary-input]:text-[#1C202D]",
                "[&_.primary-input]:text-sm",
                "[&_.primary-input]:placeholder:text-[#9CA3C0]",
                "[&_.text-muted-foreground]:text-[#8D92A8]",
                "dark:[&_.primary-input]:text-white",
                "dark:[&_.primary-input]:placeholder:text-slate-400",
                "dark:[&_.text-muted-foreground]:text-slate-400",
              )}
            >
              <RenderInputParameters
                data={data}
                types={types}
                isToolMode={isToolMode}
                showNode
                shownOutputs={[]}
                showHiddenOutputs={false}
                filterFields={[PROMPT_FIELD]}
                filterMode="include"
                fieldOverrides={{
                  [PROMPT_FIELD]: {
                    placeholder:
                      "描述你想要的语音内容，按需使用换行。",
                    inputTypes: ["Message"],
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
          )}
        </div>
      </div>

    </div>
  );
}
