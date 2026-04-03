import {
  ArrowUpToLine,
  KeyRound,
  Pencil,
  Plus,
  RefreshCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  useGetProviderRelayModelCatalogQuery,
  useCreateProviderRelay,
  useDeleteProviderRelay,
  useGetProviderRelaysQuery,
  useReorderProviderRelays,
  useUpdateProviderRelay,
} from "@/controllers/API/queries/provider-relays";
import useAlertStore from "@/stores/alertStore";
import type {
  CreateProviderRelayRequest,
  ProviderRelay,
  ProviderRelayModelCatalogItem,
  ProviderRelayProvider,
  ProviderRelayServiceType,
} from "@/types/providerRelays";

const { Title, Text } = Typography;

type RelayFormValues = {
  name: string;
  service_type: ProviderRelayServiceType;
  provider: ProviderRelayProvider;
  base_url?: string | null;
  api_key?: string | null;
  access_key?: string | null;
  secret_key?: string | null;
  model_patterns: string[];
  priority: number;
  enabled: boolean;
  is_default: boolean;
};

type RelayViewMode = "system" | "custom";

const PAGE_SIZE = 5;

const relayServiceOptions: Array<{
  label: string;
  value: ProviderRelayServiceType;
}> = [
  { label: "通用", value: "any" },
  { label: "文本", value: "text" },
  { label: "图像", value: "image" },
  { label: "视频", value: "video" },
  { label: "音频", value: "audio" },
];

const relayProviderOptions: Array<{
  label: string;
  value: ProviderRelayProvider;
}> = [
  { label: "OpenAI 兼容", value: "openai" },
  { label: "12API 站点", value: "12api" },
  { label: "豆包", value: "doubao" },
  { label: "阿里云百炼", value: "dashscope" },
  { label: "通义千问 TTS", value: "qwen" },
  { label: "Vidu", value: "vidu" },
  { label: "可灵", value: "kling" },
  { label: "Jimeng Visual", value: "jimeng" },
];

const providerLabels: Record<ProviderRelayProvider, string> = {
  openai: "OpenAI 兼容",
  "12api": "12API 站点",
  gemini: "Gemini",
  doubao: "豆包",
  dashscope: "阿里云百炼",
  qwen: "通义千问 TTS",
  sora: "Sora",
  veo: "Veo",
  vidu: "Vidu",
  kling: "可灵",
  jimeng: "Jimeng Visual",
};

const credentialProviderLabels: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  doubao: "豆包",
  gemini: "Gemini / 12API",
  dashscope: "阿里云百炼",
  vidu: "Vidu",
  kling: "可灵",
  jimeng_visual: "Jimeng Visual",
};

const builtinRelayNameOverrides: Record<string, string> = {
  "builtin:openai-text": "系统默认 OpenAI 文本线路",
  "builtin:deepseek-text": "系统默认 DeepSeek 文本线路",
  "builtin:doubao-any": "系统默认 豆包线路",
  "builtin:12api-gemini": "系统默认 12API Gemini 线路",
  "builtin:12api-veo": "系统默认 12API Veo 线路",
  "builtin:12api-sora": "系统默认 12API Sora 线路",
  "builtin:dashscope-image-video": "系统默认 百炼图像/视频线路",
  "builtin:qwen-audio": "系统默认 通义千问音频线路",
  "builtin:vidu-video": "系统默认 Vidu 视频线路",
  "builtin:kling-any": "系统默认 可灵线路",
  "builtin:jimeng-image": "系统默认 Jimeng 图像线路",
};

