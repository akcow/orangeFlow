# LangFlow 开发服务启动指南

## 🚀 快速启动

### 1. 停止所有现有服务
```bash
# Windows 命令
tasklist | findstr python
for /f "tokens=*" %i in ('tasklist /fi "IMAGENAME eq python.exe" ^| findstr "python.exe"') do (
    if not "%%i"=="" (
        taskkill /f /im python.exe /pid "%%~i" >nul 2>&1
    )
)
```

### 2. 清理所有缓存
```bash
# 进入项目目录
cd langflow-pro

# 清理前端缓存
rm -rf src/frontend/.vite
rm -rf src/frontend/node_modules/.vite

# 清理后端缓存
rm -rf src/backend/base/__pycache__
rm -rf src/backend/base/langflow/__pycache__

# 清理LFX组件缓存
rm -rf src/lfx/src/lfx/__pycache__

# 清理构建缓存
rm -rf src/frontend/build

# 清理组件索引缓存（必须，避免旧仓库的 component_index.json 覆盖当前代码）
python -m scripts.clear_component_cache
# 或手动删除 %LOCALAPPDATA%\langflow\lfx\Cache\component_index.json
# 手动路径示例：C:\Users\<用户名>\AppData\Local\langflow\lfx\Cache\component_index.json
```

### 3. 重新构建前端
```bash
cd src/frontend
npm run build
```

### 4. 同步前端文件到后端
```bash
# PowerShell 命令
Copy-Item -Path "src/frontend/build/*" -Destination "src/backend/base/langflow/frontend/" -Recurse -Force
```

### 5. ??LangFlow??

???? `start_service.py`????? 2-4????? %LOCALAPPDATA%\langflow\lfx\Cache\component_index.json????

```bash
python start_service.py
```

?????

- ?? `.vite`?`__pycache__`?`src/frontend/build` ????
- ?? `npm run build` ?? `src/frontend/build` ??? `src/backend/base/langflow/frontend`
- ?? `PYTHONPATH`?`LANGFLOW_COMPONENTS_PATH`?`LANGFLOW_SKIP_AUTH_AUTO_LOGIN=true`?`LFX_DEV=1`
- ? `python -m langflow run --host 0.0.0.0 --port 7860` ????

????? `start_service.py` ?????

## 🎯 功能特性

### ✅ 当前状态
- **服务地址**: http://localhost:7860
- **自动登录**: 已禁用（开发模式）
- **豆包组件**: 已加载并配置
- **LFX组件系统**: 已激活
- **前端常驻预览**: 已启用

### 📋 完整豆包组件列表

#### 1. 即梦图片创作 (DoubaoImageCreator)
- **功能**: 统一文生图、图生图、多图融合与组图输出能力。
- **模型**: Seedream 4.5 · 旗舰 (doubao-seedream-4-5-251128)、Seedream 4.0 · 灵动 (doubao-seedream-4-0-250828)。
- **界面字段**（严格只展示以下 8 项）：
  1. 实时预览框（支持组图翻页、放大查看、下载）
  2. 模型选择（4.0/4.5）
  3. 提示词输入（支持多行及上游 Message/Data/Text）
  4. 图像分辨率（1K/2K/4K）
  5. 图像比例（1:1、3:4、4:3、16:9、9:16、3:2、2:3）
  6. 生成张数（1～6，>1 时自动进入组图模式）
  7. 图片上传（多选按钮，点击后弹出中文指引的选择界面，可上传 1–14 张参考图）
  8. API Key 输入（默认为 .env 中的 ARK_API_KEY）
- **隐藏参数**: `watermark=false`、`sequential_image_generation=auto`，无需在 UI 中暴露。
- **输出**:
  - `generated_images` 数组（包含 URL、Base64 预览、尺寸信息）
  - `doubao_preview` 结构（前端实时预览、翻页、下载所需）
- **特色**:
  - 自动校准分辨率/比例，确保满足 Seedream 4.x 像素区间限制
  - 参考图既可来自本地多选上传，也可由上游节点传入
  - 实时预览框支持组图翻页 + 弹窗放大，满足“实时预览框支持组图翻页”的需求
  - 按生成张数自动配置 sequential_image_generation_options，实现顺序组图输出

