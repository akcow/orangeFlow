/**
 * In Honor of Otávio Anovazzi (@anovazzi1)
 *
 * This file contains the highest number of commits by Otávio in the entire Langflow project,
 * reflecting his unmatched dedication, expertise, and innovative spirit. Each line of code
 * is a testament to his relentless pursuit of excellence and his significant impact on this
 * project's evolution.

 * His commitment to selflessly helping others embodies the true meaning of open source,
 * and his legacy lives on in each one of his 2771 contributions, inspiring us to build exceptional
 * software for all.
 */

import {
  type Connection,
  type Edge,
  getOutgoers,
  type Node,
  type OnSelectionChangeParams,
  type ReactFlowJsonObject,
  type XYPosition,
} from "@xyflow/react";
import { cloneDeep } from "lodash";
import ShortUniqueId from "short-unique-id";
import {
  getLeftHandleId,
  getRightHandleId,
} from "@/CustomNodes/utils/get-handle-id";
import { INCOMPLETE_LOOP_ERROR_ALERT } from "@/constants/alerts_constants";
import { customDownloadFlow } from "@/customization/utils/custom-reactFlowUtils";
import { t } from "@/i18n/t";
import useFlowStore from "@/stores/flowStore";
import getFieldTitle from "../CustomNodes/utils/get-field-title";
import {
  INPUT_TYPES,
  IS_MAC,
  LANGFLOW_SUPPORTED_TYPES,
  OUTPUT_TYPES,
  SUCCESS_BUILD,
  specialCharsRegex,
} from "../constants/constants";
import { DESCRIPTIONS } from "../flow_constants";
import type {
  APIClassType,
  APIKindType,
  APIObjectType,
  APITemplateType,
  InputFieldType,
  OutputFieldType,
} from "../types/api";
import type {
  AllNodeType,
  EdgeType,
  FlowType,
  NodeDataType,
  sourceHandleType,
  targetHandleType,
} from "../types/flow";
import type {
  addEscapedHandleIdsToEdgesType,
  findLastNodeType,
  generateFlowType,
  updateEdgesHandleIdsType,
} from "../types/utils/reactflowUtils";
import { getLayoutedNodes } from "./layoutUtils";
import { createRandomKey, toTitleCase } from "./utils";

const uid = new ShortUniqueId();

export type EdgeImageRole = "first" | "reference" | "last";

export const IMAGE_ROLE_FIELD = "first_frame_image";
export const IMAGE_ROLE_TARGET = "DoubaoVideoGenerator";

const DEFAULT_FIRST_FRAME_MAX_UPLOADS = 6;
const KLING_MAX_UPLOADS = 7;
const VEO_REFERENCE_IMAGE_LIMIT = 3;
const VEO_MAX_UPLOADS = 5;
const VEO_FAST_MAX_UPLOADS = 2;

type ImageRoleCounts = {
  total: number;
  first: number;
  reference: number;
  last: number;
};

type ImageRoleLimits = {
  allowedRoles: EdgeImageRole[];
  maxTotal: number;
  maxReference?: number;
};

export function getDoubaoVideoModelName(node?: AllNodeType): string {
  const template = node?.data?.node?.template ?? {};
  const modelField = template?.model_name;
  const value =
    modelField?.value ?? modelField?.default ?? modelField?.options?.[0] ?? "";
  return String(value ?? "").trim();
}

export function getImageRoleLimits(modelName: string): ImageRoleLimits {
  const normalized = String(modelName ?? "").trim();
  const normalizedLower = normalized.toLowerCase();
  const isVeoModel =
    normalized === "VEO3.1" || normalized === "veo3.1-fast";
  const isVeoFast = normalized === "veo3.1-fast";
  const isSoraModel = normalized === "sora-2" || normalized === "sora-2-pro";
  const isWanModel = normalizedLower.startsWith("wan2.");
  // Seedance models support a "first + last" two-keyframe mode. Names include:
  // - "Seedance 1.0 pro" / "Seedance 1.5 pro"
  // - "Doubao-Seedance-1.5-pro｜..."
  const isSeedanceModel =
    normalizedLower.includes("seedance") ||
    normalizedLower.includes("seedream") ||
    normalized.includes("即梦");
  const isKlingModel = normalizedLower.startsWith("kling");
  const isKlingV3 = normalizedLower === "kling v3" || normalizedLower === "kling-v3";
  const isViduModel = normalizedLower.startsWith("vidu");

  if (isSoraModel) {
    return {
      allowedRoles: ["reference"],
      maxTotal: 1,
      maxReference: 1,
    };
  }

  if (normalizedLower === "viduq3-pro") {
    return {
      // Vidu q3-pro: img2video supports 1 start image; no reference/last roles.
      allowedRoles: ["first"],
      maxTotal: 1,
      maxReference: 0,
    };
  }

  if (normalizedLower === "viduq2-pro") {
    return {
      // Vidu q2-pro supports: img2video (first), start-end2video (last), reference2video (reference images + videos).
      allowedRoles: ["first", "reference", "last"],
      // Docs: reference images allow 1-7 (when no videos); when videos exist, images are limited to 1-4.
      // Keep the role-edge limit permissive here; the upload UI and backend will enforce mode-specific caps.
      maxTotal: 7,
      maxReference: 6,
    };
  }

  if (isViduModel) {
    return {
      allowedRoles: ["first"],
      maxTotal: 1,
      maxReference: 0,
    };
  }

  if (isVeoModel) {
    return {
      allowedRoles: isVeoFast ? ["first", "last"] : ["first", "reference", "last"],
      maxTotal: isVeoFast ? VEO_FAST_MAX_UPLOADS : VEO_MAX_UPLOADS,
      maxReference: isVeoFast ? 0 : VEO_REFERENCE_IMAGE_LIMIT,
    };
  }

  if (isWanModel) {
    return {
      // Wan video models don't support a tail frame; keep the original behavior.
      allowedRoles: ["first"],
      maxTotal: DEFAULT_FIRST_FRAME_MAX_UPLOADS,
    };
  }

  if (isSeedanceModel) {
    return {
      // Seedance supports "first + last" (two keyframes). We intentionally disallow
      // "reference" here to make the default 2nd connection become "last".
      allowedRoles: ["first", "last"],
      maxTotal: 2,
    };
  }

  if (isKlingV3) {
    return {
      // Kling V-series (kling-v3): image2video supports a single primary image + optional tail image.
      // No reference images/videos.
      allowedRoles: ["first", "last"],
      maxTotal: 2,
      maxReference: 0,
    };
  }

  if (isKlingModel) {
    return {
      // Kling O1 supports a dedicated `last_frame_image` input. We still allow selecting
      // "last" on role-edges so users can fix/migrate older flows where tail frames were
      // connected via `first_frame_image` (role-edge) instead of the dedicated input.
      allowedRoles: ["first", "reference", "last"],
      maxTotal: KLING_MAX_UPLOADS,
      maxReference: Math.max(KLING_MAX_UPLOADS - 1, 1),
    };
  }

  return {
    allowedRoles: ["first", "reference"],
    maxTotal: DEFAULT_FIRST_FRAME_MAX_UPLOADS,
    maxReference: Math.max(DEFAULT_FIRST_FRAME_MAX_UPLOADS - 1, 1),
  };
}

function getEdgeTargetFieldName(edge: EdgeType): string | undefined {
  const targetHandle = edge.data?.targetHandle;
  if (targetHandle && typeof targetHandle === "object") {
    return targetHandle.fieldName ?? targetHandle.name;
  }
  if (!edge.targetHandle) return undefined;
  try {
    const parsed = scapeJSONParse(edge.targetHandle);
    return parsed?.fieldName ?? parsed?.name;
  } catch {
    return undefined;
  }
}

export function resolveEdgeImageRole(
  edge: EdgeType,
  totalEdges: number,
): EdgeImageRole {
  const role = edge.data?.imageRole;
  if (role === "first" || role === "reference" || role === "last") return role;
  return totalEdges <= 1 ? "first" : "reference";
}

export function getImageRoleCounts(
  edges: EdgeType[],
  targetId: string,
  targetNode?: AllNodeType,
): ImageRoleCounts {
  const roleEdges = edges.filter((edge) => {
    if (edge.target !== targetId) return false;
    const fieldName = getEdgeTargetFieldName(edge);
    return fieldName === IMAGE_ROLE_FIELD;
  });
  const lastFrameEdges = edges.filter((edge) => {
    if (edge.target !== targetId) return false;
    const fieldName = getEdgeTargetFieldName(edge);
    return fieldName === "last_frame_image";
  });
  // Only role-edges participate in the implicit first/reference ordering.
  const totalRoleEdges = roleEdges.length;
  const counts: ImageRoleCounts = {
    total: roleEdges.length + lastFrameEdges.length,
    first: 0,
    reference: 0,
    // last_frame_image is always treated as a fixed "last" input when connected.
    last: lastFrameEdges.length,
  };
  roleEdges.forEach((edge) => {
    const role = resolveEdgeImageRole(edge, totalRoleEdges);
    counts[role] += 1;
  });
  if (targetNode) {
    const limits = getImageRoleLimits(getDoubaoVideoModelName(targetNode));
    const localCounts = getLocalImageRoleCounts(targetNode, limits);
    counts.total += localCounts.total;
    counts.first += localCounts.first;
    counts.reference += localCounts.reference;
    counts.last += localCounts.last;
  }
  return counts;
}

function getLocalImageRoleCounts(
  node: AllNodeType,
  limits?: ImageRoleLimits,
): ImageRoleCounts {
  const counts: ImageRoleCounts = {
    total: 0,
    first: 0,
    reference: 0,
    last: 0,
  };
  const template = node?.data?.node?.template;
  if (!template) return counts;

  // Count dedicated last-frame input (if present) as a fixed "last" role.
  const lastField = template["last_frame_image"];
  if (lastField) {
    const raw = lastField.value ?? lastField.file_path;
    const items = Array.isArray(raw)
      ? raw
      : raw !== undefined && raw !== null
        ? [raw]
        : [];
    const hasAny = items.some((v: unknown) => !isEmptyImageEntry(v));
    if (hasAny) {
      counts.total += 1;
      counts.last += 1;
    }
  }

  const field = template[IMAGE_ROLE_FIELD];
  if (!field) return counts;

  const values = Array.isArray(field.value)
    ? field.value
    : field.value !== undefined && field.value !== null
      ? [field.value]
      : [];
  const paths = Array.isArray(field.file_path)
    ? field.file_path
    : field.file_path !== undefined && field.file_path !== null
      ? [field.file_path]
      : [];
  const length = Math.max(values.length, paths.length);
  if (!length) return counts;

  const explicitRoles = values.map((value) => extractImageRole(value));
  const allowedRoles = limits?.allowedRoles;
  const supportsFirst = !allowedRoles || allowedRoles.includes("first");
  const supportsReference = !allowedRoles || allowedRoles.includes("reference");
  const supportsLast = Boolean(allowedRoles?.includes("last"));
  const fallbackForIndex = (index: number) => {
    if (supportsReference && supportsFirst) {
      return index === 0 ? "first" : "reference";
    }
    if (supportsReference && !supportsFirst) {
      return "reference";
    }
    if (supportsFirst) {
      return index === 0 ? "first" : supportsLast ? "last" : "first";
    }
    if (supportsLast) {
      return "last";
    }
    return "first";
  };
  const fallbackForExplicit = (index: number) => {
    if (supportsReference) return "reference";
    if (supportsFirst) return index === 0 ? "first" : supportsLast ? "last" : "first";
    if (supportsLast) return "last";
    return "first";
  };
  const entries: Array<{ role?: EdgeImageRole }> = [];
  for (let index = 0; index < length; index += 1) {
    const valueEntry = values[index];
    const pathEntry = paths[index];
    const valueEmpty = isEmptyImageEntry(valueEntry);
    const pathEmpty = isEmptyImageEntry(pathEntry);
    if (valueEmpty && pathEmpty) continue;
    entries.push({ role: explicitRoles[index] });
  }
  const hasExplicitRole = entries.some((entry) => Boolean(entry.role));
  counts.total += entries.length;
  entries.forEach((entry, index) => {
    const role = entry.role
      ? entry.role
      : !hasExplicitRole
        ? fallbackForIndex(index)
        : fallbackForExplicit(index);
    counts[role] += 1;
  });
  return counts;
}

