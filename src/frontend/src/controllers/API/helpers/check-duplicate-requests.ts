import { AUTHORIZED_DUPLICATE_REQUESTS } from "../../../constants/constants";

const DUPLICATE_WINDOW_MS = 300;

// Max length (in characters) for the serialized data portion of a signature
// before we switch to a compact hash representation.
const MAX_DATA_LENGTH = 1024;

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

/**
 * djb2 hash – deterministic, fast, produces a fixed-length hex string.
 * Used to compact large request bodies so we never exceed storage quotas.
 */
function djb2Hash(str: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0, len = str.length; i < len; i++) {
    const ch = str.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + ch) | 0;
    h2 = ((h2 << 5) + h2 + ch) | 0;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

/**
 * Produce a compact, fixed-length signature for a request so we can detect
 * rapid duplicate GETs without risking a sessionStorage quota overflow.
 * For small payloads (<= MAX_DATA_LENGTH chars) the full serialization is
 * used for perfect deduplication.  For large payloads (e.g. flows with base64
 * images/videos) we fall back to a hash + length tag.
 */
function buildRequestSignature(config: {
  method?: string;
  url?: string;
  params?: unknown;
  data?: unknown;
}): string {
  const method = (config.method ?? "get").toLowerCase();
  const url = config.url ?? "";
  const params = stableSerialize(config.params);
  const rawData = stableSerialize(config.data);

  const data =
    rawData.length > MAX_DATA_LENGTH
      ? `__hash__${djb2Hash(rawData)}__len__${rawData.length}`
      : rawData;

  return `${method}|${url}|${params}|${data}`;
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // QuotaExceededError or SecurityError – silently ignore so normal
    // request flow is never interrupted by storage bookkeeping.
    console.warn(
      `[check-duplicate-requests] sessionStorage.setItem("${key}") failed (quota/security). Skipping.`,
    );
  }
}

export function checkDuplicateRequestAndStoreRequest(config) {
  let lastSignature: string | null = null;
  let lastRequestTime: string | null = null;
  let lastCurrentUrl: string | null = null;

  try {
    lastSignature = sessionStorage.getItem("lastRequestSignature");
    lastRequestTime = sessionStorage.getItem("lastRequestTime");
    lastCurrentUrl = sessionStorage.getItem("lastCurrentUrl");
  } catch {
    // Storage unavailable – treat as no previous request.
  }

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

  safeSessionSet("lastRequestSignature", requestSignature);
  safeSessionSet("lastRequestTime", currentTime.toString());
  safeSessionSet("lastCurrentUrl", currentUrl);

  return isRapidDuplicate;
}
