import type { ReactNode } from "react";

export type MediaReferenceKind = "image" | "video";

export type MediaReferenceSuggestion = {
  id: string;
  kind: MediaReferenceKind;
  index: number;
  label: string;
  token: string;
  sourceLabel?: string;
  previewUrl?: string;
};

export type MediaReferenceTokenMatch = {
  start: number;
  end: number;
  rawToken: string;
  kind: MediaReferenceKind;
  index: number;
};

export const PROMPT_MEDIA_REFERENCE_TOKEN_PATTERN =
  /\{\{\s*(Image|Video)\s+(\d+)\s*\}\}/gi;

export function buildMediaReferenceToken(
  kind: MediaReferenceKind,
  index: number,
): string {
  return `{{${kind === "video" ? "Video" : "Image"} ${index}}}`;
}

export function extractMediaReferenceTrigger(
  value: string,
  caretIndex: number,
): { start: number; end: number; query: string; key: string } | null {
  const safeValue = String(value ?? "");
  const safeCaret = Math.max(0, Math.min(caretIndex, safeValue.length));
  const beforeCaret = safeValue.slice(0, safeCaret);
  const start = beforeCaret.lastIndexOf("@");
  if (start === -1) return null;

  const prevChar = start > 0 ? beforeCaret.slice(start - 1, start) : "";
  if (prevChar === "@" || prevChar === "{" || /[A-Za-z0-9_]/.test(prevChar)) {
    return null;
  }

  const query = beforeCaret.slice(start + 1);
  if (/[\s@{}]/.test(query)) return null;

  return {
    start,
    end: safeCaret,
    query,
    key: `${start}:${query.toLowerCase()}`,
  };
}

export function filterMediaReferenceSuggestions(
  suggestions: MediaReferenceSuggestion[],
  query: string,
): MediaReferenceSuggestion[] {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return suggestions;
  return suggestions.filter((suggestion) => {
    const haystacks = [
      suggestion.label,
      suggestion.token,
      suggestion.sourceLabel,
      suggestion.kind,
    ];
    return haystacks.some((value) =>
      String(value ?? "").toLowerCase().includes(normalized),
    );
  });
}

export function renderPromptWithMediaReferenceTokens(
  value: string,
  renderToken: (
    kind: MediaReferenceKind,
    index: number,
    rawToken: string,
    key: string,
  ) => ReactNode,
): ReactNode[] {
  const safeValue = String(value ?? "");
  if (!safeValue) return [];

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(PROMPT_MEDIA_REFERENCE_TOKEN_PATTERN);

  match = pattern.exec(safeValue);
  while (match) {
    const rawToken = match[0] ?? "";
    const tokenStart = match.index;
    const tokenEnd = tokenStart + rawToken.length;
    if (tokenStart > lastIndex) {
      nodes.push(safeValue.slice(lastIndex, tokenStart));
    }

    const kind = String(match[1] ?? "").toLowerCase() === "video" ? "video" : "image";
    const index = Number(match[2] ?? 0);
    nodes.push(renderToken(kind, index, rawToken, `${kind}-${index}-${tokenStart}`));
    lastIndex = tokenEnd;
    match = pattern.exec(safeValue);
  }

  if (lastIndex < safeValue.length) {
    nodes.push(safeValue.slice(lastIndex));
  }

  return nodes;
}

export function getMediaReferenceTokenMatches(
  value: string,
): MediaReferenceTokenMatch[] {
  const safeValue = String(value ?? "");
  if (!safeValue) return [];

  const matches: MediaReferenceTokenMatch[] = [];
  const pattern = new RegExp(PROMPT_MEDIA_REFERENCE_TOKEN_PATTERN);
  let match: RegExpExecArray | null = pattern.exec(safeValue);

  while (match) {
    const rawToken = match[0] ?? "";
    const start = match.index;
    const end = start + rawToken.length;
    const kind =
      String(match[1] ?? "").toLowerCase() === "video" ? "video" : "image";
    const index = Number(match[2] ?? 0);
    matches.push({ start, end, rawToken, kind, index });
    match = pattern.exec(safeValue);
  }

  return matches;
}
