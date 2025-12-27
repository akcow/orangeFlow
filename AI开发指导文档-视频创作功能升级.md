# AI开发指导文档 - 视频创作功能完整实现指南

> **目标**: 在远程仓库 `feature/seedream45-components` 分支的基础上，实现所有新增功能和改动
>
> **基准提交**: `akcow/feature/seedream45-components`
> **目标提交**: `8ee4d27` - "更新：添加文档和优化组件功能"
>
> **改动范围**: 16个文件，+2461行，-177行

---

## 📋 目录

1. [项目概述](#项目概述)
2. [文件改动清单](#文件改动清单)
3. [核心功能实现](#核心功能实现)
4. [详细代码改动](#详细代码改动)
5. [测试验证](#测试验证)

---

## 项目概述

本次更新主要围绕**豆包AI视频创作功能**的增强，核心包括：

- ✅ **尾帧图片支持** - 实现首尾帧视频生成
- ✅ **模型限制系统** - 不同模型的智能参数约束
- ✅ **自动连线功能** - 一键创建并连接节点
- ✅ **上游图片集成** - 从上游节点继承图片
- ✅ **参数验证增强** - 自动修正非法参数
- ✅ **UI交互优化** - 提升用户体验

---

## 文件改动清单

### 📄 新增文件 (2个)

1. **`IFLOW.md`** - LangFlow精简版项目文档
2. **`Seedance系列模型接入文档.md`** - Seedance模型API指南

### 🔧 修改文件 (14个)

#### 前端组件 (7个)
1. `src/frontend/src/CustomNodes/GenericNode/components/DoubaoVideoGeneratorLayout.tsx` ⭐⭐⭐
2. `src/frontend/src/CustomNodes/GenericNode/components/DoubaoImageCreatorLayout.tsx` ⭐⭐⭐
3. `src/frontend/src/CustomNodes/GenericNode/components/DoubaoPreviewPanel/index.tsx` ⭐⭐⭐
4. `src/frontend/src/CustomNodes/GenericNode/components/DoubaoParameterButton.tsx` ⭐⭐
5. `src/frontend/src/CustomNodes/GenericNode/index.tsx` ⭐
6. `src/frontend/src/hooks/use-add-component.ts` ⭐
7. `src/frontend/vite.config.mts` ⭐⭐

#### 后端组件 (3个)
8. `src/lfx/src/lfx/components/doubao/doubao_video_generator.py` ⭐⭐⭐
9. `src/lfx/src/lfx/components/doubao/doubao_tts_perfect.py` ⭐
10. `src/lfx/src/lfx/components/doubao/doubao_tts_perfect_backup.py` ⭐

#### 文档 (4个)
11. `README.md` ⭐
12. `start-langflow-dev.md` ⭐
13. `src/frontend/package-lock.json` ⭐
14. `src/frontend/src/pages/MainPage/pages/homePage/hooks/useMcpServer.ts` ⭐

---

## 核心功能实现

### 一、视频创作 - 尾帧图片支持

#### 📝 功能描述
为 `DoubaoVideoGenerator` 组件添加尾帧图片输入功能，支持首尾帧生成平滑过渡视频。

#### 🔨 实现步骤

##### Step 1: 前端 - 添加尾帧字段定义

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoVideoGeneratorLayout.tsx`

```typescript
// 在文件顶部常量定义区域添加
const LAST_FRAME_FIELD = "last_frame_image";

const LAST_FRAME_FIELD_FALLBACK: InputFieldType = {
  type: "file",
  required: false,
  placeholder: "",
  list: false,
  show: true,
  readonly: false,
  name: "last_frame_image",
  display_name: "尾帧图输入",
  input_types: ["Data"],
  file_types: DEFAULT_FIRST_FRAME_EXTENSIONS,
  fileTypes: DEFAULT_FIRST_FRAME_EXTENSIONS,
};
```

##### Step 2: 添加模型限制配置

```typescript
// 在组件内部添加模型限制映射
const MODEL_LIMITS: Record<
  string,
  {
    resolutions?: string[];
    minDuration?: number;
    maxDuration?: number;
    enableLastFrame?: boolean;
  }
> = {
  "Doubao-Seedance-1.5-pro｜251215": {
    resolutions: ["480p", "720p"],
    minDuration: 4,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro｜250528": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro-fast｜251015": {
    resolutions: ["480p", "720p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: false,  // 此模型不支持尾帧
  },
};

const modelLimits = MODEL_LIMITS[selectedModel] ?? null;
const allowLastFrame = modelLimits?.enableLastFrame ?? true;
```

##### Step 3: 添加尾帧字段处理

```typescript
// 添加尾帧字段处理hooks
const { handleOnNewValue: handleLastFrameChange } = useHandleOnNewValue({
  node: data.node!,
  nodeId: data.id,
  name: LAST_FRAME_FIELD,
});

// 处理尾帧图片数据
const lastFrameFieldRaw = template[LAST_FRAME_FIELD];
const lastFrameField = useMemo<InputFieldType>(() => {
  if (!lastFrameFieldRaw) return LAST_FRAME_FIELD_FALLBACK;
  // 标准化字段配置...
  return {
    ...LAST_FRAME_FIELD_FALLBACK,
    ...lastFrameFieldRaw,
    input_types: normalizedInputTypes,
    file_types: normalizedFileTypes,
    fileTypes: normalizedCamelFileTypes,
  };
}, [lastFrameFieldRaw]);
```

##### Step 4: 尾帧预览处理

```typescript
const lastFramePreviews = useMemo<DoubaoReferenceImage[]>(
  () => buildFirstFramePreviewItems(lastFrameField),
  [lastFrameField],
);

const selectedLastFrame = lastFramePreviews[0] ?? null;
const selectedLastFrameSource = useMemo(
  () =>
    (selectedLastFrame?.downloadSource || selectedLastFrame?.imageSource || "")
      .toString()
      .trim(),
  [selectedLastFrame],
);
```

##### Step 5: UI对话框增强

在首帧上传对话框中添加尾帧显示和操作：

```tsx
{allowLastFrame && selectedLastFrame && (
  <div className="flex items-center justify-between text-xs text-[#4B5168]">
    <span>
      当前尾帧：{selectedLastFrame.fileName ?? selectedLastFrame.label}
    </span>
    <button
      type="button"
      className="text-[#1B66FF] hover:underline"
      onClick={handleClearLastFrame}
    >
      清除
    </button>
  </div>
)}
```

在图片列表中添加"设为尾帧"按钮：

```tsx
{combinedFirstFramePreviews.map((preview, index) => {
  const isUpstream = index >= localFirstFrameCount;
  const previewSource = preview.downloadSource ?? preview.imageSource ?? "";
  const isSelectedLastFrame =
    selectedLastFrameSource &&
    previewSource &&
    previewSource.toString().trim() === selectedLastFrameSource;

  return (
    <div key={preview.id} className="...">
      {/* 图片显示 */}

      {/* 当前尾帧标签 */}
      {allowLastFrame && isSelectedLastFrame && (
        <span className="absolute right-3 top-3 rounded-full bg-[#111827]/80 px-2 py-0.5 text-[11px] font-medium text-white shadow">
          当前尾帧
        </span>
      )}

      {/* 操作按钮 */}
      <div className="...">
        {allowLastFrame && (
          <button
            type="button"
            onClick={() => handleSetLastFrame(preview)}
          >
            设为尾帧
          </button>
        )}
      </div>
    </div>
  );
})}
```

##### Step 6: 尾帧处理函数

```typescript
const handleSetLastFrame = useCallback(
  (preview: DoubaoReferenceImage) => {
    const source = preview.downloadSource ?? preview.imageSource;
    if (!source) return;
    handleLastFrameChange({
      value: preview.fileName ?? preview.label ?? source,
      file_path: source,
    });
  },
  [handleLastFrameChange],
);

const handleClearLastFrame = useCallback(() => {
  handleLastFrameChange({ value: "", file_path: "" });
}, [handleLastFrameChange]);
```

##### Step 7: 后端Python组件更新

**文件**: `src/lfx/src/lfx/components/doubao/doubao_video_generator.py`

```python
# 添加尾帧图片输入字段
FileInput(
    name="last_frame_image",
    display_name="尾帧图输入",
    is_list=False,
    list_add_label="上传尾帧图",
    file_types=["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff"],
    input_types=["Data"],
    info="可选：上传尾帧图片，搭配首帧生成更平滑的首尾衔接视频。",
)

# 在build方法中处理尾帧
last_frame_url = self._extract_image_url(getattr(self, "last_frame_image", None))
if last_frame_url:
    content.append({
        "type": "image_url",
        "image_url": {"url": last_frame_url},
        "role": "last_frame",  # 重要：标记为尾帧
    })

# 设置返回尾帧标志
if last_frame_url or first_frame_url:
    generate_params["return_last_frame"] = True
```

添加输出字段：

```python
# 在结果数据中添加尾帧URL
if hasattr(content_obj, 'last_frame_url'):
    result_data["last_frame_url"] = content_obj.last_frame_url

video_results = [{
    "index": 0,
    "video_url": video_url,
    "cover_url": cover_url,
    "last_frame_url": getattr(content_obj, "last_frame_url", None),
    "duration": duration,
}]
```

---

### 二、模型限制系统

#### 📝 功能描述
根据不同模型的限制，自动禁用不支持的参数选项，并自动修正非法参数值。

#### 🔨 实现步骤

##### Step 1: 定义模型限制映射

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoVideoGeneratorLayout.tsx`

```typescript
const MODEL_LIMITS: Record<string, {
  resolutions?: string[];
  minDuration?: number;
  maxDuration?: number;
  enableLastFrame?: boolean;
}> = {
  "Doubao-Seedance-1.5-pro｜251215": {
    resolutions: ["480p", "720p"],  // 仅支持这两种
    minDuration: 4,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro｜250528": {
    resolutions: ["480p", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: true,
  },
  "Doubao-Seedance-1.0-pro-fast｜251015": {
    resolutions: ["480p", "720p"],
    minDuration: 2,
    maxDuration: 12,
    enableLastFrame: false,  // 不支持尾帧
  },
};
```

##### Step 2: 添加参数验证逻辑

```typescript
// 监听模型变化，自动调整参数
useEffect(() => {
  if (!modelLimits) return;

  // 验证并修正分辨率
  const resValue = template?.resolution?.value;
  if (modelLimits.resolutions && resValue && !modelLimits.resolutions.includes(resValue)) {
    handleResolutionChange(
      { value: modelLimits.resolutions[0] },
      { skipSnapshot: true }
    );
  }

  // 验证并修正时长
  const durValue = template?.duration?.value;
  if (typeof durValue === "number") {
    if (modelLimits.minDuration && durValue < modelLimits.minDuration) {
      handleDurationChange(
        { value: modelLimits.minDuration },
        { skipSnapshot: true }
      );
    } else if (modelLimits.maxDuration && durValue > modelLimits.maxDuration) {
      handleDurationChange(
        { value: modelLimits.maxDuration },
        { skipSnapshot: true }
      );
    }
  }
}, [
  modelLimits,
  template?.resolution?.value,
  template?.duration?.value,
  handleResolutionChange,
  handleDurationChange,
]);
```

##### Step 3: 禁用不支持的选项

在控制配置生成时添加禁用逻辑：

```typescript
const controlConfigs: Array<DoubaoControlConfig> = CONTROL_FIELDS.map((field) => {
  let options = templateField.options ?? templateField.list ?? [];
  let disabledOptions: Array<string | number> | undefined;

  // 处理时长选项
  if (field.name === "duration") {
    if (modelLimits?.minDuration || modelLimits?.maxDuration) {
      disabledOptions = options.filter((opt) => {
        if (typeof opt !== "number") return false;
        if (modelLimits?.minDuration && opt < modelLimits.minDuration) return true;
        if (modelLimits?.maxDuration && opt > modelLimits.maxDuration) return true;
        return false;
      });
    }
  }

  // 处理分辨率选项
  if (field.name === "resolution" && modelLimits?.resolutions) {
    disabledOptions = options.filter(
      (opt) => !modelLimits.resolutions!.includes(String(opt)),
    );
  }

  // 处理模型选择（如果使用了尾帧，禁用不支持尾帧的模型）
  if (field.name === "model_name") {
    const shouldDisable = (opt: string | number) => {
      const optString = String(opt);
      const limits = MODEL_LIMITS[optString];
      if (isLastFrameRequested) {
        if (limits && limits.enableLastFrame === false) return true;
      }
      return false;
    };
    disabledOptions = options.filter((opt) => shouldDisable(opt));
  }

  return {
    ...field,
    options,
    value: templateField.value,
    tooltip: tooltipText,
    disabledOptions,  // 传递禁用选项
  };
});
```

##### Step 4: 参数按钮组件支持禁用

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoParameterButton.tsx`

```typescript
// 添加类型定义
export type DoubaoControlConfig = {
  // ...现有字段
  disabledOptions?: Array<string | number>;  // 新增
};

// 在渲染时显示禁用状态
{options.map((option) => {
  const disabled =
    disabledOptions?.some((item) => String(item) === String(option)) ?? false;

  return (
    <DropdownMenuRadioItem
      key={option}
      value={String(option)}
      className="text-sm"
      disabled={disabled}  // 禁用选项
    >
      {formatControlValue(name, option)}
      {disabled ? "（不支持）" : ""}  {/* 显示提示 */}
    </DropdownMenuRadioItem>
  );
})}
```

##### Step 5: 自动切换模型支持

```typescript
// 当尾帧被使用时，自动切换到支持的模型
useEffect(() => {
  const modelField = template?.model_name;
  if (!modelField) return;

  const options: Array<string> = modelField.options ?? modelField.list ?? [];
  if (!options.length) return;

  const current = modelField.value ?? modelField.default;
  const isSupported = (value: string | undefined) => {
    if (!value) return true;
    const normalized = value.toLowerCase();
    const limits = MODEL_LIMITS[value];
    // 如果使用了尾帧但模型不支持，则返回false
    if (limits && limits.enableLastFrame === false && isLastFrameRequested)
      return false;
    return true;
  };

  const firstSupported = options.find((opt) => isSupported(opt));
  if (firstSupported && !isSupported(current)) {
    handleModelChange({ value: firstSupported }, { skipSnapshot: true });
  }
}, [template?.model_name, handleModelChange, isLastFrameRequested, MODEL_LIMITS]);
```

---

### 三、自动连线功能

#### 📝 功能描述
在预览面板的空状态显示可点击的建议按钮，点击后自动创建并连接新节点。

#### 🔨 实现步骤

##### Step 1: 添加自动连线函数

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoPreviewPanel/index.tsx`

```typescript
// 添加必要的导入
import { scapedJSONStringfy } from "@/utils/reactflowUtils";
import { useAddComponent } from "@/hooks/use-add-component";
import useFlowStore from "@/stores/flowStore";
import { useTypesStore } from "@/stores/typesStore";
import useAlertStore from "@/stores/alertStore";

// 在组件内部获取hooks
const addComponent = useAddComponent();
const onConnect = useFlowStore((state) => state.onConnect);
const getNodePosition = useFlowStore((state) => state.getNodePosition);
const templates = useTypesStore((state) => state.templates);
const setErrorData = useAlertStore((state) => state.setErrorData);

// 定义常量
const DEFAULT_OFFSET_X = 320;
const DEFAULT_OFFSET_Y = 0;
const DEFAULT_VERTICAL_SPACING = 120;
```

##### Step 2: 实现节点handle解析

```typescript
// 解析源节点的输出handle
const resolveSourceHandle = useCallback(
  (sourceNodeId: string = nodeId) => {
    const node = useFlowStore.getState().nodes.find(
      (item) => item.id === sourceNodeId
    );
    if (!node || node.type !== "genericNode") return null;

    const outputs = node.data?.node?.outputs ?? [];
    const output = outputs.find((entry) => !entry.hidden) ?? outputs[0];
    if (!output) return null;

    const resolvedType = output.selected ?? output.types?.[0] ?? "Data";
    return scapedJSONStringfy({
      output_types: [resolvedType],
      id: sourceNodeId,
      dataType: node.data?.type,
      name: output.name,
    });
  },
  [nodeId],
);

// 构建视频输入节点的目标handle
const buildVideoInputHandle = useCallback(
  (fieldName: string) => {
    const node = useFlowStore.getState().nodes.find(
      (item) => item.id === nodeId
    );
    const targetTemplate = node?.data?.node?.template ?? {};
    const field = targetTemplate?.[fieldName];
    const inputTypes = field?.input_types ?? ["Data"];
    const type = field?.type ?? "file";

    return scapedJSONStringfy({
      inputTypes,
      type,
      id: nodeId,
      fieldName,
    });
  },
  [nodeId],
);

// 构建目标节点的handle
const buildTargetHandle = useCallback(
  (
    targetType: "DoubaoImageCreator" | "DoubaoVideoGenerator",
    targetId: string,
  ) => {
    const fieldName =
      targetType === "DoubaoImageCreator"
        ? REFERENCE_FIELD
        : FIRST_FRAME_FIELD;

    const targetTemplate = templates?.[targetType]?.template ?? {};
    const field = targetTemplate?.[fieldName];
    const inputTypes = field?.input_types ?? ["Data"];
    const type = field?.type ?? "file";

    return scapedJSONStringfy({
      inputTypes,
      type,
      id: targetId,
      fieldName,
    });
  },
  [templates],
);
```

##### Step 3: 实现自动创建并连接

```typescript
// 创建并连接到图片或视频节点
const createAndConnect = useCallback(
  (targetKind: "image" | "video") => {
    const targetType =
      targetKind === "image"
        ? "DoubaoImageCreator"
        : "DoubaoVideoGenerator";

    const component = templates?.[targetType];
    if (!component) {
      setErrorData({
        title: "Auto connect failed",
        list: [`Missing component template: ${targetType}`],
      });
      return;
    }

    const sourceHandle = resolveSourceHandle();
    if (!sourceHandle) {
      setErrorData({
        title: "Auto connect failed",
        list: ["No available output handle on the current node."],
      });
      return;
    }

    const sourcePos = getNodePosition(nodeId) ?? { x: 0, y: 0 };
    const newNodeId = addComponent(component, targetType, {
      x: 0,
      y: 0,
      paneX: sourcePos.x + DEFAULT_OFFSET_X,
      paneY: sourcePos.y + DEFAULT_OFFSET_Y,
    });

    const targetHandle = buildTargetHandle(targetType, newNodeId);
    if (!targetHandle) {
      setErrorData({
        title: "Auto connect failed",
        list: ["No target handle found on the new component."],
      });
      return;
    }

    window.setTimeout(() => {
      onConnect({
        source: nodeId,
        sourceHandle,
        target: newNodeId,
        targetHandle,
      });
    }, 0);

    showTransientBadge("已自动连线");
  },
  [
    addComponent,
    buildTargetHandle,
    getNodePosition,
    nodeId,
    onConnect,
    resolveSourceHandle,
    setErrorData,
    templates,
    showTransientBadge,
  ],
);
```

##### Step 4: 创建首帧节点

```typescript
const createFirstFrameNode = useCallback(() => {
  const component = templates?.DoubaoImageCreator;
  if (!component) {
    setErrorData({
      title: "Auto connect failed",
      list: ["Missing component template: DoubaoImageCreator"],
    });
    return;
  }

  const sourcePos = getNodePosition(nodeId) ?? { x: 0, y: 0 };
  const newNodeId = addComponent(component, "DoubaoImageCreator", {
    x: 0,
    y: 0,
    paneX: sourcePos.x - DEFAULT_OFFSET_X,  // 放在左侧
    paneY: sourcePos.y + DEFAULT_OFFSET_Y,
  });

  const sourceHandle = resolveSourceHandle(newNodeId);
  const targetHandle = buildVideoInputHandle(FIRST_FRAME_FIELD);

  if (!sourceHandle || !targetHandle) {
    setErrorData({
      title: "Auto connect failed",
      list: ["Missing handles for auto connection."],
    });
    return;
  }

  window.setTimeout(() => {
    onConnect({
      source: newNodeId,
      sourceHandle,
      target: nodeId,
      targetHandle,
    });
  }, 0);

  showTransientBadge("已自动连线");
}, [
  addComponent,
  buildVideoInputHandle,
  getNodePosition,
  nodeId,
  onConnect,
  resolveSourceHandle,
  setErrorData,
  showTransientBadge,
  templates,
]);
```

##### Step 5: 创建首尾帧节点

```typescript
const createFirstAndLastFrameNodes = useCallback(() => {
  // 确保模型支持尾帧
  ensureModelSupportsLastFrame();

  const component = templates?.DoubaoImageCreator;
  if (!component) {
    setErrorData({
      title: "Auto connect failed",
      list: ["Missing component template: DoubaoImageCreator"],
    });
    return;
  }

  const sourcePos = getNodePosition(nodeId) ?? { x: 0, y: 0 };

  // 创建首帧节点（左上方）
  const firstNodeId = addComponent(component, "DoubaoImageCreator", {
    x: 0,
    y: 0,
    paneX: sourcePos.x - DEFAULT_OFFSET_X,
    paneY: sourcePos.y - DEFAULT_VERTICAL_SPACING,
  });

  // 创建尾帧节点（左下方）
  const lastNodeId = addComponent(component, "DoubaoImageCreator", {
    x: 0,
    y: 0,
    paneX: sourcePos.x - DEFAULT_OFFSET_X,
    paneY: sourcePos.y + DEFAULT_VERTICAL_SPACING,
  });

  const firstSourceHandle = resolveSourceHandle(firstNodeId);
  const lastSourceHandle = resolveSourceHandle(lastNodeId);
  const firstTargetHandle = buildVideoInputHandle(FIRST_FRAME_FIELD);
  const lastTargetHandle = buildVideoInputHandle(LAST_FRAME_FIELD);

  // 连接首帧
  if (!firstSourceHandle || !firstTargetHandle) {
    setErrorData({
      title: "Auto connect failed",
      list: ["Missing handles for首帧自动连线"],
    });
    return;
  }
  window.setTimeout(() => {
    onConnect({
      source: firstNodeId,
      sourceHandle: firstSourceHandle,
      target: nodeId,
      targetHandle: firstTargetHandle,
    });
  }, 0);

  // 连接尾帧
  if (!lastSourceHandle || !lastTargetHandle) {
    setErrorData({
      title: "Auto connect failed",
      list: ["Missing handles for尾帧自动连线"],
    });
    return;
  }
  window.setTimeout(() => {
    onConnect({
      source: lastNodeId,
      sourceHandle: lastSourceHandle,
      target: nodeId,
      targetHandle: lastTargetHandle,
    });
  }, 0);

  showTransientBadge("已自动连线");
}, [
  addComponent,
  buildVideoInputHandle,
  ensureModelSupportsLastFrame,
  getNodePosition,
  nodeId,
  onConnect,
  resolveSourceHandle,
  setErrorData,
  showTransientBadge,
  templates,
]);
```

##### Step 6: 模型兼容性检查

```typescript
const isLastFrameSupported = useCallback((modelName: string | undefined) => {
  if (!modelName) return true;
  const normalized = modelName.toLowerCase();
  if (normalized.includes("fast")) return false;
  return LAST_FRAME_SUPPORTED_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );
}, []);

// 确保当前模型支持尾帧
const ensureModelSupportsLastFrame = useCallback(() => {
  const node = useFlowStore.getState().nodes.find(
    (item) => item.id === nodeId
  );
  if (!node || node.type !== "genericNode") return;

  const modelField: any = node.data?.node?.template?.model_name;
  const current = modelField?.value ?? modelField?.default;

  if (isLastFrameSupported(current)) return;

  const options: string[] = modelField?.options ?? modelField?.list ?? [];
  const fallback = options.find((opt) => isLastFrameSupported(opt));

  if (!fallback) return;

  useFlowStore.getState().setNode(nodeId, {
    ...node,
    data: {
      ...node.data,
      node: {
        ...node.data.node,
        template: {
          ...node.data.node!.template,
          model_name: {
            ...modelField,
            value: fallback,
          },
        },
      },
    },
  });
}, [isLastFrameSupported, nodeId]);
```

##### Step 7: UI集成 - 空预览面板

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoPreviewPanel/index.tsx`

修改 `EmptyPreview` 组件：

```tsx
function EmptyPreview({ kind, appearance }: EmptyPreviewProps) {
  const baseButtonClass =
    "flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-foreground shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-slate-800/70";

  if (appearance === "videoGenerator") {
    const suggestions = ["首尾帧生成视频", "首帧生成视频"];

    return (
      <div className="flex h-full min-h-[220px] w-full flex-col justify-center rounded-[16px] border border-dashed border-[#DDE3F6] bg-[#F7F8FD] p-5 text-center text-sm text-[#646B81]">
        <div className="flex flex-col items-center gap-2 text-xs text-[#8E95AF]">
          <span className="font-medium text-[#444A63]">尝试：</span>
          <div className="grid w-full gap-2 text-sm sm:grid-cols-2">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                className={baseButtonClass}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleSuggestionClick(item);
                }}
              >
                <ForwardedIconComponent
                  name="ChevronRight"
                  className="h-3 w-3 text-[#A4AAC6]"
                />
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 图片创作器也可以添加类似功能
  if (appearance === "imageCreator") {
    const suggestions = ["图片换背景"];

    return (
      <div className="...">
        <div className="grid w-full gap-2 text-sm sm:grid-cols-2">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              className={baseButtonClass}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleSuggestionClick(item);
              }}
            >
              <ForwardedIconComponent name="ChevronRight" className="h-3 w-3" />
              <span>{item}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
}
```

##### Step 8: 建议点击处理

```typescript
const handleSuggestionClick = useCallback(
  (label: string) => {
    if (label === "图片换背景") {
      if (kind === "image") {
        createAndConnect("image");
      } else if (kind === "video") {
        createAndConnect("video");
      }
    } else if (label === "首帧生成视频") {
      if (kind === "video") {
        createFirstFrameNode();
      }
    } else if (label === "首尾帧生成视频") {
      if (kind === "video") {
        createFirstAndLastFrameNodes();
      }
    }
  },
  [createAndConnect, createFirstAndLastFrameNodes, createFirstFrameNode, kind],
);
```

##### Step 9: 添加临时提示徽章

```typescript
const [transientBadge, setTransientBadge] = useState<string | null>(null);

const showTransientBadge = useCallback((label: string) => {
  setTransientBadge(label);
  const timer = window.setTimeout(() => {
    setTransientBadge(null);
  }, 2000);
  return () => window.clearTimeout(timer);
}, []);

// 在UI中显示徽章（在预览面板顶部）
{transientBadge && (
  <div className="absolute top-2 right-2 rounded-full bg-green-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2">
    {transientBadge}
  </div>
)}
```

---

### 四、上游节点图片集成

#### 📝 功能描述
支持从上游节点（DoubaoImageCreator、DoubaoVideoGenerator）继承图片，实现链式创作。

#### 🔨 实现步骤

##### Step 1: 视频生成器 - 上游首帧

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoVideoGeneratorLayout.tsx`

```typescript
// 获取上游首帧字段
const nodes = useFlowStore((state) => state.nodes);
const edges = useFlowStore((state) => state.edges);

const upstreamFirstFrameFields = useMemo<InputFieldType[]>(() => {
  const incomingEdges = edges?.filter(
    (edge) => edge.target === data.id && edge.targetHandle,
  );
  const collected: InputFieldType[] = [];

  incomingEdges?.forEach((edge) => {
    try {
      const targetHandle = scapeJSONParse(edge.targetHandle!);
      const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
      if (fieldName !== FIRST_FRAME_FIELD) return;
    } catch {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === edge.source);
    const sourceType = sourceNode?.data?.type;

    // 仅支持特定节点类型
    if (
      sourceType !== "DoubaoVideoGenerator" &&
      sourceType !== "DoubaoImageCreator"
    ) {
      return;
    }

    // 获取上游节点的首帧或参考图字段
    const sourceTemplateField =
      sourceNode.data?.node?.template?.[FIRST_FRAME_FIELD] ??
      sourceNode.data?.node?.template?.["reference_images"];

    if (sourceTemplateField) {
      collected.push(sourceTemplateField);
    }
  });

  return collected;
}, [edges, nodes, data.id]);
```

##### Step 2: 图片创建器 - 上游参考图

**文件**: `src/frontend/src/CustomNodes/GenericNode/components/DoubaoImageCreatorLayout.tsx`

```typescript
// 获取上游参考图字段
const upstreamReferenceFields = useMemo<InputFieldType[]>(() => {
  const incomingEdges = edges?.filter(
    (edge) => edge.target === data.id && edge.targetHandle,
  );
  const collected: InputFieldType[] = [];

  incomingEdges?.forEach((edge) => {
    try {
      const targetHandle = scapeJSONParse(edge.targetHandle!);
      const fieldName = targetHandle?.fieldName ?? targetHandle?.name;
      if (fieldName !== REFERENCE_FIELD) return;
    } catch {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === edge.source);
    if (sourceNode?.data?.type !== "DoubaoImageCreator") return;

    const sourceTemplateField =
      sourceNode.data?.node?.template?.[REFERENCE_FIELD];

    if (sourceTemplateField) {
      collected.push(sourceTemplateField);
    }
  });

  return collected;
}, [edges, nodes, data.id]);
```

##### Step 3: 合并预览列表

```typescript
// 从字段构建预览项
function buildFirstFramePreviewItemsFromFields(
  fields: InputFieldType[],
): DoubaoReferenceImage[] {
  if (!fields.length) return [];
  const previews: DoubaoReferenceImage[] = [];
  fields.forEach((field) => {
    previews.push(...buildFirstFramePreviewItems(field));
  });
  return dedupePreviews(previews);
}

// 合并本地和上游预览
function mergeReferencePreviewLists(
  base: DoubaoReferenceImage[],
  extras: DoubaoReferenceImage[],
): DoubaoReferenceImage[] {
  return dedupePreviews([...base, ...extras]);
}

// 去重函数
function dedupePreviews(
  previews: DoubaoReferenceImage[],
): DoubaoReferenceImage[] {
  const seen = new Set<string>();
  const result: DoubaoReferenceImage[] = [];

  previews.forEach((preview) => {
    const key = preview.imageSource ?? preview.downloadSource ?? preview.id;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    result.push(preview);
  });

  return result;
}
```

##### Step 4: 使用合并后的预览

```typescript
// 视频生成器
const upstreamFirstFramePreviews = useMemo<DoubaoReferenceImage[]>(
  () => buildFirstFramePreviewItemsFromFields(upstreamFirstFrameFields),
  [upstreamFirstFrameFields],
);

const combinedFirstFramePreviews = useMemo<DoubaoReferenceImage[]>(
  () =>
    mergeReferencePreviewLists(firstFramePreviews, upstreamFirstFramePreviews),
  [firstFramePreviews, upstreamFirstFramePreviews],
);

const localFirstFrameCount = firstFramePreviews.length;
const totalFirstFrameCount = combinedFirstFramePreviews.length;

// 图片创建器
const upstreamReferencePreviews = useMemo<DoubaoReferenceImage[]>(
  () => buildReferencePreviewItemsFromFields(upstreamReferenceFields),
  [upstreamReferenceFields],
);

const combinedReferencePreviews = useMemo<DoubaoReferenceImage[]>(
  () => mergeReferencePreviewLists(referencePreviews, upstreamReferencePreviews),
  [referencePreviews, upstreamReferencePreviews],
);

const localReferenceCount = referencePreviews.length;
```

##### Step 5: 上游图片保护机制

```typescript
// 在删除操作中检查是否为上游图片
const handleFirstFrameRemove = useCallback(
  (index: number) => {
    // 不允许删除上游图片
    if (index >= localFirstFrameCount) return;

    const entries = collectFirstFrameEntries(firstFrameField);
    if (!entries.length || index < 0 || index >= entries.length) return;

    entries.splice(index, 1);
    handleFirstFrameChange({
      value: entries.map((entry) => entry.name),
      file_path: entries.map((entry) => entry.path),
    });
  },
  [firstFrameField, handleFirstFrameChange, localFirstFrameCount],
);

// 在替换操作中检查
const handleReferenceReplace = useCallback(
  async (index: number) => {
    // 不允许替换上游图片
    if (index >= localReferenceCount) return;

    if (isReferenceUploadPending) return;
    // ... 执行替换逻辑
  },
  [isReferenceUploadPending, localReferenceCount],
);
```

##### Step 6: UI中标记上游图片

```tsx
{combinedFirstFramePreviews.map((preview, index) => {
  const isUpstream = index >= localFirstFrameCount;

  return (
    <div key={preview.id} className="...">
      <img src={preview.imageSource} alt="..." />

      {/* 操作按钮 */}
      <div className="...">
        <button
          onClick={() => handleSetPrimaryFirstFrame(index)}
          disabled={isUpstream}  {/* 禁用上游图片操作 */}
        >
          设为首帧
        </button>

        <button
          onClick={() => handleFirstFrameRemove(index)}
          disabled={isUpstream}  {/* 禁用删除 */}
        >
          删除
        </button>
      </div>
    </div>
  );
})}
```

##### Step 7: 预览面板传递上游图片

```tsx
<DoubaoPreviewPanel
  nodeId={data.id}
  componentName={data.type}
  appearance="videoGenerator"
  referenceImages={combinedFirstFramePreviews}  {/* 传递合并后的列表 */}
  onRequestUpload={openFirstFrameDialog}
/>
```

---

### 五、其他优化改动

#### 1. Vite构建配置优化

**文件**: `src/frontend/vite.config.mts`

```typescript
export default defineConfig(({ mode }) => {
  return {
    // ...其他配置

    build: {
      outDir: "build",
      chunkSizeWarningLimit: 2000,
      target: 'es2015',
      minify: false,  // 完全禁用压缩，提升稳定性
      rollupOptions: {
        output: {
          interop: 'auto',
          manualChunks: undefined,        // 禁用代码分割
          inlineDynamicImports: true,     // 内联动态导入
          format: 'es',
          compact: false,                 // 保留变量名
        },
        treeshake: false,                 // 禁用优化
        external: [],
      },
      sourcemap: false,                   // 禁用源码映射
    },
  };
});
```

#### 2. 组件命名统一

**文件**: `src/frontend/src/CustomNodes/GenericNode/index.tsx`

```typescript
// 更新组件描述
const DOUBAO_DEFAULT_DESCRIPTIONS: Record<string, Array<string>> = {
  DoubaoVideoGenerator: [
    "调用视频创作接口，支持文生视频和图生视频，可自定义模型、提示词与分辨率等参数。",
  ],
  DoubaoTTS: [
    "调用音频合成双向流式接口，将文本转换为语音。",
  ],
};

// 删除节点限制
<div className="nopan nodelete noflow relative cursor-auto">
  {/* 移除了 nodrate 类 */}
</div>
```

#### 3. 文档更新

**README.md**:
```markdown
## 豆包AI组件

- **DoubaoTTS** - 音频合成  （原：豆包语音合成）
- **DoubaoVideoGenerator** - 豆包视频生成
- **DoubaoImageCreator** - 即梦图片创作（Seedream 4.0/4.5）
```

**start-langflow-dev.md**:
```markdown
#### 3. 音频合成  （原：豆包语音合成 v3）

#### 4. 视频创作  （原：豆包文生视频）

# 音频合成  （原：# 豆包语音合成）
TS_APP_ID=...
TS_TOKEN=...
```

---

## 测试验证

### ✅ 功能测试清单

#### 1. 尾帧图片功能
- [ ] 上传尾帧图片
- [ ] 设置候选图为尾帧
- [ ] 清除尾帧
- [ ] 首尾帧视频生成
- [ ] 不支持尾帧的模型自动禁用功能

#### 2. 模型限制系统
- [ ] 切换模型时自动调整分辨率
- [ ] 时长超出范围自动修正
- [ ] 禁用选项显示"（不支持）"
- [ ] 使用尾帧时自动切换支持的模型

#### 3. 自动连线功能
- [ ] 点击"首帧生成视频"创建并连接节点
- [ ] 点击"首尾帧生成视频"创建两个节点并连接
- [ ] 自动布局位置正确
- [ ] 显示"已自动连线"提示

#### 4. 上游图片集成
- [ ] 从上游DoubaoImageCreator继承参考图
- [ ] 从上游DoubaoVideoGenerator继承首帧
- [ ] 本地和上游图片合并显示
- [ ] 上游图片不可删除/替换
- [ ] 图片去重功能正常

#### 5. UI交互
- [ ] 参数禁用状态显示正确
- [ ] 空预览面板显示可点击按钮
- [ ] 按钮点击触发正确动作
- [ ] 上游图片有正确标识

#### 6. 构建配置
- [ ] Vite构建成功
- [ ] 生产环境正常运行
- [ ] 无构建错误或警告

### 🐛 已知问题检查

1. **模型兼容性**
   - 检查 `MODEL_LIMITS` 配置是否与最新API文档一致
   - 验证每个模型的支持参数范围

2. **边缘情况**
   - 上游节点为空时的处理
   - 同时连接多个上游节点
   - 快速切换模型时的状态同步

3. **性能考虑**
   - 大量图片时的去重性能
   - 频繁切换模型时的重新渲染

---

## 开发注意事项

### ⚠️ 关键点

1. **类型安全**
   - 所有新增的字段都要添加完整的类型定义
   - 使用 `useMemo` 和 `useCallback` 优化性能

2. **状态管理**
   - 使用 `skipSnapshot: true` 避免不必要的状态快照
   - 确保状态更新在正确的时机执行

3. **错误处理**
   - 自动连线失败时显示明确的错误信息
   - API调用失败时的降级处理

4. **向后兼容**
   - 所有新功能都是可选的
   - 旧的工作流继续正常工作

5. **代码复用**
   - `buildFirstFramePreviewItems`、`dedupePreviews` 等工具函数在多个组件中复用

### 📚 相关文档

- Seedance模型API文档：`Seedance系列模型接入文档.md`
- 项目架构文档：`IFLOW.md`
- 启动指南：`start-langflow-dev.md`

---

## 提交规范

建议的提交信息格式：

```
feat(video-generator): 添加尾帧图片支持

- 新增尾帧图片输入字段
- 实现首尾帧视频生成
- 添加模型限制系统
- 支持上游节点图片继承
- 实现自动连线功能

🤖 Generated with Claude Code
```

---

## 总结

本文档详细记录了视频创作功能的所有改动，包括：

- ✅ **尾帧图片支持** - 完整的前后端实现
- ✅ **模型限制系统** - 智能参数约束和验证
- ✅ **自动连线功能** - 一键创建并连接节点
- ✅ **上游图片集成** - 链式创作支持
- ✅ **UI优化** - 提升用户体验

按照本文档的步骤，AI助手可以在远程仓库的基础上完整重现所有功能。

**总代码量**: +2461行，-177行，共16个文件修改

**预计耗时**: 4-6小时（包含测试）

**优先级**: 高 - 建议尽快合并到主分支
