import type { AllNodeType, EdgeType } from "@/types/flow";

export type EdgeImageRole = "first" | "reference" | "last";
export type VideoGenerationMode =
  | "text"
  | "first_frame"
  | "first_last_frame"
  | "reference_image"
  | "reference_video"
  | "video_edit";

export const IMAGE_ROLE_FIELD = "first_frame_image";
export const IMAGE_ROLE_TARGET = "DoubaoVideoGenerator";

const DEFAULT_FIRST_FRAME_MAX_UPLOADS = 6;
const KLING_MAX_UPLOADS = 7;
const VEO_REFERENCE_IMAGE_LIMIT = 3;
const VEO_MAX_UPLOADS = 5;
const VEO_FAST_MAX_UPLOADS = 2;
const LAST_FRAME_FIELD = "last_frame_image";
const ESCAPED_QUOTE_TOKEN = "è‰™";

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

const VIDEO_GENERATION_MODE_OPTIONS: Record<string, VideoGenerationMode[]> = {
  default: ["text", "first_frame"],
  seedance: ["text", "first_frame", "first_last_frame"],
  "wan2.5": ["text", "first_frame"],
  "wan2.6": ["text", "first_frame", "reference_video"],
  "veo3.1": ["text", "first_frame", "first_last_frame", "reference_image"],
  "veo3.1-fast": ["text", "first_frame", "first_last_frame"],
  "sora-2": ["text", "reference_image"],
  "sora-2-pro": ["text", "reference_image"],
  "kling o1": [
    "text",
    "first_frame",
    "first_last_frame",
    "reference_image",
    "reference_video",
    "video_edit",
  ],
  "kling o3": [
    "text",
    "first_frame",
    "first_last_frame",
    "reference_image",
    "reference_video",
    "video_edit",
  ],
  "kling v3": ["text", "first_frame", "first_last_frame"],
  "viduq3-pro": ["text", "first_frame"],
  "viduq2-pro": ["text", "first_frame", "first_last_frame", "reference_video"],
};

export function getDoubaoVideoModelName(node?: AllNodeType): string {
  const template = node?.data?.node?.template ?? {};
  const modelField = template?.model_name;
  const value =
    modelField?.value ?? modelField?.default ?? modelField?.options?.[0] ?? "";
  return String(value ?? "").trim();
}

export function getSupportedVideoGenerationModes(
  modelName: string,
): VideoGenerationMode[] {
  const normalized = String(modelName ?? "").trim();
  const normalizedLower = normalized.toLowerCase();

  if (
    normalizedLower.includes("seedance") ||
    normalizedLower.includes("seedream") ||
    normalized.includes("闁告娅曢埅?")
  ) {
    return [...VIDEO_GENERATION_MODE_OPTIONS.seedance];
  }

  const direct = VIDEO_GENERATION_MODE_OPTIONS[normalizedLower];
  if (direct) return [...direct];

  return [...VIDEO_GENERATION_MODE_OPTIONS.default];
}

export function getAvailableVideoGenerationModes(
  modelName: string,
  inputProfile: {
    hasImageUpstream: boolean;
    hasVideoUpstream: boolean;
  },
): VideoGenerationMode[] {
  const supported = getSupportedVideoGenerationModes(modelName);

  if (inputProfile.hasVideoUpstream) {
    const videoModes = new Set<VideoGenerationMode>([
      "reference_video",
      "video_edit",
    ]);
    return supported.filter((mode) => videoModes.has(mode));
  }

  if (inputProfile.hasImageUpstream) {
    const imageModes = new Set<VideoGenerationMode>([
      "first_frame",
      "first_last_frame",
      "reference_image",
    ]);
    return supported.filter((mode) => imageModes.has(mode));
  }

  return supported.filter((mode) => mode === "text");
}

export function getDefaultVideoGenerationMode(
  modelName: string,
): VideoGenerationMode {
  return getSupportedVideoGenerationModes(modelName)[0] ?? "text";
}

export function normalizeAvailableVideoGenerationMode(
  modelName: string,
  mode: unknown,
  availableModes: VideoGenerationMode[],
): VideoGenerationMode {
  const normalizedMode =
    typeof mode === "string" ? (mode.trim() as VideoGenerationMode) : "";
  if (availableModes.includes(normalizedMode)) {
    return normalizedMode;
  }
  return availableModes[0] ?? getDefaultVideoGenerationMode(modelName);
}

export function normalizeVideoGenerationMode(
  modelName: string,
  mode: unknown,
): VideoGenerationMode {
  const normalizedMode =
    typeof mode === "string" ? (mode.trim() as VideoGenerationMode) : "";
  const supported = getSupportedVideoGenerationModes(modelName);
  if (supported.includes(normalizedMode)) {
    return normalizedMode;
  }
  return getDefaultVideoGenerationMode(modelName);
}

