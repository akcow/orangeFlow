import { AUTHORIZED_DUPLICATE_REQUESTS } from "../../../constants/constants";

const DUPLICATE_WINDOW_MS = 300;

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries
    .map(([key, val]) => `${key}:${stableSerialize(val)}`)
    .join(",")}}`;
}

function buildRequestSignature(config: {
  method?: string;
  url?: string;
  params?: unknown;
  data?: unknown;
}): string {
  const method = (config.method ?? "get").toLowerCase();
  const url = config.url ?? "";
  const params = stableSerialize(config.params);
  const data = stableSerialize(config.data);
  return `${method}|${url}|${params}|${data}`;
}

export function checkDuplicateRequestAndStoreRequest(config) {
  const lastSignature = sessionStorage.getItem("lastRequestSignature");
  const lastRequestTime = sessionStorage.getItem("lastRequestTime");
  const lastCurrentUrl = sessionStorage.getItem("lastCurrentUrl");

  const currentUrl = window.location.pathname;
  const currentTime = Date.now();
  const requestSignature = buildRequestSignature(config);
  const isContained = AUTHORIZED_DUPLICATE_REQUESTS.some((request) =>
    config?.url!.includes(request),
  );

  const isRapidDuplicate =
    requestSignature === lastSignature &&
    !isContained &&
    (config?.method ?? "get").toLowerCase() === "get" &&
    !!lastRequestTime &&
    currentTime - parseInt(lastRequestTime, 10) < DUPLICATE_WINDOW_MS &&
    lastCurrentUrl === currentUrl;

  sessionStorage.setItem("lastRequestSignature", requestSignature);
  sessionStorage.setItem("lastRequestTime", currentTime.toString());
  sessionStorage.setItem("lastCurrentUrl", currentUrl);

  return isRapidDuplicate;
}
