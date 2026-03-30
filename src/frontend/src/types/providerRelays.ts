export type ProviderRelayServiceType =
  | "any"
  | "text"
  | "image"
  | "video"
  | "audio";

export type ProviderRelayProvider =
  | "openai"
  | "12api"
  | "gemini"
  | "doubao"
  | "dashscope"
  | "qwen"
  | "sora"
  | "veo"
  | "vidu"
  | "kling";

export type ProviderRelay = {
  id: string;
  name: string;
  service_type: ProviderRelayServiceType;
  provider: ProviderRelayProvider;
  base_url?: string | null;
  api_key_present: boolean;
  api_key_masked?: string | null;
  model_patterns: string[];
  priority: number;
  enabled: boolean;
  is_default: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  managed_via?: string;
  system_default?: boolean;
  credential_provider?: string | null;
  deletable?: boolean;
  reorderable?: boolean;
  editable_fields?: string[] | null;
};

export type CreateProviderRelayRequest = {
  name: string;
  service_type: ProviderRelayServiceType;
  provider: ProviderRelayProvider;
  base_url?: string | null;
  api_key?: string | null;
  model_patterns: string[];
  priority: number;
  enabled: boolean;
  is_default: boolean;
};

export type UpdateProviderRelayRequest = Partial<CreateProviderRelayRequest>;

export type DeleteProviderRelayResponse = {
  id: string;
  deleted: boolean;
};

export type ReorderProviderRelaysRequest = {
  relay_ids: string[];
};
