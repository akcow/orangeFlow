import IconComponent from "@/components/common/genericIconComponent";
import { t } from "@/i18n/t";
import { cn } from "@/utils/utils";

export const FolderSelectItem = ({ nameKey, iconName }) => (
  <div
    className={cn(
      nameKey === "Delete" ? "text-destructive" : "",
      "flex items-center font-medium",
    )}
  >
    <IconComponent name={iconName} className="mr-2 w-4" />
    <span>{t(nameKey)}</span>
  </div>
);
