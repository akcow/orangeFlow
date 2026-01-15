import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [isEditing, setIsEditing] = useState(true);
  const { data: globalVariables, refetch } = useGetGlobalVariables();
  const { mutate: createVariable } = usePostGlobalVariables();
  const { mutate: updateVariable } = usePatchGlobalVariables();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const navigate = useNavigate();

  useEffect(() => {
    if (!globalVariables) return;
    const modelKeyVar = globalVariables.find((v) => v.name === "MODEL_API_KEY");
    if (!modelKeyVar) return;
    setApiKey(modelKeyVar.value ?? "");
    setKeyId(modelKeyVar.id);
    setIsEditing(false);
  }, [globalVariables]);

  const maskedValue = (value: string) => {
    const v = (value ?? "").trim();
    if (!v) return "";
    return `${v.slice(0, 8)}********`;
  };

  const handleSave = () => {
    if (!isEditing && keyId) return;
    if (!apiKey.trim()) {
      setErrorData({
        title: "错误",
        list: ["API Key 不能为空"],
      });
      return;
    }

    if (keyId) {
      updateVariable(
        { id: keyId, value: apiKey },
        {
          onSuccess: () => {
            setSuccessData({ title: "已保存" });
            setIsEditing(false);
            refetch();
          },
          onError: () => {
            setErrorData({
              title: "保存失败",
              list: ["更新 API Key 时出错"],
            });
          },
        },
      );
      return;
    }

    createVariable(
      { name: "MODEL_API_KEY", type: "Generic", value: apiKey, default_fields: [] },
      {
        onSuccess: () => {
          setSuccessData({ title: "已保存" });
          setIsEditing(false);
          refetch();
        },
        onError: () => {
          setErrorData({
            title: "保存失败",
            list: ["创建 API Key 时出错"],
          });
        },
      },
    );
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <div className="flex w-full flex-col">
        <h2 className="flex items-center text-lg font-semibold tracking-tight">
          模型配置
          <IconComponent name="Settings2" className="ml-2 h-5 w-5 text-primary" />
        </h2>
        <p className="text-sm text-muted-foreground">
          配置自定义组件运行所需的 API Key（未配置时将无法运行自定义组件）。
        </p>
      </div>

      <div className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">模型 API Key</label>
          <Input
            value={isEditing ? apiKey : maskedValue(apiKey)}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="请输入 API Key（在“设置 → API Keys”页面生成）"
            type={isEditing ? "password" : "text"}
            disabled={!isEditing && Boolean(keyId)}
          />
          <p className="text-xs text-muted-foreground">
            获取方式：先在“设置 → API Keys”页面创建一个 API Key，然后复制粘贴到这里。
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/settings/api-keys")}>
            去 API Keys 页面创建
          </Button>
          {keyId && !isEditing ? (
            <Button
              onClick={() => {
                // Avoid showing full key in the UI; require re-paste when editing.
                setApiKey("");
                setIsEditing(true);
              }}
            >
              修改
            </Button>
          ) : (
            <Button onClick={handleSave}>保存配置</Button>
          )}
        </div>
      </div>
    </div>
  );
}