function isEmptyImageEntry(entry: unknown): boolean {
  if (entry === null || entry === undefined) return true;
  if (typeof entry === "string") return entry.trim().length === 0;
  if (typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!keys.length) return true;
    return keys.every((key) => isEmptyImageEntry(record[key]));
  }
  return false;
}

function extractImageRole(value: unknown): EdgeImageRole | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as any;
  const direct = record.role;
  if (typeof direct === "string") {
    const normalized = direct.trim();
    if (normalized === "first" || normalized === "reference" || normalized === "last") {
      return normalized;
    }
  }
  const nested = record.value;
  if (nested && typeof nested === "object") {
    const nestedRole = (nested as any).role;
    if (typeof nestedRole === "string") {
      const normalized = nestedRole.trim();
      if (normalized === "first" || normalized === "reference" || normalized === "last") {
        return normalized;
      }
    }
  }
  return undefined;
}

export function canAddImageRole(
  role: EdgeImageRole,
  counts: ImageRoleCounts,
  limits: ImageRoleLimits,
): boolean {
  if (!limits.allowedRoles.includes(role)) return false;
  if (counts.total + 1 > limits.maxTotal) return false;
  if (role === "first" && counts.first >= 1) return false;
  if (role === "last" && counts.last >= 1) return false;
  if (
    role === "reference" &&
    limits.maxReference != null &&
    counts.reference >= limits.maxReference
  ) {
    return false;
  }
  return true;
}

export function canUpdateImageRole(
  role: EdgeImageRole,
  counts: ImageRoleCounts,
  limits: ImageRoleLimits,
): boolean {
  if (!limits.allowedRoles.includes(role)) return false;
  if (role === "first" && counts.first >= 1) return false;
  if (role === "last" && counts.last >= 1) return false;
  if (
    role === "reference" &&
    limits.maxReference != null &&
    counts.reference >= limits.maxReference
  ) {
    return false;
  }
  return true;
}

export function pickImageRoleForNewEdge(
  limits: ImageRoleLimits,
  counts: ImageRoleCounts,
): EdgeImageRole | null {
  const preferredOrder: EdgeImageRole[] = ["first", "reference", "last"];
  for (const role of preferredOrder) {
    if (canAddImageRole(role, counts, limits)) {
      return role;
    }
  }
  return null;
}

export function checkChatInput(nodes: Node[]) {
  return nodes.some((node) => node.data.type === "ChatInput");
}

export function checkWebhookInput(nodes: Node[]) {
  return nodes.some((node) => node.data.type === "Webhook");
}

export function cleanEdges(nodes: AllNodeType[], edges: EdgeType[]) {
  let newEdges: EdgeType[] = cloneDeep(
    edges.map((edge) => ({ ...edge, selected: false, animated: false })),
  );
  edges.forEach((edge) => {
    const newEdgeIndex = () => newEdges.findIndex((e) => e.id === edge.id);
    // check if the source and target node still exists
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) {
      newEdges = newEdges.filter((edg) => edg.id !== edge.id);
      return;
    }
    // check if the source and target handle still exists
    const sourceHandle = edge.sourceHandle; //right
    const targetHandle = edge.targetHandle; //left
    if (targetHandle) {
      const targetHandleObject: targetHandleType = scapeJSONParse(targetHandle);
      const field = targetHandleObject.fieldName;
      let id: targetHandleType | sourceHandleType;

      const templateFieldType = targetNode.data.node!.template[field]?.type;
      const inputTypes = targetNode.data.node!.template[field]?.input_types;
      const hasProxy = targetNode.data.node!.template[field]?.proxy;
      const isToolMode = targetNode.data.node!.template[field]?.tool_mode;

      if (
        !field &&
        targetHandleObject.name &&
        targetNode.type === "genericNode"
      ) {
        const dataType = targetNode.data.type;
        const outputTypes =
          targetNode.data.node!.outputs?.find(
            (output) => output.name === targetHandleObject.name,
          )?.types ?? [];

        id = {
          dataType: dataType ?? "",
          name: targetHandleObject.name,
          id: targetNode.data.id,
          output_types: outputTypes,
        };
      } else {
        id = {
          type: templateFieldType,
          fieldName: field,
          id: targetNode.data.id,
          inputTypes: inputTypes,
        };
        if (hasProxy) {
          id.proxy = targetNode.data.node!.template[field]?.proxy;
        }
      }
      if (
        scapedJSONStringfy(id) !== targetHandle ||
        (targetNode.data.node?.tool_mode && isToolMode)
      ) {
        // If handle schema changed but the connection is still valid, auto-repair instead of removing.
        if (targetNode.data.node?.tool_mode && isToolMode) {
          newEdges = newEdges.filter((e) => e.id !== edge.id);
          return;
        }

        const rebuiltTargetHandle = scapedJSONStringfy(id);
        const targetCandidateIndex = newEdgeIndex();
        const targetCandidate = targetCandidateIndex >= 0 ? newEdges[targetCandidateIndex] : null;
        const sourceHandleForCheck = targetCandidate?.sourceHandle ?? edge.sourceHandle;
        const connIsValid = sourceHandleForCheck
          ? isValidConnection(
              {
                source: edge.source,
                target: edge.target,
                sourceHandle: sourceHandleForCheck,
                targetHandle: rebuiltTargetHandle,
              },
              nodes,
              newEdges,
            )
          : false;

        if (connIsValid && targetCandidate) {
          const updatedData = {
            sourceHandle: scapeJSONParse(sourceHandleForCheck!) as sourceHandleType,
            targetHandle: scapeJSONParse(rebuiltTargetHandle) as targetHandleType,
          };
          newEdges[targetCandidateIndex] = {
            ...targetCandidate,
            targetHandle: rebuiltTargetHandle,
            data: updatedData,
          };
        } else {
          newEdges = newEdges.filter((e) => e.id !== edge.id);
        }
      }
    }
    if (sourceHandle) {
      const parsedSourceHandle = scapeJSONParse(sourceHandle);
      const name = parsedSourceHandle.name;

      if (sourceNode.type == "genericNode") {
        const output =
          sourceNode.data.node!.outputs?.find(
            (output) => output.name === sourceNode.data.selected_output,
          ) ??
          sourceNode.data.node!.outputs?.find(
            (output) =>
              (output.selected ||
                (sourceNode.data.node!.outputs?.filter(
                  (output) => !output.group_outputs,
                )?.length ?? 0) <= 1) &&
              output.name === name,
          );

        if (output) {
          const outputTypes =
            output!.types.length === 1 ? output!.types : [output!.selected!];

          const id: sourceHandleType = {
            id: sourceNode.data.id,
            name: output?.name ?? name,
            output_types: outputTypes,
            dataType: sourceNode.data.type,
          };

          if (scapedJSONStringfy(id) !== sourceHandle) {
            const rebuiltSourceHandle = scapedJSONStringfy(id);
            const sourceCandidateIndex = newEdgeIndex();
            const sourceCandidate =
              sourceCandidateIndex >= 0 ? newEdges[sourceCandidateIndex] : null;
            const targetHandleForCheck =
              sourceCandidate?.targetHandle ?? edge.targetHandle;

            const connIsValid =
              targetHandleForCheck && rebuiltSourceHandle
                ? isValidConnection(
                    {
                      source: edge.source,
                      target: edge.target,
                      sourceHandle: rebuiltSourceHandle,
                      targetHandle: targetHandleForCheck,
                    },
                    nodes,
                    newEdges,
                  )
                : false;

            if (connIsValid && sourceCandidate) {
              const updatedData = {
                sourceHandle: scapeJSONParse(rebuiltSourceHandle) as sourceHandleType,
                targetHandle: scapeJSONParse(targetHandleForCheck!) as targetHandleType,
              };
              newEdges[sourceCandidateIndex] = {
                ...sourceCandidate,
                sourceHandle: rebuiltSourceHandle,
                data: updatedData,
              };
            } else {
              newEdges = newEdges.filter((e) => e.id !== edge.id);
            }
          }
        } else {
          newEdges = newEdges.filter((e) => e.id !== edge.id);
        }
      }
    }

    const edgeForHiddenCheck =
      newEdges.find((e) => e.id === edge.id) ?? (edge as unknown as EdgeType);
    newEdges = filterHiddenFieldsEdges(edgeForHiddenCheck, newEdges, targetNode);
  });
  return newEdges;
}

export function clearHandlesFromAdvancedFields(
  componentId: string,
  data: APIClassType,
): void {
  if (!componentId || !data?.template) {
    return;
  }

  try {
    const flowStore = useFlowStore.getState();
    const { edges, deleteEdge } = flowStore;

    const connectedEdges = edges.filter((edge) => edge.target === componentId);

    if (connectedEdges.length === 0) {
      return;
    }

    const edgeIdsToDelete: string[] = [];

    for (const edge of connectedEdges) {
      const fieldName = edge.data?.targetHandle?.fieldName;

      if (fieldName && isAdvancedField(data, fieldName)) {
        edgeIdsToDelete.push(edge.id);
      }
    }

    edgeIdsToDelete.forEach(deleteEdge);
  } catch (error) {
    console.error("Error clearing handles from advanced fields:", error);
  }
}

const isAdvancedField = (data: APIClassType, fieldName: string): boolean => {
  const field = data.template[fieldName];
  return field && "advanced" in field && field.advanced === true;
};

