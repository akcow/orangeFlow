export function sanitizePreviewDataUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("data:image")) return undefined;
  // Remove any whitespace/newlines to avoid broken data URLs.
  return trimmed.replace(/\s+/g, "");
}

// Convert data URLs into blob object URLs to improve browser compatibility with large inline previews.
export async function toRenderableImageSource(
  source: string | undefined,
): Promise<{ url: string; revoke?: () => void }> {
  if (!source) return { url: "" };
  // For data URLs, keep them as-is after sanitization; this avoids fetch failures on very long URIs.
  if (source.startsWith("data:image")) {
    return { url: sanitizePreviewDataUrl(source) ?? source };
  }
  try {
    const response = await fetch(source);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (_e) {
    // Fallback to the original source if conversion fails.
    return { url: source };
  }
}
