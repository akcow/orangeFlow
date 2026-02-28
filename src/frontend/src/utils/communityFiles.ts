import { getURL } from "@/controllers/API/helpers/constants";

const UUIDISH_RE =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(filePath: string): string {
  return String(filePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function extractFromFilesRoute(pathLike: string): { flowId: string; fileName: string } | null {
  const normalized = normalizePath(pathLike);
  const markers = [
    "/files/images/",
    "/files/media/",
    "/files/download/",
    "api/v1/files/images/",
    "api/v1/files/media/",
    "api/v1/files/download/",
    "files/images/",
    "files/media/",
    "files/download/",
  ];

  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx < 0) continue;
    const tail = normalized.slice(idx + marker.length);
    const parts = tail.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    return { flowId: parts[0]!, fileName: safeDecode(parts.slice(1).join("/")) };
  }
  return null;
}

function splitStoragePath(filePath: string): { flowId: string; fileName: string } | null {
  const normalized = normalizePath(filePath);
  if (!normalized) return null;

  const fromRoute = extractFromFilesRoute(normalized);
  if (fromRoute) return fromRoute;

  try {
    const asUrl = new URL(normalized);
    const fromUrlRoute = extractFromFilesRoute(asUrl.pathname);
    if (fromUrlRoute) return fromUrlRoute;
  } catch {
    // Not an absolute URL; continue with raw path parsing.
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const uuidIndex = parts.findIndex((part) => UUIDISH_RE.test(part));
  if (uuidIndex >= 0 && uuidIndex < parts.length - 1) {
    return {
      flowId: parts[uuidIndex]!,
      fileName: safeDecode(parts.slice(uuidIndex + 1).join("/")),
    };
  }

  return { flowId: parts[0]!, fileName: safeDecode(parts.slice(1).join("/")) };
}

export function isLikelyImagePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".svg")
  );
}

export function getCommunityImageUrl(filePath: string): string | null {
  const parts = splitStoragePath(filePath);
  if (!parts) return null;
  return `${getURL("FILES")}/images/${encodeURIComponent(parts.flowId)}/${encodeURIComponent(parts.fileName)}`;
}

export function getCommunityMediaUrl(filePath: string): string | null {
  const parts = splitStoragePath(filePath);
  if (!parts) return null;
  return `${getURL("FILES")}/media/${encodeURIComponent(parts.flowId)}/${encodeURIComponent(parts.fileName)}`;
}

export function getCommunityPreviewUrl(filePath: string): string | null {
  return isLikelyImagePath(filePath) ? getCommunityImageUrl(filePath) : getCommunityMediaUrl(filePath);
}