export function getDoubaoVideoGenerationMode(
  node?: AllNodeType,
): VideoGenerationMode {
  const template = node?.data?.node?.template ?? {};
  const modeField = template?.generation_mode;
  const rawMode =
    modeField?.value ?? modeField?.default ?? modeField?.options?.[0] ?? "";
  return normalizeVideoGenerationMode(getDoubaoVideoModelName(node), rawMode);
}

export function getImageRoleLimitsForGenerationMode(
  modelName: string,
  generationMode: unknown,
): ImageRoleLimits {
  const normalizedMode = normalizeVideoGenerationMode(modelName, generationMode);
  const normalizedModel = String(modelName ?? "").trim().toLowerCase();
  const baseLimits = getImageRoleLimits(modelName);

  if (normalizedMode === "text") {
    return { allowedRoles: [], maxTotal: 0, maxReference: 0 };
  }

  if (normalizedMode === "first_frame" || normalizedMode === "first_last_frame") {
    return { allowedRoles: ["first"], maxTotal: 1, maxReference: 0 };
  }

  if (normalizedMode === "reference_image") {
    const maxReference = baseLimits.maxReference ?? baseLimits.maxTotal;
    return {
      allowedRoles: ["reference"],
      maxTotal: maxReference,
      maxReference,
    };
  }

  if (normalizedMode === "reference_video" || normalizedMode === "video_edit") {
    let maxReference = baseLimits.maxReference ?? baseLimits.maxTotal;
    if (normalizedModel === "viduq2-pro") {
      maxReference = 4;
    } else if (normalizedModel === "wan2.6") {
      maxReference = 5;
    } else if (normalizedModel.startsWith("kling")) {
      maxReference = 4;
    }
    return {
      allowedRoles: ["reference"],
      maxTotal: maxReference,
      maxReference,
    };
  }

  return baseLimits;
}

export function getImageRoleLimits(modelName: string): ImageRoleLimits {
  const normalized = String(modelName ?? "").trim();
  const normalizedLower = normalized.toLowerCase();
  const isVeoModel = normalized === "VEO3.1" || normalized === "veo3.1-fast";
  const isVeoFast = normalized === "veo3.1-fast";
  const isSoraModel = normalized === "sora-2" || normalized === "sora-2-pro";
  const isWanModel = normalizedLower.startsWith("wan2.");
  const isSeedanceModel =
    normalizedLower.includes("seedance") ||
    normalizedLower.includes("seedream") ||
    normalized.includes("é—è™«â…µ");
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
      allowedRoles: ["first"],
      maxTotal: 1,
      maxReference: 0,
    };
  }

  if (normalizedLower === "viduq2-pro") {
    return {
      allowedRoles: ["first", "reference", "last"],
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
      allowedRoles: ["first"],
      maxTotal: DEFAULT_FIRST_FRAME_MAX_UPLOADS,
    };
  }

  if (isSeedanceModel) {
    return {
      allowedRoles: ["first", "last"],
      maxTotal: 2,
    };
  }

  if (isKlingV3) {
    return {
      allowedRoles: ["first", "last"],
      maxTotal: 2,
      maxReference: 0,
    };
  }

  if (isKlingModel) {
    return {
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

function parseEscapedJson(json: string): any {
  return JSON.parse(json.replace(new RegExp(ESCAPED_QUOTE_TOKEN, "g"), '"'));
}

function getEdgeTargetFieldName(edge: EdgeType): string | undefined {
  const targetHandle = edge.data?.targetHandle;
  if (targetHandle && typeof targetHandle === "object") {
    return targetHandle.fieldName ?? targetHandle.name;
  }
  if (!edge.targetHandle) return undefined;
  try {
    const parsed = parseEscapedJson(edge.targetHandle);
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
    return fieldName === LAST_FRAME_FIELD;
  });
  const totalRoleEdges = roleEdges.length;
  const counts: ImageRoleCounts = {
    total: roleEdges.length + lastFrameEdges.length,
    first: 0,
    reference: 0,
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

  const lastField = template[LAST_FRAME_FIELD];
  if (lastField) {
    const raw = lastField.value ?? lastField.file_path;
    const items = Array.isArray(raw)
      ? raw
      : raw !== undefined && raw !== null
        ? [raw]
        : [];
    const hasAny = items.some((value: unknown) => !isEmptyImageEntry(value));
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
  const record = value as Record<string, unknown>;
  const direct = record.role;
  if (typeof direct === "string") {
    const normalized = direct.trim();
    if (normalized === "first" || normalized === "reference" || normalized === "last") {
      return normalized;
    }
  }
  const nested = record.value;
  if (nested && typeof nested === "object") {
    const nestedRole = (nested as Record<string, unknown>).role;
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
