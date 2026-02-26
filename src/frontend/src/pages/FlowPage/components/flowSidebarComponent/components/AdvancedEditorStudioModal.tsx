import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  VisuallyHidden,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils/utils";
import ScribbleImageStudio from "./ScribbleImageStudio";
import ScribbleVideoStudio from "./ScribbleVideoStudio";
import { PoseGeneratorPanel } from "./PoseGeneratorModal";

export type AdvancedEditorStudioTab =
  | "scribble-video"
  | "scribble-image"
  | "pose-generator";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: AdvancedEditorStudioTab;
};

export default function AdvancedEditorStudioModal({
  open,
  onOpenChange,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<AdvancedEditorStudioTab>(initialTab);
  const [pendingTab, setPendingTab] = useState<AdvancedEditorStudioTab | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dirtyByTab, setDirtyByTab] = useState<
    Record<AdvancedEditorStudioTab, boolean>
  >({
    "scribble-video": false,
    "scribble-image": false,
    "pose-generator": false,
  });
  const [tabEpoch, setTabEpoch] = useState<
    Record<AdvancedEditorStudioTab, number>
  >({
    "scribble-video": 0,
    "scribble-image": 0,
    "pose-generator": 0,
  });

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    if (open) return;
    setPendingTab(null);
    setConfirmOpen(false);
    setDirtyByTab({
      "scribble-video": false,
      "scribble-image": false,
      "pose-generator": false,
    });
  }, [open]);

  const tabs = useMemo(
    () =>
      [
        { key: "scribble-video", label: "涂鸦生视频", disabled: false },
        { key: "scribble-image", label: "涂鸦生图", disabled: false },
        { key: "pose-generator", label: "姿势生成器", disabled: false },
      ] as const,
    [],
  );

  const tabLabel = useMemo(
    () =>
      tabs.reduce(
        (acc, t) => {
          acc[t.key] = t.label;
          return acc;
        },
        {} as Record<AdvancedEditorStudioTab, string>,
      ),
    [tabs],
  );

  const handleTabChange = (nextTab: AdvancedEditorStudioTab) => {
    if (nextTab === tab) return;
    if (dirtyByTab[tab]) {
      setPendingTab(nextTab);
      setConfirmOpen(true);
      return;
    }
    setTab(nextTab);
  };

  const handleConfirmSwitch = () => {
    if (!pendingTab) return;
    const current = tab;
    setDirtyByTab((prev) => ({ ...prev, [current]: false }));
    // Force remount of the current tab panel so edits are truly discarded.
    setTabEpoch((prev) => ({ ...prev, [current]: prev[current] + 1 }));
    setTab(pendingTab);
    setPendingTab(null);
    setConfirmOpen(false);
  };

  const handleCancelSwitch = () => {
    setPendingTab(null);
    setConfirmOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[94vh] w-[98vw] max-w-[1680px] overflow-hidden p-0",
          "border-0 bg-transparent shadow-none",
        )}
        closeButtonClassName={cn(
          "right-6 top-4 z-30 h-10 w-10 rounded-full border border-border/60 bg-background/90 hover:bg-background",
          "backdrop-blur-sm shadow",
        )}
      >
        <VisuallyHidden>
          <DialogTitle>高级编辑工作台</DialogTitle>
          <DialogDescription>
            涂鸦生视频、涂鸦生图与姿势生成器
          </DialogDescription>
        </VisuallyHidden>

        <Tabs
          value={tab}
          onValueChange={(v) => handleTabChange(v as AdvancedEditorStudioTab)}
          className="relative h-full"
        >
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-6">
            <TabsList className="pointer-events-auto h-12 w-fit gap-1 rounded-full border border-border/60 bg-background/85 p-1.5 backdrop-blur">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  disabled={t.disabled}
                  className={cn(
                    "h-9 rounded-full px-8 text-base font-medium text-muted-foreground",
                    "data-[state=active]:bg-foreground data-[state=active]:text-background",
                    "data-[state=inactive]:hover:text-foreground",
                  )}
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="absolute inset-x-5 bottom-4 top-20 overflow-hidden rounded-[22px] border border-border/60 bg-background text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="h-full min-h-0">
              <TabsContent value="scribble-image" className="mt-0 h-full">
                <ScribbleImageStudio
                  key={`scribble-image-${tabEpoch["scribble-image"]}`}
                  active={open && tab === "scribble-image"}
                  onRequestClose={() => onOpenChange(false)}
                  onDirtyChange={(dirty) =>
                    setDirtyByTab((prev) => ({
                      ...prev,
                      "scribble-image": dirty,
                    }))
                  }
                />
              </TabsContent>

              <TabsContent value="pose-generator" className="mt-0 h-full">
                <PoseGeneratorPanel
                  key={`pose-generator-${tabEpoch["pose-generator"]}`}
                  open={open && tab === "pose-generator"}
                  onOpenChange={(next) => {
                    if (!next) onOpenChange(false);
                  }}
                  embedded
                  hideTitle
                  onDirtyChange={(dirty) =>
                    setDirtyByTab((prev) => ({
                      ...prev,
                      "pose-generator": dirty,
                    }))
                  }
                />
              </TabsContent>

              <TabsContent value="scribble-video" className="mt-0 h-full">
                <ScribbleVideoStudio
                  key={`scribble-video-${tabEpoch["scribble-video"]}`}
                  active={open && tab === "scribble-video"}
                  onRequestClose={() => onOpenChange(false)}
                  onDirtyChange={(dirty) =>
                    setDirtyByTab((prev) => ({
                      ...prev,
                      "scribble-video": dirty,
                    }))
                  }
                />
              </TabsContent>
            </div>
          </div>

          {confirmOpen && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45">
              <div className="w-[min(440px,92vw)] rounded-[16px] border border-white/10 bg-[#02040b] px-5 py-4 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
                <div className="text-[16px] font-semibold leading-tight tracking-tight">
                  {`确认切换到${pendingTab ? tabLabel[pendingTab] : ""}?`}
                </div>
                <div className="mt-3 text-[13px] font-medium leading-snug text-white/55">
                  切换后，当前更改将丢失。是否继续？
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-xl px-4 text-[14px] font-semibold text-white/90 hover:bg-white/10"
                    onClick={handleCancelSwitch}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-xl bg-[#2bb0ef] px-5 text-[14px] font-semibold text-white shadow-[0_8px_18px_rgba(43,176,239,0.32)] hover:bg-[#1ca7ea]"
                    onClick={handleConfirmSwitch}
                  >
                    确认
                  </button>
                </div>
              </div>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
