import { ForwardedIconComponent } from "@/components/common/genericIconComponent";

export const CustomStoreSidebar = (hasStore: boolean = false) => {
  const items: Array<{ title: string; href: string; icon: JSX.Element }> = [];

  if (hasStore) {
    items.push({
      title: "Langflow Store",
      href: "/settings/store",
      icon: (
        <ForwardedIconComponent
          name="Store"
          className="w-4 flex-shrink-0 justify-start stroke-[1.5]"
        />
      ),
    });
  }

  return items;
};
