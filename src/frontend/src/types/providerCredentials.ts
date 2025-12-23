export type ProviderCredentialField = {
  present: boolean;
  masked: string | null;
  source: "saved" | "env" | "unset";
};

export type ProviderCredentialsResponse = {
  provider: string;
  app_id: ProviderCredentialField;
  access_token: ProviderCredentialField;
  api_key: ProviderCredentialField;
  updated_at?: string | null;
};

export type ProviderCredentialsUpdateRequest = {
  app_id?: string | null;
  access_token?: string | null;
  api_key?: string | null;
};
