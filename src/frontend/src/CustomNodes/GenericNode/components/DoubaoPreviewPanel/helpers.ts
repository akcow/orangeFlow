export function sanitizePreviewDataUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("data:image")) return undefined;
  // Remove any whitespace/newlines to avoid broken data URLs.
  return trimmed.replace(/\s+/g, "");
}

function decodeBase64ToUint8Array(value: string): Uint8Array | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  if (typeof atob !== "function") return null;
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function tryConvertDataUrlToObjectUrl(
  dataUrl: string,
): { url: string; revoke?: () => void } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  if (!/^data:/i.test(dataUrl)) return null;

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return null;

  const meta = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const isBase64 = /;base64/i.test(meta);
  if (!isBase64) return null;

  const mimeType = meta.slice("data:".length).split(";")[0] || "image/png";

  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Blob === "undefined"
  ) {
    return null;
  }

  const bytes = decodeBase64ToUint8Array(payload);
  if (!bytes) return null;

  try {
    const blob = new Blob([bytes], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    return null;
  }
}

// Convert data URLs into blob object URLs to improve browser compatibility (e.g. CSP blocking `data:` images).
export async function toRenderableImageSource(
  source: string | undefined,
): Promise<{ url: string; revoke?: () => void }> {
  if (!source) return { url: "" };
  const trimmed = source.trim();
  const sanitized = sanitizePreviewDataUrl(trimmed) ?? trimmed;

  if (/^blob:/i.test(sanitized)) {
    return { url: sanitized };
  }

  if (/^data:/i.test(sanitized)) {
    const converted = tryConvertDataUrlToObjectUrl(sanitized);
    if (converted) return converted;
    return { url: sanitized };
  }

  // Keep normal image URLs unchanged. Fetching them into blob URLs can mask backend
  // error payloads as opaque object URLs and causes valid remote JPG previews to fail.
  return { url: sanitized };
}