const builtinRelaySupportedModels: Record<string, string[]> = {
  "builtin:openai-text": [
    "GPT-4o Mini",
    "GPT-4o",
    "GPT-4.1",
    "GPT-4.1 Mini",
    "GPT-4.1 Nano",
  ],
  "builtin:deepseek-text": ["DeepSeek Chat", "DeepSeek Reasoner"],
  "builtin:doubao-any": [
    "Doubao Seedream 5.0 Lite",
    "Doubao Seedream 4.5",
    "Doubao Seedream 4.0",
    "Doubao Seedance 1.0 Pro",
    "Doubao Seedance 1.5 Pro",
  ],
  "builtin:12api-gemini": [
    "Gemini 3 Pro",
    "Gemini 3 Flash",
    "Nano Banana 2",
    "Nano Banana Pro",
  ],
  "builtin:12api-veo": ["Veo 3.1", "Veo 3.1 Fast"],
  "builtin:12api-sora": ["Sora 2", "Sora 2 Pro"],
  "builtin:dashscope-image-video": [
    "Wan 2.6 T2I",
    "Wan 2.6 I2I",
    "Wan 2.5 T2I",
    "Wan 2.5 I2I",
    "WanX 2.1 Image Edit",
    "Qwen Image Edit Max",
    "Wan 2.6 Video",
    "Wan 2.6 T2V",
    "Wan 2.6 I2V",
    "Wan 2.6 I2V Flash",
    "Wan 2.6 R2V",
    "Wan 2.6 R2V Flash",
    "Wan 2.5 Video",
    "Wan 2.5 T2V",
    "Wan 2.5 I2V",
  ],
  "builtin:qwen-audio": ["Qwen TTS Flash"],
  "builtin:vidu-video": ["Vidu Q3 Pro", "Vidu Q2 Pro", "Vidu Upscale"],
  "builtin:kling-any": [
    "Kling O1 Image",
    "Kling V3 Image",
    "Kling O1 Video",
    "Kling O3 Video",
  ],
  "builtin:jimeng-image": ["Jimeng Smart HD"],
};

const builtinRelayModelSummaries: Record<string, string> = {
  "builtin:openai-text": "按 gpt-* 自动映射当前项目可用的 OpenAI 文本模型。",
};

const darkCardStyle = {
  borderRadius: 24,
  background: "rgba(9, 14, 24, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  boxShadow: "0 24px 72px rgba(0, 0, 0, 0.22)",
};

const modelTypeLabels: Record<string, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "音频",
};

function relayUsesKeyPairCredentials(value?: ProviderRelay | ProviderRelayProvider | null) {
  if (!value) return false;
  if (typeof value === "string") {
    return value === "jimeng";
  }
  return (
    value.provider === "jimeng" ||
    Boolean(value.editable_fields?.includes("access_key")) ||
    Boolean(value.editable_fields?.includes("secret_key"))
  );
}

function getRelayCredentialLabel(relay: ProviderRelay) {
  return relayUsesKeyPairCredentials(relay) ? "Access Key / Secret Key" : "API Key";
}

function getRelayCredentialValue(relay: ProviderRelay) {
  if (relayUsesKeyPairCredentials(relay)) {
    const accessKey = relay.access_key_masked || "未配置";
    const secretKey = relay.secret_key_masked || "未配置";
    return "AK: " + accessKey + " / SK: " + secretKey;
  }
  return relay.api_key_masked || "未配置";
}

function formatDateTime(value?: string | null) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getServiceTypeLabel(value: ProviderRelayServiceType) {
  return relayServiceOptions.find((item) => item.value === value)?.label ?? value;
}

function getProviderLabel(value: ProviderRelayProvider) {
  return providerLabels[value] ?? value;
}

function getCredentialProviderLabel(value?: string | null) {
  if (!value) return "未指定";
  return credentialProviderLabels[value] ?? value;
}

function getRelayDisplayName(relay: ProviderRelay) {
  return builtinRelayNameOverrides[relay.id] ?? relay.name;
}

function getBuiltinRelaySupportedModels(relayId: string) {
  return builtinRelaySupportedModels[relayId] ?? [];
}

function getModelPatternLabel(
  pattern: string,
  modelCatalogById: Map<string, ProviderRelayModelCatalogItem>,
) {
  return modelCatalogById.get(pattern)?.full_name ?? pattern;
}

function getRelayModelTagItems(
  relay: ProviderRelay,
  modelCatalogById: Map<string, ProviderRelayModelCatalogItem>,
) {
  const builtinModels = getBuiltinRelaySupportedModels(relay.id);
  if (builtinModels.length > 0) {
    return builtinModels;
  }

  if (relay.model_patterns.length > 0) {
    return relay.model_patterns.map((pattern) => getModelPatternLabel(pattern, modelCatalogById));
  }

  const builtinSummary = builtinRelayModelSummaries[relay.id];
  if (builtinSummary) {
    return [builtinSummary];
  }

  return [];
}

function getSupportedModelsDisplaySummary(
  relay: ProviderRelay,
  modelCatalogById: Map<string, ProviderRelayModelCatalogItem>,
) {
  const builtinModels = getBuiltinRelaySupportedModels(relay.id);
  if (builtinModels.length > 0) {
    return builtinModels.join("、");
  }

  const builtinSummary = builtinRelayModelSummaries[relay.id];
  if (builtinSummary) {
    return builtinSummary;
  }

  if (relay.model_patterns.length > 0) {
    return `按模型生效：${relay.model_patterns
      .map((pattern) => getModelPatternLabel(pattern, modelCatalogById))
      .join("、")}`;
  }

  return "使用该服务类型的默认匹配规则。";
}

