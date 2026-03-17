import { CircleDollarSign } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useGetCreditEstimateQuery } from "@/controllers/API/queries/credits";
import type { NodeDataType } from "@/types/flow";
import { cn } from "@/utils/utils";

type GenerationCostPillProps = {
  data: NodeDataType;
  children: ReactNode;
  className?: string;
};

const CHARGEABLE_COMPONENTS = new Set([
  "DoubaoImageCreator",
  "DoubaoVideoGenerator",
  "TextCreation",
]);

const ESTIMATE_FIELDS_BY_COMPONENT: Record<string, string[]> = {
  DoubaoImageCreator: ["model_name", "resolution", "image_count"],
  DoubaoVideoGenerator: [
    "model_name",
    "resolution",
    "duration",
    "enable_audio",
    "first_frame_image",
    "last_frame_image",
  ],
  TextCreation: ["model_name"],
};

const DEFAULT_LABEL = "暂不可估算";

function pickEstimateField(field: any) {
  if (!field || typeof field !== "object") return field;
  return {
    value: field.value,
    default: field.default,
    options: field.options,
    file_path: field.file_path,
    name: field.name,
    display_name: field.display_name,
  };
}

export default function GenerationCostPill({
  data,
  children,
  className,
}: GenerationCostPillProps) {
  const enabled = CHARGEABLE_COMPONENTS.has(String(data.type || ""));
  const estimateFields = ESTIMATE_FIELDS_BY_COMPONENT[String(data.type || "")] ?? [];
  const payload = useMemo(() => {
    if (!enabled) return {};
    const template = data.node?.template ?? {};
    const estimateTemplate = estimateFields.reduce<Record<string, any>>((acc, fieldName) => {
      if (template[fieldName] !== undefined) {
        acc[fieldName] = pickEstimateField(template[fieldName]);
      }
      return acc;
    }, {});
    return {
      vertex_id: data.id,
      node_payload: {
        id: data.id,
        data: {
          id: data.id,
          type: data.type,
          node: {
            template: estimateTemplate,
          },
        },
      },
    };
  }, [data.id, data.node?.template, data.type, enabled, estimateFields]);

  const { data: estimate, isLoading } = useGetCreditEstimateQuery(payload, {
    enabled,
  });

  const nextStableLabel = useMemo(() => {
    if (!enabled) return DEFAULT_LABEL;
    if (estimate?.billing_mode === "usage_based") return "按输出结算";
    if (estimate?.billing_mode === "estimated" && typeof estimate.estimated_credits === "number") {
      return `${estimate.estimated_credits}`;
    }
    if (estimate?.billing_mode === "unavailable") return DEFAULT_LABEL;
    if (isLoading) return null;
    return DEFAULT_LABEL;
  }, [enabled, estimate, isLoading]);

  const [stableLabel, setStableLabel] = useState<string>(nextStableLabel ?? DEFAULT_LABEL);

  useEffect(() => {
    if (!nextStableLabel) return;
    setStableLabel((current) => (current === nextStableLabel ? current : nextStableLabel));
  }, [nextStableLabel]);

  return (
    <div
      className={cn(
        "ml-auto flex h-[52px] w-[150px] items-center gap-1 rounded-full border border-white/14 p-1",
        "bg-[linear-gradient(180deg,rgba(18,20,26,0.96),rgba(38,42,51,0.92))]",
        "shadow-[0_10px_30px_rgba(255,255,255,0.08),0_14px_40px_rgba(0,0,0,0.32)] backdrop-blur-md",
        className,
      )}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 px-3 text-sm font-medium text-white/88"
      >
        <CircleDollarSign className="h-[23px] w-[23px] shrink-0 text-amber-300" />
        <span className="truncate whitespace-nowrap">{stableLabel}</span>
      </div>
      {children}
    </div>
  );
}
