# 常驻预览框按钮：自动创建节点 + 自动连线 + 信息传输（开发指南）

本文总结本次为 `TextCreation（文本创作）` 常驻预览框按钮实现的开发方式与完整踩坑修复方案，用于指导后续 AI 以同样逻辑扩展到其它组件/链路。

## 目标与约束（本次已落地）

- 点击常驻预览框按钮后：
  - 自动在画布上创建目标组件（上游/下游）。
  - 自动创建并持久化一条可运行的连线（刷新/重进项目不掉线）。
  - 连接后能把上游“预览/结果”作为下游提示词（或文本输入）参与生成。
- 布局规则：
  - 下游创建：`x + 700`，`y` 与当前节点 **顶部对齐**（同 `position.y`）。
  - 上游创建：按链路要求的偏移（本次图反推链路有特殊值；其它链路保持 700）。
  - 不触发自动分组（group）/不触发自动缩放（fitView/zoom）。
  - 如果右侧已存在且已连接的目标节点：直接选中/聚焦，不重复创建。
- 句柄与连线：
  - `TextCreation` 的 **左侧句柄**（输入）连接到下游生成组件 **左侧 input type=data 的句柄**（或目标字段对应句柄）。
  - 为了解决“未聚焦时输入框隐藏导致句柄不存在”，部分生成类组件需要始终渲染一个“prompt/text 的左侧句柄”（无需显示输入框）。

## 核心实现方式（推荐模板）

### 1）在 Layout 中处理按钮点击：创建节点 + 创建边

位置：`src/frontend/src/CustomNodes/GenericNode/components/TextCreationLayout.tsx`

通用步骤：
1. 从 store 取 `nodes/edges/setNodes/onConnect/templates/takeSnapshot`。
2. 判断是否已有目标节点且已连上：
   - 遍历 `edges`，找到 `edge.source === 当前节点` 且 `edge.target` 的组件类型匹配；
   - 同时校验 `edge.data?.sourceHandle/targetHandle`（或 `edge.sourceHandle/targetHandle`）解析后的 `name/fieldName` 是否匹配预期；
   - 若存在：`setNodes` 选中该节点并 `return`。
3. 无则创建：
   - `takeSnapshot()`；
   - `getNodeId(ComponentName)` 生成 id；
   - 从 `templates[ComponentName]` clone 新 node data；
   - 计算 `position`（偏移 + y 对齐）；
   - `setNodes` 插入并选中新节点。
4. 立即 `onConnect(...)` 创建边：
   - **不要硬编码 handle 的 type/inputTypes**，必须从模板字段读取（见下）。

### 2）Handle ID 一定要按“模板字段”生成（否则刷新必掉线）

LangFlow 的 ReactFlow handle 不是简单字符串，而是把对象 JSON 化后再做字符替换：

- `scapedJSONStringfy(handleObj)`：把 `"` 转成特殊字符（`œ`），用于存储到 edge 的 `sourceHandle/targetHandle`。
- `scapeJSONParse(str)`：把特殊字符还原为 JSON 再 parse。

相关类型：
- `src/frontend/src/types/flow/index.ts`：
  - `sourceHandleType`（右侧输出）
  - `targetHandleType`（左侧输入；可包含 `proxy`）

关键原则：
- `targetHandle` 必须使用目标节点 `node.template[fieldName]` 的：
  - `type`
  - `input_types`
  - `proxy`（如果存在必须带上）
- `sourceHandle` 必须使用源节点 outputs 的：
  - `name`（如 `text_output`、`image`）
  - `output_types`（优先用 outputs 的 types/selected 计算）
  - **不要随便带 proxy**（只有当 output 本身定义了 proxy 才带）

### 3）未聚焦句柄缺失：用“常驻句柄”解决，但不强加 UI 输入框

问题表现：
- 节点未聚焦时输入框不渲染，导致对应 input 句柄也不存在；
- 用户点击按钮虽然创建了 edge，但看不到连线/无法连接到正确字段，或连接后下游显示逻辑异常。

解决方式（本次用法）：
- 在目标生成类节点的 Layout 中，始终渲染一个该字段的左侧句柄（只渲染 Handle，不强制显示输入框）。
- 示例（音频组件已落地）：
  - `src/frontend/src/CustomNodes/GenericNode/components/DoubaoAudioLayout.tsx`
  - 通过 `promptField = template[text]` 生成 `promptHandleMeta`，并在未展开状态也渲染 `HandleRenderComponent`。

## 信息传输/运行逻辑（本次已落地）

### TextCreation：允许“预览文本直通”下游（不调用模型）

问题：
- TextCreation 既可以“输入 prompt 调模型生成”，也可以“用户直接在预览框写内容”；
- 若强制要求 prompt 非空，会导致“文生视频/文生音乐”链路必须乱填 prompt 才能跑通。

解决：
- 后端 `TextCreation.generate_text` 支持 passthrough：
  - 当 `prompt` 为空且 `draft_text`（预览文本）有值：直接把 `draft_text` 作为输出 `Data(text=...)` 返回，不调用模型。
  - 当两者都空：仍报错。