export function filterHiddenFieldsEdges(
  edge: EdgeType,
  newEdges: EdgeType[],
  targetNode: AllNodeType,
) {
  if (targetNode) {
    const targetHandle = edge.data?.targetHandle;
    if (!targetHandle) return newEdges;

    const fieldName = targetHandle.fieldName;
    const nodeTemplates = targetNode.data.node!.template;

    // Only check the specific field the edge is connected to
    if (nodeTemplates[fieldName]?.show === false) {
      newEdges = newEdges.filter((e) => e.id !== edge.id);
    }
  }
  return newEdges;
}

export function detectBrokenEdgesEdges(nodes: AllNodeType[], edges: EdgeType[]) {
  function generateAlertObject(sourceNode, targetNode, edge) {
    const targetHandleObject: targetHandleType = scapeJSONParse(
      edge.targetHandle,
    );
    const sourceHandleObject: sourceHandleType = scapeJSONParse(
      edge.sourceHandle,
    );
    const name = sourceHandleObject.name;
    const output = sourceNode.data.node!.outputs?.find(
      (output) => output.name === name,
    );

    return {
      source: {
        nodeDisplayName: sourceNode.data.node!.display_name,
        outputDisplayName: output?.display_name,
      },
      target: {
        displayName: targetNode.data.node!.display_name,
        field:
          targetNode.data.node!.template[targetHandleObject.fieldName]
            ?.display_name ??
          targetHandleObject.fieldName ??
          targetHandleObject.name,
      },
    };
  }
  let newEdges = cloneDeep(edges);
  const BrokenEdges: {
    source: {
      nodeDisplayName: string;
      outputDisplayName?: string;
    };
    target: {
      displayName: string;
      field: string;
    };
  }[] = [];
  edges.forEach((edge) => {
    // check if the source and target node still exists
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) {
      newEdges = newEdges.filter((edg) => edg.id !== edge.id);
      return;
    }
    // check if the source and target handle still exists
    const sourceHandle = edge.sourceHandle; //right
    const targetHandle = edge.targetHandle; //left
    if (targetHandle) {
      const targetHandleObject: targetHandleType = scapeJSONParse(targetHandle);
      const field = targetHandleObject.fieldName;
      let id: sourceHandleType | targetHandleType;

      const templateFieldType = targetNode.data.node!.template[field]?.type;
      const inputTypes = targetNode.data.node!.template[field]?.input_types;
      const hasProxy = targetNode.data.node!.template[field]?.proxy;

      if (
        !field &&
        targetHandleObject.name &&
        targetNode.type === "genericNode"
      ) {
        const dataType = targetNode.data.type;
        const outputTypes =
          targetNode.data.node!.outputs?.find(
            (output) => output.name === targetHandleObject.name,
          )?.types ?? [];

        id = {
          dataType: dataType ?? "",
          name: targetHandleObject.name,
          id: targetNode.data.id,
          output_types: outputTypes,
        };
      } else {
        id = {
          type: templateFieldType,
          fieldName: field,
          id: targetNode.data.id,
          inputTypes: inputTypes,
        };
        if (hasProxy) {
          id.proxy = targetNode.data.node!.template[field]?.proxy;
        }
      }
      const rebuiltHandle = scapedJSONStringfy(id);
      if (rebuiltHandle !== targetHandle) {
        // If handle schema changed but the connection is still valid, auto-repair instead of removing.
        const connIsValid = isValidConnection(
          {
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle!,
            targetHandle: rebuiltHandle,
          },
          nodes,
          newEdges,
        );
        if (connIsValid) {
          const idx = newEdges.findIndex((e) => e.id === edge.id);
          if (idx >= 0) {
            newEdges[idx] = { ...newEdges[idx], targetHandle: rebuiltHandle };
          }
        } else {
          newEdges = newEdges.filter((e) => e.id !== edge.id);
          BrokenEdges.push(generateAlertObject(sourceNode, targetNode, edge));
        }
      }
    }
    if (sourceHandle) {
      const parsedSourceHandle = scapeJSONParse(sourceHandle);
      const name = parsedSourceHandle.name;
      if (sourceNode.type == "genericNode") {
        const output = sourceNode.data.node!.outputs?.find(
          (output) => output.name === name,
        );
        if (output) {
          const outputTypes =
            output!.types.length === 1 ? output!.types : [output!.selected!];

          const id: sourceHandleType = {
            id: sourceNode.data.id,
            name: name,
            output_types: outputTypes,
            dataType: sourceNode.data.type,
          };
          const rebuiltSourceHandle = scapedJSONStringfy(id);
          if (rebuiltSourceHandle !== sourceHandle) {
            const targetHandleForCheck =
              newEdges.find((e) => e.id === edge.id)?.targetHandle ??
              edge.targetHandle;
            const connIsValid = isValidConnection(
              {
                source: edge.source,
                target: edge.target,
                sourceHandle: rebuiltSourceHandle,
                targetHandle: targetHandleForCheck!,
              },
              nodes,
              newEdges,
            );
            if (connIsValid) {
              const idx = newEdges.findIndex((e) => e.id === edge.id);
              if (idx >= 0) {
                newEdges[idx] = {
                  ...newEdges[idx],
                  sourceHandle: rebuiltSourceHandle,
                };
              }
            } else {
              newEdges = newEdges.filter((e) => e.id !== edge.id);
              BrokenEdges.push(generateAlertObject(sourceNode, targetNode, edge));
            }
          }
        } else {
          newEdges = newEdges.filter((e) => e.id !== edge.id);
          BrokenEdges.push(generateAlertObject(sourceNode, targetNode, edge));
        }
      }
    }
  });
  return BrokenEdges;
}

export function unselectAllNodesEdges(nodes: Node[], edges: Edge[]) {
  nodes.forEach((node: Node) => {
    node.selected = false;
  });
  edges.forEach((edge: Edge) => {
    edge.selected = false;
  });
}

export function isValidConnection(
  connection: Connection,
  nodes?: AllNodeType[],
  edges?: EdgeType[],
): boolean {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (source === target) {
    return false;
  }

  const nodesArray = nodes || useFlowStore.getState().nodes;
  const edgesArray = edges || useFlowStore.getState().edges;

  // Some nodes use a single visible "+" input bubble for UX. For type-safety, we may need to
  // reinterpret what that drop means based on the source type.
  let effectiveTargetHandle = targetHandle!;
  let targetHandleObject: targetHandleType = scapeJSONParse(effectiveTargetHandle);
  const sourceHandleObject: sourceHandleType = scapeJSONParse(sourceHandle!);

  // Special-case: audio output dropped onto video generator's image "+" should connect to audio_input.
  // This avoids creating an invalid "首帧/参考" edge for an audio payload.
  const targetNode = nodesArray.find((node) => node.id === target!);
  const sourceNode = nodesArray.find((node) => node.id === source);
  const resolvedSourceType =
    sourceNode?.data?.type ?? (sourceHandleObject?.dataType as string | undefined);
  const targetFieldName = targetHandleObject?.fieldName ?? targetHandleObject?.name;
  if (
    targetNode?.data?.type === IMAGE_ROLE_TARGET &&
    (targetFieldName === IMAGE_ROLE_FIELD || targetFieldName === "last_frame_image") &&
    resolvedSourceType === "DoubaoTTS"
  ) {
    const audioField = targetNode?.data?.node?.template?.["audio_input"];
    if (audioField) {
      const inputTypes =
        audioField.input_types && audioField.input_types.length > 0
          ? audioField.input_types
          : ["Data"];
      const resolvedType = audioField.type ?? "data";
      targetHandleObject = {
        inputTypes,
        type: resolvedType,
        id: target!,
        fieldName: "audio_input",
        ...(audioField.proxy ? { proxy: audioField.proxy } : {}),
      };
      effectiveTargetHandle = scapedJSONStringfy(targetHandleObject);
    }
  }

  // Special-case: TextCreation output dropped onto video generator's image "+" should connect to prompt.
  // This avoids creating an invalid "首帧/参考" edge for a text payload.
  if (
    targetNode?.data?.type === IMAGE_ROLE_TARGET &&
    (targetFieldName === IMAGE_ROLE_FIELD || targetFieldName === "last_frame_image") &&
    resolvedSourceType === "TextCreation"
  ) {
    const promptField = targetNode?.data?.node?.template?.["prompt"];
    if (promptField) {
      const inputTypes =
        promptField.input_types && promptField.input_types.length > 0
          ? promptField.input_types
          : ["Message", "Data", "Text"];
      const resolvedType = promptField.type ?? "data";
      targetHandleObject = {
        inputTypes,
        type: resolvedType,
        id: target!,
        fieldName: "prompt",
        ...(promptField.proxy ? { proxy: promptField.proxy } : {}),
      };
      effectiveTargetHandle = scapedJSONStringfy(targetHandleObject);
    }
  }

  // Helper to find the edge between two nodes
  function findEdgeBetween(srcId: string, tgtId: string) {
    return edgesArray.find((e) => e.source === srcId && e.target === tgtId);
  }

  // Modified hasCycle to return the path of edges forming the loop
  const findCyclePath = (
    node: AllNodeType,
    visited = new Set(),
    path: EdgeType[] = [],
  ): EdgeType[] | null => {
    if (visited.has(node.id)) return null;
    visited.add(node.id);
    for (const outgoer of getOutgoers(node, nodesArray, edgesArray)) {
      const edge = findEdgeBetween(node.id, outgoer.id);
      if (!edge) continue;
      if (outgoer.id === source) {
        // This edge would close the loop
        return [...path, edge];
      }
      const result = findCyclePath(outgoer, visited, [...path, edge]);
      if (result) return result;
    }
    return null;
  };

  if (
    targetHandleObject.inputTypes?.some(
      (n) => n === sourceHandleObject.dataType,
    ) ||
    (targetHandleObject.output_types &&
      (targetHandleObject.output_types?.some(
        (n) => n === sourceHandleObject.dataType,
      ) ||
        sourceHandleObject.output_types.some((t) =>
          targetHandleObject.output_types?.some((n) => n === t),
        ))) ||
    sourceHandleObject.output_types.some(
      (t) =>
        targetHandleObject.inputTypes?.some((n) => n === t) ||
        t === targetHandleObject.type,
    )
  ) {
    const targetNodeDataNode = targetNode?.data?.node;
    if (
      (!targetNodeDataNode &&
        !edgesArray.find((e) => e.targetHandle === effectiveTargetHandle)) ||
      (targetNodeDataNode &&
        targetHandleObject.output_types &&
        !edgesArray.find((e) => e.targetHandle === effectiveTargetHandle)) ||
      (targetNodeDataNode &&
        !targetHandleObject.output_types &&
        ((!targetNodeDataNode.template[targetHandleObject.fieldName].list &&
          !edgesArray.find((e) => e.targetHandle === effectiveTargetHandle)) ||
          targetNodeDataNode.template[targetHandleObject.fieldName].list))
    ) {
      // If the current target handle is a loop component, allow connection immediately
      if (targetHandleObject.output_types) {
        return true;
      }
      // Check for loop and if any edge in the loop is a loop component
      let cyclePath: EdgeType[] | null = null;
      if (targetNode) {
        cyclePath = findCyclePath(targetNode);
      }
      if (cyclePath) {
        // Check if any edge in the cycle path is a loop component
        const hasLoopComponent = cyclePath.some((edge) => {
          try {
            const th = scapeJSONParse(edge.targetHandle!);
            return !!th.output_types;
          } catch {
            return false;
          }
        });
        if (!hasLoopComponent) {
          return false;
        }
      }
      if (
        targetNode?.data?.type === IMAGE_ROLE_TARGET &&
        targetHandleObject?.fieldName === IMAGE_ROLE_FIELD
      ) {
        // Video-to-video "bridge" edges (e.g. Wan r2v reference videos) shouldn't consume
        // the image-role budget for first_frame_image.
        const isVideoBridgeEdge =
          sourceNode?.data?.type === IMAGE_ROLE_TARGET &&
          targetNode?.data?.type === IMAGE_ROLE_TARGET;
        if (isVideoBridgeEdge) {
          return true;
        }
        const modelName = getDoubaoVideoModelName(targetNode);
        const limits = getImageRoleLimits(modelName);
        const counts = getImageRoleCounts(edgesArray, target!, targetNode);
        if (!pickImageRoleForNewEdge(limits, counts)) {
          return false;
        }
      }
      return true;
    }
  }
  return false;
}

