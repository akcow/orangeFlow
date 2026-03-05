import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ForwardedIconComponent } from "@/components/common/genericIconComponent";
import CardsWrapComponent from "@/components/core/cardsWrapComponent";
import { Button } from "@/components/ui/button";
import { DotBackgroundDemo } from "@/components/ui/dot-background";
import useCreateBlankFlow from "@/hooks/flows/use-create-blank-flow";
import { useFolderStore } from "@/stores/foldersStore";
import useFileDrop from "../hooks/use-on-file-drop";

const ORANGE_FLOW_ICON = "/branding/orangeflow-icon-512.png?v=20260305";

export const EmptyPageCommunity = () => {
  const { t } = useTranslation();
  const handleFileDrop = useFileDrop(undefined);
  const folders = useFolderStore((state) => state.folders);
  const createBlankFlow = useCreateBlankFlow();
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);

  return (
    <DotBackgroundDemo>
      <CardsWrapComponent
        dragMessage={t("Drop flows or components here")}
        onFileDrop={handleFileDrop}
      >
        <div className="m-0 h-full w-full bg-background p-0">
          <div className="z-50 flex h-full w-full flex-col items-center justify-center gap-5">
            <div className="z-50 flex flex-col items-center gap-2">
              <img
                src={ORANGE_FLOW_ICON}
                alt={t("OrangeFlow logo")}
                data-testid="empty_page_logo_orangeflow"
                className="h-36 w-36 rounded-full object-cover pointer-events-none select-none"
              />
              <span
                data-testid="mainpage_title"
                className="z-50 text-center font-chivo text-2xl font-medium text-foreground"
              >
                {t("Welcome to OrangeFlow")}
              </span>

              <span
                data-testid="empty_page_description"
                className="z-50 text-center text-base text-secondary-foreground"
              >
                {folders?.length > 1
                  ? t("Empty folder")
                  : t("Build and publish AI workflows more efficiently")}
              </span>
            </div>

            <div className="flex w-full max-w-[510px] flex-col gap-7 sm:gap-[29px]">
              <Button
                variant="default"
                className="z-10 m-auto mt-3 h-10 w-full max-w-[10rem] rounded-lg font-bold transition-all duration-300"
                onClick={async () => {
                  if (isCreatingFlow) return;
                  setIsCreatingFlow(true);
                  try {
                    await createBlankFlow();
                  } catch {
                  } finally {
                    setIsCreatingFlow(false);
                  }
                }}
                id="new-project-btn"
                data-testid="new_project_btn_empty_page"
                loading={isCreatingFlow}
              >
                <ForwardedIconComponent
                  name="Plus"
                  aria-hidden="true"
                  className="h-4 w-4"
                />
                <span>{t("Create your first flow")}</span>
              </Button>
            </div>
          </div>
        </div>
        <p
          data-testid="empty_page_drag_and_drop_text"
          className="absolute bottom-5 left-0 right-0 mt-4 cursor-default text-center text-xxs text-muted-foreground"
        >
          {t("Already have a flow? Drag and drop files here to upload.")}
        </p>
      </CardsWrapComponent>
    </DotBackgroundDemo>
  );
};

export default EmptyPageCommunity;
