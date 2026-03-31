import type { Connection } from "@xyflow/react";
import type { AllNodeType, EdgeType } from "@/types/flow";
import {
  canAddImageRole,
  type EdgeImageRole,
  getDoubaoVideoGenerationMode,
  getDoubaoVideoModelName,
  getImageRoleCounts,
  getImageRoleLimitsForGenerationMode,
  pickImageRoleForNewEdge,
  type VideoGenerationMode,
} from "./flowMediaUtils";
import { scapeJSONParse, scapedJSONStringfy } from "./reactflowUtils";

const IMAGE_REFERENCE_SOURCE_TYPES = new Set([
  "DoubaoImageCreator",
  "UserUploadImage",
]);
const VIDEO_REFERENCE_SOURCE_TYPES = new Set([
  "DoubaoVideoGenerator",
  "UserUploadVideo",
]);

const REFERENCE_IMAGES_FIELD = "reference_images";
const FIRST_FRAME_FIELD = "first_frame_image";
const LAST_FRAME_FIELD = "last_frame_image";
const IMAGE_OUTPUT_NAME = "image";
const VIDEO_OUTPUT_NAME = "video";

type ReferenceSelectionMeta = {
  canSelectImageSources: boolean;
  canSelectVideoSources: boolean;
  fieldName:
    | typeof REFERENCE_IMAGES_FIELD
    | typeof FIRST_FRAME_FIELD
    | typeof LAST_FRAME_FIELD;
  hoverLabel: string;
  imageRole?: EdgeImageRole | null;
};

type ReferenceSelectionOverrides = {
  preferredFieldName?: string | null;
  preferredImageRole?: EdgeImageRole | null;
  hoverLabel?: string | null;
};

function getNodeType(node: AllNodeType | undefined): string {
  return String(node?.data?.type ?? "").trim();
}

function isImageReferenceSourceType(nodeType?: string): boolean {
  return IMAGE_REFERENCE_SOURCE_TYPES.has(String(nodeType ?? "").trim());
}

function isVideoReferenceSourceType(nodeType?: string): boolean {
  return VIDEO_REFERENCE_SOURCE_TYPES.has(String(nodeType ?? "").trim());
}

