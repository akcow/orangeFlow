import { useEffect, useState } from "react";
import {
    useGetGlobalVariables,
    usePatchGlobalVariables,
    usePostGlobalVariables,
} from "@/controllers/API/queries/variables";
import IconComponent from "../../../../components/common/genericIconComponent";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import useAlertStore from "../../../../stores/alertStore";

export default function ModelConfigPage() {
    const [apiKey, setApiKey] = useState("");
    const [keyId, setKeyId] = useState<string | null>(null);
    const { data: globalVariables, refetch } = useGetGlobalVariables();
    const { mutate: createVariable } = usePostGlobalVariables();
    const { mutate: updateVariable } = usePatchGlobalVariables();
    const setSuccessData = useAlertStore((state) => state.setSuccessData);
    const setErrorData = useAlertStore((state) => state.setErrorData);

    useEffect(() => {
        if (globalVariables) {
            const modelKeyVar = globalVariables.find(
                (v) => v.name === "MODEL_API_KEY"
            );
            if (modelKeyVar) {
                setApiKey(modelKeyVar.value ?? "");
                setKeyId(modelKeyVar.id);
            }
        }
    }, [globalVariables]);

    const handleSave = () => {
        if (!apiKey.trim()) {
            setErrorData({
                title: "错误",
                list: ["API Key 不能为空"],
            });
            return;
        }

        if (keyId) {
            // Update existing
            updateVariable(
                { id: keyId, value: apiKey },
                {
                    onSuccess: () => {
                        setSuccessData({ title: "已保存" });
                        refetch();
                    },
                    onError: () => {
                        setErrorData({
                            title: "保存失败",
                            list: ["更新 API Key 时出错"],
                        });
                    },
                }
            );
        } else {
            // Create new
            createVariable(
                { name: "MODEL_API_KEY", type: "Generic", value: apiKey, default_fields: [] },
                {
                    onSuccess: () => {
                        setSuccessData({ title: "已保存" });
                        refetch();
                    },
                    onError: () => {
                        setErrorData({
                            title: "保存失败",
                            list: ["创建 API Key 时出错"],
                        });
                    },
                }
            );
        }
    };

    return (
        <div className="flex h-full w-full flex-col gap-6">
            <div className="flex w-full flex-col">
                <h2 className="flex items-center text-lg font-semibold tracking-tight">
                    模型配置
                    <IconComponent
                        name="Settings2"
                        className="ml-2 h-5 w-5 text-primary"
                    />
                </h2>
                <p className="text-sm text-muted-foreground">
                    配置自定义组件所需的 API Key
                </p>
            </div>

            <div className="flex max-w-md flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Global Model API Key</label>
                    <Input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="请输入 API Key"
                        type="password"
                    />
                    <p className="text-xs text-muted-foreground">
                        此 Key 将用于验证所有自定义组件模型的请求。
                    </p>
                </div>
                <Button onClick={handleSave} className="w-fit">
                    保存配置
                </Button>
            </div>
        </div>
    );
}