export function removeApiKeys(flow: FlowType): FlowType {
  const cleanFLow = cloneDeep(flow);
  cleanFLow.data!.nodes.forEach((node) => {
    if (node.type !== "genericNode") return;
    for (const key in node.data.node!.template) {
      if (node.data.node!.template[key].password) {
        node.data.node!.template[key].value = "";
      }
    }
  });
  return cleanFLow;
}

export function updateTemplate(
  reference: APITemplateType,
  objectToUpdate: APITemplateType,
): APITemplateType {
  const clonedObject: APITemplateType = cloneDeep(reference);

  // Loop through each key in the reference object
  for (const key in clonedObject) {
    // If the key is not in the object to update, add it
    if (objectToUpdate[key] && objectToUpdate[key].value) {
      clonedObject[key].value = objectToUpdate[key].value;
    }
    if (
      objectToUpdate[key] &&
      objectToUpdate[key].advanced !== null &&
      objectToUpdate[key].advanced !== undefined
    ) {
      clonedObject[key].advanced = objectToUpdate[key].advanced;
    }
  }
  return clonedObject;
}

export const processFlows = (DbData: FlowType[], skipUpdate = true) => {
  const savedComponents: { [key: string]: APIClassType } = {};
  DbData.forEach(async (flow: FlowType) => {
    try {
      if (!flow.data) {
        return;
      }
      if (flow.data && flow.is_component) {
        (flow.data.nodes[0].data as NodeDataType).node!.display_name =
          flow.name;
        savedComponents[
          createRandomKey(
            (flow.data.nodes[0].data as NodeDataType).type,
            uid.randomUUID(5),
          )
        ] = cloneDeep((flow.data.nodes[0].data as NodeDataType).node!);
        return;
      }
      await processDataFromFlow(flow, !skipUpdate).catch((e) => {
        console.error(e);
      });
    } catch (e) {
      console.error(e);
    }
  });
  return { data: savedComponents, flows: DbData };
};

export const needsLayout = (nodes: AllNodeType[]) => {
  return nodes.some((node) => !node.position);
};

export async function processDataFromFlow(
  flow: FlowType,
  refreshIds = true,
): Promise<ReactFlowJsonObject<AllNodeType, EdgeType> | null> {
  const data = flow?.data ? flow.data : null;
  if (data) {
    processFlowEdges(flow);
    //add dropdown option to nodeOutputs
    processFlowNodes(flow);
    //add animation to text type edges
    updateEdges(data.edges);
    // updateNodes(data.nodes, data.edges);
    if (refreshIds) updateIds(data); // Assuming updateIds is defined elsewhere
    // add layout to nodes if not present
    if (needsLayout(data.nodes)) {
      const layoutedNodes = await getLayoutedNodes(data.nodes, data.edges);
      data.nodes = layoutedNodes;
    }
  }
  return data;
}

export function updateIds(
  { edges, nodes }: { edges: EdgeType[]; nodes: AllNodeType[] },
  selection?: OnSelectionChangeParams,
) {
  const idsMap = {};
  const selectionIds = selection?.nodes.map((n) => n.id);
  if (nodes) {
    nodes.forEach((node: AllNodeType) => {
      // Generate a unique node ID
      let newId = getNodeId(node.data.type);
      if (selection && !selectionIds?.includes(node.id)) {
        newId = node.id;
      }
      idsMap[node.id] = newId;
      node.id = newId;
      node.data.id = newId;
      // Add the new node to the list of nodes in state
    });
    selection?.nodes.forEach((sNode: Node) => {
      if (sNode.type === "genericNode") {
        const newId = idsMap[sNode.id];
        sNode.id = newId;
        sNode.data.id = newId;
      }
    });
  }
  const concatedEdges = [...edges, ...((selection?.edges as EdgeType[]) ?? [])];
  if (concatedEdges)
    concatedEdges.forEach((edge: EdgeType) => {
      edge.source = idsMap[edge.source];
      edge.target = idsMap[edge.target];

      const sourceHandleObject: sourceHandleType = scapeJSONParse(
        edge.sourceHandle!,
      );
      edge.sourceHandle = scapedJSONStringfy({
        ...sourceHandleObject,
        id: edge.source,
      });
      if (edge.data?.sourceHandle?.id) {
        edge.data.sourceHandle.id = edge.source;
      }
      const targetHandleObject: targetHandleType = scapeJSONParse(
        edge.targetHandle!,
      );
      edge.targetHandle = scapedJSONStringfy({
        ...targetHandleObject,
        id: edge.target,
      });
      if (edge.data?.targetHandle?.id) {
        edge.data.targetHandle.id = edge.target;
      }
      edge.id =
        "reactflow__edge-" +
        edge.source +
        edge.sourceHandle +
        "-" +
        edge.target +
        edge.targetHandle;
    });
  return idsMap;
}

export function validateNode(node: AllNodeType, edges: Edge[]): Array<string> {
  if (!node.data?.node?.template || !Object.keys(node.data.node.template)) {
    return [
      t(
        "We've noticed a potential issue with a component in the flow. Please review it and, if necessary, submit a bug report with your exported flow file. Thank you for your help!",
      ),
    ];
  }

  const {
    type,
    node: { template },
  } = node.data;

  const displayName = node.data.node.display_name;

  return Object.keys(template).reduce((errors: Array<string>, t) => {
    const field = template[t];
    // `code` is a system-managed field. If its value is redacted/missing in a payload,
    // we should not block the whole flow at pre-validation time.
    const isSystemCodeField = t === "code" && field?.type === "code";
    if (isSystemCodeField) return errors;
    if (
      node.type === "genericNode" &&
      field.required &&
      !(field.tool_mode && node?.data?.node?.tool_mode) &&
      field.show &&
      (field.value === undefined ||
        field.value === null ||
        field.value === "") &&
      !edges.some(
        (edge) =>
          (scapeJSONParse(edge.targetHandle!) as targetHandleType).fieldName ===
            t &&
          (scapeJSONParse(edge.targetHandle!) as targetHandleType).id ===
            node.id,
      )
    ) {
      errors.push(
        `${displayName || type} 缺少 ${getFieldTitle(template, t)}。`,
      );
    } else if (
      field.type === "dict" &&
      field.required &&
      field.show &&
      (field.value !== undefined ||
        field.value !== null ||
        field.value !== "")
    ) {
      if (hasDuplicateKeys(field.value))
        errors.push(
          `${displayName || type}（${getFieldTitle(
            template,
            t,
          )}）包含重复的键。`,
        );
      if (hasEmptyKey(field.value))
        errors.push(
          `${displayName || type}（${getFieldTitle(template, t)}）字段不能为空。`,
        );
    }
    return errors;
  }, [] as string[]);
}

export function validateNodes(
  nodes: AllNodeType[],
  edges: EdgeType[],
): // this returns an array of tuples with the node id and the errors
Array<{ id: string; errors: Array<string> }> {
  if (nodes.length === 0) {
    return [
      {
        id: "",
        errors: [
          t(
            "No components found in the flow. Please add at least one component to the flow.",
          ),
        ],
      },
    ];
  }
  // validateNode(n, edges) returns an array of errors for the node
  const nodeMap = nodes.map((n) => ({
    id: n.id,
    errors: validateNode(n, edges),
  }));

  return nodeMap.filter((n) => n.errors?.length);
}

export function validateEdge(
  e: EdgeType,
  nodes: AllNodeType[],
  edges: EdgeType[],
): Array<string> {
  const targetHandleObject: targetHandleType = scapeJSONParse(e.targetHandle!);

  const loop = hasLoop(e, nodes, edges);
  if (targetHandleObject.output_types && !loop) {
    return [INCOMPLETE_LOOP_ERROR_ALERT];
  }
  return [];
}

function hasLoop(
  e: EdgeType,
  nodes: AllNodeType[],
  edges: EdgeType[],
): boolean {
  const source = e.source;
  const target = e.target;

  // Check if this connection would create a cycle
  const targetNode = nodes.find((n) => n.id === target);

  const hasCycle = (
    node,
    visited = new Set(),
    firstEdge: EdgeType | null = null,
  ): boolean => {
    if (visited.has(node.id)) return false;

    visited.add(node.id);

    for (const outgoer of getOutgoers(node, nodes, edges)) {
      const edge = edges.find(
        (e) => e.source === node.id && e.target === outgoer.id,
      );
      if (outgoer.id === source) {
        const sourceHandleObject = scapeJSONParse(
          firstEdge?.sourceHandle ?? edge?.sourceHandle ?? "",
        );
        const sourceHandleParsed = scapedJSONStringfy(sourceHandleObject);
        if (sourceHandleParsed === e.targetHandle) {
          return true;
        }
      }
      if (hasCycle(outgoer, visited, firstEdge || edge)) return true;
    }
    return false;
  };

  if (targetNode?.id === source) return false;
  return hasCycle(targetNode);
}

export function updateEdges(edges: EdgeType[]) {
  if (edges)
    edges.forEach((edge) => {
      const _targetHandleObject: targetHandleType = scapeJSONParse(
        edge.targetHandle!,
      );
      edge.className = "";
    });
}

export function addVersionToDuplicates(flow: FlowType, flows: FlowType[]) {
  const flowsWithoutUpdatedFlow = flows.filter((f) => f.id !== flow.id);

  const existingNames = flowsWithoutUpdatedFlow.map((item) => item.name);
  let newName = flow.name;
  let count = 1;

  while (existingNames.includes(newName)) {
    newName = `${flow.name} (${count})`;
    count++;
  }

  return newName;
}

