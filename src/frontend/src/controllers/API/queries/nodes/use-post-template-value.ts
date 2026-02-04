import type { UseMutationResult } from "@tanstack/react-query";
import useFlowStore from "@/stores/flowStore";
import type {
  APIClassType,
  ResponseErrorDetailAPI,
  useMutationFunctionType,
} from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface IPostTemplateValue {
  value: any;
  tool_mode?: boolean;
}

interface IPostTemplateValueParams {
  node: APIClassType;
  nodeId: string;
  parameterId: string;
}

function normalizeTemplateBoolInputs(template: Record<string, any>): Record<string, any> {
  // Some asset/workflow templates can contain BoolInput fields with `value: null`.
  // The backend validates BoolInput.value strictly as boolean and will 400 on null/None.
  // Keep this normalization cheap: copy-on-write only for the affected fields.
  let changed = false;
  const next: Record<string, any> = { ...template };

  for (const [key, field] of Object.entries(template)) {
    if (!field || typeof field !== "object") continue;
    const inputType = (field as any)._input_type;
    const type = (field as any).type;
    const def = (field as any).default;
    const inputTypeLower = typeof inputType === "string" ? inputType.trim().toLowerCase() : "";
    const typeLower = typeof type === "string" ? type.trim().toLowerCase() : "";
    // Be tolerant to asset/workflow serialization quirks (e.g. typos like "Boollnput").
    // If it looks like a boolean input, normalize null/undefined values to a real boolean.
    const isBool =
      inputType === "BoolInput" ||
      inputTypeLower.includes("bool") ||
      typeLower === "bool" ||
      typeof def === "boolean";
    if (!isBool) continue;

    const rawValue = (field as any).value;
    let normalized: boolean | null = null;

    if (rawValue === null || rawValue === undefined) {
      normalized = typeof def === "boolean" ? def : false;
    } else if (typeof rawValue === "boolean") {
      normalized = rawValue;
    } else if (rawValue === "true" || rawValue === "false") {
      normalized = rawValue === "true";
    } else if (rawValue === 1 || rawValue === 0) {
      normalized = Boolean(rawValue);
    } else {
      // Unknown shape; leave as-is to avoid surprising coercions.
      normalized = null;
    }

    if (normalized !== null && normalized !== rawValue) {
      next[key] = { ...(field as any), value: normalized };
      changed = true;
    }
  }

  return changed ? next : template;
}

export const usePostTemplateValue: useMutationFunctionType<
  IPostTemplateValueParams,
  IPostTemplateValue,
  APIClassType,
  ResponseErrorDetailAPI
> = ({ parameterId, nodeId, node }, options?) => {
  const { mutate } = UseRequestProcessor();
  const getNode = useFlowStore((state) => state.getNode);

  const postTemplateValueFn = async (
    payload: IPostTemplateValue,
  ): Promise<APIClassType | undefined> => {
    // Prefer the latest node from the store (the hook param can lag by a render).
    const latestNode = getNode(nodeId)?.data?.node as APIClassType | undefined;
    const template = latestNode?.template ?? node.template;

    if (!template) return;
    const templateForRequest = normalizeTemplateBoolInputs(template as any);
    const lastUpdated = new Date().toISOString();
    const response = await api.post<APIClassType>(
      getURL("CUSTOM_COMPONENT", { update: "update" }),
      {
        code: templateForRequest.code?.value ?? template.code?.value,
        template: templateForRequest,
        field: parameterId,
        field_value: payload.value,
        tool_mode: payload.tool_mode,
      },
    );
    const newTemplate = response.data;
    newTemplate.last_updated = lastUpdated;
    const newNode = getNode(nodeId)?.data?.node as APIClassType | undefined;

    if (
      !newNode?.last_updated ||
      !newTemplate.last_updated ||
      Date.parse(newNode.last_updated) < Date.parse(newTemplate.last_updated)
    ) {
      return newTemplate;
    }

    return undefined;
  };

  const mutation: UseMutationResult<
    APIClassType,
    ResponseErrorDetailAPI,
    IPostTemplateValue
  > = mutate(
    ["usePostTemplateValue", { parameterId, nodeId }],
    postTemplateValueFn,
    {
      ...options,
      retry: 0,
    },
  );

  return mutation;
};