function getInitialValues(relay?: ProviderRelay | null): RelayFormValues {
  if (!relay) {
    return {
      name: "",
      service_type: "any",
      provider: "openai",
      base_url: "",
      api_key: "",
      access_key: "",
      secret_key: "",
      model_patterns: [],
      priority: 100,
      enabled: true,
      is_default: false,
    };
  }

  return {
    name: getRelayDisplayName(relay),
    service_type: relay.service_type,
    provider: relay.provider,
    base_url: relay.base_url ?? "",
    api_key: relay.api_key_masked ?? "",
    access_key: relay.access_key_masked ?? "",
    secret_key: relay.secret_key_masked ?? "",
    model_patterns: relay.model_patterns,
    priority: relay.priority,
    enabled: relay.enabled,
    is_default: relay.is_default,
  };
}

function isLegacyPattern(pattern: string) {
  return /[*?[\]]/.test(pattern);
}

function getModelOptionText(item: ProviderRelayModelCatalogItem) {
  return `${item.full_name} (${modelTypeLabels[item.model_type] ?? item.model_type})`;
}

function isSystemRelay(relay?: ProviderRelay | null) {
  return Boolean(relay?.system_default || relay?.managed_via === "provider_credentials");
}

function RelayListPanel({
  title,
  description,
  relays,
  modelCatalogById,
  draggingRelayId,
  onDragStart,
  onDrop,
  onMoveToTop,
  onEdit,
  onDelete,
  onToggleDefault,
  onToggleEnabled,
  isDeleting,
  isUpdating,
}: {
  title: string;
  description: string;
  relays: ProviderRelay[];
  modelCatalogById: Map<string, ProviderRelayModelCatalogItem>;
  draggingRelayId: string | null;
  onDragStart: (relayId: string | null) => void;
  onDrop: (targetId: string) => void;
  onMoveToTop: (relay: ProviderRelay) => void;
  onEdit: (relay: ProviderRelay) => void;
  onDelete: (relay: ProviderRelay) => void;
  onToggleDefault: (relay: ProviderRelay) => void;
  onToggleEnabled: (relay: ProviderRelay, enabled: boolean) => void;
  isDeleting: boolean;
  isUpdating: boolean;
}) {
  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <div>
        <Title level={5} style={{ margin: 0, color: "#f8fafc" }}>
          {title}
        </Title>
        <Text style={{ color: "rgba(226, 232, 240, 0.68)" }}>{description}</Text>
      </div>

      {relays.length === 0 ? (
        <Empty description="当前分类暂无线路" />
      ) : (
        <List
          dataSource={relays}
          pagination={{
            pageSize: PAGE_SIZE,
            hideOnSinglePage: relays.length <= PAGE_SIZE,
            size: "small",
            align: "center",
          }}
          renderItem={(relay, index) => {
            const canReorder = relay.reorderable !== false;
            const systemRelay = isSystemRelay(relay);
            return (
              <List.Item style={{ border: "none", padding: 0, marginBottom: 12 }}>
                <Card
                  size="small"
                  draggable={canReorder}
                  onDragStart={() => canReorder && onDragStart(relay.id)}
                  onDragEnd={() => onDragStart(null)}
                  onDragOver={(event) => canReorder && event.preventDefault()}
                  onDrop={() => canReorder && onDrop(relay.id)}
                  style={{
                    width: "100%",
                    borderRadius: 18,
                    background: "rgba(14, 20, 32, 0.95)",
                    borderColor:
                      draggingRelayId === relay.id
                        ? "rgba(79, 140, 255, 0.6)"
                        : "rgba(148, 163, 184, 0.12)",
                  }}
                >
                  <Row gutter={[12, 12]} justify="space-between" align="middle">
                    <Col xs={24} xl={14}>
                      <Space direction="vertical" size={8}>
                        <Space wrap>
                          <Tag color={systemRelay ? "purple" : "blue"}>
                            {systemRelay ? "系统默认" : `自定义 #${index + 1}`}
                          </Tag>
                          <Tag>{getProviderLabel(relay.provider)}</Tag>
                          <Tag>{getServiceTypeLabel(relay.service_type)}</Tag>
                          <Tag color={relay.enabled ? "green" : "default"}>
                            {relay.enabled ? "已启用" : "已停用"}
                          </Tag>
                          <Tag color={relay.is_default ? "gold" : "default"}>
                            {relay.is_default ? "默认线路" : "普通线路"}
                          </Tag>
                          {relay.credential_provider ? (
                            <Tag color="cyan">
                              凭证归属：{getCredentialProviderLabel(relay.credential_provider)}
                            </Tag>
                          ) : null}
                        </Space>

                        <div>
                          <Title level={5} style={{ margin: 0, color: "#f8fafc" }}>
                            {getRelayDisplayName(relay)}
                          </Title>
                          <Text style={{ color: "rgba(226, 232, 240, 0.72)" }}>
                            {relay.base_url || "使用系统默认 Base URL"}
                          </Text>
                        </div>

                        <div>
                          <Text style={{ color: "rgba(226, 232, 240, 0.88)" }}>
                            支持模型：{getSupportedModelsDisplaySummary(relay, modelCatalogById)}
                          </Text>
                        </div>

                        <Space wrap size={[6, 6]}>
                          {getRelayModelTagItems(relay, modelCatalogById).length > 0 ? (
                            getRelayModelTagItems(relay, modelCatalogById).map((item) => (
                              <Tag key={`${relay.id}-${item}`}>{item}</Tag>
                            ))
                          ) : (
                            <Tag color="processing">未单独设置匹配规则</Tag>
                          )}
                        </Space>
                      </Space>
                    </Col>

                    <Col xs={24} xl={10}>
                      <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        <Descriptions
                          size="small"
                          column={1}
                          items={[
                            {
                              key: "priority",
                              label: "优先级",
                              children: relay.priority,
                            },
                            {
                              key: "apiKey",
                              label: getRelayCredentialLabel(relay),
                              children: getRelayCredentialValue(relay),
                            },
                            {
                              key: "updated",
                              label: "最近更新",
                              children: formatDateTime(relay.updated_at),
                            },
                          ]}
                        />

                        <Space wrap>
                          {canReorder ? (
                            <Button
                              icon={<ArrowUpToLine size={14} />}
                              onClick={() => onMoveToTop(relay)}
                            >
                              一键置顶
                            </Button>
                          ) : null}

                          <Button
                            icon={systemRelay ? <KeyRound size={14} /> : <Pencil size={14} />}
                            onClick={() => onEdit(relay)}
                          >
                            {systemRelay ? "编辑密钥" : "编辑"}
                          </Button>

                          {!systemRelay ? (
                            <Button
                              onClick={() => onToggleDefault(relay)}
                              loading={isUpdating}
                            >
                              {relay.is_default ? "取消默认" : "设为默认"}
                            </Button>
                          ) : null}

                          {!systemRelay ? (
                            <Switch
                              checked={relay.enabled}
                              checkedChildren="启用"
                              unCheckedChildren="停用"
                              onChange={(checked) => onToggleEnabled(relay, checked)}
                            />
                          ) : null}

                          {relay.deletable !== false ? (
                            <Button
                              danger
                              icon={<Trash2 size={14} />}
                              onClick={() => onDelete(relay)}
                              loading={isDeleting}
                            >
                              删除
                            </Button>
                          ) : null}
                        </Space>
                      </Space>
                    </Col>
                  </Row>
                </Card>
              </List.Item>
            );
          }}
        />
      )}
    </Space>
  );
}

