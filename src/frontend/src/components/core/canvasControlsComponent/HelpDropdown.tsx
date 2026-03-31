import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelpDropdownView } from "@/components/core/canvasControlsComponent/HelpDropdownView";
import {
  DATASTAX_DOCS_URL,
  DOCS_URL,
} from "@/constants/constants";
import { ENABLE_DATASTAX_LANGFLOW } from "@/customization/feature-flags";
import useFlowStore from "@/stores/flowStore";
import { IssueFeedbackDialog } from "./IssueFeedbackDialog";

const HelpDropdown = () => {
  const navigate = useNavigate();
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const helperLineEnabled = useFlowStore((state) => state.helperLineEnabled);
  const setHelperLineEnabled = useFlowStore(
    (state) => state.setHelperLineEnabled,
  );

  const onToggleHelperLines = useCallback(() => {
    setHelperLineEnabled(!helperLineEnabled);
  }, [helperLineEnabled]);

  const docsUrl = ENABLE_DATASTAX_LANGFLOW ? DATASTAX_DOCS_URL : DOCS_URL;

  return (
    <>
      <HelpDropdownView
        isOpen={isHelpMenuOpen}
        onOpenChange={setIsHelpMenuOpen}
        helperLineEnabled={helperLineEnabled}
        onToggleHelperLines={onToggleHelperLines}
        navigateTo={(path) => navigate(path)}
        openLink={(url) => window.open(url, "_blank")}
        onReportIssue={() => {
          setIsHelpMenuOpen(false);
          setIsIssueDialogOpen(true);
        }}
        urls={{ docs: docsUrl }}
      />
      <IssueFeedbackDialog
        open={isIssueDialogOpen}
        onOpenChange={setIsIssueDialogOpen}
      />
    </>
  );
};

export default HelpDropdown;
