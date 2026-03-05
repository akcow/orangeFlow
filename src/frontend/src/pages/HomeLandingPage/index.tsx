import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAddFlow from "@/hooks/flows/use-add-flow";
import useCreateBlankFlow from "@/hooks/flows/use-create-blank-flow";
import HomeTVShowcase from "@/pages/HomeLandingPage/HomeTVShowcase";
import { TapNowLanding } from "@/pages/MainPage/pages/homePage/TapNowLanding";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import type { CommunityItem } from "@/types/community";
import { getCommunityImageUrl } from "@/utils/communityFiles";
import { cn } from "@/utils/utils";

const TEMPLATE_CATEGORIES = [
  "全部",
  "广告",
  "电商",
  "影视",
  "生活",
  "工具",
  "有趣",
  "ACG",
  "其他",
] as const;

function HomeTemplateShowcase() {
  const navigate = useCustomNavigate();
  const addFlow = useAddFlow();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const [category, setCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]>(
    "全部",
  );

  const categoryFilter = category === "全部" ? undefined : category;

  const listPublic = useQuery({
    queryKey: ["home", "workflows", "public", categoryFilter],
    queryFn: async () => {
      const r = await api.get<CommunityItem[]>(
        `${getURL("COMMUNITY")}/items/public`,
        {
          params: {
            type: "WORKFLOW",
            ...(categoryFilter ? { category: categoryFilter } : {}),
            limit: 24,
          },
        },
      );
      return r.data ?? [];
    },
  });

  const cloneToWorkspace = async (flowId: string) => {
    try {
      const r = await api.get<Record<string, unknown>>(
        getURL("PUBLIC_FLOW", { flowId }),
      );
      const flow = r.data as any;
      const newId = await addFlow({ flow });
      if (typeof newId === "string" && newId) {
        setSuccessData({ title: "已克隆到工作空间" });
        navigate(`/flow/${newId}/`);
      }
    } catch (error: any) {
      setErrorData({ title: "克隆失败", list: [error?.message ?? "未知错误"] });
    }
  };

  if (listPublic.isLoading) {
    return <div className="py-8 text-sm text-muted-foreground">加载模板库中...</div>;
  }

  const items = listPublic.data ?? [];
  if (!items.length) {
    return <div className="py-8 text-sm text-muted-foreground">暂无模板内容</div>;
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TEMPLATE_CATEGORIES.map((item) => {
          const active = item === category;
          return (
            <Button
              key={item}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-8 rounded-full", !active && "text-muted-foreground")}
              onClick={() => setCategory(item)}
            >
              {item}
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.map((item) => {
          const coverUrl = item.cover_path
            ? getCommunityImageUrl(item.cover_path)
            : null;
          const canClone = isAuthenticated && item.status === "PUBLIC";
          return (
            <div key={item.id} className="group">
              <div className="overflow-hidden rounded-2xl border bg-muted/10">
                <div className="relative aspect-[4/3] w-full bg-muted/20">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                      <IconComponent name="Workflow" className="mr-2 h-4 w-4" />
                      无封面
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      type="button"
                      className={cn("rounded-full", !canClone && "opacity-60")}
                      disabled={!canClone}
                      onClick={() => cloneToWorkspace(item.flow_id)}
                    >
                      克隆
                      <IconComponent name="ArrowUpRight" className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <div className="truncate font-medium">{item.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  @{item.user_name ?? "匿名"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomeLandingPage() {
  const navigate = useCustomNavigate();
  const createBlankFlow = useCreateBlankFlow();

  const handleCreateNewFlow = useCallback(async () => {
    try {
      await createBlankFlow();
    } catch {
      // Keep create-flow UX silent on failure.
    }
  }, [createBlankFlow]);

  return (
    <TapNowLanding
      onCreateNew={handleCreateNewFlow}
      onOpenTemplates={() => navigate("/community/workflows")}
    >
      <HomeTemplateShowcase />

      <div className="mt-12">
        <div
          className="mb-4 flex w-fit cursor-pointer items-center gap-2 hover:opacity-80"
          onClick={() => navigate("/community/tv")}
        >
          <h2 className="text-xl font-semibold text-white">TapTV</h2>
          <ArrowRight className="h-5 w-5 text-gray-400" />
        </div>
        <p className="mb-4 text-sm text-gray-400">为你推荐</p>
        <HomeTVShowcase />
      </div>
    </TapNowLanding>
  );
}
