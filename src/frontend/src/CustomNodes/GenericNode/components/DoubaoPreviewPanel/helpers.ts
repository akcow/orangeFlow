export function sanitizePreviewDataUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("data:image")) return undefined;
  // Remove any whitespace/newlines to avoid broken data URLs.
  return trimmed.replace(/\s+/g, "");
}
