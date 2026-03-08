import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import IconComponent from "@/components/common/genericIconComponent";
import { useTranslation } from "react-i18next";

interface CreateTeamModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (name: string) => void;
}

export function CreateTeamModal({
    open,
    onOpenChange,
    onCreate,
}: CreateTeamModalProps) {
    const { t } = useTranslation();
    const [teamName, setTeamName] = useState("");

    const handleConfirm = () => {
        if (teamName.trim().length > 0) {
            onCreate(teamName.trim());
            setTeamName(""); // reset on successful creation
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] border-zinc-700 bg-zinc-900 text-zinc-100">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">{t("创建团队")}</DialogTitle>
                    <DialogDescription className="text-zinc-400 mt-1">
                        {t("新团队将拥有独立的工作空间")}
                    </DialogDescription>
                </DialogHeader>

                {/* Warning Alert */}
                <div className="mt-4 flex flex-col gap-2 rounded-lg border border-yellow-700/50 bg-yellow-900/10 p-4">
                    <div className="flex items-center gap-2 font-semibold text-yellow-500">
                        <IconComponent name="AlertTriangle" className="h-4 w-4" />
                        <span>{t("重要提示")}</span>
                    </div>
                    <div className="text-sm text-zinc-300 leading-relaxed">
                        {t("新团队拥有独立的计费账户，")}
                        <strong className="text-white">{t("初始 Tapies 为 0")}</strong>
                        {t("。原有的权益与积分无法")}
                        <strong className="text-white">{t("继承")}</strong>
                        {t("至新团队。")}
                    </div>
                </div>

                {/* Input area */}
                <div className="mt-6 flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-lg font-bold">
                        {teamName ? teamName[0].toUpperCase() : "T"}
                    </div>
                    <div className="flex-1 space-y-2">
                        <div className="flex justify-between text-xs text-zinc-400">
                            <span>{t("团队名称*")}</span>
                            <span>{teamName.length}/50</span>
                        </div>
                        <Input
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value.substring(0, 50))}
                            placeholder={t("请输入团队名称")}
                            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 h-10"
                        />
                    </div>
                </div>

                <DialogFooter className="mt-6 sm:justify-start gap-4 sm:space-x-0">
                    <Button
                        variant="ghost"
                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg"
                        onClick={() => {
                            onOpenChange(false);
                            setTeamName("");
                        }}
                    >
                        {t("取消")}
                    </Button>
                    <Button
                        className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg disabled:opacity-50"
                        onClick={handleConfirm}
                        disabled={!teamName.trim()}
                    >
                        {t("确认")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
