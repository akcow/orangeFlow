import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN.json";

const LANGUAGE_STORAGE_KEY = "langflow-language";

const enUS = Object.fromEntries(
  Object.keys(zhCN).map((key) => [key, key]),
);

const getInitialLanguage = () => {
  if (typeof window === "undefined") return "zh-CN";
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "zh-CN" || saved === "en") return saved;
  return "zh-CN";
};

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": {
      translation: zhCN,
    },
    en: {
      translation: enUS,
    },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  returnEmptyString: false,
});

export default i18n;
