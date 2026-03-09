import { useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n/t";
import TVPublishForm from "@/pages/Community/TVPublishForm";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { cn } from "@/utils/utils";

type DeployMenuItem = {
  key: "publish" | "share" | "move";
  title: string;
  description: string;
  actionLabel: string;
  iconName: string;
  disabled?: boolean;
  onClick: () => void;
};

export default function PublishDropdown() {
  const [openTvPublish, setOpenTvPublish] = useState(false);
  const currentFlow = useFlowsManagerStore((state) => state.currentFlow);
  const flowId = currentFlow?.id;

  const deployMenuItems: DeployMenuItem[] = [
    {
      key: "publish",
      title: "在 TapTV 上发布",
      description: "在 TapTV 上发布你的作品，让更多创作者看到。",
      actionLabel: "发布",
      iconName: "Globe",
      disabled: !flowId,
      onClick: () => {
        if (!flowId) return;
        setOpenTvPublish(true);
      },
    },
    {
      key: "share",
      title: "通过链接分享",
      description: "任何拥有此链接的人都可以查看并克隆你的画布。",
      actionLabel: "分享",
      iconName: "Link2",
      onClick: () => { },
    },
    {
      key: "move",
      title: "移动到团队项目",
      description: "将此项目转移到团队进行协作。",
      actionLabel: "移动",
      iconName: "ScanSearch",
      onClick: () => { },
    },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 flex cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:bg-gray-100 transition-colors"
            data-testid="publish-button"
          >
            <IconComponent name="Forward" className="h-[22px] w-[22px] text-gray-500" strokeWidth={2.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          forceMount
          sideOffset={7}
          alignOffset={-2}
          align="end"
          className="w-[400px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md"
        >
          {deployMenuItems.map((item, index) => (
            <DropdownMenuItem
              key={item.key}
              className={cn(
                "group flex cursor-pointer items-start gap-2.5 rounded-none px-0 py-3 outline-none focus:bg-transparent data-[highlighted]:bg-transparent",
                index !== deployMenuItems.length - 1 &&
                "border-b border-border",
              )}
              disabled={item.disabled}
              onClick={item.onClick}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <IconComponent
                  name={item.iconName}
                  className="h-[18px] w-[18px]"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold leading-tight text-foreground">
                  {item.title}
                </div>
                <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <div className="ml-2 mt-0.5 flex h-9 min-w-[78px] items-center justify-center rounded-xl bg-muted px-3.5 text-[15px] font-semibold text-foreground transition-colors duration-150 group-hover:bg-accent">
                {item.actionLabel}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openTvPublish} onOpenChange={setOpenTvPublish}>
        <DialogContent className="max-w-3xl p-0" closeButtonClassName="hidden">
          {flowId ? (
            <TVPublishForm
              flowId={flowId}
              onClose={() => setOpenTvPublish(false)}
              onSuccess={() => setOpenTvPublish(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
