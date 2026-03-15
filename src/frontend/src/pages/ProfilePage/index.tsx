import { useCallback, useContext, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cloneDeep } from "lodash";
import {
  ArrowUpRight,
  Camera,
  CircleDollarSign,
  Edit2,
  History,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { useUpdateUser } from "@/controllers/API/queries/auth";
import {
  useGetMyCreditLedgerQuery,
  useGetMyCreditsQuery,
} from "@/controllers/API/queries/credits";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { AuthContext } from "@/contexts/authContext";
import useAuthStore from "@/stores/authStore";
import useAlertStore from "@/stores/alertStore";
import type { FlowType } from "@/types/flow";
import { getCommunityImageUrl } from "@/utils/communityFiles";
import { customPreLoadImageUrl } from "@/customization/utils/custom-pre-load-image-url";
import { cn } from "@/utils/utils";
import Cropper from "react-easy-crop";
import getCroppedImg from "@/components/core/appHeaderComponent/components/TeamMenu/cropImage";

type TabKey = "works" | "favorites";

interface ProfilePageProps {
  userId?: string;
}

const DEFAULT_BIO = "I am turning imagination into reality.";

export default function ProfilePage({ userId }: ProfilePageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useCustomNavigate();
  const { userData: currentUserData, setUserData: setContextUserData } = useContext(AuthContext);
  const { isAuthenticated, userData, setUserData: setStoreUserData } = useAuthStore();
  const { mutate: mutatePatchUser } = useUpdateUser();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);

  const [activeTab, setActiveTab] = useState<TabKey>("works");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("");

  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && userData?.id && !backgroundImage) {
      const bg = localStorage.getItem(`profile_background_${userData.id}`);
      if (bg && !bg.startsWith("blob:")) {
        setBackgroundImage(bg);
      } else if (bg && bg.startsWith("blob:")) {
        localStorage.removeItem(`profile_background_${userData.id}`);
      }
    }
  }, [userData?.id]);

  const [isBackgroundHovered, setIsBackgroundHovered] = useState(false);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);

  // Custom Avatar Cropping States
  const [isAvatarCropping, setIsAvatarCropping] = useState(false);
  const [avatarCropSource, setAvatarCropSource] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarCroppedAreaPixels, setAvatarCroppedAreaPixels] = useState(null);

  // Custom Background Cropping States
  const [isBackgroundCropping, setIsBackgroundCropping] = useState(false);
  const [pendingBackgroundImage, setPendingBackgroundImage] = useState<string | null>(null);
  const [backgroundCrop, setBackgroundCrop] = useState({ x: 0, y: 0 });
  const [backgroundZoom, setBackgroundZoom] = useState(1);
  const [backgroundCroppedAreaPixels, setBackgroundCroppedAreaPixels] = useState(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !userId || userId === userData?.id;
  const profileUser = isOwnProfile ? userData : null;
  const displayName = profileUser?.nickname || profileUser?.username || t("User");
  const accountName = profileUser?.username || t("User");
  const userInitial = displayName.slice(0, 1).toUpperCase();

  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ?? true;
  const { data: creditAccount } = useGetMyCreditsQuery({ enabled: isOwnProfile });
  const { data: creditLedger = [] } = useGetMyCreditLedgerQuery(
    { limit: 10 },
    { enabled: isOwnProfile },
  );

  // 获取用户实际创建的 flow（有封面的才算作品）
  const userFlowsQuery = useQuery({
    queryKey: ["profile", "flows", profileUser?.id],
    queryFn: async () => {
      if (!profileUser?.id) return [];
      const { data } = await api.get<FlowType[]>(`${getURL("FLOWS")}/`, {
        params: { get_all: true },
      });
      return (data ?? []).filter(flow => flow.cover_path);
    },
    enabled: !!profileUser?.id && activeTab === "works",
  });

  const handleEditProfile = () => {
    setEditUsername(profileUser?.nickname || profileUser?.username || "");
    setEditBio(DEFAULT_BIO);
    setSelectedAvatar(profileUser?.profile_image ?? "");
    setUploadedAvatar(null);
    setIsEditDialogOpen(true);
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarCropSource(reader.result as string);
        setIsAvatarCropping(true);
      };
      reader.readAsDataURL(file);
    }
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const onAvatarCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setAvatarCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirmAvatarCrop = useCallback(async () => {
    try {
      if (!avatarCropSource || !avatarCroppedAreaPixels) return;
      const croppedImage = await getCroppedImg(avatarCropSource, avatarCroppedAreaPixels, 0);
      setUploadedAvatar(croppedImage);
      setSelectedAvatar("");
      setIsAvatarCropping(false);
      setAvatarCropSource(null);
      setAvatarZoom(1);
    } catch (e) {
      console.error(e);
    }
  }, [avatarCropSource, avatarCroppedAreaPixels]);

  const handleCancelAvatarCrop = () => {
    setIsAvatarCropping(false);
    setAvatarCropSource(null);
    setAvatarZoom(1);
  };

  const handleSaveProfile = useCallback(() => {
    const trimmedNickname = editUsername.trim();
    const avatarToSave = uploadedAvatar || selectedAvatar;
    if (avatarToSave && avatarToSave !== profileUser?.profile_image) {
      mutatePatchUser(
        {
          user_id: profileUser!.id,
          user: {
            profile_image: avatarToSave,
            nickname:
              trimmedNickname !== (profileUser?.nickname ?? profileUser?.username)
                ? trimmedNickname
                : undefined,
          },
        },
        {
          onSuccess: () => {
            const newUserData = cloneDeep(currentUserData);
            newUserData!.profile_image = avatarToSave;
            if (trimmedNickname) newUserData!.nickname = trimmedNickname;
            setContextUserData(newUserData);
            setStoreUserData(newUserData);
            setSuccessData({ title: t("Profile updated") });
            setIsEditDialogOpen(false);
          },
          onError: (error: any) => {
            setErrorData({
              title: t("Failed to update profile"),
              list: [error?.response?.data?.detail ?? t("Unknown error")],
            });
          },
        },
      );
    } else if (trimmedNickname !== (profileUser?.nickname ?? profileUser?.username)) {
      mutatePatchUser(
        { user_id: profileUser!.id, user: { nickname: trimmedNickname } },
        {
          onSuccess: () => {
            const newUserData = cloneDeep(currentUserData);
            newUserData!.nickname = trimmedNickname;
            setContextUserData(newUserData);
            setStoreUserData(newUserData);
            setSuccessData({ title: t("Profile updated") });
            setIsEditDialogOpen(false);
          },
          onError: (error: any) => {
            setErrorData({
              title: t("Failed to update profile"),
              list: [error?.response?.data?.detail ?? t("Unknown error")],
            });
          },
        },
      );
    } else {
      setIsEditDialogOpen(false);
    }
  }, [uploadedAvatar, selectedAvatar, editUsername, profileUser, currentUserData, setContextUserData, setStoreUserData, mutatePatchUser, setSuccessData, setErrorData, t]);

  const getValidAvatarUrl = (url: string | undefined | null) => {
    if (!url) return undefined;
    if (url.startsWith("data:image")) return url;
    return customPreLoadImageUrl(url);
  };

  const handleShareProfile = () => {
    const profileUrl = window.location.href;
    navigator.clipboard.writeText(profileUrl);
    setSuccessData({ title: t("Profile link copied") });
  };

  const handleCreateNewFlow = () => {
    navigate("/all");
  };

  const handleBackgroundButtonClick = () => {
    backgroundInputRef.current?.click();
  };

  const handleBackgroundFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingBackgroundImage(reader.result as string);
        setBackgroundZoom(1);
        setIsBackgroundCropping(true);
      };
      reader.readAsDataURL(file);
    }
    if (backgroundInputRef.current) backgroundInputRef.current.value = '';
  };

  const onBackgroundCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setBackgroundCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirmBackgroundCrop = useCallback(async () => {
    try {
      if (!pendingBackgroundImage || !backgroundCroppedAreaPixels) return;
      const croppedImage = await getCroppedImg(pendingBackgroundImage, backgroundCroppedAreaPixels, 0);
      setBackgroundImage(croppedImage);
      if (profileUser?.id) {
        localStorage.setItem(`profile_background_${profileUser.id}`, croppedImage);
      }
      setIsBackgroundCropping(false);
      setPendingBackgroundImage(null);
      setBackgroundZoom(1);
    } catch (e) {
      console.error(e);
    }
  }, [pendingBackgroundImage, backgroundCroppedAreaPixels, profileUser?.id]);

  const handleCancelBackgroundCrop = () => {
    setIsBackgroundCropping(false);
    setPendingBackgroundImage(null);
    setBackgroundZoom(1);
  };

  const handleChangeLanguage = (lang: "zh-CN" | "en") => {
    void i18n.changeLanguage(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("langflow-language", lang);
    }
  };

  const flows = userFlowsQuery.data ?? [];
  const currentAvatarSrc = uploadedAvatar || getValidAvatarUrl(selectedAvatar);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0D0D0F]">
      {/* 背景横幅 - 高度185px */}
      <div
        className="relative h-[185px] w-full shrink-0"
        onMouseEnter={() => setIsBackgroundHovered(true)}
        onMouseLeave={() => setIsBackgroundHovered(false)}
      >
        {/* 背景图片 */}
        {backgroundImage && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${backgroundImage})`,
              }}
            />
            {/* 悬停时变灰遮罩 */}
            {isBackgroundHovered && (
              <div className="absolute inset-0 bg-black/40 transition-opacity duration-200" />
            )}
          </>
        )}

        {/* 默认背景渐变 */}
        {!backgroundImage && (
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
        )}

        {/* 更换背景按钮 - hover时显示，无黑色容器 */}
        {isBackgroundHovered && (
          <button
            onClick={handleBackgroundButtonClick}
            className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-black/60 px-4 py-2 text-white backdrop-blur-sm transition-all hover:bg-black/80"
          >
            <Camera className="h-5 w-5" />
            <span className="text-sm">{t("Change Background")}</span>
          </button>
        )}

        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBackgroundFileSelect}
        />
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧用户信息面板 */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/5 bg-[#0D0D0F] p-6">
          <div className="relative flex flex-col items-center gap-4 rounded-2xl bg-[#1A1A1D] p-6">
            {/* 分享按钮 - 卡片右上角 */}
            {isOwnProfile && (
              <button
                onClick={handleShareProfile}
                className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-[#2D2D30] text-white shadow-lg transition-colors hover:bg-[#3D3D40]"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            )}

            {/* 头像 */}
            <div className="relative">
              <Avatar
                className="h-16 w-16 border-2 border-white/20 cursor-pointer"
                onClick={() => isOwnProfile && avatarInputRef.current?.click()}
              >
                <AvatarImage
                  src={getValidAvatarUrl(profileUser?.profile_image)}
                  alt={displayName}
                />
                <AvatarFallback className="bg-[#44444C] text-xl font-semibold text-white">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              {/* 编辑按钮 - 头像右下角 */}
              {isOwnProfile && (
                <button
                  onClick={handleEditProfile}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#2D2D30] text-white shadow-lg transition-colors hover:bg-[#3D3D40]"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            {/* 用户名和简介 */}
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">{displayName}</h2>
              <p className="mt-1 text-xs text-[#7E7E88]">@{accountName}</p>
              <p className="mt-1 text-sm text-[#A0A0A0]">
                {DEFAULT_BIO}
              </p>
            </div>
          </div>
        </aside>

        {/* 右侧主内容 */}
        <main className="flex-1 overflow-y-auto p-6">
          {isOwnProfile ? (
            <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
              <section className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,200,87,0.22),rgba(255,255,255,0.06))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                <div className="flex items-center gap-3 text-white">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/20">
                    <CircleDollarSign className="h-5 w-5 text-amber-200" />
                  </div>
                  <div>
                    <p className="text-sm text-white/70">{isZh ? "当前积分" : "Current Credits"}</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                      {creditAccount?.balance ?? 0}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                    <p className="text-xs text-white/65">{isZh ? "累计充值" : "Total Added"}</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {creditAccount?.total_recharged ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                    <p className="text-xs text-white/65">{isZh ? "累计消耗" : "Total Used"}</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {creditAccount?.total_consumed ?? 0}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#151518] p-5">
                <div className="flex items-center gap-2 text-white">
                  <History className="h-4 w-4 text-white/70" />
                  <h3 className="text-sm font-semibold">
                    {isZh ? "最近积分流水" : "Recent Credit Activity"}
                  </h3>
                </div>
                <div className="mt-4 space-y-3">
                  {creditLedger.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/55">
                      {isZh ? "暂无积分记录" : "No credit activity yet"}
                    </div>
                  ) : (
                    creditLedger.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {entry.remark ||
                              (entry.delta > 0
                                ? isZh
                                  ? "积分增加"
                                  : "Credits added"
                                : isZh
                                  ? "积分扣除"
                                  : "Credits charged")}
                          </p>
                          <p className="mt-1 text-xs text-white/45">
                            {new Date(entry.created_at).toLocaleString(isZh ? "zh-CN" : "en-US")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-semibold ${
                              entry.delta > 0 ? "text-emerald-300" : "text-amber-300"
                            }`}
                          >
                            {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                          </p>
                          <p className="mt-1 text-xs text-white/45">
                            {isZh ? "余额" : "Balance"} {entry.balance_after}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : null}
          {/* 标签页 */}
          <div className="mb-6 flex items-center gap-8 border-b border-white/10 pb-4">
            <button
              onClick={() => setActiveTab("works")}
              className={cn(
                "text-sm font-medium transition-colors",
                activeTab === "works"
                  ? "border-b-2 border-white text-white"
                  : "text-[#A0A0A0] hover:text-white"
              )}
            >
              {t("My Works")}
            </button>
            <button
              onClick={() => setActiveTab("favorites")}
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium transition-colors",
                activeTab === "favorites"
                  ? "border-b-2 border-white text-white"
                  : "text-[#A0A0A0] hover:text-white"
              )}
              disabled
            >
              {t("My Favorites")}
              <Lock className="h-3 w-3" />
            </button>
          </div>

          {/* 作品网格 */}
          <div className="flex flex-wrap gap-6">
            {/* 发布作品卡片 */}
            {isOwnProfile && (
              <div className="w-80 rounded-2xl bg-[#1E1E20] p-4">
                <div
                  onClick={handleCreateNewFlow}
                  className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl bg-[#2D2D29] transition-all hover:bg-[#3A3A3F]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white">
                    <Plus className="h-6 w-6 text-black" />
                  </div>
                  <span className="text-sm font-medium text-white">
                    {t("Publish Work")}
                  </span>
                </div>
              </div>
            )}

            {/* 已发布作品 */}
            {flows.map((flow) => {
              const coverUrl = flow.cover_path
                ? getCommunityImageUrl(flow.cover_path)
                : null;
              if (!coverUrl) return null;
              return (
                <div
                  key={flow.id}
                  className="group w-80 overflow-hidden rounded-2xl bg-[#1E1E20]"
                >
                  <div className="relative aspect-[4/3] w-full bg-muted/20">
                    <img
                      src={coverUrl}
                      alt={flow.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        className="rounded-full bg-[#1A2530] text-[#4DA6FF] hover:bg-[#253545]"
                        onClick={() => navigate(`/flow/${flow.id}/`)}
                      >
                        {t("View Process")}
                        <ArrowUpRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-[#A0A0A0]">
                      @{accountName}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-white">
                      {flow.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeTab === "works" && flows.length === 0 && !isOwnProfile && (
            <div className="py-12 text-center text-sm text-[#A0A0A0]">
              {t("No works yet")}
            </div>
          )}
        </main>
      </div>

      {/* 资料设置弹窗 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-xl border-white/10 bg-[#1E1E1E] text-white">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>{t("Profile Settings")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-6">
            {/* 左侧头像 */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="relative cursor-pointer"
                onClick={() => avatarInputRef.current?.click()}
              >
                <Avatar className="h-20 w-20 border-2 border-white/20">
                  <AvatarImage
                    src={currentAvatarSrc || undefined}
                    alt={editUsername}
                  />
                  <AvatarFallback className="bg-[#44444C] text-2xl font-semibold text-white">
                    {editUsername.slice(0, 1).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                  <Camera className="h-6 w-6 text-white" />
                </div>
              </div>
              <span className="text-xs text-[#A0A0A0]">{t("Click to change avatar")}</span>
            </div>

            {/* 右侧表单 */}
            <div className="flex-1 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#E0E0E0]">
                  {t("Nickname")}
                </label>
                <Input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  maxLength={30}
                  className="border-[#333] bg-transparent text-white placeholder:text-[#9E9E9E] focus:border-[#2196F3]"
                />
                <div className="mt-1 text-right text-xs text-[#9E9E9E]">
                  {editUsername.length}/30
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#E0E0E0]">
                  {t("Bio")}
                </label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  maxLength={200}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-[#333] bg-transparent px-3 py-2 text-sm text-white placeholder:text-[#9E9E9E] focus:border-[#2196F3] focus:outline-none"
                />
                <div className="mt-1 text-right text-xs text-[#9E9E9E]">
                  {editBio.length}/200
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#E0E0E0]">
                  {t("Language")}
                </label>
                <div className="relative">
                  <select
                    value={isZh ? "zh-CN" : "en"}
                    onChange={(e) => handleChangeLanguage(e.target.value as "zh-CN" | "en")}
                    className="w-full appearance-none rounded-lg border border-[#333] bg-transparent px-3 py-2.5 text-sm text-white focus:border-[#2196F3] focus:outline-none"
                  >
                    <option value="zh-CN">{t("Simplified Chinese")}</option>
                    <option value="en">{t("English")}</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="h-4 w-4 text-[#A0A0A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsEditDialogOpen(false)}
              className="text-[#A0A0A0] hover:text-white"
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveProfile}
              className="border-0 hover:bg-[#206add]"
              style={{ backgroundColor: "#2f88ff", color: "white" }}
            >
              {t("Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 头像裁剪弹窗 */}
      <Dialog open={isAvatarCropping} onOpenChange={handleCancelAvatarCrop}>
        <DialogContent className="max-w-[420px] bg-[#222222] border-[#333] text-white p-6 shadow-2xl rounded-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-semibold">{t("裁切头像")}</DialogTitle>
          </DialogHeader>

          <div className="relative w-full h-[320px] rounded-2xl overflow-hidden bg-black/50 mb-6">
            {avatarCropSource && (
              <Cropper
                image={avatarCropSource}
                crop={avatarCrop}
                zoom={avatarZoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setAvatarCrop}
                onZoomChange={setAvatarZoom}
                onCropComplete={onAvatarCropComplete}
                style={{ containerStyle: { background: "transparent" } }}
              />
            )}
          </div>

          <div className="flex items-center gap-4 mb-8 px-2">
            <span className="text-sm text-zinc-400 whitespace-nowrap">{t("缩放")}</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={avatarZoom}
              onChange={(e) => setAvatarZoom(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer outline-none slider-thumb-brand"
              style={{
                accentColor: "#2F88FF",
                background: `linear-gradient(to right, #2F88FF 0%, #2F88FF ${(avatarZoom - 1) / 2 * 100}%, rgba(255,255,255,0.2) ${(avatarZoom - 1) / 2 * 100}%, rgba(255,255,255,0.2) 100%)`
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="flex-1 bg-[#3A3A3D] hover:bg-[#464649] text-white rounded-xl h-12 font-medium"
              onClick={handleCancelAvatarCrop}
            >
              {t("Cancel")}
            </Button>
            <Button
              className="flex-1 rounded-xl h-12 font-medium border-0 hover:bg-[#206add]"
              style={{ backgroundColor: "#2f88ff", color: "white" }}
              onClick={handleConfirmAvatarCrop}
            >
              {t("Confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 背景图片调整弹窗 */}
      <Dialog open={isBackgroundCropping} onOpenChange={handleCancelBackgroundCrop}>
        <DialogContent className="max-w-3xl border-[#333] bg-[#222] text-white p-6 shadow-2xl rounded-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle>{t("调整背景图")}</DialogTitle>
          </DialogHeader>

          <div className="relative w-full h-[400px] overflow-hidden rounded-xl bg-black/50 mb-6">
            {pendingBackgroundImage && (
              <Cropper
                image={pendingBackgroundImage}
                crop={backgroundCrop}
                zoom={backgroundZoom}
                aspect={3 / 1}
                showGrid={true}
                onCropChange={setBackgroundCrop}
                onZoomChange={setBackgroundZoom}
                onCropComplete={onBackgroundCropComplete}
                style={{ containerStyle: { background: "transparent" } }}
              />
            )}
          </div>

          <div className="flex items-center gap-4 mb-8 px-2">
            <span className="text-sm text-zinc-400 whitespace-nowrap">{t("缩放")}</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={backgroundZoom}
              onChange={(e) => setBackgroundZoom(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer outline-none slider-thumb-brand"
              style={{
                accentColor: "#2F88FF",
                background: `linear-gradient(to right, #2F88FF 0%, #2F88FF ${(backgroundZoom - 1) / 2 * 100}%, rgba(255,255,255,0.2) ${(backgroundZoom - 1) / 2 * 100}%, rgba(255,255,255,0.2) 100%)`
              }}
            />
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelBackgroundCrop}
              className="flex-1 bg-[#3A3A3D] hover:bg-[#464649] text-white rounded-xl h-12 font-medium"
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmBackgroundCrop}
              className="flex-1 rounded-xl h-12 font-medium border-0 hover:bg-[#206add]"
              style={{ backgroundColor: "#2f88ff", color: "white" }}
            >
              {t("Confirm")}
            </Button>
          </div>
          <style>{`
              .slider-thumb-brand::-webkit-slider-thumb {
                  appearance: none;
                  width: 16px;
                  height: 16px;
                  background: #2F88FF;
                  border-radius: 50%;
                  cursor: pointer;
                  border: 2px solid #222222;
              }
          `}</style>
        </DialogContent>
      </Dialog>
    </div>
  );
}
