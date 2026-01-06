import type { UniqueInputsComponents } from "../types";
import { t } from "@/i18n/t";

export const getDisabledTooltip = (
  SBItemName: string,
  uniqueInputsComponents: UniqueInputsComponents,
) => {
  if (SBItemName === "ChatInput" && uniqueInputsComponents.chatInput) {
    return t("Chat input already added");
  }
  if (SBItemName === "Webhook" && uniqueInputsComponents.webhookInput) {
    return t("Webhook already added");
  }
  return "";
};
