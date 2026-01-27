import {
  type DragEventHandler,
  forwardRef,
  useCallback,
  useRef,
  useState,
} from "react";
import IconComponent, {
  ForwardedIconComponent,
} from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n/t";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select-custom";
import useDeleteFlow from "@/hooks/flows/use-delete-flow";
import { useAddComponent } from "@/hooks/use-add-component";
import { useDarkStore } from "@/stores/darkStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { APIClassType } from "@/types/api";
import {
  createFlowComponent,
  downloadNode,
  getNodeId,
} from "@/utils/reactflowUtils";
import { cn, removeCountFromString } from "@/utils/utils";

export const SidebarDraggableComponent = forwardRef(
  (
    {
      sectionName,
      display_name,
      icon,
      itemName,
      error,
      color,
      onDragStart,
      apiClass,
      official,
      onDelete,
      beta,
      legacy,
      disabled,
      disabledTooltip,
    }: {
      sectionName: string;
      apiClass: APIClassType;
      icon: string;
      display_name: string;
      itemName: string;
      error: boolean;
      color: string;
      onDragStart: DragEventHandler<HTMLDivElement>;
      official: boolean;
      onDelete?: () => void;
      beta: boolean;
      legacy: boolean;
      disabled?: boolean;
      disabledTooltip?: string;
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const { deleteFlow } = useDeleteFlow();
    const flows = useFlowsManagerStore((state) => state.flows);
    const addComponent = useAddComponent();
    const suppressClickRef = useRef(false);

    const version = useDarkStore((state) => state.version);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const popoverRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e) => {
      if (!open) {
        const rect = popoverRef.current?.getBoundingClientRect() ?? {
          left: 0,
          top: 0,
        };
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    };

    function handleSelectChange(value: string) {
      switch (value) {
        case "download": {
          const type = removeCountFromString(itemName);
          downloadNode(
            createFlowComponent(
              { id: getNodeId(type), type, node: apiClass },
              version,
            ),
          );
          break;
        }
        case "delete": {
          if (onDelete) {
            onDelete();
            break;
          }
          const flowId = flows?.find((f) => f.name === display_name);
          if (flowId) deleteFlow({ id: flowId.id });
          break;
        }
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        addComponent(apiClass, itemName);
      }
    };

    const handleAddComponent = useCallback(() => {
      if (disabled || error) return;
      addComponent(apiClass, itemName);
    }, [addComponent, apiClass, itemName, disabled, error]);

    return (
      <Select
        onValueChange={handleSelectChange}
        onOpenChange={(change) => setOpen(change)}
        open={open}
        key={itemName}
      >
        <ShadTooltip
          content={disabled ? disabledTooltip : null}
          styleClasses="z-50"
        >
          <div
            onPointerDown={handlePointerDown}
            onContextMenuCapture={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            key={itemName}
            data-tooltip-id={itemName}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="rounded-md outline-none ring-ring focus-visible:ring-1"
            data-testid={`${sectionName.toLowerCase()}_${display_name.toLowerCase()}_draggable`}
          >
            <div
              data-testid={sectionName + display_name}
              id={sectionName + display_name}
              className={cn(
                "group/draggable flex w-full cursor-pointer items-center gap-4 rounded-xl bg-muted px-4 py-2.5 hover:bg-secondary-hover/75",
                error && "cursor-not-allowed select-none",
                disabled
                  ? "pointer-events-none bg-accent text-placeholder-foreground h-12"
                  : "bg-muted text-foreground",
              )}
              draggable={!error}
              style={{
                borderLeftColor: color,
              }}
              onDragStart={(event) => {
                suppressClickRef.current = true;
                onDragStart(event);
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement | null;
                if (!target) return;
                if (open) return;
                if (suppressClickRef.current) return;
                if (target.closest('[data-stop-add="true"]')) return;
                handleAddComponent();
              }}
              onDragEnd={() => {
                if (
                  document.getElementsByClassName("cursor-grabbing").length > 0
                ) {
                  document.body.removeChild(
                    document.getElementsByClassName("cursor-grabbing")[0],
                  );
                }
                // A drag gesture often ends with a click; suppress it briefly.
                setTimeout(() => {
                  suppressClickRef.current = false;
                }, 150);
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/60 ring-1 ring-border/60">
                <ForwardedIconComponent name={icon} className="h-5 w-5" />
              </div>
              <div className="flex flex-1 items-center overflow-hidden">
                <ShadTooltip content={display_name} styleClasses="z-50">
                  <span
                    data-testid="display-name"
                    className="truncate text-base font-normal"
                  >
                    {display_name}
                  </span>
                </ShadTooltip>
                {beta && (
                  <Badge
                    variant="purpleStatic"
                    size="xq"
                    className="ml-1.5 shrink-0"
                  >
                    {t("Beta")}
                  </Badge>
                )}
                {legacy && (
                  <Badge
                    variant="secondaryStatic"
                    size="xq"
                    className="ml-1.5 shrink-0"
                  >
                    {t("Legacy")}
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div
                  ref={popoverRef}
                  data-stop-add="true"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ForwardedIconComponent
                    name="GripVertical"
                    className="h-5 w-5 shrink-0 text-muted-foreground group-hover/draggable:text-primary"
                  />
                  <SelectTrigger tabIndex={-1}></SelectTrigger>
                  <SelectContent
                    position="popper"
                    side="bottom"
                    sideOffset={-25}
                    style={{
                      position: "absolute",
                      left: cursorPos.x,
                      top: cursorPos.y,
                    }}
                  >
                    <SelectItem value={"download"}>
                      <div className="flex">
                        <IconComponent
                          name="Download"
                          className="relative top-0.5 mr-2 h-4 w-4"
                        />{" "}
                        {t("Download")}{" "}
                      </div>{" "}
                    </SelectItem>
                    {(!official || onDelete) && (
                      <SelectItem
                        value={"delete"}
                        data-testid="draggable-component-menu-delete"
                      >
                        <div className="flex">
                          <IconComponent
                            name="Trash2"
                            className="relative top-0.5 mr-2 h-4 w-4"
                          />{" "}
                          {t("Delete")}{" "}
                        </div>{" "}
                      </SelectItem>
                    )}
                  </SelectContent>
                </div>
              </div>
            </div>
          </div>
        </ShadTooltip>
      </Select>
    );
  },
);

export default SidebarDraggableComponent;
