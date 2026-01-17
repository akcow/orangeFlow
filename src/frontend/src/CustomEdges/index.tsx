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

const IMAGE_ROLE_OPTIONS: Array<{ label: string; value: EdgeImageRole }> = [
  { label: "首帧", value: "first" },
  { label: "参考", value: "reference" },
  { label: "尾帧", value: "last" },
];
const LAST_FRAME_FIELD = "last_frame_image";

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
  const edges = useFlowStore((state) => state.edges);
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
  const isFirstFrameField = targetFieldName === IMAGE_ROLE_FIELD;
  const isLastFrameField = targetFieldName === LAST_FRAME_FIELD;
  const isRoleEdge =
    (isFirstFrameField || isLastFrameField) &&
    targetNode?.data?.type === IMAGE_ROLE_TARGET;
  const modelName = getDoubaoVideoModelName(targetNode);
  const roleLimits = getImageRoleLimits(modelName);
  const isSoraModel =
    roleLimits.allowedRoles.length === 1 &&
    roleLimits.allowedRoles[0] === "reference";
  const isVeoModel = roleLimits.allowedRoles.includes("last");
  const fixedRole: EdgeImageRole | null = isLastFrameField
    ? "last"
    : isSoraModel
      ? "reference"
      : null;
  const roleEdges = edges.filter((edge) => {
    if (edge.target !== target) return false;
    const fieldName =
      edge.data?.targetHandle?.fieldName ??
      (edge.targetHandle ? scapeJSONParse(edge.targetHandle)?.fieldName : undefined);
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
            ...edge.data,
            imageRole: fixedRole,
          },
        };
      }),
    );
  }, [edgeData?.imageRole, fixedRole, id, isRoleEdge, setEdges, takeSnapshot]);

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
            ...edge.data,
            imageRole: fallbackRole,
          },
        };
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

  const sourceXNew =
    (sourceNode?.position.x ?? 0) + (sourceNode?.measured?.width ?? 0) + 7;
  const targetXNew = (targetNode?.position.x ?? 0) - 7;

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
              ...edge.data,
              imageRole: fixedRole,
            },
          };
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
              ...edge.data,
              imageRole: nextRole,
            },
          };
        }

        if (nextRole !== "reference" && edge.target === target && edge.id !== id) {
          const fieldName =
            edge.data?.targetHandle?.fieldName ??
            (edge.targetHandle ? scapeJSONParse(edge.targetHandle)?.fieldName : undefined);
          const resolvedRole = resolveEdgeImageRole(edge, totalRoleEdges);
          if (fieldName === IMAGE_ROLE_FIELD && resolvedRole === nextRole) {
            if (!roleLimits.allowedRoles.includes("reference")) {
              return edge;
            }
            return {
              ...edge,
              data: {
                ...edge.data,
                imageRole: "reference",
              },
            };
          }
        }
        return edge;
      }),
    );
  };

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <BaseEdge
        path={targetHandleObject?.output_types ? edgePathLoop : edgePath}
        strokeDasharray={targetHandleObject?.output_types ? "5 5" : "0"}
        {...domSafeProps}
        data-animated={animated ? "true" : "false"}
        data-selectable={selectable ? "true" : "false"}
        data-deletable={deletable ? "true" : "false"}
        data-selected={selected ? "true" : "false"}
      />
      {selected || hovered ? (
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
                className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <select
                  aria-label="Edge role selector"
                  value={normalizedRole}
                  disabled={isLocked}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    handleRoleChange(event.target.value as EdgeImageRole)
                  }
                  className="cursor-pointer bg-transparent text-xs outline-none"
                >
                  {roleOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={
                        !fixedRole && !roleLimits.allowedRoles.includes(option.value)
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!isLocked ? (
              <button
                type="button"
                aria-label={t("Remove connection")}
                className="group flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
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
                  className="h-4 w-4"
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