function getEdgeTargetFieldName(edge: EdgeType): string | undefined {
  const targetHandle =
    edge.data?.targetHandle ??
    (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
  return targetHandle?.fieldName ?? targetHandle?.name;
}

function getMaxIncomingVideoReferenceEdges(modelName: string): number {
  return modelName.trim().toLowerCase() === "viduq2-pro" ? 2 : 1;
}

function countIncomingVideoReferenceEdges(
  targetNodeId: string,
  edges: EdgeType[],
  nodes: AllNodeType[],
): number {
  return edges.filter((edge) => {
    if (edge.target !== targetNodeId) return false;
    if (getEdgeTargetFieldName(edge) !== FIRST_FRAME_FIELD) return false;
    if (
      edge.data?.videoReferType === "base" ||
      edge.data?.videoReferType === "feature"
    ) {
      return true;
    }
    const sourceNode = nodes.find((node) => node.id === edge.source);
    return isVideoReferenceSourceType(getNodeType(sourceNode));
  }).length;
}

export function getVideoGenerationModeLabel(mode: unknown): string {
  const labels: Record<VideoGenerationMode, string> = {
    text: "文生视频",
    first_frame: "首帧",
    first_last_frame: "首尾帧",
    reference_image: "参考",
    reference_video: "参考视频",
    video_edit: "视频编辑",
  };
  const normalized = String(mode ?? "").trim() as VideoGenerationMode;
  return labels[normalized] ?? (String(mode ?? "").trim() || "参考");
}

export function getReferenceSelectionMeta(
  targetNode: AllNodeType | undefined,
  edges: EdgeType[] = [],
  nodes: AllNodeType[] = [],
  overrides?: ReferenceSelectionOverrides,
): ReferenceSelectionMeta | null {
  if (targetNode?.type !== "genericNode") return null;

  const targetType = getNodeType(targetNode);
  if (targetType === "DoubaoImageCreator") {
    return {
      canSelectImageSources: true,
      canSelectVideoSources: false,
      fieldName: REFERENCE_IMAGES_FIELD,
      hoverLabel: overrides?.hoverLabel ?? "参考",
      imageRole: overrides?.preferredImageRole ?? null,
    };
  }

  if (targetType !== "DoubaoVideoGenerator") return null;

  const generationMode = getDoubaoVideoGenerationMode(targetNode);
  const modelName = getDoubaoVideoModelName(targetNode);
  const imageRoleLimits = getImageRoleLimitsForGenerationMode(
    modelName,
    generationMode,
  );
  const imageCounts = getImageRoleCounts(edges, targetNode.id, targetNode);
  const hasVideoCapacity =
    countIncomingVideoReferenceEdges(targetNode.id, edges, nodes) <
    getMaxIncomingVideoReferenceEdges(modelName);

  let canSelectImageSources = false;
  let canSelectVideoSources = false;
  const preferredFieldName = overrides?.preferredFieldName ?? null;
  const preferredImageRole = overrides?.preferredImageRole ?? null;

  if (generationMode === "text") {
    return {
      canSelectImageSources: true,
      canSelectVideoSources: true,
      fieldName: FIRST_FRAME_FIELD,
      hoverLabel: overrides?.hoverLabel ?? "上传图片或视频",
      imageRole: preferredImageRole,
    };
  }

  if (preferredFieldName === LAST_FRAME_FIELD || preferredImageRole === "last") {
    return {
      canSelectImageSources: canAddImageRole("last", imageCounts, imageRoleLimits),
      canSelectVideoSources: false,
      fieldName: LAST_FRAME_FIELD,
      hoverLabel: overrides?.hoverLabel ?? "尾帧",
      imageRole: "last",
    };
  }

  if (preferredImageRole === "first") {
    return {
      canSelectImageSources: canAddImageRole("first", imageCounts, imageRoleLimits),
      canSelectVideoSources: false,
      fieldName: FIRST_FRAME_FIELD,
      hoverLabel: overrides?.hoverLabel ?? "首帧",
      imageRole: "first",
    };
  }

  if (generationMode === "first_frame") {
    canSelectImageSources = canAddImageRole(
      "first",
      imageCounts,
      imageRoleLimits,
    );
  } else if (generationMode === "first_last_frame") {
    canSelectImageSources =
      pickImageRoleForNewEdge(imageRoleLimits, imageCounts) !== null;
  } else if (
    generationMode === "reference_image" ||
    generationMode === "reference_video" ||
    generationMode === "video_edit"
  ) {
    canSelectImageSources = canAddImageRole(
      "reference",
      imageCounts,
      imageRoleLimits,
    );
  }

  if (
    generationMode === "reference_video" ||
    generationMode === "video_edit"
  ) {
    canSelectVideoSources = hasVideoCapacity;
  }

  return {
    canSelectImageSources,
    canSelectVideoSources,
    fieldName: FIRST_FRAME_FIELD,
    hoverLabel:
      overrides?.hoverLabel ?? getVideoGenerationModeLabel(generationMode),
    imageRole: preferredImageRole,
  };
}

export function canStartReferenceSelection(
  targetNode: AllNodeType | undefined,
  edges: EdgeType[] = [],
  nodes: AllNodeType[] = [],
  overrides?: ReferenceSelectionOverrides,
): boolean {
  const meta = getReferenceSelectionMeta(targetNode, edges, nodes, overrides);
  if (!meta) return false;
  return meta.canSelectImageSources || meta.canSelectVideoSources;
}

export function isReferenceSelectionSourceNode(
  sourceNode: AllNodeType | undefined,
  targetNode: AllNodeType | undefined,
  edges: EdgeType[] = [],
  nodes: AllNodeType[] = [],
  overrides?: ReferenceSelectionOverrides,
): boolean {
  if (sourceNode?.type !== "genericNode") return false;
  if (!targetNode || sourceNode.id === targetNode.id) return false;

  const meta = getReferenceSelectionMeta(targetNode, edges, nodes, overrides);
  if (!meta) return false;

  const sourceType = getNodeType(sourceNode);
  if (isImageReferenceSourceType(sourceType)) {
    return meta.canSelectImageSources;
  }
  if (isVideoReferenceSourceType(sourceType)) {
    return meta.canSelectVideoSources;
  }
  return false;
}

function getPreferredOutputName(sourceNode: AllNodeType | undefined): string {
  return isVideoReferenceSourceType(getNodeType(sourceNode))
    ? VIDEO_OUTPUT_NAME
    : IMAGE_OUTPUT_NAME;
}

export function buildReferenceSelectionConnection(
  sourceNode: AllNodeType | undefined,
  targetNode: AllNodeType | undefined,
  edges: EdgeType[] = [],
  nodes: AllNodeType[] = [],
  overrides?: ReferenceSelectionOverrides,
): Connection | null {
  if (
    !isReferenceSelectionSourceNode(
      sourceNode,
      targetNode,
      edges,
      nodes,
      overrides,
    )
  ) {
    return null;
  }

  const meta = getReferenceSelectionMeta(targetNode, edges, nodes, overrides);
  if (!meta || sourceNode?.type !== "genericNode" || targetNode?.type !== "genericNode") {
    return null;
  }

  const sourceOutputs = sourceNode.data?.node?.outputs ?? [];
  const preferredOutputName = getPreferredOutputName(sourceNode);
  const outputDefinition =
    sourceOutputs.find((output) => output.name === preferredOutputName) ??
    sourceOutputs.find((output) => !output.hidden) ??
    sourceOutputs[0];
  const targetField = targetNode.data?.node?.template?.[meta.fieldName];

  if (!outputDefinition || !targetField) return null;

  const sourceOutputTypes =
    outputDefinition.types && outputDefinition.types.length === 1
      ? outputDefinition.types
      : outputDefinition.selected
        ? [outputDefinition.selected]
        : ["Data"];

  const sourceHandle = {
    output_types: sourceOutputTypes,
    id: sourceNode.id,
    dataType: sourceNode.data.type,
    name: outputDefinition.name ?? preferredOutputName,
    ...(outputDefinition.proxy ? { proxy: outputDefinition.proxy } : {}),
  };

  const targetHandle = {
    inputTypes: targetField.input_types,
    type: targetField.type,
    id: targetNode.id,
    fieldName: meta.fieldName,
    ...(targetField.proxy ? { proxy: targetField.proxy } : {}),
  };

  return {
    source: sourceNode.id,
    target: targetNode.id,
    sourceHandle: scapedJSONStringfy(sourceHandle),
    targetHandle: scapedJSONStringfy(targetHandle),
    ...(meta.imageRole ? { imageRole: meta.imageRole } : {}),
  };
}
