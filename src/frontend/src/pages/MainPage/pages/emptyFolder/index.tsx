import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import useCreateBlankFlow from "@/hooks/flows/use-create-blank-flow";
import { useFolderStore } from "@/stores/foldersStore";
import { useState } from "react";

type EmptyFolderProps = {
  onCreateFlow?: () => void;
};

export const EmptyFolder = ({ onCreateFlow }: EmptyFolderProps) => {
  const folders = useFolderStore((state) => state.folders);
  const createBlankFlow = useCreateBlankFlow();
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);

  const handleCreateFlow = async () => {
    if (isCreatingFlow) return;
    setIsCreatingFlow(true);
    try {
      if (onCreateFlow) {
        await onCreateFlow();
        return;
      }
      await createBlankFlow();
    } catch {
    } finally {
      setIsCreatingFlow(false);
    }
  };

  return (
    <div className="m-0 flex w-full justify-center">
      <div className="absolute top-1/2 flex w-full -translate-y-1/2 flex-col items-center justify-center gap-2">
        <h3
          className="pt-5 font-chivo text-2xl font-semibold"
          data-testid="mainpage_title"
        >
          {folders?.length > 1 ? "Empty project" : "Start building"}
        </h3>
        <p className="pb-5 text-sm text-secondary-foreground">
          Start from scratch with a blank flow.
        </p>
        <Button
          variant="default"
          onClick={handleCreateFlow}
          id="new-project-btn"
          data-testid="new_project_btn_empty_page"
          loading={isCreatingFlow}
        >
          <ForwardedIconComponent
            name="plus"
            aria-hidden="true"
            className="h-4 w-4"
          />
          <span className="whitespace-nowrap font-semibold">New Flow</span>
        </Button>
      </div>
    </div>
  );
};

export default EmptyFolder;