#### 3. 音频合成 (DoubaoTTS)
- **功能**: 将文本转换为高质量语音
- **技术**: DashScope Qwen-TTS（Qwen3-TTS-Flash）
- **音色选择**（49种音色）: 下拉选项悬停可查看音色描述
- **主要参数**:
  - 合成文本（必需）
  - DashScope API Key（可在节点中配置，或使用环境变量 DASHSCOPE_API_KEY）
  - 音色（必需）
  - 保存音频文件（可选）
- **输出**: WAV 格式的音频数据和 Base64 编码
- **特色**: 支持多语种，24kHz 采样率，`language_type=Auto`

#### 4. 视频创作 (DoubaoVideoGenerator)
- **功能**: 根据文本生成高质量视频
- **模型**: Doubao-Seedance-1.0-pro-fast｜251015
- **主要参数**:
  - 视频生成提示词（必需）
  - 视频分辨率（480p/720p/1080p，默认1080p）
  - 视频时长（2-12秒，默认5秒）
  - 固定镜头模式（可选）
  - 添加水印（默认开启）
  - 启用预览（默认开启）
- **输出**: 视频URL、封面图片和详细信息
- **特色**: 异步任务处理，状态轮询，封面预览生成
- **支持**: 纯文生视频、图生视频（提供首帧图片时）

### 🔧 组件通用配置

#### 环境变量配置
```bash
# 豆包图片编辑/生成
ARK_API_KEY=your_doubao_api_key_here

# 音频合成
DASHSCOPE_API_KEY=your_dashscope_api_key_here
```

#### API密钥获取方式
1. **豆包图像服务**:
   - 访问豆包控制台
   - 开通图像生成和图像编辑服务
   - 获取ARK_API_KEY

2. **音频合成**:
   - 访问火山引擎语音合成v3页面
   - 创建应用获取App ID（纯数字格式）
   - 生成Access Token（任意格式）
   - 配置资源ID: volc.service_type.10029

### ⚡ 性能优化建议

#### 图片组件优化
- 建议使用512的倍数作为图片尺寸
- 预览功能会增加内存使用，大文件可关闭
- 编辑图片时，引导强度使用默认值5.5效果最佳

#### 语音组件优化
- 单次文本建议控制在500字以内
- WebSocket连接失败时检查网络和防火墙设置
- MP3格式适合大多数场景，24kHz采样率平衡质量和大小

#### 视频组件优化
- 1080p分辨率提供最佳质量，但生成时间较长
- 短视频（2-5秒）生成速度更快
- 首帧图片可有效控制视频起始内容
- 轮询间隔3秒平衡实时性和服务器压力

### 🔍 豆包图片编辑组件使用

1. **创建新流程**: 点击 "+" 创建新的流程
2. **添加豆包组件**: 在组件库中搜索 "豆包图片编辑"
3. **组件配置**:
   - 模型名称: 选择 "Doubao-SeedEdit-3.0-i2i｜250628"
   - 图片编辑提示词: 输入你想要的编辑描述
   - 原图片URL: 输入要编辑的图片地址
   - API密钥: 可在节点中配置，或使用环境变量 ARK_API_KEY
   - 启用预览: 启用以查看编辑后的图片预览

4. **组件输出**:
   - 编辑结果: 包含编辑后的图片URL和预览数据
   - 预览功能: 自动生成base64编码的图片预览

## 🚨 故障排除

### 问题1: 页面白屏 (最常见问题)
**现象**: 访问 http://localhost:7860 显示空白页面，但检查网络请求发现 assets/*.js 返回的是 HTML 而不是 JavaScript 文件。

**根本原因**: 环境变量未正确设置，LangFlow 从全局安装位置读取前端资源，而不是使用我们构建的前端文件。

**详细分析**:
1. 直接访问 `http://127.0.0.1:7860/assets/index-*.js` 得到的是 HTML（约 1142 字节）而不是 JS 文件
2. FastAPI 的 SPA fallback 把首页又回传了一遍
3. 浏览器加载不到任何 React 代码，导致白屏

**原因追踪**: 使用混合了 Bash (`export`) 和 cmd (`&& ^`) 的语法，导致在 PowerShell 中这些命令被当成普通字符串，环境变量完全没有设置成功。

