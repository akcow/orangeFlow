import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PROVIDER_KEY,
  PROVIDER_OPTIONS,
  PROVIDER_FIELD_WHITELIST,
} from "@/constants/providerCredentials";
import IconComponent, {
  ForwardedIconComponent,
} from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useGetProviderCredentials,
  usePutProviderCredentials,
} from "@/controllers/API/queries/provider-credentials";
import type { ProviderCredentialField } from "@/types/providerCredentials";
import useAlertStore from "@/stores/alertStore";

type FieldKey = "app_id" | "access_token" | "api_key";

const fieldMeta: Record<
  FieldKey,
  { label: string; placeholder: string; helper: string }
> = {
  app_id: {
    label: "App ID / Client ID",
    placeholder: "例如：4942118390",
    helper: "用于部分语音/多媒体接口的应用标识，通常为数字或字符串 ID。",
  },
  access_token: {
    label: "Access Token / Client Secret",
    placeholder: "输入访问令牌",
    helper: "作为鉴权头传递，不会在界面明文回显。",
  },
  api_key: {
    label: "API Key",
    placeholder: "输入 API Key",
    helper: "将用于模型/媒体生成接口的统一密钥。",
  },
};

export default function ProviderCredentialsPage() {
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER_KEY);
  const [formState, setFormState] = useState<
    Record<FieldKey, string | undefined>
  >({
    app_id: "",
    access_token: "",
    api_key: "",
  });
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    app_id: false,
    access_token: false,
    api_key: false,
  });

  const setErrorData = useAlertStore((state) => state.setErrorData);

  const {
    data,
    isError,
    error: fetchError,
  } = useGetProviderCredentials(provider, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { mutate: saveCredentials, isLoading: isSaving } =
    usePutProviderCredentials();

  useEffect(() => {
    if (isError && fetchError) {
      const detail =
        (fetchError as any)?.response?.data?.detail ??
        (fetchError as any)?.message ??
        (fetchError as any)?.toString?.() ??
        "加载密钥状态失败";
      const detailStr =
        typeof detail === "string" ? detail : JSON.stringify(detail);
      setErrorData({ title: "加载失败", list: [detailStr] });
    }
  }, [isError, fetchError, setErrorData]);

  useEffect(() => {
    // 不回填掩码值，保持为空以避免覆盖
    setFormState({ app_id: "", access_token: "", api_key: "" });
    setTouched({ app_id: false, access_token: false, api_key: false });
  }, [data?.updated_at, provider]);

  useEffect(() => {
    setFormState({ app_id: "", access_token: "", api_key: "" });
    setTouched({ app_id: false, access_token: false, api_key: false });
  }, [provider]);

  const onChange = (key: FieldKey, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const visibleKeys = useMemo(() => {
    const whitelist = PROVIDER_FIELD_WHITELIST[provider] ?? [];
    return (Object.keys(fieldMeta) as FieldKey[]).filter((key) =>
      whitelist.includes(key),
    );
  }, [provider]);

  const handleClearFields = (keys: FieldKey[]) => {
    if (isSaving) return;
    const ok = window.confirm("确定要清空已保存的密钥吗？此操作会立即生效。");
    if (!ok) return;
    const payload = Object.fromEntries(keys.map((key) => [key, ""]));
    saveCredentials({ provider, payload });
    setFormState((prev) => ({ ...prev, ...payload }));
    setTouched((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = false;
      });
      return next;
    });
  };

  const handleSave = () => {
    const hasTouched = Object.values(touched).some(Boolean);
    if (!hasTouched) {
      setErrorData({ title: "请输入至少一项后再保存", list: [] });
      return;
    }
    const payloadEntries = (Object.keys(formState) as FieldKey[])
      .filter((key) => touched[key])
      .map((key) => {
        const trimmed = formState[key]?.trim() ?? "";
        // 空字符串表示清空，非空表示更新，未触碰的字段不发送（不覆盖）
        return [key, trimmed === "" ? "" : trimmed];
      });
    const payload = Object.fromEntries(payloadEntries);
    saveCredentials({ provider, payload });
    // 重置触摸状态，仅在保存后需要再次输入才算修改
    setTouched({ app_id: false, access_token: false, api_key: false });
  };

  const fieldStatus = useMemo(
    () => ({
      app_id: data?.app_id,
      access_token: data?.access_token,
      api_key: data?.api_key,
    }),
    [data],
  ) as Record<FieldKey, ProviderCredentialField | undefined>;

  const hasAnySaved = useMemo(() => {
    return visibleKeys.some((key) => fieldStatus[key]?.source === "saved");
  }, [visibleKeys, fieldStatus]);

  const renderStatus = (field?: ProviderCredentialField) => {
    if (!field) return null;
    if (!field.present) return (
      <span className="text-muted-foreground">未配置</span>
    );
    const sourceLabel = field.source === "env" ? "环境变量" : "已保存";
    return (
      <span className="text-muted-foreground">
        {sourceLabel}
        {field.masked ? `（${field.masked}）` : ""}
      </span>
    );
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <div className="flex w-full items-start justify-between gap-6">
        <div className="flex w-full flex-col">
          <h2
            className="flex items-center text-lg font-semibold tracking-tight"
            data-testid="settings_menu_header"
          >
            密钥配置
            <ForwardedIconComponent
              name="KeyRound"
              className="ml-2 h-5 w-5 text-primary"
            />
          </h2>
          <p className="text-sm text-muted-foreground">
            为模型/多媒体提供商集中配置密钥字段，可在各节点保持默认使用，必要时仍可在节点内独立覆盖。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">当前提供商：</span>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_OPTIONS.map((item) => (
                <Button
                  key={item.key}
                  variant={provider === item.key ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setProvider(item.key)}
                >
                  <ForwardedIconComponent
                    name={provider === item.key ? "Check" : "Circle"}
                    className="h-4 w-4"
                  />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {hasAnySaved && (
            <Button
              variant="ghost"
              disabled={isSaving}
              onClick={() => handleClearFields(visibleKeys)}
              title="清空当前提供商已保存的全部字段（不影响环境变量）"
            >
              <IconComponent name="Trash2" className="w-4" />
              清空
            </Button>
          )}
          <Button variant="primary" loading={isSaving} disabled={isSaving} onClick={handleSave}>
            <IconComponent name="Save" className="w-4" />
            保存
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 rounded-lg border border-border/50 bg-background p-6">
        {visibleKeys.map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{fieldMeta[key].label}</Label>
                <div className="flex items-center gap-2 text-xs">
                  {renderStatus(fieldStatus[key])}
                  {fieldStatus[key]?.source === "saved" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => handleClearFields([key])}
                      title="清空该字段已保存的值（不影响环境变量）"
                    >
                      清空
                    </Button>
                  )}
                </div>
              </div>
              <Input
                type="password"
                value={formState[key] ?? ""}
                placeholder={fieldMeta[key].placeholder}
                onChange={(event) => onChange(key, event.target.value)}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                {fieldMeta[key].helper}
              </p>
            </div>
          ))}
        <div className="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground">
          提示：表单留空时不会覆盖已保存的值；若需清除已保存的字段，请点击右侧“清空”。
        </div>
      </div>
    </div>
  );
}
