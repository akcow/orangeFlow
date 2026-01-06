import { convertTestName } from "@/components/common/storeCardComponent/utils/convert-test-name";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n/t";
import { nodeColorsName } from "@/utils/styleUtils";

export default function HandleTooltipComponent({
  isInput,
  tooltipTitle,
  isConnecting,
  isCompatible,
  isSameNode,
  left,
}: {
  isInput: boolean;
  tooltipTitle: string;
  isConnecting: boolean;
  isCompatible: boolean;
  isSameNode: boolean;
  left: boolean;
}) {
  const tooltips = tooltipTitle.split("\n");

  return (
    <div className="font-medium">
      {isSameNode ? (
        t("Can't connect to the same node")
      ) : (
        <div className="flex items-center gap-1.5">
          {isConnecting ? (
            isCompatible ? (
              <span>
                <span className="font-semibold">{t("Connect")}</span>{" "}
                {t("to")}
              </span>
            ) : (
              <span>{t("Incompatible with")}</span>
            )
          ) : (
            <span className="text-xs">
              {isInput ? t("Input types") : t("Output types")}:{" "}
            </span>
          )}
          {tooltips.map((word, index) => (
            <Badge
              className="h-6 rounded-md p-1"
              key={`${index}-${word.toLowerCase()}`}
              style={{
                backgroundColor: left
                  ? `hsl(var(--datatype-${nodeColorsName[word]}))`
                  : `hsl(var(--datatype-${nodeColorsName[word]}-foreground))`,
                color: left
                  ? `hsl(var(--datatype-${nodeColorsName[word]}-foreground))`
                  : `hsl(var(--datatype-${nodeColorsName[word]}))`,
              }}
              data-testid={`${isInput ? "input" : "output"}-tooltip-${convertTestName(word)}`}
            >
              {word}
            </Badge>
          ))}
          {isConnecting && <span>{isInput ? t("input") : t("output")}</span>}
        </div>
      )}
      {!isConnecting && (
        <div className="mt-2 flex flex-col gap-0.5 text-xs leading-6">
          <div>
            <b>{t("Drag")}</b>{" "}
            {t("to connect compatible")}{" "}
            {!isInput ? t("inputs") : t("outputs")}
          </div>
          <div>
            <b>{t("Click")}</b>{" "}
            {t("to filter compatible")}{" "}
            {!isInput ? t("inputs") : t("outputs")} {t("and components")}
          </div>
        </div>
      )}
    </div>
  );
}
