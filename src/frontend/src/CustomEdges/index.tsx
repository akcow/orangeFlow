import {
  BaseEdge,
  type EdgeProps,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
} from "@xyflow/react";
import { useEffect, useState } from "react";
import { t } from "@/i18n/t";
import useAlertStore from "@/stores/alertStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import type { EdgeDataType } from "@/types/flow";
import { BuildStatus } from "@/constants/enums";
import {
  canUpdateImageRole,
  getDoubaoVideoModelName,
  getImageRoleCounts,
  getImageRoleLimits,
  IMAGE_ROLE_FIELD,
  IMAGE_ROLE_TARGET,
  resolveEdgeImageRole,
  scapeJSONParse,
} from "@/utils/reactflowUtils";

type EdgeImageRole = "first" | "reference" | "last";
type VideoReferType = "base" | "feature";

const IMAGE_ROLE_OPTIONS: Array<{ label: string; value: EdgeImageRole }> = [
  { label: "\u9996\u5e27", value: "first" },
  { label: "\u53c2\u8003", value: "reference" },
  { label: "\u5c3e\u5e27", value: "last" },
];
const LAST_FRAME_FIELD = "last_frame_image";
const REFERENCE_IMAGES_FIELD = "reference_images";
const VIDEO_ROLE_SOURCE_TYPES = new Set([IMAGE_ROLE_TARGET, "UserUploadVideo"]);
const MEDIA_SOURCE_TYPES = new Set([
  "DoubaoImageCreator",
  "DoubaoVideoGenerator",
  "UserUploadImage",
  "UserUploadVideo",
]);
const MEDIA_INPUT_FIELDS = new Set([
  REFERENCE_IMAGES_FIELD,
  IMAGE_ROLE_FIELD,
  LAST_FRAME_FIELD,
]);

const VIDEO_ROLE_OPTIONS: Array<{ label: string; value: VideoReferType }> = [
  { label: "\u89c6\u9891\u7f16\u8f91", value: "base" },
  { label: "\u89c6\u9891\u53c2\u8003", value: "feature" },
];

function getVideoReferTypeLimits(modelName: string): {
  allowedRoles: VideoReferType[];
  fallback: VideoReferType;
} {
  const normalized = String(modelName ?? "").trim().toLowerCase();
  if (normalized === "wan2.6") {
    return {
      allowedRoles: ["feature"],
      fallback: "feature",
    };
  }
  if (normalized.startsWith("kling")) {
    return {
      allowedRoles: ["base", "feature"],
      fallback: "feature",
    };
  }
  if (normalized === "viduq2-pro") {
    return {
      allowedRoles: ["base", "feature"],
      fallback: "feature",
    };
  }
  return {
    allowedRoles: ["feature"],
    fallback: "feature",
  };
}