export function addEscapedHandleIdsToEdges({
  edges,
}: addEscapedHandleIdsToEdgesType): EdgeType[] {
  const newEdges = cloneDeep(edges);
  newEdges.forEach((edge) => {
    let escapedSourceHandle = edge.sourceHandle;
    let escapedTargetHandle = edge.targetHandle;
    if (!escapedSourceHandle) {
      const sourceHandle = edge.data?.sourceHandle;
      if (sourceHandle) {
        escapedSourceHandle = getRightHandleId(sourceHandle);
        edge.sourceHandle = escapedSourceHandle;
      }
    }
    if (!escapedTargetHandle) {
      const targetHandle = edge.data?.targetHandle;
      if (targetHandle) {
        escapedTargetHandle = getLeftHandleId(targetHandle);
        edge.targetHandle = escapedTargetHandle;
      }
    }
  });
  return newEdges;
}
export function updateEdgesHandleIds({
  edges,
  nodes,
}: updateEdgesHandleIdsType): EdgeType[] {
  const newEdges = cloneDeep(edges);
  newEdges.forEach((edge) => {
    const previousData = edge.data ?? {};
    const sourceNodeId = edge.source;
    const targetNodeId = edge.target;
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const source = edge.sourceHandle;
    const target = edge.targetHandle;
    //right
    let newSource: sourceHandleType;
    //left
    let newTarget: targetHandleType;
    if (target && targetNode) {
      const field = target.split("|")[1];
      newTarget = {
        type: targetNode.data.node!.template[field].type,
        fieldName: field,
        id: targetNode.data.id,
        inputTypes: targetNode.data.node!.template[field].input_types,
      };
    }
    if (source && sourceNode && sourceNode.type === "genericNode") {
      const output_types =
        sourceNode.data.node!.output_types ??
        sourceNode.data.node!.base_classes!;
      newSource = {
        id: sourceNode.data.id,
        output_types,
        dataType: sourceNode.data.type,
        name: output_types.join(" | "),
      };
    }
    edge.sourceHandle = scapedJSONStringfy(newSource!);
    edge.targetHandle = scapedJSONStringfy(newTarget!);
    const newData = {
      sourceHandle: scapeJSONParse(edge.sourceHandle),
      targetHandle: scapeJSONParse(edge.targetHandle),
    };
    edge.data = {
      // Preserve any custom metadata (e.g. videoReferType) across migrations.
      ...previousData,
      ...newData,
      imageRole: (previousData as any)?.imageRole,
    };
  });
  return newEdges;
}

export function updateNewOutput({ nodes, edges }: updateEdgesHandleIdsType) {
  const newEdges = cloneDeep(edges);
  const newNodes = cloneDeep(nodes);
  newEdges.forEach((edge) => {
    if (edge.sourceHandle && edge.targetHandle) {
      const newSourceHandle: sourceHandleType = scapeJSONParse(
        edge.sourceHandle,
      );
      const newTargetHandle: targetHandleType = scapeJSONParse(
        edge.targetHandle,
      );
      const id = newSourceHandle.id;
      const sourceNodeIndex = newNodes.findIndex((node) => node.id === id);
      let sourceNode: AllNodeType | undefined;
      if (sourceNodeIndex !== -1) {
        sourceNode = newNodes[sourceNodeIndex];
      }
      if (sourceNode?.type === "genericNode") {
        let intersection;
        if (newSourceHandle.baseClasses) {
          if (!newSourceHandle.output_types) {
            if (sourceNode?.data.node!.output_types) {
              newSourceHandle.output_types =
                sourceNode?.data.node!.output_types;
            } else {
              newSourceHandle.output_types = newSourceHandle.baseClasses;
            }
          }
          delete newSourceHandle.baseClasses;
        }
        if (
          newTargetHandle.inputTypes &&
          newTargetHandle.inputTypes.length > 0
        ) {
          intersection = newSourceHandle.output_types.filter((type) =>
            newTargetHandle.inputTypes!.includes(type),
          );
        } else {
          intersection = newSourceHandle.output_types.filter(
            (type) => type === newTargetHandle.type,
          );
        }
        const selected = intersection[0];
        newSourceHandle.name = newSourceHandle.output_types.join(" | ");
        newSourceHandle.output_types = [selected];
        if (sourceNode) {
          if (!sourceNode.data.node?.outputs) {
            sourceNode.data.node!.outputs = [];
          }
          const types =
            sourceNode.data.node!.output_types ??
            sourceNode.data.node!.base_classes!;
          if (
            !sourceNode.data.node!.outputs.some(
              (output) => output.selected === selected,
            )
          ) {
            sourceNode.data.node!.outputs.push({
              types,
              selected: selected,
              name: types.join(" | "),
              display_name: types.join(" | "),
            });
          }
        }

        edge.sourceHandle = scapedJSONStringfy(newSourceHandle);
        if (edge.data) {
          edge.data.sourceHandle = newSourceHandle;
        }
      }
    }
  });
  return { nodes: newNodes, edges: newEdges };
}

export function handleKeyDown(
  e:
    | React.KeyboardEvent<HTMLInputElement>
    | React.KeyboardEvent<HTMLTextAreaElement>,
  inputValue: string | number | string[] | null | undefined,
  block: string,
) {
  //condition to fix bug control+backspace on Windows/Linux
  if (
    (typeof inputValue === "string" &&
      (e.metaKey === true || e.ctrlKey === true) &&
      e.key === "Backspace" &&
      (inputValue === block ||
        inputValue?.charAt(inputValue?.length - 1) === " " ||
        specialCharsRegex.test(inputValue?.charAt(inputValue?.length - 1)))) ||
    (IS_MAC && e.ctrlKey === true && e.key === "Backspace")
  ) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (e.ctrlKey === true && e.key === "Backspace" && inputValue === block) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function handleOnlyIntegerInput(
  event: React.KeyboardEvent<HTMLInputElement>,
) {
  if (
    event.key === "." ||
    event.key === "-" ||
    event.key === "," ||
    event.key === "e" ||
    event.key === "E" ||
    event.key === "+"
  ) {
    event.preventDefault();
  }
}

export function getConnectedNodes(
  edge: Edge,
  nodes: Array<AllNodeType>,
): Array<AllNodeType> {
  const sourceId = edge.source;
  const targetId = edge.target;
  return nodes.filter((node) => node.id === targetId || node.id === sourceId);
}

export function convertObjToArray(singleObject: object | string, type: string) {
  if (type !== "dict") return [{ "": "" }];
  if (typeof singleObject === "string") {
    singleObject = JSON.parse(singleObject);
  }
  if (Array.isArray(singleObject)) return singleObject;

  const arrConverted: any[] = [];
  if (typeof singleObject === "object") {
    for (const key in singleObject) {
      if (Object.hasOwn(singleObject, key)) {
        const newObj = {};
        newObj[key] = singleObject[key];
        arrConverted.push(newObj);
      }
    }
  }
  return arrConverted;
}

export function convertArrayToObj(arrayOfObjects) {
  if (!Array.isArray(arrayOfObjects)) return arrayOfObjects;

  const objConverted = {};
  for (const obj of arrayOfObjects) {
    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        objConverted[key] = obj[key];
      }
    }
  }
  return objConverted;
}

export function hasDuplicateKeys(array) {
  const keys = {};
  // Transforms an empty object into an object array without opening the 'editNode' modal to prevent the flow build from breaking.
  if (!Array.isArray(array)) array = [{ "": "" }];
  for (const obj of array) {
    for (const key in obj) {
      if (keys[key]) {
        return true;
      }
      keys[key] = true;
    }
  }
  return false;
}

export function hasEmptyKey(objArray) {
  // Transforms an empty object into an array without opening the 'editNode' modal to prevent the flow build from breaking.
  if (!Array.isArray(objArray)) objArray = [];
  for (const obj of objArray) {
    for (const key in obj) {
      if (Object.hasOwn(obj, key) && key === "") {
        return true; // Found an empty key
      }
    }
  }
  return false; // No empty keys found
}

export function convertValuesToNumbers(arr) {
  return arr.map((obj) => {
    const newObj = {};
    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        let value = obj[key];
        if (/^\d+$/.test(value)) {
          value = value?.toString().trim();
        }
        newObj[key] =
          value === "" || isNaN(value) ? value.toString() : Number(value);
      }
    }
    return newObj;
  });
}

