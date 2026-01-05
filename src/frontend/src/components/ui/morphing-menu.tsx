import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/utils";

type MorphingMenuItem = {
  icon?: string;
  label: string;
  onClick: () => void;
};

export function MorphingMenu({
  variant = "large",
  trigger,
  items,
}: {
  variant?: "large" | "small";
  trigger: string;
  items: MorphingMenuItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={variant === "large" ? "md" : "sm"}
          className={cn(variant === "large" ? "w-full justify-between" : "")}
        >
          <span>{trigger}</span>
          <IconComponent name="ChevronDown" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onClick}>
            {item.icon ? (
              <IconComponent name={item.icon} className="mr-2 h-4 w-4" />
            ) : null}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

