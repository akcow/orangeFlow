import { CircleDollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGetMyCreditsQuery } from "@/controllers/API/queries/credits";
import { cn } from "@/utils/utils";

type CreditsBalanceButtonProps = {
  className?: string;
  compact?: boolean;
};

export function CreditsBalanceButton({
  className,
  compact = false,
}: CreditsBalanceButtonProps) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { data, isLoading } = useGetMyCreditsQuery();

  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const balanceLabel = isLoading ? "--" : String(data?.balance ?? 0);

  return (
    <Button
      variant="ghost"
      onClick={() => navigate("/profile")}
      className={cn(
        "h-10 rounded-full border border-amber-300/30 bg-[linear-gradient(135deg,rgba(255,213,79,0.18),rgba(255,255,255,0.04))] px-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all hover:border-amber-200/45 hover:bg-[linear-gradient(135deg,rgba(255,213,79,0.24),rgba(255,255,255,0.08))]",
        compact ? "px-3" : "px-4",
        className,
      )}
    >
      <CircleDollarSign className="h-4 w-4 text-amber-300" />
      <span className="font-semibold tracking-[0.01em]">{balanceLabel}</span>
      {!compact ? (
        <span className="text-white/75">{isZh ? "积分" : "Credits"}</span>
      ) : null}
    </Button>
  );
}
