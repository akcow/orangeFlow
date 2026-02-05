import { getURL } from "@/controllers/API/helpers/constants";

function splitStoragePath(filePath: string): { flowId: string; fileName: string } | null {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const flowId = parts[0]!;
  const fileName = parts.slice(1).join("/");
  return { flowId, fileName };
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
  return `${getURL("FILES")}/images/${parts.flowId}/${parts.fileName}`;
}

export function getCommunityMediaUrl(filePath: string): string | null {
  const parts = splitStoragePath(filePath);
  if (!parts) return null;
  return `${getURL("FILES")}/media/${parts.flowId}/${parts.fileName}`;
}

export function getCommunityPreviewUrl(filePath: string): string | null {
  return isLikelyImagePath(filePath) ? getCommunityImageUrl(filePath) : getCommunityMediaUrl(filePath);
}
