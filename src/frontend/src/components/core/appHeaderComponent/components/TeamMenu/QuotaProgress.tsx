import { Infinity } from "lucide-react";
import { cn } from "@/utils/utils";
import type { QuotaSummary } from "./quota";

const formatCredits = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

type QuotaProgressProps = {
  isZh: boolean;
  summary: QuotaSummary;
  showUsage?: boolean;
  align?: "left" | "center";
  className?: string;
};

export function QuotaProgress({
  isZh,
  summary,
  showUsage = false,
  align = "left",
  className,
}: QuotaProgressProps) {
  const alignmentClass = align === "center" ? "items-center text-center" : "";

  return (
    <div className={cn("flex min-w-0 flex-col", alignmentClass, className)}>
      {summary.isUnlimited ? (
        <>
          <div className="flex items-center gap-2 text-sm font-medium text-[#39BFFF]">
            <span>{isZh ? "无额度限制" : "Unlimited"}</span>
            <Infinity className="h-4 w-4" />
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-full rounded-full bg-[#39BFFF]" />
          </div>
        </>
      ) : (
        <>
          <div className="text-sm font-medium text-white">
            {formatCredits(summary.remaining)} / {formatCredits(summary.total)}
          </div>
          {showUsage ? (
            <div className="mt-1 text-xs text-white/42">
              {isZh
                ? `已使用 ${formatCredits(summary.used)}`
                : `Used ${formatCredits(summary.used)}`}
            </div>
          ) : null}
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[#39BFFF] transition-[width] duration-300"
              style={{ width: `${summary.progressRatio * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
