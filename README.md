# LangFlow 精简版

![Langflow logo](./docs/static/img/langflow-logo-color-black-solid.svg)

[![PyPI - License](https://img.shields.io/badge/license-MIT-orange)](https://opensource.org/licenses/MIT)
[![GitHub star chart](https://img.shields.io/github/stars/langflow-ai/langflow?style=flat-square)](https://star-history.com/#langflow-ai/langflow)

**LangFlow 精简版** 是一个基于 LangFlow 的定制化 AI 工作流平台，专门针对豆包 AI 组件进行了优化和集成。

## 🎯 项目特色

- **🎨 8个核心组件** - 精选的输入输出组件，专注核心功能
- **🤖 豆包AI集成** - 集成 DoubaoTTS、DoubaoVideoGenerator、DoubaoImageCreator 等豆包AI服务
- **🌐 简洁界面** - 清爽的组件展示，专为豆包AI优化的图标和分类
- **⚡ 快速启动** - 一键启动，开箱即用
- **🔧 精简配置** - 移除冗余功能，专注核心体验

## 🚀 快速开始

### 系统要求

- Python 3.10–3.13
- 操作系统：Windows / Linux / macOS

### 启动方式

#### 方式一：Windows 用户（推荐）

双击运行 `启动LangFlow.bat` 文件，或在命令行中执行：

```batch
cd langflow-pro
启动LangFlow.bat
```

#### 方式二：Python 直接启动

```bash
cd langflow-pro
python start_service.py
```

#### 方式三：Linux/macOS 用户

```bash
cd langflow-pro
./启动LangFlow.sh
```

### 访问应用

启动成功后，在浏览器中访问：**[http://localhost:7860](http://localhost:7860)**

## 🎨 核心组件

### 输入输出组件

- **TextInput** - 文本输入组件
- **ChatInput** - 对话输入组件
- **TextOutput** - 文本输出组件
- **ChatOutput** - 对话输出组件

### 豆包AI组件

- **DoubaoTTS** - 音频合成
- **DoubaoVideoGenerator** - 视频创作
- **DoubaoImageCreator** - 即梦图片创作（Seedream 4.0/4.5 文生图、图生图、组图预览）

## ⚙️ 配置说明

### 环境变量配置

复制 `.env.example` 为 `.env` 并根据需要修改配置：

```bash
cp .env.example .env
```

主要配置项：

- `LANGFLOW_PORT` - 服务端口（默认：7860）
- `LANGFLOW_HOST` - 监听地址（默认：0.0.0.0）
- `LANGFLOW_LOG_LEVEL` - 日志级别（默认：info）

### 停止服务

- 按 `Ctrl+C` 停止前台服务
- 或直接关闭命令行窗口

## ❓ 常见问题

### Q: 端口 7860 被占用怎么办？

A: 修改 `start_service.py` 中的端口号，或通过 `.env` 文件设置 `LANGFLOW_PORT`

### Q: 组件不显示？

A: 检查白名单配置和组件注册是否正确

### Q: 服务启动失败？

A: 检查 Python 环境和依赖是否正确安装

### Q: 如何添加自定义组件？

A: 参考 [DEVELOPMENT.md](./DEVELOPMENT.md) 中的组件开发指南

## 📁 项目结构

```text
langflow-pro/
├── src/                    # 源代码目录
│   ├── backend/base/      # 后端基础代码
│   └── lfx/src/           # LangFlow 核心代码
├── start_service.py       # 主启动脚本
├── 启动LangFlow.bat       # Windows 批处理启动
├── 启动LangFlow.sh        # Linux/macOS 启动脚本
├── .env.example           # 环境变量模板
├── README.md              # 项目说明文档
└── venv/                  # Python 虚拟环境
```

## 🔗 相关链接

- [LangFlow 官方文档](https://docs.langflow.org/)
- [LangFlow GitHub 仓库](https://github.com/langflow-ai/langflow)
- [开发指南](./DEVELOPMENT.md)
- [贡献指南](./CONTRIBUTING.md)
- [安全政策](./SECURITY.md)

## 📄 许可证

本项目基于 MIT 许可证开源，详见 [LICENSE](./LICENSE) 文件。

## 🤝 贡献

欢迎贡献代码！请阅读 [贡献指南](./CONTRIBUTING.md) 了解如何参与项目开发。

---

**🎉 现在开始使用 LangFlow 精简版吧！**
