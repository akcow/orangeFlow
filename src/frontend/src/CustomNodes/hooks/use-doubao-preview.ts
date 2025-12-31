import { useCallback } from 'react';
import useFlowStore from '@/stores/flowStore';
import { BuildStatus } from '@/constants/enums';
import type { OutputLogType } from '@/types/api';

// Doubao组件类型映射 - 也在节点渲染时复用
export const DOUBAO_COMPONENTS = new Set<string>([
  'DoubaoImageCreator',
  'DoubaoVideoGenerator',
  'DoubaoTTS'
]);

export const isDoubaoComponent = (componentName?: string): boolean =>
  Boolean(componentName && DOUBAO_COMPONENTS.has(componentName));

// 默认类型映射
const COMPONENT_KIND_MAP: Record<string, 'image' | 'video' | 'audio'> = {
  DoubaoImageCreator: 'image',
  DoubaoVideoGenerator: 'video',
  DoubaoTTS: 'audio',
};

export type DoubaoPreviewDescriptor = {
  token: string;
  kind: 'image' | 'video' | 'audio';
  available: boolean;
  payload: any;
  error?: string;
  generated_at?: string;
};

type UseDoubaoPreviewReturn = {
  preview: DoubaoPreviewDescriptor | null;
  isBuilding: boolean;
  rawMessage: OutputLogType | null;
  lastUpdated?: string;
};

type OutputLogValue = OutputLogType | OutputLogType[] | undefined;

function normalizeOutputLogs(outputData: OutputLogValue): OutputLogType[] {
  if (!outputData) return [];
  const logs = Array.isArray(outputData) ? outputData : [outputData];
  return logs.filter((log): log is OutputLogType => Boolean(log)).reverse();
}

function searchPreviewInOutputs(
  outputs: Record<string, OutputLogValue>,
  matcher: (log: OutputLogType) => DoubaoPreviewDescriptor | null
): { preview: DoubaoPreviewDescriptor; rawLog: OutputLogType } | null {
  for (const outputData of Object.values(outputs)) {
    const logs = normalizeOutputLogs(outputData);
    for (const log of logs) {
      const candidate = matcher(log);
      if (candidate) {
        return { preview: candidate, rawLog: log };
      }
    }
  }
  return null;
}

