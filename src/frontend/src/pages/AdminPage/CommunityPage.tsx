import { useContext } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { AuthContext } from "@/contexts/authContext";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import CommunityModerationPanel from "./CommunityModerationPanel";

const MODERATION_CENTER = "审核中心";
const CONTENT_MODERATION = "内容审核";
const USER_MANAGEMENT = "返回用户管理";
const DESCRIPTION =
  "统一处理社区投稿的审核、驳回与下架，支持 TV 和工作流两类内容。";

export default function AdminCommunityPage() {
  const { userData } = useContext(AuthContext);
  const navigate = useCustomNavigate();

  return (
    <>
      {userData && (
        <div className="admin-page-panel flex min-h-full flex-col gap-4 pb-8">
          <div className="rounded-2xl border border-border/60 bg-background/95 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <IconComponent name="Shield" className="h-4 w-4" />
                  {MODERATION_CENTER}
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {CONTENT_MODERATION}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {DESCRIPTION}
                  </p>
                </div>
              </div>

              {userData?.is_superuser && (
                <Button variant="secondary" onClick={() => navigate("/admin")}>
                  <IconComponent name="ArrowLeft" className="mr-2 h-4 w-4" />
                  {USER_MANAGEMENT}
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0">
            <CommunityModerationPanel />
          </div>
        </div>
      )}
    </>
  );
}