- 文件：`src/lfx/src/lfx/components/text/text_creation.py`

### 文本创作 → 视频创作：新建下游节点时自动填充 prompt 前缀（避免无法运行）

- 本次实现：新建 `DoubaoVideoGenerator` 时，将其本地 prompt 预填为固定前缀（如“根据文字描述生成视频”）。
- 目的：即使用户没手动填 prompt，也能直接运行链路。
- 文件：`src/frontend/src/CustomNodes/GenericNode/components/TextCreationLayout.tsx`

> 注意：你后续规划的“根据上游预览实时同步到下游 prompt”属于增强逻辑；本次按你的要求不做“在输入框实时展示合并后的完整文本”。

## 刷新/重进项目后断链：根因与彻底修复（重要）

现象：
- 刷新/重新进入项目后，“文字生成音乐”“图片反推提示词”等链路断开；
- 提示：`Some connections were removed because they were invalid: ...`

根因 1：`cleanEdges()` 对 handle 做严格重建比对，不一致就删边
- 加载 flow 时会调用：
  - `resetFlow()` → `detectBrokenEdgesEdges()`（提示）→ `cleanEdges()`（清理）
- `cleanEdges()` 会根据节点当前模板/outputs 重建 handle 对象，然后与 edge 上保存的 handle 字符串做 **严格相等** 比较：
  - 不一致：边会被移除（即使语义上仍然可连接）。
- 触发原因包括：
  - 你创建 edge 时硬编码了 `type/inputTypes`；
  - 组件 Layout/RenderInputParameters 对字段做了 override，导致渲染句柄与模板不一致；
  - 目标字段存在 `proxy`，但你没带上（或反之）。

根因 2：连接到了 `show=false` 的字段，`filterHiddenFieldsEdges()` 会直接删边
- `filterHiddenFieldsEdges()` 逻辑：如果目标字段在模板里 `show === false`，则边会被清理。
- 本次触发：`TextCreation.draft_text` 最初设置为 `show=False`（虽然 UI 上渲染了句柄，但模板标记隐藏）。

本次彻底修复（已落地）：
1. **不要硬编码 handle schema**：创建边时从模板字段取 `type/input_types/proxy`（例如 TTS 文本输入字段）。
   - `src/frontend/src/CustomNodes/GenericNode/components/TextCreationLayout.tsx`
2. **允许自动修复 handle schema**：在 `cleanEdges()` 中，当 handle 字符串不匹配但连接仍然合法时，自动把 edge 的 handle 更新为重建值，而不是删边。
   - `src/frontend/src/utils/reactflowUtils.ts`
3. **避免隐藏字段删边**：
   - 从源头把 `TextCreation.draft_text.show` 改为 `True`（使其成为“允许连线的字段”）。
     - `src/lfx/src/lfx/components/text/text_creation.py`
   - 对旧存量 flow 做兼容：`resetFlow()` 时强制把加载到内存的 `TextCreation.template.draft_text.show = true`，避免旧 flow 一刷新就断。
     - `src/frontend/src/stores/flowStore.ts`

## 开发其他链路时的检查清单（照此执行基本不会翻车）

1. **创建节点前先查重**：已存在且已连上的目标节点要复用并选中。
2. **position 只做平移**：不要 fitView/zoom；不要创建 group。
3. **edge 的 handle 一定来自模板**：
   - `targetHandle = { id, fieldName, type: template[field].type, inputTypes: template[field].input_types, proxy?: template[field].proxy }`
   - `sourceHandle = { id, name: output.name, dataType, output_types: 选定输出类型 }`
4. **未聚焦句柄问题**：如果目标字段输入框在未选中时不渲染，务必在 Layout 常驻渲染一个该字段的 HandleRenderComponent（不一定要显示输入框）。
5. **刷新不掉线**：
   - 不要连到 `show=false` 字段；如果必须连，模板层面把它改为 `show=true`，并给旧 flow 做兼容处理。
6. **如遇“连线存在但刷新断开”**：
   - 首先检查 edge 的 `targetHandle` 解析后 `fieldName/type/inputTypes/proxy` 是否与目标节点模板一致；
   - 检查是否存在 UI override 改了字段类型/输入类型；
   - 再看是否被 `filterHiddenFieldsEdges` 清掉。

## 本次相关关键文件索引

- 自动创建/连线按钮逻辑：`src/frontend/src/CustomNodes/GenericNode/components/TextCreationLayout.tsx`
- 音频组件常驻句柄：`src/frontend/src/CustomNodes/GenericNode/components/DoubaoAudioLayout.tsx`
- 边清理与自动修复：`src/frontend/src/utils/reactflowUtils.ts`
- 加载 flow 的清理入口（兼容旧 flow）：`src/frontend/src/stores/flowStore.ts`
- TextCreation 后端 passthrough：`src/lfx/src/lfx/components/text/text_creation.py`

