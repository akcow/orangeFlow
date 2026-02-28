import { useContext } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { ADMIN_HEADER_TITLE } from "@/constants/constants";
import { AuthContext } from "@/contexts/authContext";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import CommunityModerationPanel from "./CommunityModerationPanel";

export default function AdminCommunityPage() {
  const { userData } = useContext(AuthContext);
  const navigate = useCustomNavigate();

  return (
    <>
      {userData && (
        <div className="admin-page-panel flex h-full flex-col pb-8">
          <div className="main-page-nav-arrangement flex items-center justify-between">
            <span className="main-page-nav-title">
              <IconComponent name="Shield" className="w-6" />
              {ADMIN_HEADER_TITLE}
            </span>
            {userData?.is_superuser && (
              <Button variant="ghost" onClick={() => navigate("/admin")}>
                <IconComponent name="ArrowLeft" className="mr-2 h-4 w-4" />
                返回用户管理
              </Button>
            )}
          </div>

          <span className="admin-page-description-text">
            投稿审核（TV / 工作流）
          </span>

          <div className="mt-2 flex-1 overflow-hidden">
            <CommunityModerationPanel />
          </div>
        </div>
      )}
    </>
  );
}
