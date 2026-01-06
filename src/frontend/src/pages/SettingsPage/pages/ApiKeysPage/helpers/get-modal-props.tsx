import { t } from "@/i18n/t";

export const getModalPropsApiKey = () => {
  const modalProps = {
    title: t("Create API Key"),
    description: t("Create a secret API Key to use Langflow API."),
    inputPlaceholder: t("My API Key"),
    buttonText: t("Generate API Key"),
    generatedKeyMessage: (
      <>
        {t("Please save this secret key somewhere safe and accessible.")}{" "}
        {t("For security reasons,")}{" "}
        <strong>{t("you won't be able to view it again")}</strong>{" "}
        {t("through your account.")}{" "}
        {t(
          "If you lose this secret key, you'll need to generate a new one.",
        )}
      </>
    ),
    showIcon: true,
    inputLabel: (
      <>
        <span className="text-sm">{t("Description")}</span>{" "}
        <span className="text-xs text-muted-foreground">{t("(optional)")}</span>
      </>
    ),
  };

  return modalProps;
};
