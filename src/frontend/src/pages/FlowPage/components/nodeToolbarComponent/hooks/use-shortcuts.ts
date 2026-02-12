import { useHotkeys } from "react-hotkeys-hook";
import { useShortcutsStore } from "@/stores/shortcuts";
import isWrappedWithClass from "../../PageComponent/utils/is-wrapped-with-class";

export default function useShortcuts({
  showOverrideModal,
  showconfirmShare,
  downloadFunction,
  displayDocs,
  saveComponent,
  shareComponent,
  ungroup,
  minimizeFunction,
}: {
  showOverrideModal?: boolean;
  showconfirmShare?: boolean;
  downloadFunction?: () => void;
  displayDocs?: () => void;
  saveComponent?: () => void;
  shareComponent?: () => void;
  ungroup?: () => void;
  minimizeFunction?: () => void;
}) {
  const minimize = useShortcutsStore((state) => state.minimize);
  const componentShare = useShortcutsStore((state) => state.componentShare);
  const save = useShortcutsStore((state) => state.saveComponent);
  const docs = useShortcutsStore((state) => state.docs);
  const group = useShortcutsStore((state) => state.group);
  const download = useShortcutsStore((state) => state.download);

  function handleDownloadWShortcut(e: KeyboardEvent) {
    if (!downloadFunction) return;
    e.preventDefault();
    downloadFunction();
  }

  function handleDocsWShortcut(e: KeyboardEvent) {
    if (!displayDocs) return;
    e.preventDefault();
    displayDocs();
  }

  function handleSaveWShortcut(e: KeyboardEvent) {
    if (
      (isWrappedWithClass(e, "noflow") && !showOverrideModal) ||
      !saveComponent
    )
      return;
    e.preventDefault();
    saveComponent();
  }

  function handleShareWShortcut(e: KeyboardEvent) {
    if (
      (isWrappedWithClass(e, "noflow") && !showconfirmShare) ||
      !shareComponent
    )
      return;
    e.preventDefault();
    shareComponent();
  }

  function handleGroupWShortcut(e: KeyboardEvent) {
    if (isWrappedWithClass(e, "noflow") || !ungroup) return;
    e.preventDefault();
    ungroup();
  }

  function handleMinimizeWShortcut(e: KeyboardEvent) {
    if (isWrappedWithClass(e, "noflow") || !minimizeFunction) return;
    e.preventDefault();
    minimizeFunction();
  }

  useHotkeys(minimize, handleMinimizeWShortcut, { preventDefault: true });
  useHotkeys(group, handleGroupWShortcut, { preventDefault: true });
  useHotkeys(componentShare, handleShareWShortcut, { preventDefault: true });
  useHotkeys(save, handleSaveWShortcut, { preventDefault: true });
  useHotkeys(docs, handleDocsWShortcut, { preventDefault: true });
  useHotkeys(download, handleDownloadWShortcut, { preventDefault: true });
}