export function scapedJSONStringfy(json: object): string {
  return customStringify(json).replace(/"/g, "œ");
}
export function scapeJSONParse(json: string): any {
  const parsed = json.replace(/œ/g, '"');
  return JSON.parse(parsed);
}

// this function receives an array of edges and return true if any of the handles are not a json string
export function checkOldEdgesHandles(edges: Edge[]): boolean {
  return edges.some(
    (edge) =>
      !edge.sourceHandle ||
      !edge.targetHandle ||
      !edge.sourceHandle.includes("{") ||
      !edge.targetHandle.includes("{"),
  );
}

export function checkEdgeWithoutEscapedHandleIds(edges: Edge[]): boolean {
  return edges.some(
    (edge) =>
      (!edge.sourceHandle || !edge.targetHandle) && edge.data?.sourceHandle,
  );
}

export function checkOldNodesOutput(nodes: AllNodeType[]): boolean {
  return nodes.some(
    (node) =>
      node.type === "genericNode" && node.data.node?.outputs === undefined,
  );
}

export function customStringify(obj: any): string {
  if (typeof obj === "undefined") {
    return "null";
  }

  if (obj === null || typeof obj !== "object") {
    if (obj instanceof Date) {
      return `"${obj.toISOString()}"`;
    }
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const arrayItems = obj.map((item) => customStringify(item)).join(",");
    return `[${arrayItems}]`;
  }

  const keys = Object.keys(obj).sort();
  const keyValuePairs = keys.map(
    (key) => `"${key}":${customStringify(obj[key])}`,
  );
  return `{${keyValuePairs.join(",")}}`;
}

export function getMiddlePoint(nodes: Node[]) {
  let middlePointX = 0;
  let middlePointY = 0;

  nodes.forEach((node) => {
    middlePointX += node.position.x;
    middlePointY += node.position.y;
  });

  const totalNodes = nodes.length;
  const averageX = middlePointX / totalNodes;
  const averageY = middlePointY / totalNodes;

  return { x: averageX, y: averageY };
}

export function getNodeId(nodeType: string) {
  return nodeType + "-" + uid.randomUUID(5);
}

export function getHandleId(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
) {
  return (
    "reactflow__edge-" + source + sourceHandle + "-" + target + targetHandle
  );
}

export function generateFlow(
  selection: OnSelectionChangeParams,
  nodes: AllNodeType[],
  edges: EdgeType[],
  name: string,
): generateFlowType {
  const newFlowData = { nodes, edges, viewport: { zoom: 1, x: 0, y: 0 } };
  /*	remove edges that are not connected to selected nodes on both ends
   */
  newFlowData.edges = edges.filter(
    (edge) =>
      selection.nodes.some((node) => node.id === edge.target) &&
      selection.nodes.some((node) => node.id === edge.source),
  );
  newFlowData.nodes = selection.nodes as AllNodeType[];

  const newFlow: FlowType = {
    data: newFlowData,
    is_component: false,
    name: name,
    description: "",
    //generating local id instead of using the id from the server, can change in the future
    id: uid.randomUUID(5),
  };
  // filter edges that are not connected to selected nodes on both ends
  // using O(n²) aproach because the number of edges is small
  // in the future we can use a better aproach using a set
  return {
    newFlow,
    removedEdges: edges.filter(
      (edge) =>
        (selection.nodes.some((node) => node.id === edge.target) ||
          selection.nodes.some((node) => node.id === edge.source)) &&
        newFlowData.edges.every((e) => e.id !== edge.id),
    ),
  };
}

export function reconnectEdges(
  groupNode: AllNodeType,
  excludedEdges: EdgeType[],
) {
  if (groupNode.type !== "genericNode" || !groupNode.data.node!.flow) return [];
  let newEdges = cloneDeep(excludedEdges);
  const { nodes } = groupNode.data.node!.flow!.data!;
  const lastNode = findLastNode(groupNode.data.node!.flow!.data!);
  newEdges = newEdges.filter(
    (e) => !(nodes.some((n) => n.id === e.source) && e.source !== lastNode?.id),
  );
  newEdges.forEach((edge) => {
    const newSourceHandle: sourceHandleType = scapeJSONParse(
      edge.sourceHandle!,
    );
    const newTargetHandle: targetHandleType = scapeJSONParse(
      edge.targetHandle!,
    );
    if (lastNode && edge.source === lastNode.id) {
      edge.source = groupNode.id;
      newSourceHandle.id = groupNode.id;
      edge.sourceHandle = scapedJSONStringfy(newSourceHandle);
    }
    if (nodes.some((node) => node.id === edge.target)) {
      const targetNode = nodes.find((node) => node.id === edge.target)!;
      const proxy = { id: targetNode.id, field: newTargetHandle.fieldName };
      newTargetHandle.id = groupNode.id;
      newTargetHandle.proxy = proxy;
      edge.target = groupNode.id;
      newTargetHandle.fieldName =
        newTargetHandle.fieldName + "_" + targetNode.id;
      edge.targetHandle = scapedJSONStringfy(newTargetHandle);
    }
    if (newSourceHandle && newTargetHandle) {
      edge.data = {
        sourceHandle: newSourceHandle,
        targetHandle: newTargetHandle,
        imageRole: edge.data?.imageRole,
      };
    }
  });
  return newEdges;
}

export function filterFlow(
  selection: OnSelectionChangeParams,
  setNodes: (update: Node[] | ((oldState: Node[]) => Node[])) => void,
  setEdges: (update: Edge[] | ((oldState: Edge[]) => Edge[])) => void,
) {
  setNodes((nodes) => nodes.filter((node) => !selection.nodes.includes(node)));
  setEdges((edges) => edges.filter((edge) => !selection.edges.includes(edge)));
}

export function findLastNode({ nodes, edges }: findLastNodeType) {
  /*
		this function receives a flow and return the last node
	*/
  const lastNode = nodes.find((n) => !edges.some((e) => e.source === n.id));
  return lastNode;
}

export function updateFlowPosition(NewPosition: XYPosition, flow: FlowType) {
  const middlePoint = getMiddlePoint(flow.data!.nodes);
  const deltaPosition = {
    x: NewPosition.x - middlePoint.x,
    y: NewPosition.y - middlePoint.y,
  };
  return {
    ...flow,
    data: {
      ...flow.data!,
      nodes: flow.data!.nodes.map((node) => ({
        ...node,
        position: {
          x: node.position.x + deltaPosition.x,
          y: node.position.y + deltaPosition.y,
        },
      })),
    },
  };
}

export function concatFlows(
  flow: FlowType,
  setNodes: (update: Node[] | ((oldState: Node[]) => Node[])) => void,
  setEdges: (update: Edge[] | ((oldState: Edge[]) => Edge[])) => void,
) {
  const { nodes, edges } = flow.data!;
  setNodes((old) => [...old, ...nodes]);
  setEdges((old) => [...old, ...edges]);
}

export function validateSelection(
  selection: OnSelectionChangeParams,
  edges: Edge[],
): Array<string> {
  const clonedSelection = cloneDeep(selection);
  const clonedEdges = cloneDeep(edges);
  //add edges to selection if selection mode selected only nodes
  if (clonedSelection.edges.length === 0) {
    clonedSelection.edges = clonedEdges;
  }

  // get only edges that are connected to the nodes in the selection
  // first creates a set of all the nodes ids
  const nodesSet = new Set(clonedSelection.nodes.map((n) => n.id));
  // then filter the edges that are connected to the nodes in the set
  const connectedEdges = clonedSelection.edges.filter(
    (e) => nodesSet.has(e.source) && nodesSet.has(e.target),
  );
  // add the edges to the selection
  clonedSelection.edges = connectedEdges;

  const errorsArray: Array<string> = [];

  // Note: we intentionally don't block grouping for any specific component types here.
  // Group nodes are primarily an organizational tool and users may still want to group
  // wide/special-layout nodes even if the grouped UI isn't perfect.
  // check if there is more than one node
  if (clonedSelection.nodes.length < 2) {
    errorsArray.push(t("Please select more than one component"));
  }
  if (
    clonedSelection.nodes.some(
      (node) =>
        isInputNode(node.data as NodeDataType) ||
        isOutputNode(node.data as NodeDataType),
    )
  ) {
    errorsArray.push(t("Select non-input/output components only"));
  }
  //check if there are two or more nodes with free outputs
  if (
    clonedSelection.nodes.filter(
      (n) => !clonedSelection.edges.some((e) => e.source === n.id),
    ).length > 1
  ) {
    errorsArray.push("Select only one component with free outputs");
  }

  // check if there is any node that does not have any connection
  if (
    clonedSelection.nodes.some(
      (node) =>
        !clonedSelection.edges.some((edge) => edge.target === node.id) &&
        !clonedSelection.edges.some((edge) => edge.source === node.id),
    )
  ) {
    errorsArray.push("Select only connected components");
  }
  return errorsArray;
}
function updateGroupNodeTemplate(template: APITemplateType) {
  /*this function receives a template, iterates for it's items
	updating the visibility of all basic types setting it to advanced true*/
  Object.keys(template).forEach((key) => {
    const type = template[key].type;
    const input_types = template[key].input_types;
    if (
      LANGFLOW_SUPPORTED_TYPES.has(type) &&
      !template[key].required &&
      !input_types
    ) {
      template[key].advanced = true;
    }
    //prevent code fields from showing on the group node
    if (type === "code" && key === "code") {
      template[key].show = false;
    }
  });
  return template;
}
export function mergeNodeTemplates({
  nodes,
  edges,
}: {
  nodes: AllNodeType[];
  edges: Edge[];
}): APITemplateType {
  /* this function receives a flow and iterate throw each node
		and merge the templates with only the visible fields
		if there are two keys with the same name in the flow, we will update the display name of each one
		to show from which node it came from
	*/
  const template: APITemplateType = {};
  nodes.forEach((node) => {
    const nodeTemplate = cloneDeep(node.data.node!.template);
    Object.keys(nodeTemplate)
      .filter((field_name) => field_name.charAt(0) !== "_")
      .forEach((key) => {
        if (
          node.type === "genericNode" &&
          !isTargetHandleConnected(edges, key, nodeTemplate[key], node.id)
        ) {
          template[key + "_" + node.id] = nodeTemplate[key];
          template[key + "_" + node.id].proxy = { id: node.id, field: key };
          if (node.data.type === "GroupNode") {
            template[key + "_" + node.id].display_name =
              node.data.node!.flow!.name + " - " + nodeTemplate[key].name;
          } else {
            template[key + "_" + node.id].display_name =
              //data id already has the node name on it
              nodeTemplate[key].display_name
                ? nodeTemplate[key].display_name
                : nodeTemplate[key].name
                  ? toTitleCase(nodeTemplate[key].name)
                  : toTitleCase(key);
          }
        }
      });
  });
  return template;
}
export function isTargetHandleConnected(
  edges: Edge[],
  key: string,
  field: InputFieldType,
  nodeId: string,
) {
  /*
		this function receives a flow and a handleId and check if there is a connection with this handle
	*/
  if (!field) return true;
  if (field.proxy) {
    if (
      edges.some(
        (e) =>
          e.targetHandle ===
          scapedJSONStringfy({
            type: field.type,
            fieldName: key,
            id: nodeId,
            proxy: { id: field.proxy!.id, field: field.proxy!.field },
            inputTypes: field.input_types,
          } as targetHandleType),
      )
    ) {
      return true;
    }
  } else {
    if (
      edges.some(
        (e) =>
          e.targetHandle ===
          scapedJSONStringfy({
            type: field.type,
            fieldName: key,
            id: nodeId,
            inputTypes: field.input_types,
          } as targetHandleType),
      )
    ) {
      return true;
    }
  }
  return false;
}

export function generateNodeTemplate(Flow: FlowType) {
  /*
		this function receives a flow and generate a template for the group node
	*/
  const template = mergeNodeTemplates({
    nodes: Flow.data!.nodes,
    edges: Flow.data!.edges,
  });
  updateGroupNodeTemplate(template);
  return template;
}

export function generateNodeFromFlow(
  flow: FlowType,
  getNodeId: (type: string) => string,
): AllNodeType {
  const { nodes } = flow.data!;
  const _outputNode = cloneDeep(findLastNode(flow.data!));
  const position = getMiddlePoint(nodes);
  const data = cloneDeep(flow);
  const id = getNodeId("groupComponent");
  const newGroupNode: AllNodeType = {
    data: {
      id,
      type: "GroupNode",
      node: {
        display_name: "Group",
        documentation: "",
        description: "",
        template: generateNodeTemplate(data),
        flow: data,
        outputs: generateNodeOutputs(data),
      },
    },
    id,
    position,
    type: "genericNode",
  };
  return newGroupNode;
}

function generateNodeOutputs(flow: FlowType) {
  const { nodes, edges } = flow.data!;
  const outputs: Array<OutputFieldType> = [];
  nodes.forEach((node: AllNodeType) => {
    if (node.type === "genericNode" && node.data.node?.outputs) {
      const nodeOutputs = node.data.node.outputs;
      nodeOutputs.forEach((output) => {
        //filter outputs that are not connected
        if (
          !edges.some(
            (edge) =>
              edge.source === node.id &&
              (edge.data?.sourceHandle as sourceHandleType).name ===
                output.name,
          )
        ) {
          outputs.push(
            cloneDeep({
              ...output,
              proxy: {
                id: node.id,
                name: output.name,
                nodeDisplayName:
                  node.data.node!.display_name ?? node.data.node!.name,
              },
              name: node.id + "_" + output.name,
              display_name: output.display_name,
            }),
          );
        }
      });
    }
  });
  return outputs;
}

export function updateProxyIdsOnTemplate(
  template: APITemplateType,
  idsMap: { [key: string]: string },
) {
  Object.keys(template).forEach((key) => {
    if (template[key].proxy && idsMap[template[key].proxy!.id]) {
      template[key].proxy!.id = idsMap[template[key].proxy!.id];
    }
  });
}

export function updateProxyIdsOnOutputs(
  outputs: OutputFieldType[] | undefined,
  idsMap: { [key: string]: string },
) {
  if (!outputs) return;
  outputs.forEach((output) => {
    if (output.proxy && idsMap[output.proxy.id]) {
      output.proxy.id = idsMap[output.proxy.id];
    }
  });
}

export function updateEdgesIds(
  edges: EdgeType[],
  idsMap: { [key: string]: string },
) {
  edges.forEach((edge) => {
    const targetHandle: targetHandleType = edge.data!.targetHandle;
    if (targetHandle.proxy && idsMap[targetHandle.proxy!.id]) {
      targetHandle.proxy!.id = idsMap[targetHandle.proxy!.id];
    }
    edge.data!.targetHandle = targetHandle;
    edge.targetHandle = scapedJSONStringfy(targetHandle);
  });
}

export function processFlowEdges(flow: FlowType) {
  if (!flow.data || !flow.data.edges) return;
  if (checkEdgeWithoutEscapedHandleIds(flow.data.edges)) {
    const newEdges = addEscapedHandleIdsToEdges({ edges: flow.data.edges });
    flow.data.edges = newEdges;
  } else if (checkOldEdgesHandles(flow.data.edges)) {
    const newEdges = updateEdgesHandleIds(flow.data);
    flow.data.edges = newEdges;
  }
}

export function processFlowNodes(flow: FlowType) {
  if (!flow.data || !flow.data.nodes) return;
  if (checkOldNodesOutput(flow.data.nodes)) {
    const { nodes, edges } = updateNewOutput(flow.data);
    flow.data.nodes = nodes;
    flow.data.edges = edges;
  }
}

export function expandGroupNode(
  id: string,
  flow: FlowType,
  template: APITemplateType,
  setNodes: (
    update: AllNodeType[] | ((oldState: AllNodeType[]) => AllNodeType[]),
  ) => void,
  setEdges: (
    update: EdgeType[] | ((oldState: EdgeType[]) => EdgeType[]),
  ) => void,
  outputs?: OutputFieldType[],
) {
  const idsMap = updateIds(flow!.data!);
  updateProxyIdsOnTemplate(template, idsMap);
  const flowEdges = useFlowStore.getState().edges;
  updateEdgesIds(flowEdges, idsMap);
  const gNodes: AllNodeType[] = cloneDeep(flow?.data?.nodes!);
  const gEdges = cloneDeep(flow!.data!.edges);
  // //redirect edges to correct proxy node
  // let updatedEdges: Edge[] = [];
  // flowEdges.forEach((edge) => {
  //   let newEdge = cloneDeep(edge);
  //   if (newEdge.target === id) {
  //     const targetHandle: targetHandleType = newEdge.data.targetHandle;
  //     if (targetHandle.proxy) {
  //       let type = targetHandle.type;
  //       let field = targetHandle.proxy.field;
  //       let proxyId = targetHandle.proxy.id;
  //       let inputTypes = targetHandle.inputTypes;
  //       let node: NodeType = gNodes.find((n) => n.id === proxyId)!;
  //       if (node) {
  //         newEdge.target = proxyId;
  //         let newTargetHandle: targetHandleType = {
  //           fieldName: field,
  //           type,
  //           id: proxyId,
  //           inputTypes: inputTypes,
  //         };
  //         if (node.data.node?.flow) {
  //           newTargetHandle.proxy = {
  //             field: node.data.node.template[field].proxy?.field!,
  //             id: node.data.node.template[field].proxy?.id!,
  //           };
  //         }
  //         newEdge.data.targetHandle = newTargetHandle;
  //         newEdge.targetHandle = scapedJSONStringfy(newTargetHandle);
  //       }
  //     }
  //   }
  //   if (newEdge.source === id) {
  //     const lastNode = cloneDeep(findLastNode(flow!.data!));
  //     newEdge.source = lastNode!.id;
  //     let newSourceHandle: sourceHandleType = scapeJSONParse(
  //       newEdge.sourceHandle!,
  //     );
  //     newSourceHandle.id = lastNode!.id;
  //     newEdge.data.sourceHandle = newSourceHandle;
  //     newEdge.sourceHandle = scapedJSONStringfy(newSourceHandle);
  //   }
  //   if (edge.target === id || edge.source === id) {
  //     updatedEdges.push(newEdge);
  //   }
  // });
  //update template values
  Object.keys(template).forEach((key) => {
    if (template[key].proxy) {
      const { field, id } = template[key].proxy!;
      const nodeIndex = gNodes.findIndex((n) => n.id === id);
      if (nodeIndex !== -1) {
        let proxy: { id: string; field: string } | undefined;
        let display_name: string | undefined;
        const show = gNodes[nodeIndex].data.node!.template[field].show;
        const advanced = gNodes[nodeIndex].data.node!.template[field].advanced;
        if (gNodes[nodeIndex].data.node!.template[field].display_name) {
          display_name =
            gNodes[nodeIndex].data.node!.template[field].display_name;
        } else {
          display_name = gNodes[nodeIndex].data.node!.template[field].name;
        }
        if (gNodes[nodeIndex].data.node!.template[field].proxy) {
          proxy = gNodes[nodeIndex].data.node!.template[field].proxy;
        }
        gNodes[nodeIndex].data.node!.template[field] = template[key];
        gNodes[nodeIndex].data.node!.template[field].show = show;
        gNodes[nodeIndex].data.node!.template[field].advanced = advanced;
        gNodes[nodeIndex].data.node!.template[field].display_name =
          display_name;
        // keep the nodes selected after ungrouping
        // gNodes[nodeIndex].selected = false;
        if (proxy) {
          gNodes[nodeIndex].data.node!.template[field].proxy = proxy;
        } else {
          delete gNodes[nodeIndex].data.node!.template[field].proxy;
        }
      }
    }
  });
  outputs?.forEach((output) => {
    const nodeIndex = gNodes.findIndex((n) => n.id === output.proxy!.id);
    if (nodeIndex !== -1) {
      const node = gNodes[nodeIndex];
      if (node.type === "genericNode") {
        if (node.data.node?.outputs) {
          const nodeOutputIndex = node.data.node!.outputs!.findIndex(
            (o) => o.name === output.proxy?.name,
          );
          if (nodeOutputIndex !== -1 && output.selected) {
            node.data.node!.outputs![nodeOutputIndex].selected =
              output.selected;
          }
        }
      }
    }
  });
  const filteredNodes = [
    ...useFlowStore.getState().nodes.filter((n) => n.id !== id),
    ...gNodes,
  ];
  const filteredEdges = [
    ...flowEdges.filter((e) => e.target !== id && e.source !== id),
    ...gEdges,
  ];
  setNodes(filteredNodes);
  setEdges(filteredEdges);
}

export function getGroupStatus(
  flow: FlowType,
  ssData: { [key: string]: { valid: boolean; params: string } },
) {
  let status = { valid: true, params: SUCCESS_BUILD };
  const { nodes } = flow.data!;
  const ids = nodes.map((n: AllNodeType) => n.data.id);
  ids.forEach((id) => {
    if (!ssData[id]) {
      status = ssData[id];
      return;
    }
    if (!ssData[id].valid) {
      status = { valid: false, params: ssData[id].params };
    }
  });
  return status;
}

export function createFlowComponent(
  nodeData: NodeDataType,
  version: string,
): FlowType {
  const flowNode: FlowType = {
    data: {
      edges: [],
      nodes: [
        {
          data: { ...nodeData, node: { ...nodeData.node, official: false } },
          id: nodeData.id,
          position: { x: 0, y: 0 },
          type: "genericNode",
        },
      ],
      viewport: { x: 1, y: 1, zoom: 1 },
    },
    description: nodeData.node?.description || "",
    name: nodeData.node?.display_name || nodeData.type || "",
    id: nodeData.id || "",
    is_component: true,
    last_tested_version: version,
  };
  return flowNode;
}

export function downloadNode(NodeFLow: FlowType) {
  const element = document.createElement("a");
  const file = new Blob([JSON.stringify(NodeFLow)], {
    type: "application/json",
  });
  element.href = URL.createObjectURL(file);
  element.download = `${NodeFLow?.name ?? "node"}.json`;
  element.click();
}

export function updateComponentNameAndType(
  data: any,
  component: NodeDataType,
) {}

export function removeFileNameFromComponents(flow: FlowType) {
  flow.data!.nodes.forEach((node: AllNodeType) => {
    if (node.type === "genericNode") {
      Object.keys(node.data.node!.template).forEach((field) => {
        if (node.data.node?.template[field].type === "file") {
          node.data.node!.template[field].value = "";
        }
      });
      if (node.data.node?.flow) {
        removeFileNameFromComponents(node.data.node.flow);
      }
    }
  });
}

export function removeGlobalVariableFromComponents(flow: FlowType) {
  flow.data!.nodes.forEach((node: AllNodeType) => {
    if (node.type === "genericNode") {
      Object.keys(node.data.node!.template).forEach((field) => {
        if (node.data?.node?.template[field]?.load_from_db) {
          node.data.node!.template[field].value = "";
          node.data.node!.template[field].load_from_db = false;
        }
      });
      if (node.data.node?.flow) {
        removeGlobalVariableFromComponents(node.data.node.flow);
      }
    }
  });
}

export function typesGenerator(data: APIObjectType) {
  return Object.keys(data)
    .reverse()
    .reduce((acc, curr) => {
      Object.keys(data[curr]).forEach((c: keyof APIKindType) => {
        acc[c] = curr;
        // Add the base classes to the accumulator as well.
        data[curr][c].base_classes?.forEach((b) => {
          acc[b] = curr;
        });
      });
      return acc;
    }, {});
}

export function templatesGenerator(data: APIObjectType) {
  return Object.keys(data).reduce((acc, curr) => {
    Object.keys(data[curr]).forEach((c: keyof APIKindType) => {
      //prevent wrong overwriting of the component template by a group of the same type
      if (!data[curr][c].flow) acc[c] = data[curr][c];
    });
    return acc;
  }, {});
}

/**
 * Determines if a field is a SecretStr field type
 */
function isSecretField(fieldData: any): boolean {
  // Check if field type is specifically SecretStr
  if (fieldData?.type === "SecretStr") {
    return true;
  }

  // Also check for fields that have both password=true and load_from_db=true
  // which are characteristics of SecretStrInput fields
  if (fieldData?.password === true && fieldData?.load_from_db === true) {
    return true;
  }

  return false;
}

/**
 * Extract only SecretStr type fields from components for global variables
 */
export function extractSecretFieldsFromComponents(data: APIObjectType) {
  const fields = new Set<string>();

  // Check if data exists
  if (!data) {
    console.warn(
      "[Types] Data is undefined in extractSecretFieldsFromComponents",
    );
    return fields;
  }

  Object.keys(data).forEach((key) => {
    // Check if data[key] exists
    if (!data[key]) {
      console.warn(
        `[Types] data["${key}"] is undefined in extractSecretFieldsFromComponents`,
      );
      return;
    }

    Object.keys(data[key]).forEach((kind) => {
      // Check if data[key][kind] exists
      if (!data[key][kind]) {
        console.warn(
          `[Types] data["${key}"]["${kind}"] is undefined in extractSecretFieldsFromComponents`,
        );
        return;
      }

      // Skip legacy components
      if (data[key][kind].legacy === true) {
        return;
      }

      // Check if template exists
      if (!data[key][kind].template) {
        console.warn(
          `[Types] data["${key}"]["${kind}"].template is undefined in extractSecretFieldsFromComponents`,
        );
        return;
      }

      Object.keys(data[key][kind].template).forEach((field) => {
        const fieldData = data[key][kind].template[field];
        if (
          fieldData?.display_name &&
          fieldData?.show &&
          isSecretField(fieldData)
        )
          fields.add(fieldData.display_name!);
      });
    });
  });

  return fields;
}

export function extractFieldsFromComponenents(data: APIObjectType) {
  const fields = new Set<string>();

  // Check if data exists
  if (!data) {
    console.warn("[Types] Data is undefined in extractFieldsFromComponenents");
    return fields;
  }

  Object.keys(data).forEach((key) => {
    // Check if data[key] exists
    if (!data[key]) {
      console.warn(
        `[Types] data["${key}"] is undefined in extractFieldsFromComponenents`,
      );
      return;
    }

    Object.keys(data[key]).forEach((kind) => {
      // Check if data[key][kind] exists
      if (!data[key][kind]) {
        console.warn(
          `[Types] data["${key}"]["${kind}"] is undefined in extractFieldsFromComponenents`,
        );
        return;
      }
      // Check if template exists
      if (!data[key][kind].template) {
        console.warn(
          `[Types] data["${key}"]["${kind}"].template is undefined in extractFieldsFromComponenents`,
        );
        return;
      }

      Object.keys(data[key][kind].template).forEach((field) => {
        if (
          data[key][kind].template[field]?.display_name &&
          data[key][kind].template[field]?.show
        )
          fields.add(data[key][kind].template[field].display_name!);
      });
    });
  });

  return fields;
}
/**
 * Recursively sorts all object keys and arrays in a JSON structure
 * @param obj - The object to sort keys and arrays for
 * @returns A new object with sorted keys and arrays
 */
function sortJsonStructure<T>(obj: T): T {
  // Handle null case
  if (obj === null) {
    return obj;
  }

  // Handle arrays - sort array elements if they are objects
  if (Array.isArray(obj)) {
    return obj.map((item) => sortJsonStructure(item)) as unknown as T;
  }

  // Only process actual objects
  if (typeof obj !== "object") {
    return obj;
  }

  // Create a new object with sorted keys
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      // Recursively sort nested objects and arrays
      result[key] = sortJsonStructure(obj[key]);
      return result;
    }, {} as any);
}