export function DefaultEdge({
  sourceHandleId,
  source,
  sourceX,
  sourceY,
  target,
  targetHandleId,
  targetX,
  targetY,
  id,
  ...props
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const deleteEdge = useFlowStore((state) => state.deleteEdge);
  const setEdges = useFlowStore((state) => state.setEdges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const edges = useFlowStore((state) => state.edges);
  const flowBuildStatus = useFlowStore((state) => state.flowBuildStatus);
  const isLocked = useFlowStore((state) => state.currentFlow?.locked);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const getNode = useFlowStore((state) => state.getNode);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const sourceNode = getNode(source);
  const targetNode = getNode(target);

  const edgeData = props.data as EdgeDataType | undefined;
  const targetHandleObject =
    edgeData?.targetHandle ??
    (targetHandleId ? scapeJSONParse(targetHandleId) : undefined);
  const targetFieldName =
    targetHandleObject?.fieldName ?? targetHandleObject?.name;
  const getEdgeTargetFieldName = (
    edge: {
      data?: { targetHandle?: { fieldName?: string; name?: string } };
      targetHandle?: string | null;
    },
  ): string | undefined => {
    const targetHandle = edge?.data?.targetHandle;
    if (targetHandle && typeof targetHandle === "object") {
      return targetHandle.fieldName ?? targetHandle.name;
    }
    if (!edge?.targetHandle) return undefined;
    try {
      const parsed = scapeJSONParse(edge.targetHandle) as
        | { fieldName?: string; name?: string }
        | null;
      return parsed?.fieldName ?? parsed?.name;
    } catch {
      return undefined;
    }
  };
  const isFirstFrameField = targetFieldName === IMAGE_ROLE_FIELD;
  const isLastFrameField = targetFieldName === LAST_FRAME_FIELD;
  const isVideoBridgeEdge =
    isFirstFrameField &&
    VIDEO_ROLE_SOURCE_TYPES.has(String(sourceNode?.data?.type ?? "")) &&
    targetNode?.data?.type === IMAGE_ROLE_TARGET;
  const hasIncomingVideoSourceEdge = edges.some((edge) => {
    if (edge.target !== target) return false;
    if (getEdgeTargetFieldName(edge) !== IMAGE_ROLE_FIELD) return false;
    const edgeVideoReferType = edge.data?.videoReferType;
    if (edgeVideoReferType === "base" || edgeVideoReferType === "feature") return true;
    const sourceType = getNode(edge.source)?.data?.type;
    return VIDEO_ROLE_SOURCE_TYPES.has(String(sourceType ?? ""));
  });
  const isRoleEdge =
    !isVideoBridgeEdge &&
    (isFirstFrameField || isLastFrameField) &&
    targetNode?.data?.type === IMAGE_ROLE_TARGET;
  const modelName = getDoubaoVideoModelName(targetNode);
  const isKlingModel = modelName.toLowerCase().startsWith("kling");
  const roleLimits = getImageRoleLimits(modelName);
  const isSoraModel =
    roleLimits.allowedRoles.length === 1 &&
    roleLimits.allowedRoles[0] === "reference";
  const videoReferLimits = getVideoReferTypeLimits(modelName);
  const fixedRole: EdgeImageRole | null = isLastFrameField
    ? "last"
    : isSoraModel
      ? "reference"
      : isRoleEdge && hasIncomingVideoSourceEdge
        ? "reference"
      : null;
  const roleEdges = edges.filter((edge) => {
    if (edge.target !== target) return false;
    const fieldName = getEdgeTargetFieldName(edge);
    return fieldName === IMAGE_ROLE_FIELD;
  });
  const totalRoleEdges = roleEdges.length;
  const currentRole: EdgeImageRole = fixedRole
    ? fixedRole
    : resolveEdgeImageRole(props as any, totalRoleEdges);
  const normalizedRole: EdgeImageRole = fixedRole
    ? fixedRole
    : roleLimits.allowedRoles.includes(currentRole)
      ? currentRole
      : roleLimits.allowedRoles[0] ?? "first";
  const roleOptions = fixedRole
    ? IMAGE_ROLE_OPTIONS.filter((option) => option.value === fixedRole)
    : IMAGE_ROLE_OPTIONS.filter((option) => roleLimits.allowedRoles.includes(option.value));

  const currentVideoReferType: VideoReferType =
    edgeData?.videoReferType === "base" || edgeData?.videoReferType === "feature"
      ? edgeData.videoReferType
      : videoReferLimits.fallback;
  const normalizedVideoReferType: VideoReferType = videoReferLimits.allowedRoles.includes(
    currentVideoReferType,
  )
    ? currentVideoReferType
    : videoReferLimits.fallback;
  const videoRoleOptions = VIDEO_ROLE_OPTIONS;

  useEffect(() => {
    if (!isRoleEdge || !fixedRole) return;
    if (edgeData?.imageRole === fixedRole) return;
    takeSnapshot();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== id) return edge;
        return {
          ...edge,
          data: {
            ...(edge.data ?? ({} as any)),
            imageRole: fixedRole,
          },
        } as any;
      }),
    );
  }, [edgeData?.imageRole, fixedRole, id, isRoleEdge, setEdges, takeSnapshot]);

  useEffect(() => {
    if (!isVideoBridgeEdge) return;
    if (edgeData?.videoReferType === normalizedVideoReferType) return;
    takeSnapshot();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== id) return edge;
        return {
          ...edge,
          data: {
            ...(edge.data ?? ({} as any)),
            videoReferType: normalizedVideoReferType,
          },
        } as any;
      }),
    );
  }, [
    edgeData?.videoReferType,
    id,
    isVideoBridgeEdge,
    normalizedVideoReferType,
    setEdges,
    takeSnapshot,
  ]);

  useEffect(() => {
    if (!isRoleEdge || fixedRole) return;
    if (roleLimits.allowedRoles.includes(currentRole)) return;
    const fallbackRole = roleLimits.allowedRoles[0] ?? "first";
    if (edgeData?.imageRole === fallbackRole) return;
    takeSnapshot();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== id) return edge;
        return {
          ...edge,
          data: {
            ...(edge.data ?? ({} as any)),
            imageRole: fallbackRole,
          },
        } as any;
      }),
    );
  }, [
    currentRole,
    edgeData?.imageRole,
    fixedRole,
    id,
    isRoleEdge,
    roleLimits.allowedRoles,
    setEdges,
    takeSnapshot,
  ]);

  // IMPORTANT: use XYFlow-provided coordinates (already absolute, even for nested nodes).
  // Node `position` is parent-relative when grouped, which will misplace edges.
  const sourceXNew = sourceX + 7;
  const targetXNew = targetX - 7;

  const distance = 200 + 0.1 * ((sourceXNew - targetXNew) / 2);

  const zeroOnNegative =
    (1 +
      (1 - Math.exp(-0.01 * Math.abs(sourceXNew - targetXNew))) *
      (sourceXNew - targetXNew >= 0 ? 1 : -1)) /
    2;

  const distanceY =
    200 -
    200 * (1 - zeroOnNegative) +
    0.3 * Math.abs(targetY - sourceY) * zeroOnNegative;

  const sourceDistanceY =
    200 -
    200 * (1 - zeroOnNegative) +
    0.3 * Math.abs(sourceY - targetY) * zeroOnNegative;

  const targetYNew = targetY + 1;
  const sourceYNew = sourceY + 1;

  const edgePathLoop = `M ${sourceXNew} ${sourceYNew} C ${sourceXNew + distance} ${sourceYNew + sourceDistanceY}, ${targetXNew - distance} ${targetYNew + distanceY}, ${targetXNew} ${targetYNew}`;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sourceXNew,
    sourceY: sourceYNew,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    targetX: targetXNew,
    targetY: targetYNew,
  });

  const { animated, selectable, deletable, selected, ...domSafeProps } = props;
  const targetType = targetNode?.data?.type;
  const sourceType = sourceNode?.data?.type;
  const pathForRender = targetHandleObject?.output_types ? edgePathLoop : edgePath;
  const isMediaTargetNode =
    targetType === "DoubaoImageCreator" || targetType === "DoubaoVideoGenerator";
  const isMediaInputEdge =
    Boolean(targetFieldName) &&
    MEDIA_INPUT_FIELDS.has(String(targetFieldName)) &&
    isMediaTargetNode &&
    MEDIA_SOURCE_TYPES.has(String(sourceType));
  const isTargetBuilding =
    flowBuildStatus?.[target]?.status === BuildStatus.BUILDING;
  const showRunningWave = Boolean(isTargetBuilding && isMediaInputEdge);

  const handleRoleChange = (nextRole: EdgeImageRole) => {
    if (isLocked) return;
    if (fixedRole) {
      if (edgeData?.imageRole === fixedRole) return;
      takeSnapshot();
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id !== id) return edge;
          return {
            ...edge,
            data: {
              ...(edge.data ?? ({} as any)),
              imageRole: fixedRole,
            },
          } as any;
        }),
      );
      return;
    }
    if (nextRole === currentRole) return;
    if (!roleLimits.allowedRoles.includes(nextRole)) {
      setErrorData({
        title: "Role not supported",
        list: ["The selected model does not support this image role."],
      });
      return;
    }

    const otherEdges = edges.filter((edge) => edge.id !== id);
    const counts = getImageRoleCounts(otherEdges, target, targetNode);
    const hasSameRole = counts[nextRole] > 0;
    const canDemoteToReference =
      roleLimits.allowedRoles.includes("reference") &&
      (roleLimits.maxReference == null ||
        counts.reference + (hasSameRole ? 1 : 0) <= roleLimits.maxReference);

    if (nextRole === "reference") {
      if (!canUpdateImageRole(nextRole, counts, roleLimits)) {
        setErrorData({
          title: "Reference limit reached",
          list: [
            "No more reference images are allowed for the selected model.",
          ],
        });
        return;
      }
    } else if (hasSameRole && !canDemoteToReference) {
      setErrorData({
        title: "Role limit reached",
        list: [
          "Another connection already uses this role, and no reference slots remain.",
        ],
      });
      return;
    } else if (!hasSameRole && !canUpdateImageRole(nextRole, counts, roleLimits)) {
      setErrorData({
        title: "Role limit reached",
        list: ["Another connection already uses this role."],
      });
      return;
    }

    takeSnapshot();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id === id) {
          return {
            ...edge,
            data: {
              ...(edge.data ?? ({} as any)),
              imageRole: nextRole,
            },
          } as any;
        }

        if (nextRole !== "reference" && edge.target === target && edge.id !== id) {
          const fieldName = getEdgeTargetFieldName(edge);
          const resolvedRole = resolveEdgeImageRole(edge, totalRoleEdges);
          if (fieldName === IMAGE_ROLE_FIELD && resolvedRole === nextRole) {
            if (!roleLimits.allowedRoles.includes("reference")) {
              return edge;
            }
            return {
              ...edge,
              data: {
                ...(edge.data ?? ({} as any)),
                imageRole: "reference",
              },
            } as any;
          }
        }
        return edge;
      }),
    );
  };

  const handleVideoReferTypeChange = (next: VideoReferType) => {
    if (!isVideoBridgeEdge) return;
    if (!videoReferLimits.allowedRoles.includes(next)) {
      setErrorData({
        title: "Role not supported",
        list: ["The selected model does not support this video role."],
      });
      return;
    }
    const nextValue: VideoReferType = next === "base" ? "base" : "feature";

    takeSnapshot();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id !== id) return edge;
        return {
          ...edge,
          data: {
            ...(edge.data ?? ({} as any)),
            videoReferType: nextValue,
          },
        } as any;
      }),
    );

    // Persist into the target node template so the backend component can read it reliably.
    const targetTemplateMaybe = (targetNode as any)?.data?.node?.template;
    if (isKlingModel && targetTemplateMaybe?.kling_video_refer_type) {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== target) return node;
          if (node.data?.type !== IMAGE_ROLE_TARGET) return node;
          const nodeData = node.data as any;
          const template = nodeData?.node?.template ?? {};
          const field = template.kling_video_refer_type;
          if (!field) return node;
          const nextNode = { ...(node as any) };
          nextNode.data = { ...nodeData, node: { ...(nodeData?.node ?? {}) } };
          nextNode.data.node.template = {
            ...template,
            kling_video_refer_type: { ...field, value: nextValue },
          };
          return nextNode;
        }),
      );
    }
  };

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-doubao-running-wave={showRunningWave ? "true" : "false"}
    >
      <BaseEdge
        path={pathForRender}
        strokeDasharray={targetHandleObject?.output_types ? "5 5" : "0"}
        {...domSafeProps}
        data-animated={animated ? "true" : "false"}
        data-selectable={selectable ? "true" : "false"}
        data-deletable={deletable ? "true" : "false"}
        data-selected={selected ? "true" : "false"}
      />
      {showRunningWave ? (
        <>
          <path
            d={pathForRender}
            fill="none"
            pathLength={1}
            className="doubao-edge-wave-glow"
          />
          <path
            d={pathForRender}
            fill="none"
            pathLength={1}
            className="doubao-edge-wave-pulse"
          />
        </>
      ) : null}
      {selected || hovered || isVideoBridgeEdge ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="flex items-center gap-2"
          >
            {isRoleEdge ? (
              <label
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-base text-foreground shadow-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <select
                  aria-label="Edge role selector"
                  value={normalizedRole}
                  disabled={Boolean(isLocked)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    handleRoleChange(event.target.value as EdgeImageRole)
                  }
                  className="cursor-pointer bg-transparent text-base leading-none outline-none"
                >
                  {roleOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-popover text-popover-foreground"
                      disabled={
                        !fixedRole && !roleLimits.allowedRoles.includes(option.value)
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : isVideoBridgeEdge ? (
              <label
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-base text-foreground shadow-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <select
                  aria-label="Video refer type selector"
                  value={normalizedVideoReferType}
                  disabled={Boolean(isLocked)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    handleVideoReferTypeChange(event.target.value as VideoReferType)
                  }
                  className="cursor-pointer bg-transparent text-base leading-none outline-none"
                >
                  {videoRoleOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-popover text-popover-foreground"
                      disabled={!videoReferLimits.allowedRoles.includes(option.value)}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!isLocked && (selected || hovered) ? (
              <button
                type="button"
                aria-label={t("Remove connection")}
                className="group flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  takeSnapshot();
                  deleteEdge(id);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <circle cx="7" cy="6.5" r="2" />
                  <circle cx="7" cy="17.5" r="2" />
                  <path d="M8.8 8.3 20 4" />
                  <path d="M8.8 15.7 20 20" />
                  <path d="M8.5 12 20 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}

