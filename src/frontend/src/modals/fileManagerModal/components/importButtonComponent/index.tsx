import { MorphingMenu } from "@/components/ui/morphing-menu";
import { t } from "@/i18n/t";

export default function ImportButtonComponent({
  variant = "large",
}: {
  variant?: "large" | "small";
}) {
  const items = [
    {
      icon: "GoogleDrive",
      label: "Drive",
      onClick: () => {
        // Handle Google Drive click
      },
    },
    {
      icon: "OneDrive",
      label: "OneDrive",
      onClick: () => {
        // Handle OneDrive click
      },
    },
    {
      icon: "AWSInverted",
      label: "S3 Bucket",
      onClick: () => {
        // Handle S3 click
      },
    },
  ];

  return (
    <MorphingMenu
      variant={variant}
      trigger={t("Import from...")}
      items={items}
    />
  );
}