export default function AdminRelayWorkspace() {
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const [form] = Form.useForm<RelayFormValues>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRelay, setEditingRelay] = useState<ProviderRelay | null>(null);
  const [draggingRelayId, setDraggingRelayId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<RelayViewMode>("system");

  const {
    data: relays = [],
    isLoading,
    isError: relaysLoadFailed,
    error: relaysLoadError,
    refetch,
  } = useGetProviderRelaysQuery();
  const {
    data: modelCatalog = [],
    isError: modelCatalogLoadFailed,
    error: modelCatalogLoadError,
  } = useGetProviderRelayModelCatalogQuery();
  const { mutate: createRelay, isPending: isCreating } = useCreateProviderRelay();
  const { mutate: updateRelay, isPending: isUpdating } = useUpdateProviderRelay();
  const { mutate: deleteRelay, isPending: isDeleting } = useDeleteProviderRelay();
  const { mutate: reorderRelays, isPending: isReordering } = useReorderProviderRelays();
  const watchedProvider = Form.useWatch("provider", form);
  const watchedServiceType = Form.useWatch("service_type", form);
  const watchedSelectedModels = Form.useWatch("model_patterns", form) ?? [];
  const isKeyPairProvider = relayUsesKeyPairCredentials(editingRelay ?? watchedProvider);

  const customRelays = useMemo(
    () =>
      [...relays]
        .filter((relay) => !isSystemRelay(relay))
        .sort((a, b) => a.priority - b.priority),
    [relays],
  );

  const builtinRelays = useMemo(
    () =>
      [...relays]
        .filter((relay) => isSystemRelay(relay))
        .sort((a, b) => a.priority - b.priority),
    [relays],
  );

  const currentRelays = viewMode === "system" ? builtinRelays : customRelays;
  const systemRelayEditing = isSystemRelay(editingRelay);
  const modelCatalogById = useMemo(
    () => new Map(modelCatalog.map((item) => [item.id, item])),
    [modelCatalog],
  );
  const relayModelSelectOptions = useMemo(() => {
    const selectedValues = Array.from(new Set(watchedSelectedModels));
    const visibleCatalogItems = modelCatalog.filter((item) => {
      if (watchedProvider && item.relay_provider !== watchedProvider) return false;
      if (
        watchedServiceType &&
        watchedServiceType !== "any" &&
        item.relay_service_type !== watchedServiceType
      ) {
        return false;
      }
      return true;
    });

    const mergedKnownItems = new Map<string, ProviderRelayModelCatalogItem>();
    for (const item of visibleCatalogItems) {
      mergedKnownItems.set(item.id, item);
    }
    for (const value of selectedValues) {
      const selectedItem = modelCatalogById.get(value);
      if (selectedItem) {
        mergedKnownItems.set(selectedItem.id, selectedItem);
      }
    }

    const legacyOptions = selectedValues
      .filter((value) => !modelCatalogById.has(value))
      .map((value) => ({
        value,
        label: `旧规则：${value}`,
        searchText: value,
      }));

    const knownOptions = Array.from(mergedKnownItems.values())
      .sort((a, b) => {
        if (a.model_type !== b.model_type) {
          return a.model_type.localeCompare(b.model_type);
        }
        return a.full_name.localeCompare(b.full_name);
      })
      .map((item) => ({
        value: item.id,
        label: getModelOptionText(item),
        searchText: `${item.full_name} ${item.id} ${item.owned_by} ${modelTypeLabels[item.model_type] ?? item.model_type}`,
      }));

    return [...legacyOptions, ...knownOptions];
  }, [modelCatalog, modelCatalogById, watchedProvider, watchedSelectedModels, watchedServiceType]);
  const incompatibleSelectedModels = useMemo(
    () =>
      watchedSelectedModels
        .map((value) => modelCatalogById.get(value))
        .filter((item): item is ProviderRelayModelCatalogItem => Boolean(item))
        .filter((item) => {
          if (watchedProvider && item.relay_provider !== watchedProvider) {
            return true;
          }
          if (
            watchedServiceType &&
            watchedServiceType !== "any" &&
            item.relay_service_type !== watchedServiceType
          ) {
            return true;
          }
          return false;
        }),
    [modelCatalogById, watchedProvider, watchedSelectedModels, watchedServiceType],
  );
  const legacySelectedPatterns = useMemo(
    () =>
      watchedSelectedModels.filter(
        (value) => !modelCatalogById.has(value) || isLegacyPattern(value),
      ),
    [modelCatalogById, watchedSelectedModels],
  );
  const relayLoadErrorMessage = useMemo(() => {
    const detail =
      (relaysLoadError as any)?.response?.data?.detail ||
      (modelCatalogLoadError as any)?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    return relaysLoadError?.message || modelCatalogLoadError?.message || "加载线路配置失败";
  }, [modelCatalogLoadError, relaysLoadError]);

  function openCreateDrawer() {
    setEditingRelay(null);
    form.setFieldsValue(getInitialValues());
    setDrawerOpen(true);
  }

  function openEditDrawer(relay: ProviderRelay) {
    setEditingRelay(relay);
    form.setFieldsValue(getInitialValues(relay));
    setDrawerOpen(true);
  }

  function persistOrder(nextRelays: ProviderRelay[]) {
    reorderRelays({ relay_ids: nextRelays.map((item) => item.id) });
  }

  function handleMoveToTop(relay: ProviderRelay) {
    if (relay.reorderable === false) return;
    persistOrder([relay, ...customRelays.filter((item) => item.id !== relay.id)]);
  }

  function handleDrop(targetId: string) {
    if (!draggingRelayId || draggingRelayId === targetId) {
      setDraggingRelayId(null);
      return;
    }

    const sourceIndex = customRelays.findIndex((item) => item.id === draggingRelayId);
    const targetIndex = customRelays.findIndex((item) => item.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggingRelayId(null);
      return;
    }

    const nextRelays = [...customRelays];
    const [moved] = nextRelays.splice(sourceIndex, 1);
    nextRelays.splice(targetIndex, 0, moved);
    setDraggingRelayId(null);
    persistOrder(nextRelays);
  }

  function handleDelete(relay: ProviderRelay) {
    Modal.confirm({
      title: "删除供应商线路",
      content: `确认删除“${getRelayDisplayName(relay)}”吗？删除后将不再参与模型匹配与路由。`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        deleteRelay({ relayId: relay.id });
      },
    });
  }

  function handleSubmit() {
    form
      .validateFields()
      .then((values) => {
        if (systemRelayEditing && editingRelay) {
          updateRelay(
            {
              relayId: editingRelay.id,
              payload: {
                api_key: relayUsesKeyPairCredentials(editingRelay)
                  ? null
                  : values.api_key?.trim() || null,
                access_key: relayUsesKeyPairCredentials(editingRelay)
                  ? values.access_key?.trim() || null
                  : null,
                secret_key: relayUsesKeyPairCredentials(editingRelay)
                  ? values.secret_key?.trim() || null
                  : null,
              },
            },
            { onSuccess: () => setDrawerOpen(false) },
          );
          return;
        }

        const payload: CreateProviderRelayRequest = {
          name: values.name.trim(),
          service_type: values.service_type,
          provider: values.provider,
          base_url: values.base_url?.trim() || null,
          api_key: relayUsesKeyPairCredentials(values.provider)
            ? null
            : values.api_key?.trim() || null,
          access_key: relayUsesKeyPairCredentials(values.provider)
            ? values.access_key?.trim() || null
            : null,
          secret_key: relayUsesKeyPairCredentials(values.provider)
            ? values.secret_key?.trim() || null
            : null,
          model_patterns: values.model_patterns ?? [],
          priority: values.priority,
          enabled: values.enabled,
          is_default: values.is_default,
        };

        if (incompatibleSelectedModels.length > 0) {
          setErrorData({
            title: "当前已选模型与供应商或服务类型不一致",
            list: incompatibleSelectedModels.map((item) => getModelOptionText(item)),
          });
          return;
        }

        if (relayUsesKeyPairCredentials(payload.provider) && (!payload.access_key || !payload.secret_key)) {
          setErrorData({
            title: "Jimeng 凭证不完整",
            list: ["请同时填写 Access Key 和 Secret Key。"],
          });
          return;
        }

        if (!payload.is_default && payload.model_patterns.length === 0) {
          setErrorData({
            title: "非默认线路必须至少选择一个具体模型",
            list: ["例如 `Kling O1`、`Sora 2`、`Gemini 3 Pro`。"],
          });
          return;
        }

        if (editingRelay) {
          updateRelay(
            { relayId: editingRelay.id, payload },
            { onSuccess: () => setDrawerOpen(false) },
          );
          return;
        }

        createRelay(payload, { onSuccess: () => setDrawerOpen(false) });
      })
      .catch(() => undefined);
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card bordered={false} style={darkCardStyle} styles={{ body: { padding: 24 } }}>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} md={16}>
            <Space direction="vertical" size={4}>
              <Title level={4} style={{ marginBottom: 0, color: "#f8fafc" }}>
                供应商路由管理
              </Title>
              <Text style={{ color: "rgba(226, 232, 240, 0.72)" }}>
                在这里统一维护中转线路、默认服务凭证与 Base URL 路由策略。系统默认线路与自定义线路分开查看，管理员可以直接在后台调整当前使用的 API Key。
              </Text>
            </Space>
          </Col>
          <Col xs={24} md="auto">
            <Space wrap>
              <Button icon={<RefreshCcw size={16} />} onClick={() => refetch()}>
                刷新列表
              </Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={openCreateDrawer}>
                新增自定义线路
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Alert
        type="info"
        showIcon
        message="当前路由规则"
        description={
          isKeyPairProvider
            ? "当前线路使用 Access Key / Secret Key 双凭证；Base URL、服务类型和所选模型仍会一起参与最终路由。"
            : "自定义线路会按优先级、服务类型、模型选择和 Base URL 参与路由；系统默认线路则主要用于直接维护当前供应商凭证。"
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card bordered={false} style={darkCardStyle} styles={{ body: { padding: 20 } }}>
            <Space direction="vertical" size={18} style={{ width: "100%" }}>
              <Row gutter={[12, 12]} justify="space-between" align="middle">
                <Col xs={24} md={14}>
                  <Space direction="vertical" size={4}>
                    <Title level={4} style={{ margin: 0, color: "#f8fafc" }}>
                      已配置线路列表
                    </Title>
                    <Text style={{ color: "rgba(226, 232, 240, 0.68)" }}>
                      使用切换按钮查看系统默认线路或自定义线路，每页显示 5 条。
                    </Text>
                  </Space>
                </Col>
                <Col xs={24} md="auto">
                  <Segmented<RelayViewMode>
                    value={viewMode}
                    onChange={(value) => setViewMode(value)}
                    options={[
                      {
                        label: `系统默认线路 (${builtinRelays.length})`,
                        value: "system",
                      },
                      {
                        label: `自定义线路 (${customRelays.length})`,
                        value: "custom",
                      },
                    ]}
                  />
                </Col>
              </Row>

              {isLoading ? (
                <div style={{ padding: 32 }}>
                  <Text style={{ color: "rgba(226, 232, 240, 0.72)" }}>正在加载线路配置...</Text>
                </div>
              ) : relaysLoadFailed || modelCatalogLoadFailed ? (
                <Alert
                  type="error"
                  showIcon
                  message="线路列表加载失败"
                  description={`后端没有返回可用线路数据。常见原因是当前会话不是 superuser，或者公网部署后的登录态、Cookie、反向代理配置导致管理接口返回 401/403。详细错误：${relayLoadErrorMessage}`}
                />
              ) : relays.length === 0 ? (
                <Empty description="暂无线路配置" />
              ) : (
                <>
                  <Alert
                    type="success"
                    showIcon
                    message={`共 ${relays.length} 条线路：系统默认 ${builtinRelays.length} 条，自定义 ${customRelays.length} 条`}
                    description="系统默认线路不会参与拖拽排序，也不能删除；点击“编辑密钥”即可快速改写当前服务的 API Key。自定义线路支持默认线路、一键置顶与拖拽排序。"
                  />

                  {viewMode === "system" ? (
                    <RelayListPanel
                      title="系统默认线路"
                      description="用于承接项目内置模型供应商配置，适合直接维护 API Key，并查看各线路支持的模型范围。"
                      relays={currentRelays}
                      modelCatalogById={modelCatalogById}
                      draggingRelayId={draggingRelayId}
                      onDragStart={setDraggingRelayId}
                      onDrop={handleDrop}
                      onMoveToTop={handleMoveToTop}
                      onEdit={openEditDrawer}
                      onDelete={handleDelete}
                      onToggleDefault={() => undefined}
                      onToggleEnabled={() => undefined}
                      isDeleting={isDeleting}
                      isUpdating={isUpdating}
                    />
                  ) : (
                    <RelayListPanel
                      title="自定义线路"
                      description="适合配置中转站、多条备选 Base URL，以及专门的模型匹配规则。"
                      relays={currentRelays}
                      modelCatalogById={modelCatalogById}
                      draggingRelayId={draggingRelayId}
                      onDragStart={setDraggingRelayId}
                      onDrop={handleDrop}
                      onMoveToTop={handleMoveToTop}
                      onEdit={openEditDrawer}
                      onDelete={handleDelete}
                      onToggleDefault={(relay) =>
                        updateRelay({
                          relayId: relay.id,
                          payload: { is_default: !relay.is_default },
                        })
                      }
                      onToggleEnabled={(relay, enabled) =>
                        updateRelay({
                          relayId: relay.id,
                          payload: { enabled },
                        })
                      }
                      isDeleting={isDeleting}
                      isUpdating={isUpdating}
                    />
                  )}
                </>
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card bordered={false} style={darkCardStyle} styles={{ body: { padding: 20 } }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Title level={4} style={{ marginBottom: 0, color: "#f8fafc" }}>
                操作说明
              </Title>
              <Alert
                type="success"
                showIcon
                message="系统默认线路"
                description="OpenAI、DeepSeek、豆包、12API、百炼、Vidu、可灵、Jimeng 等项目内置能力会自动映射成可见线路，便于管理员统一查看。"
              />
              <Alert
                type="warning"
                showIcon
                message="拖拽排序"
                description="拖拽排序和一键置顶只对自定义线路生效，系统默认线路不参与排序，以免误操作。"
              />
              <Alert
                type="info"
                showIcon
                message="12API 站点"
                description="新增线路时供应商类型只保留 12API 站点，不再单独暴露 Gemini、Veo、Sora。系统会按模型名称自动路由到对应服务。"
              />
              <Button
                block
                type="primary"
                icon={<Settings2 size={16} />}
                onClick={openCreateDrawer}
                loading={isCreating || isUpdating || isReordering}
              >
                新增一条自定义线路
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Drawer
        title={
          systemRelayEditing
            ? "编辑系统默认线路密钥"
            : editingRelay
              ? "编辑供应商线路"
              : "新增供应商线路"
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={isCreating || isUpdating} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        }
      >
        {systemRelayEditing ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="该线路来自系统默认配置"
            description="这里仅支持快速修改 API Key。Base URL、模型匹配规则和服务类型仍按系统内置逻辑维护。输入新的密钥后保存即可生效。"
          />
        ) : null}

        <Form form={form} layout="vertical" initialValues={getInitialValues(editingRelay)}>
          <Form.Item
            label="线路名称"
            name="name"
            rules={[{ required: true, message: "请输入线路名称" }]}
          >
            <Input placeholder="例如：OpenAI 中转 A 线" disabled={systemRelayEditing} />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="服务类型" name="service_type">
                <Select options={relayServiceOptions} disabled={systemRelayEditing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="供应商类型" name="provider">
                <Select options={relayProviderOptions} disabled={systemRelayEditing} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Base URL" name="base_url">
            <Input placeholder="https://relay.example.com/v1" disabled={systemRelayEditing} />
          </Form.Item>

          {!isKeyPairProvider ? (
            <Form.Item
              label="API Key"
              name="api_key"
              extra={systemRelayEditing ? "留空或保持当前掩码不变时，将沿用现有 API Key。" : undefined}
            >
              <Input.Password placeholder="请输入 API Key" />
            </Form.Item>
          ) : (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="Access Key"
                  name="access_key"
                  extra={systemRelayEditing ? "留空或保持当前掩码不变时，将沿用现有 Access Key。" : undefined}
                >
                  <Input.Password placeholder="请输入 Access Key" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Secret Key"
                  name="secret_key"
                  extra={systemRelayEditing ? "留空或保持当前掩码不变时，将沿用现有 Secret Key。" : undefined}
                >
                  <Input.Password placeholder="请输入 Secret Key" />
                </Form.Item>
              </Col>
            </Row>
          )}

          {!systemRelayEditing && incompatibleSelectedModels.length > 0 ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="当前已选模型与供应商或服务类型不一致"
              description={incompatibleSelectedModels.map((item) => getModelOptionText(item)).join("、")}
            />
          ) : null}

          {!systemRelayEditing && legacySelectedPatterns.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="检测到旧版匹配规则"
              description={`以下旧规则会继续保留，直到你改成精确模型：${legacySelectedPatterns.join("、")}`}
            />
          ) : null}

          <Form.Item
            label="适用模型"
            name="model_patterns"
            extra="按当前供应商类型和服务类型筛选。保存后会写入精确模型 ID，不再依赖手工输入匹配规则。默认线路可不选。"
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={relayModelSelectOptions}
              placeholder="请选择一个或多个具体模型"
              maxTagCount="responsive"
              popupMatchSelectWidth={false}
              filterOption={(input, option) =>
                String(option?.label ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase()) ||
                String((option as { searchText?: string } | undefined)?.searchText ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              disabled={systemRelayEditing}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="优先级" name="priority">
                <InputNumber style={{ width: "100%" }} min={1} disabled={systemRelayEditing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="启用状态" name="enabled" valuePropName="checked">
                <Switch
                  checkedChildren="启用"
                  unCheckedChildren="停用"
                  disabled={systemRelayEditing}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="设为默认线路" name="is_default" valuePropName="checked">
            <Switch
              checkedChildren="默认"
              unCheckedChildren="普通"
              disabled={systemRelayEditing}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}
