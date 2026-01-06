import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n/t";

const FeatureToggles = ({
  showBeta,
  setShowBeta,
  showLegacy,
  setShowLegacy,
}) => {
  const toggles = [
    {
      labelKey: "Beta",
      checked: showBeta,
      onChange: setShowBeta,
      badgeVariant: "purpleStatic" as const,
      testId: "sidebar-beta-switch",
    },
    {
      labelKey: "Legacy",
      checked: showLegacy,
      onChange: setShowLegacy,
      badgeVariant: "secondaryStatic" as const,
      testId: "sidebar-legacy-switch",
    },
  ];

  return (
    <div className="flex flex-col gap-7 pb-3 px-2 pt-5">
      {toggles.map((toggle) => (
        <div
          key={toggle.labelKey}
          className="flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <span className="flex cursor-default gap-2 text-sm font-medium">
              {t("Show")}
              <Badge variant={toggle.badgeVariant} size="xq">
                {t(toggle.labelKey)}
              </Badge>
            </span>
          </div>
          <Switch
            checked={toggle.checked}
            onCheckedChange={toggle.onChange}
            data-testid={toggle.testId}
            className="scale-90"
          />
        </div>
      ))}
    </div>
  );
};

export default FeatureToggles;
