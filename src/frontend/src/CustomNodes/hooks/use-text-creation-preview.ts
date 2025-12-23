import { useMemo } from "react";
import { BuildStatus } from "@/constants/enums";
import useFlowStore from "@/stores/flowStore";
import type { OutputLogType } from "@/types/api";

export type TextPreviewItem = {
  id: string;
  text: string;
  generatedAt?: string;
  model?: string;
  prompt?: string;
};

function resolveText(message: any): string | null {
  if (!message) return null;
  if (typeof message === "string") return message;
  if (typeof message.text === "string") return message.text;
  if (typeof message.content === "string") return message.content;
  if (typeof message.data === "string") return message.data;
  if (message.data && typeof message.data.text === "string") return message.data.text;
  if (message.message && typeof message.message === "string") return message.message;
  return null;
}

function parseLog(
  log: OutputLogType | undefined,
  fallbackTimestamp?: string,
): TextPreviewItem | null {
  if (!log) return null;
  const message = log.message;
  const text = resolveText(message);
  if (!text) return null;

  const previewMeta =
    message && typeof message === "object" ? message.text_preview ?? {} : {};

  const generatedAt =
    previewMeta.generated_at ??
    previewMeta.generatedAt ??
    fallbackTimestamp ??
    undefined;
  const model = previewMeta.model ?? message?.model ?? message?.model_name;
  const prompt = previewMeta.prompt ?? message?.prompt;
  const token =
    previewMeta.token ??
    message?.token ??
    message?.id ??
    `text-${generatedAt ?? Date.now()}`;

  return {
    id: String(token),
    text,
    generatedAt,
    model,
    prompt,
  };
}

export function useTextCreationPreview(
  nodeId: string,
  preferredOutput?: string,
): {
  current: TextPreviewItem | null;
  history: TextPreviewItem[];
  isBuilding: boolean;
  lastUpdated?: string;
} {
  const { flowPool, flowBuildStatus } = useFlowStore();

  return useMemo(() => {
    const pool = flowPool[nodeId] ?? [];
    const history: TextPreviewItem[] = [];

    // Iterate newest first
    for (let i = pool.length - 1; i >= 0; i -= 1) {
      const entry = pool[i];
      const outputs = entry?.data?.outputs ?? {};
      const outputLogs = preferredOutput && outputs[preferredOutput]
        ? [outputs[preferredOutput]]
        : Object.values(outputs ?? {});

      const match = outputLogs
        .map((log) => parseLog(log, entry?.timestamp))
        .find(Boolean);
      if (match) {
        history.push(match);
      }
    }

    const current = history[0] ?? null;
    const isBuilding =
      flowBuildStatus[nodeId]?.status === BuildStatus.BUILDING || false;
    const lastUpdated = current?.generatedAt ?? pool.at(-1)?.timestamp;

    return {
      current,
      history,
      isBuilding,
      lastUpdated,
    };
  }, [flowPool, flowBuildStatus, nodeId, preferredOutput]);
}
