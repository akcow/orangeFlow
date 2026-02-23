import { Dialog, DialogContent } from "@/components/ui/dialog";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";

type ShortcutRow = {
  left: string;
  right: string;
};

const SHORTCUTS: ShortcutRow[] = [
  { left: "Left / Right", right: "移动选区" },
  { left: "Up / Down", right: "扩大/收缩选区" },
  { left: "Shift + Arrow", right: "精确微调 (0.01s)" },
  { left: "Ctrl/Cmd + Arrow", right: "快速调整 (1s)" },
  { left: "I / O", right: "设置入点/出点" },
  { left: "Space", right: "播放/暂停预览" },
  { left: "Enter", right: "完成剪辑" },
  { left: "Esc", right: "取消" },
];

export default function VideoClipShortcutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[680px] max-w-[92vw] rounded-2xl border bg-background p-0 text-foreground shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex items-center gap-3 text-base font-semibold">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <ForwardedIconComponent name="Keyboard" className="h-5 w-5" />
            </div>
            <span>剪辑快捷键</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 py-6">
          {SHORTCUTS.map((row) => (
            <div
              key={`${row.left}-${row.right}`}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border",
                "bg-muted/30 px-5 py-4",
              )}
            >
              <div className="rounded-xl border bg-background/60 px-3 py-2 font-mono text-sm text-foreground">
                {row.left}
              </div>
              <div className="text-sm text-muted-foreground">{row.right}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
