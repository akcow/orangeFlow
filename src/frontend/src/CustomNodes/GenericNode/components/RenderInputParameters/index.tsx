import { useMemo } from "react";
import { getNodeInputColors } from "@/CustomNodes/helpers/get-node-input-colors";
import { getNodeInputColorsName } from "@/CustomNodes/helpers/get-node-input-colors-name";
import { sortToolModeFields } from "@/CustomNodes/helpers/sort-tool-mode-field";
import getFieldTitle from "@/CustomNodes/utils/get-field-title";
import { scapedJSONStringfy } from "@/utils/reactflowUtils";
import NodeInputField from "../NodeInputField";

type RenderInputParametersProps = {
  data;
  types;
  isToolMode;
  showNode;
  shownOutputs;
  showHiddenOutputs;
  filterFields?: string[];
  filterMode?: "include" | "exclude";
  fieldOverrides?: Record<
    string,
    {
      placeholder?: string;
      inputTypes?: string[];
      type?: string;
      tooltip?: string;
    }
  >;
};

const RenderInputParameters = ({
  data,
  types,
  isToolMode,
  showNode,
  shownOutputs,
  showHiddenOutputs,
  filterFields,
  filterMode = "exclude",
  fieldOverrides,
}: RenderInputParametersProps) => {
  const filterSet = useMemo(
    () => (filterFields ? new Set(filterFields) : null),
    [filterFields],
  );

  const templateFields = useMemo(() => {
    return Object.keys(data.node?.template || {})
      .filter((templateField) => templateField.charAt(0) !== "_")
      .sort((a, b) =>
        sortToolModeFields(
          a,
          b,
          data.node!.template,
          data.node?.field_order ?? [],
          isToolMode,
        ),
      );
  }, [data.node?.template, data.node?.field_order, isToolMode]);

  const shownTemplateFields = useMemo(() => {
    return templateFields.filter((templateField) => {
      if (filterSet) {
        const shouldInclude =
          filterMode === "include"
            ? filterSet.has(templateField)
            : !filterSet.has(templateField);
        if (!shouldInclude) {
          return false;
        }
      }
      const template = data.node?.template[templateField];
      return (
        template?.show &&
        !template?.advanced &&
        !(template?.tool_mode && isToolMode)
      );
    });
  }, [templateFields, data.node?.template, isToolMode]);

  const memoizedColors = useMemo(() => {
    const colorMap = new Map();

    templateFields.forEach((templateField) => {
      const template = data.node?.template[templateField];
      if (template) {
        colorMap.set(templateField, {
          colors: getNodeInputColors(
            template.input_types,
            template.type,
            types,
          ),
          colorsName: getNodeInputColorsName(
            template.input_types,
            template.type,
            types,
          ),
        });
      }
    });

    return colorMap;
  }, [templateFields, types, data.node?.template]);

  const memoizedKeys = useMemo(() => {
    const keyMap = new Map();

    templateFields.forEach((templateField) => {
      const template = data.node?.template[templateField];
      if (template) {
        keyMap.set(
          templateField,
          scapedJSONStringfy({
            inputTypes: template.input_types,
            type: template.type,
            id: data.id,
            fieldName: templateField,
            proxy: template.proxy,
          }),
        );
      }
    });

    return keyMap;
  }, [templateFields, data.id, data.node?.template]);

  const renderInputParameter = shownTemplateFields.map(
    (templateField: string, idx: number) => {
      const template = data.node?.template[templateField];

      const memoizedColor = memoizedColors.get(templateField);
      const memoizedKey = memoizedKeys.get(templateField);
      const overrides = fieldOverrides?.[templateField];
      const resolvedInputTypes =
        overrides?.inputTypes ?? template.input_types;
      const resolvedType = overrides?.type ?? template.type;
      const tooltipTitle =
        overrides?.tooltip ??
        resolvedInputTypes?.join("\n") ??
        resolvedType;
      const colorSource =
        overrides?.inputTypes || overrides?.type
          ? {
              colors: getNodeInputColors(resolvedInputTypes, resolvedType, types),
              colorsName: getNodeInputColorsName(
                resolvedInputTypes,
                resolvedType,
                types,
              ),
            }
          : memoizedColor;
      const resolvedKey =
        overrides?.inputTypes || overrides?.type
          ? scapedJSONStringfy({
              inputTypes: resolvedInputTypes,
              type: resolvedType,
              id: data.id,
              fieldName: templateField,
              proxy: template.proxy,
            })
          : memoizedKey;

      return (
        <NodeInputField
          lastInput={
            !(shownOutputs.length > 0 || showHiddenOutputs) &&
            idx === shownTemplateFields.length - 1
          }
          key={resolvedKey}
          data={data}
          colors={colorSource.colors}
          title={getFieldTitle(data.node?.template!, templateField)}
          info={template.info!}
          name={templateField}
          tooltipTitle={tooltipTitle}
          required={template.required}
          id={{
            inputTypes: resolvedInputTypes,
            type: resolvedType,
            id: data.id,
            fieldName: templateField,
            proxy: template.proxy,
          }}
          type={resolvedType}
          optionalHandle={resolvedInputTypes}
          proxy={template.proxy}
          showNode={showNode}
          colorName={colorSource.colorsName}
          isToolMode={isToolMode && template.tool_mode}
          placeholderOverride={overrides?.placeholder}
        />
      );
    },
  );

  return <>{renderInputParameter}</>;
};

export default RenderInputParameters;
