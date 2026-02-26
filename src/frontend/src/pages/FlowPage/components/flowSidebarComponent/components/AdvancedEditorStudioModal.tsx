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
import { PoseGeneratorPanel } from "./PoseGeneratorModal";

export type AdvancedEditorStudioTab = "scribble-video" | "scribble-image" | "pose-generator";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: AdvancedEditorStudioTab;
};

export default function AdvancedEditorStudioModal({ open, onOpenChange, initialTab }: Props) {
  const [tab, setTab] = useState<AdvancedEditorStudioTab>(initialTab);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [initialTab, open]);

  const tabs = useMemo(
    () => [
      { key: "scribble-video", label: "涂鸦生视频", disabled: true },
      { key: "scribble-image", label: "涂鸦生图", disabled: false },
      { key: "pose-generator", label: "姿势生成器", disabled: false },
    ] as const,
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[94vh] w-[98vw] max-w-[1680px] overflow-hidden p-0",
          "border-0 bg-transparent shadow-none",
        )}
        closeButtonClassName={cn(
          "right-5 top-5 h-10 w-10 rounded-full bg-muted/60 hover:bg-muted/80",
          "backdrop-blur",
        )}
      >
        <VisuallyHidden>
          <DialogTitle>高级编辑工作台</DialogTitle>
          <DialogDescription>涂鸦生图与姿势生成器</DialogDescription>
        </VisuallyHidden>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="h-full">
          <div className="flex h-full flex-col bg-background text-foreground">
            <div className="flex justify-center px-6 pt-5">
              <TabsList className="h-10 w-fit gap-1 rounded-full bg-muted/60 p-1">
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    disabled={t.disabled}
                    className={cn(
                      "h-8 rounded-full px-6 text-sm font-medium text-muted-foreground",
                      "data-[state=active]:bg-background data-[state=active]:text-foreground",
                      "data-[state=inactive]:hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="min-h-0 flex-1">
              <TabsContent value="scribble-image" className="mt-0 h-full">
                <ScribbleImageStudio active={open && tab === "scribble-image"} onRequestClose={() => onOpenChange(false)} />
              </TabsContent>
              <TabsContent value="pose-generator" className="mt-0 h-full">
                <PoseGeneratorPanel
                  open={open && tab === "pose-generator"}
                  onOpenChange={(next) => {
                    if (!next) onOpenChange(false);
                  }}
                  embedded
                  hideTitle
                />
              </TabsContent>
              <TabsContent value="scribble-video" className="mt-0 h-full">
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  敬请期待
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