function parsePreviewData(componentName: string | undefined, rawPayload: any): DoubaoPreviewDescriptor | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const data = rawPayload;

  // 优先解析新的doubao_preview格式
  if (data.doubao_preview) {
    const fromData = data.doubao_preview;
    const kind = fromData.kind as DoubaoPreviewDescriptor['kind'];

    // Normalize payload for backward-compatible video previews:
    // some backends only return `payload.videos[]` without a top-level `payload.video_url`.
    let normalizedPayload = fromData.payload ?? null;
    if (kind === 'video' && normalizedPayload && typeof normalizedPayload === 'object') {
      const payloadObj: any = normalizedPayload;
      const videos = Array.isArray(payloadObj.videos) ? payloadObj.videos : [];
      const first =
        videos.find((video: any) => video?.video_url || video?.url) ?? null;
      if (!payloadObj.video_url && first) {
        payloadObj.video_url = first.video_url || first.url;
        payloadObj.cover_preview_base64 =
          payloadObj.cover_preview_base64 ?? first.cover_preview_base64;
        payloadObj.cover_url =
          payloadObj.cover_url ?? first.cover_url ?? first.last_frame_url;
        payloadObj.duration = payloadObj.duration ?? first.duration;
      }
      normalizedPayload = payloadObj;
    }
    return {
      token: fromData.token,
      kind,
      generated_at: fromData.generated_at,
      available: Boolean(fromData.available),
      payload: normalizedPayload,
      error: fromData.error,
    };
  }

  // fallback: image nodes returning inline/base64 data
  const inlineImage =
    data.image_data_url ||
    data.preview_base64 ||
    data.preview_data_url ||
    null;
  const remoteImage =
    data.image_url ||
    data.edited_image_url ||
    data.original_image_url ||
    null;
  if (inlineImage || remoteImage) {
    const fallbackKind = componentName ? COMPONENT_KIND_MAP[componentName] : 'image';
    return {
      token: data.preview_token,
      kind: fallbackKind ?? 'image',
      generated_at: data.generated_at,
      available: true,
      payload: {
        image_data_url: inlineImage ?? undefined,
        image_url: remoteImage ?? undefined,
        width: data.width,
        height: data.height,
      },
      error: data.preview_error,
    };
  }

  const videos = Array.isArray(data.videos) ? data.videos : [];
  const primaryVideo =
    videos.find((video) => video?.video_url || video?.url) ||
    (data.video_url
      ? {
          video_url: data.video_url,
          cover_preview_base64: data.cover_preview_base64,
          cover_url: data.cover_url,
          duration: data.duration,
        }
      : null);
  if (primaryVideo?.video_url) {
    return {
      token: data.preview_token || data.task_id || data.id || primaryVideo.video_url,
      kind: 'video',
      generated_at: data.generated_at,
      available: true,
      payload: {
        video_url: primaryVideo.video_url,
        cover_preview_base64: primaryVideo.cover_preview_base64 || data.cover_preview_base64,
        cover_url: primaryVideo.cover_url || data.cover_url || primaryVideo.last_frame_url,
        duration: primaryVideo.duration || data.duration,
        videos: videos.length ? videos : undefined,
      },
      error: data.preview_error || data.warning,
    };
  }

  if (data.audio_base64) {
    return {
      token: data.preview_token,
      kind: 'audio',
      generated_at: data.generated_at,
      available: true,
      payload: {
        audio_base64: data.audio_base64,
        audio_type: data.audio_type,
        sample_rate: data.sample_rate,
      },
      error: data.preview_error,
    };
  }

  return null;
}

export function useDoubaoPreview(nodeId: string, componentName?: string): UseDoubaoPreviewReturn {
  const { flowPool, flowBuildStatus } = useFlowStore();

  const result = useCallback((): UseDoubaoPreviewReturn => {
    const nodeOutputs = flowPool[nodeId];
    if (!nodeOutputs?.length) {
      return {
        preview: null,
        isBuilding: flowBuildStatus[nodeId]?.status === BuildStatus.BUILDING,
        rawMessage: null,
      };
    }

    // 获取最新的输出消息
    const messageData = nodeOutputs[nodeOutputs.length - 1];
    if (!messageData?.data?.outputs) {
      return {
        preview: null,
        isBuilding: flowBuildStatus[nodeId]?.status === BuildStatus.BUILDING,
        rawMessage: messageData,
      };
    }

    // 查找包含doubao数据的输出字段
    const allOutputs = messageData.data.outputs as Record<string, OutputLogValue>;
    let preview: DoubaoPreviewDescriptor | null = null;
    let rawMessage = messageData;

    // 1. ??????doubao_preview??
    const prioritized = searchPreviewInOutputs(allOutputs, (log) => {
      const payload = log?.message;
      if (payload?.doubao_preview) {
        return parsePreviewData(componentName, payload);
      }
      return null;
    });

    if (prioritized) {
      preview = prioritized.preview;
      rawMessage = prioritized.rawLog;
    } else {
      const fallback = searchPreviewInOutputs(allOutputs, (log) =>
        parsePreviewData(componentName, log?.message)
      );
      if (fallback) {
        preview = fallback.preview;
        rawMessage = fallback.rawLog;
      }
    }

    return {
      preview,
      isBuilding: flowBuildStatus[nodeId]?.status === BuildStatus.BUILDING,
      rawMessage,
      lastUpdated: preview?.generated_at,
    };
  }, [componentName, nodeId, flowPool, flowBuildStatus]);

  return result();
}

export default useDoubaoPreview;
