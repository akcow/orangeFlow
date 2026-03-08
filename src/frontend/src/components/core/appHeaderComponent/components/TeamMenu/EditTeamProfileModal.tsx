import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { Team } from "./useTeamMockData";
import Cropper from "react-easy-crop";
import getCroppedImg from "./cropImage";
import IconComponent from "@/components/common/genericIconComponent";
import { cn } from "@/utils/utils";

interface EditTeamProfileModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    team: Team;
    updateTeamProfile: (name: string, avatarUrl: string | undefined) => void;
}

export function EditTeamProfileModal({ open, onOpenChange, team, updateTeamProfile }: EditTeamProfileModalProps) {
    const { t } = useTranslation();
    const [name, setName] = useState(team.name);
    // Determine the initially displayed avatar or null
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(team.avatar);

    // Crop related states
    const [isCropping, setIsCropping] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const showCroppedImage = useCallback(async () => {
        try {
            if (!imageSrc || !croppedAreaPixels) return;
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, 0);
            setAvatarUrl(croppedImage);
            setIsCropping(false);
            setImageSrc(null);
            setZoom(1);
        } catch (e) {
            console.error(e);
        }
    }, [imageSrc, croppedAreaPixels]);

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageDataUrl = await readFile(file);
            setImageSrc(imageDataUrl);
            setIsCropping(true);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleConfirm = () => {
        updateTeamProfile(name, avatarUrl);
        onOpenChange(false);
    };

    const handleCancel = () => {
        if (isCropping) {
            setIsCropping(false);
            setImageSrc(null);
        } else {
            // Restore previous states and close
            setName(team.name);
            setAvatarUrl(team.avatar);
            onOpenChange(false);
        }
    };

    if (isCropping && imageSrc) {
        return (
            <Dialog open={open} onOpenChange={handleCancel}>
                <DialogContent className="max-w-[420px] bg-[#222222] border-[#333] text-white p-6 shadow-2xl rounded-2xl">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-lg font-semibold">{t("团队信息")}</DialogTitle>
                    </DialogHeader>

                    <div className="relative w-full h-[320px] rounded-2xl overflow-hidden bg-black/50 mb-6">
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                            style={{
                                containerStyle: { background: "transparent" },
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-4 mb-8 px-2">
                        <span className="text-sm text-zinc-400 whitespace-nowrap">{t("缩放")}</span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer outline-none slider-thumb-brand"
                            style={{
                                accentColor: "#2F88FF",
                                background: `linear-gradient(to right, #2F88FF 0%, #2F88FF ${(zoom - 1) / 2 * 100}%, rgba(255,255,255,0.2) ${(zoom - 1) / 2 * 100}%, rgba(255,255,255,0.2) 100%)`
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            className="flex-1 bg-[#3A3A3D] hover:bg-[#464649] text-white rounded-xl h-12 font-medium"
                            onClick={handleCancel}
                        >
                            {t("取消")}
                        </Button>
                        <Button
                            className="flex-1 rounded-xl h-12 font-medium border-0 hover:bg-[#206add]"
                            style={{ backgroundColor: "#2f88ff", color: "white" }}
                            onClick={showCroppedImage}
                        >
                            {t("确认")}
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
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleCancel}>
            <DialogContent className="max-w-[420px] bg-[#222222] border-[#333] text-white p-6 shadow-2xl rounded-2xl">
                <DialogHeader className="mb-6">
                    <DialogTitle className="text-lg font-semibold">{t("团队信息")}</DialogTitle>
                </DialogHeader>

                <div className="flex items-start gap-4 mb-8">
                    <div className="relative group shrink-0">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="avatar" className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/10" />
                        ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#5E7B92] text-2xl font-semibold text-white">
                                {team.name[0].toUpperCase()}
                            </div>
                        )}
                        <button
                            className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <IconComponent name="Pencil" className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between text-sm text-zinc-400">
                            <span>{t("团队名称")}</span>
                            <span>{name.length}/50</span>
                        </div>
                        <Input
                            maxLength={50}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#1A1A1A] border-zinc-700 text-white h-11 px-4 focus-visible:ring-1 focus-visible:ring-zinc-600 rounded-xl"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        className="flex-1 bg-[#3A3A3D] hover:bg-[#464649] text-white rounded-xl h-11 font-medium"
                        onClick={handleCancel}
                    >
                        {t("取消")}
                    </Button>
                    <Button
                        className="flex-1 rounded-xl h-11 font-medium border-0 hover:bg-[#206add]"
                        style={{ backgroundColor: "#2f88ff", color: "white" }}
                        onClick={handleConfirm}
                    >
                        {t("确认")}
                    </Button>
                </div>

                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={onFileChange}
                />
            </DialogContent>
        </Dialog>
    );
}

function readFile(file: File): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result as string), false);
        reader.readAsDataURL(file);
    });
}
