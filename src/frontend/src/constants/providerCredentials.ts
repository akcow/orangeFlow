export const DEFAULT_PROVIDER_KEY = "doubao";

export const PROVIDER_OPTIONS = [
  { key: "doubao", label: "豆包" },
  { key: "deepseek", label: "DeepSeek" },
];

export const PROVIDER_FIELD_WHITELIST: Record<string, Array<"app_id" | "access_token" | "api_key">> = {
  doubao: ["app_id", "access_token", "api_key"],
  deepseek: ["api_key"],
};