/**
 * Downloads the flow as a JSON file with sorted keys and arrays
 * @param flow - The flow to download
 * @param flowName - The name to use for the flow
 * @param flowDescription - Optional description for the flow
 */
export async function downloadFlow(
  flow: FlowType,
  flowName: string,
  flowDescription?: string,
): Promise<string | undefined | void> {
  try {
    const clonedFlow = cloneDeep(flow);

    removeFileNameFromComponents(clonedFlow);

    const flowData = {
      ...clonedFlow,
      name: flowName,
      description: flowDescription,
    };

    const sortedData = sortJsonStructure(flowData);
    const sortedJsonString = JSON.stringify(sortedData, null, 2);

    return await customDownloadFlow(flow, sortedJsonString, flowName);
  } catch (error) {
    console.error("Error downloading flow:", error);
    throw error;
  }
}

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function getRandomDescription(): string {
  return getRandomElement(DESCRIPTIONS);
}

export const createNewFlow = (
  flowData: ReactFlowJsonObject<AllNodeType, EdgeType>,
  folderId: string,
  flow?: FlowType,
) => {
  return {
    description: flow?.description ?? getRandomDescription(),
    name: flow?.name ? flow.name : "新建流程",
    data: flowData,
    id: "",
    icon: flow?.icon ?? undefined,
    gradient: flow?.gradient ?? undefined,
    is_component: flow?.is_component ?? false,
    folder_id: folderId,
    endpoint_name: flow?.endpoint_name ?? undefined,
    tags: flow?.tags ?? [],
    mcp_enabled: true,
  };
};

