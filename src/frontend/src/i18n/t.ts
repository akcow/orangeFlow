import i18n from "./index";

export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