**立即解决**:
1. **停止当前服务**: `Ctrl + C`
2. **使用正确的方法启动** (见上文第5步的任一方法)
3. **验证环境变量设置**:
   ```powershell
   echo $env:PYTHONPATH
   echo $env:LANGFLOW_COMPONENTS_PATH
   ```

**预防措施**:
- 使用 PowerShell 脚本或批处理文件
- 不要混合使用不同 shell 的语法
- 确保路径指向当前仓库，而不是旧的全局安装

### 问题2: 页面显示异常（色块、图形错乱）
**解决方案**:
1. **强制刷新浏览器**: `Ctrl + Shift + R`
2. **清除浏览器缓存**:
   - Chrome: `Ctrl + Shift + Delete`
   - 或按 `F12` -> 右键刷新按钮 -> "清空缓存并硬性重新加载"
3. **使用无痕模式**: `Ctrl + Shift + N`

### 问题3: 连接被拒绝 (localhost 拒绝连接)
**解决方案**:
1. **检查端口占用**:
   ```bash
   netstat -ano | findstr ":7860"
   ```
2. **使用完整脚本**: 运行上面的 `python start_service.py`
3. **检查环境变量**: 确保 PYTHONPATH 和 LANGFLOW_COMPONENTS_PATH 正确设置

### 问题4: 组件未找到
**解决方案**:
1. **检查组件路径**:
   ```bash
   echo %LANGFLOW_COMPONENTS_PATH%
   ```
2. **重新加载组件**: 在LangFlow界面中点击 "刷新" 按钮
3. **检查文件权限**: 确保组件目录可读

## 🔧 开发调试

### 启用开发模式
```bash
# 在启动命令中添加
set LANGFLOW_DEBUG=true
set LANGFLOW_LOG_LEVEL=debug
```

### 查看日志
```bash
# 日志文件位置
# Windows: %APPDATA%\langflow\logs\
# 或者在控制台输出中查看实时日志
```

## 📝 验证清单

启动后请确认以下项目：

- [ ] http://localhost:7860 可以正常访问
- [ ] **页面正常显示（非白屏）** - 检查浏览器开发者工具网络标签页，确认 assets/*.js 文件返回的是 JavaScript 而非 HTML
- [ ] 页面显示正常的LangFlow界面（无色块或错乱图形）
- [ ] 豆包图片编辑组件在组件库中可见
- [ ] 可以创建包含豆包组件的新流程
- [ ] 豆包组件的预览功能正常工作
- [ ] 控制台无严重错误信息
- [ ] **环境变量验证**：
  ```powershell
  echo $env:PYTHONPATH      # 应包含当前仓库的 backend/base 和 lfx/src 路径
  echo $env:LANGFLOW_COMPONENTS_PATH  # 应包含当前仓库的 lfx/components 路径
  ```

## 🔄 日常开发流程

### 修改代码后重启
1. 修改LFX组件代码
2. 停止当前服务: `Ctrl + C`
3. 清理Python缓存: `rm -rf src/lfx/src/lfx/__pycache__`
4. 重新启动: 运行启动脚本或完整命令

### 更新组件
1. 修改组件文件后，LangFlow会自动重新加载
2. 如需强制刷新: 在界面中点击刷新按钮
3. 检查组件输出: 在组件的输出面板查看结果

## 📚 组件开发注意

### 豆包组件路径
- **组件文件**: `src/lfx/src/lfx/components/doubao/`
- **主要文件**:
  - `doubao_image_generator.py` - 图片生成
  - `doubao_image_editor.py` - 图片编辑
  - `__init__.py` - 组件注册

### 修改组件
1. **编辑组件文件**后，自动重新加载
2. **测试功能**: 在流程中测试组件
3. **检查日志**: 查看组件初始化和执行日志

---

## 🎉 总结

按照本指南启动的LangFlow服务将包含：
- ✅ 正确的环境配置
- ✅ 完整的豆包图片编辑组件
- ✅ 前端预览功能支持
- ✅ 开发友好的调试信息
- ✅ 自动化的缓存管理

如遇到问题，请参考故障排除部分或查看控制台日志。
