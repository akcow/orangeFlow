type EnvValue = string | boolean | undefined;

const getProcessEnv = (): Record<string, EnvValue> | undefined => {
  const processEnv = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, EnvValue> };
    }
  ).process?.env;

  if (!processEnv || typeof processEnv !== "object") {
    return undefined;
  }

  return processEnv;
};

const getImportMetaEnv = (key: string): EnvValue => {
  switch (key) {
    case "BACKEND_URL":
      return import.meta.env.BACKEND_URL;
    case "ACCESS_TOKEN_EXPIRE_SECONDS":
      return import.meta.env.ACCESS_TOKEN_EXPIRE_SECONDS;
    case "CI":
      return import.meta.env.CI;
    case "LANGFLOW_AUTO_LOGIN":
      return import.meta.env.LANGFLOW_AUTO_LOGIN;
    case "LANGFLOW_MCP_COMPOSER_ENABLED":
      return import.meta.env.LANGFLOW_MCP_COMPOSER_ENABLED;
    default:
      return undefined;
  }
};

export const getEnvVar = <T = EnvValue>(
  key: string,
  defaultValue?: T,
): T | EnvValue => {
  const processEnv = getProcessEnv();
  if (processEnv && Object.prototype.hasOwnProperty.call(processEnv, key)) {
    return (processEnv[key] ?? defaultValue) as T | EnvValue;
  }

  return (getImportMetaEnv(key) ?? defaultValue) as T | EnvValue;
};

export const isEnvVarEnabled = (
  key: string,
  defaultValue = true,
): boolean => {
  const value = getEnvVar(key);

  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return value.toLowerCase().trim() !== "false";
};