export function isInputNode(nodeData: NodeDataType): boolean {
  return INPUT_TYPES.has(nodeData.type);
}

export function isOutputNode(nodeData: NodeDataType): boolean {
  return OUTPUT_TYPES.has(nodeData.type);
}

export function isInputType(type: string): boolean {
  return INPUT_TYPES.has(type);
}

export function isOutputType(type: string): boolean {
  return OUTPUT_TYPES.has(type);
}

export function updateGroupRecursion(
  groupNode: AllNodeType,
  edges: EdgeType[],
  unavailableFields:
    | {
        [name: string]: string;
      }
    | undefined,
  globalVariablesEntries: string[] | undefined,
) {
  if (groupNode.type === "genericNode") {
    updateGlobalVariables(
      groupNode.data.node,
      unavailableFields,
      globalVariablesEntries,
    );
    if (groupNode.data.node?.flow) {
      groupNode.data.node.flow.data!.nodes.forEach((node) => {
        if (node.type === "genericNode") {
          if (node.data.node?.flow) {
            updateGroupRecursion(
              node,
              node.data.node.flow.data!.edges,
              unavailableFields,
              globalVariablesEntries,
            );
          }
        }
      });
      const newFlow = groupNode.data.node!.flow;
      const idsMap = updateIds(newFlow.data!);
      updateProxyIdsOnTemplate(groupNode.data.node!.template, idsMap);
      updateProxyIdsOnOutputs(groupNode.data.node.outputs, idsMap);
      const flowEdges = edges;
      updateEdgesIds(flowEdges, idsMap);
    }
  }
}
export function updateGlobalVariables(
  node: APIClassType | undefined,
  unavailableFields:
    | {
        [name: string]: string;
      }
    | undefined,
  globalVariablesEntries: string[] | undefined,
) {
  if (node && node.template) {
    Object.keys(node.template).forEach((field) => {
      if (
        globalVariablesEntries &&
        node!.template[field].load_from_db &&
        !globalVariablesEntries.includes(node!.template[field].value)
      ) {
        node!.template[field].value = "";
        node!.template[field].load_from_db = false;
      }
      if (
        !node!.template[field].load_from_db &&
        node!.template[field].value === "" &&
        unavailableFields &&
        Object.keys(unavailableFields).includes(
          node!.template[field].display_name ?? "",
        )
      ) {
        node!.template[field].value =
          unavailableFields[node!.template[field].display_name ?? ""];
        node!.template[field].load_from_db = true;
      }
    });
  }
}

export function getGroupOutputNodeId(
  flow: FlowType,
  p_name: string,
  p_node_id: string,
) {
  const node: AllNodeType | undefined = flow.data?.nodes.find(
    (n) => n.id === p_node_id,
  );
  if (!node || node.type !== "genericNode") return;
  if (node.data.node?.flow) {
    const output = node.data.node.outputs?.find((o) => o.name === p_name);
    if (output && output.proxy) {
      return getGroupOutputNodeId(
        node.data.node.flow,
        output.proxy.name,
        output.proxy.id,
      );
    }
  }
  return { id: node.id, outputName: p_name };
}

export function checkOldComponents({ nodes }: { nodes: any[] }) {
  return nodes.some(
    (node) =>
      node.data.node?.template.code &&
      (node.data.node?.template.code.value as string).includes(
        "(CustomComponent):",
      ),
  );
}

export function someFlowTemplateFields(
  { nodes }: { nodes: AllNodeType[] },
  validateFn: (field: InputFieldType) => boolean,
): boolean {
  return nodes.some((node) => {
    return Object.keys(node.data.node?.template ?? {}).some((field) => {
      return validateFn((node.data.node?.template ?? {})[field]);
    });
  });
}

/**
 * Determines if the provided API template supports tool mode.
 *
 * A template is considered to support tool mode if either:
 * - It contains only the 'code' and '_type' fields (with both being truthy),
 *   indicating that no additional fields exist.
 * - At least one field in the template has a truthy 'tool_mode' property.
 *
 * @param template - The API template to evaluate.
 * @returns True if the template supports tool mode capability; otherwise, false.
 */
export function checkHasToolMode(template: APITemplateType): boolean {
  if (!template) return false;

  const templateKeys = Object.keys(template);

  // Check if the template has no additional fields
  const hasNoAdditionalFields =
    templateKeys.length === 2 &&
    Boolean(template.code) &&
    Boolean(template._type);

  // Check if the template has at least one field with a truthy 'tool_mode' property
  const hasToolModeFields = Object.values(template).some((field) =>
    Boolean(field.tool_mode),
  );
  // Check if the component is already in tool mode
  // This occurs when the template has exactly 3 fields: _type, code, and tools_metadata
  const isInToolMode =
    templateKeys.length === 3 &&
    Boolean(template.code) &&
    Boolean(template._type) &&
    Boolean(template.tools_metadata);

  return hasNoAdditionalFields || hasToolModeFields || isInToolMode;
}

export function buildPositionDictionary(nodes: AllNodeType[]) {
  const positionDictionary = {};
  nodes.forEach((node) => {
    positionDictionary[node.position.x] = node.position.y;
  });
  return positionDictionary;
}

export function hasStreaming(nodes: AllNodeType[]) {
  return nodes.some((node) => node.data.node?.template?.stream?.value);
}

// Utility to get all connected nodes and edges from a given nodeId, in a given direction
export function getConnectedSubgraph(
  nodeId: string,
  nodes: AllNodeType[],
  edges: EdgeType[],
  direction: "upstream" | "downstream",
): { nodes: AllNodeType[]; edges: EdgeType[] } {
  const visited = new Set<string>();
  const resultNodes: AllNodeType[] = [];
  const resultEdges: EdgeType[] = [];

  function dfs(currentId: string) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const node = nodes.find((n) => n.id === currentId);
    if (node) {
      resultNodes.push(node);
      if (direction === "upstream") {
        // Find all incoming edges
        const incomingEdges = edges.filter((e) => e.target === currentId);
        for (const edge of incomingEdges) {
          resultEdges.push(edge);
          dfs(edge.source);
        }
      } else {
        // downstream: Find all outgoing edges
        const outgoingEdges = edges.filter((e) => e.source === currentId);
        for (const edge of outgoingEdges) {
          resultEdges.push(edge);
          dfs(edge.target);
        }
      }
    }
  }
  dfs(nodeId);
  return {
    nodes: resultNodes,
    edges: resultEdges,
  };
}
