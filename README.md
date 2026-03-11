# LangFlow 精简版（Doubao 定制）

![Langflow logo](./docs/static/img/langflow-logo-color-black-solid.svg)

本项目是基于 LangFlow 的定制版本，重点面向 Doubao 相关能力（图像/视频/TTS）和本地开发体验优化。

如果你是要把它部署到服务器给真实用户使用，不要直接使用 `start_service.py` 这一类开发脚本。
生产部署请看 `docker/DEPLOYMENT.md`、`docker/production.docker-compose.yml`，以及 `docker/nginx.langflow.conf.example` / `docker/Caddyfile.example`。

如果你的协作者第一次接触这个仓库，建议先看完本文的：
- `快速启动`（先跑起来）
- `两种启动模式差异`（避免登录和数据库混淆）
- `目录导览`（知道代码在哪）
- `常见问题`（遇到问题快速定位）

## 1. 项目定位（先看懂它是什么）

和原版 LangFlow 相比，这个仓库主要做了三类定制：

1. 组件侧定制：
- 重点集成了 Doubao 相关组件，位于 `src/lfx/src/lfx/components/doubao/`
- 目前核心组件：`DoubaoImageCreator`、`DoubaoVideoGenerator`、`DoubaoTTS`

2. 启动与开发流程定制：
- 提供一键开发启动脚本（自动清缓存、检查依赖、构建前端、同步静态文件、启动服务）
- 支持两种模式：
  - `start_service.py`：自动登录模式（适合本地开发）
  - `start_service_admin.py`：管理员登录模式（适合权限/登录流程验证）

3. 目录与运行时文件规范化：
- 代码、配置、脚本留在根目录和标准子目录
- 运行时数据库统一收敛到 `data/runtime/`（避免根目录被 `.db` 文件污染）

## 2. 环境要求

- Python：`3.10 ~ 3.13`（来自 `pyproject.toml` 的 `>=3.10,<3.14`）
- Node.js：建议 `20 LTS` 或 `22 LTS`
- npm：用于前端构建
- uv：**必需**（启动脚本会自动检测并安装）
- 操作系统：Windows / macOS / Linux

说明：
- 在 Windows 上，若使用 Node.js 23+，构建可能出现原生依赖崩溃；推荐回退到 20/22 LTS。
- uv 是本项目的依赖管理工具，首次运行 `python start_service.py` 时，如果检测到 uv 未安装，脚本会**自动安装**。你也可以手动安装：
  - Windows：`powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"`
  - macOS/Linux：`curl -LsSf https://astral.sh/uv/install.sh | sh`

## 3. 快速启动

### 3.1 自动登录模式（开发默认）

```bash
python start_service.py
```

启动后访问：`http://localhost:7860`

- 默认数据库：`PostgreSQL`
- 默认连接串：`postgresql://langflow:langflow@127.0.0.1:5433/langflow`

脚本会自动执行以下步骤：
1. 清理缓存与组件索引缓存
2. **自动检测并安装 uv**（如果未安装）
3. 执行 `uv sync --extra postgresql` 安装 Python 依赖和 PostgreSQL 驱动
4. 加载仓库根目录 `.env`
5. 检查 PostgreSQL 是否可连通；若未显式配置数据库，会自动尝试启动 `docker/postgres.docker-compose.yml`
6. 前端依赖安装与构建（按需）
7. 同步 `src/frontend/build` 到后端静态目录
8. 设置开发环境变量并启动 LangFlow

说明：
- `start_service.py` 不再默认回退到 SQLite。
- 如果你在 `.env` 里写了 `LANGFLOW_DATABASE_URL=sqlite://...`，脚本会直接报错，防止历史记录、并发写入和多用户隔离再次退回旧问题。
- 如果你不想用本地 Docker PostgreSQL，可以直接在 `.env` 或系统环境变量里设置你自己的 `LANGFLOW_DATABASE_URL`。

### 3.2 管理员登录模式（需要真实登录流程时使用）

```bash
python start_service_admin.py --admin-username admin
```

首次会提示输入管理员密码（如果没有通过参数或环境变量传入）。

- 默认数据库：`PostgreSQL`
- 默认连接串：`postgresql://langflow:langflow@127.0.0.1:5433/langflow`

常用参数：

```bash
python start_service_admin.py --admin-username admin --admin-password 123456
python start_service_admin.py --port 7861
python start_service_admin.py --db-path ./data/runtime/custom_admin.db
python start_service_admin.py --reset-db
python start_service_admin.py --skip-clean
python start_service_admin.py --skip-frontend
```

管理员模式启动后常用地址：
- 页面地址：`http://127.0.0.1:<port>`
- 管理员登录入口：`http://127.0.0.1:<port>/login/admin?force=1`

### 3.3 两种启动模式差异

| 维度 | `start_service.py` | `start_service_admin.py` |
|---|---|---|
| 登录行为 | 自动登录（`LANGFLOW_AUTO_LOGIN=true`） | 需要管理员账号登录（`LANGFLOW_AUTO_LOGIN=false`） |
| 适用场景 | 日常开发联调 | 登录/权限相关验证 |
| 默认数据库 | 默认 PostgreSQL | 默认 PostgreSQL |
| 可选参数 | 无 | 支持 `--port`、`--database-url` 等；旧的 `--db-path`、`--reset-db` 已废弃 |

## 4. 环境变量配置（.env）

1. 复制模板：

```bash
cp .env.example .env
```

2. 你最常改的变量一般是这些：

- 服务相关：
  - `LANGFLOW_PORT`
  - `LANGFLOW_HOST`
  - `LANGFLOW_LOG_LEVEL`
  - `LANGFLOW_DATABASE_URL`
  - `LANGFLOW_STORAGE_TYPE`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_DB`
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `LANGFLOW_S3_BUCKET_NAME`
  - `LANGFLOW_S3_REGION`
  - `LANGFLOW_S3_ENDPOINT_URL`
  - `LANGFLOW_S3_ACCESS_KEY_ID`
  - `LANGFLOW_S3_SECRET_ACCESS_KEY`
  - `LANGFLOW_S3_ROOT_PREFIX`
  - `LANGFLOW_S3_PUBLIC_BASE_URL`

- 模型/网关相关（按需配置）：
  - `ARK_API_KEY`
  - `DASHSCOPE_API_KEY`
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY` / `GOOGLE_API_KEY`

补充说明：
- `DoubaoImageCreator`、`DoubaoVideoGenerator`、`DoubaoTTS` 会优先读取组件输入中的 key；留空时读取对应环境变量。
- 管理员启动脚本默认不显式传 `--env-file`，但 LangFlow 仍会尝试加载附近 `.env`（不会覆盖已设置的关键环境变量）。

## 5. 目录导览（新协作者重点）

```text
.
|- src/
|  |- backend/base/langflow/              # 后端主代码（API、服务、数据库等）
|  |- frontend/                           # 前端工程（React/Vite）
|  |- lfx/src/lfx/                        # 组件与运行时核心逻辑
|  |  |- components/doubao/               # Doubao 定制组件
|- scripts/                               # 辅助脚本（缓存清理、构建、CI）
|- docs/                                  # 文档站点与项目文档
|- docker/                                # Docker 构建与部署
|- data/runtime/                          # 运行时数据库、临时状态文件（不提交）
|- start_service.py                       # 自动登录开发启动脚本
|- start_service_admin.py                 # 管理员登录启动脚本
|- .env.example                           # 环境变量模板
|- README.md                              # 当前文档
```

推荐阅读顺序（给新同学）：
1. 先看本文 `快速启动` 跑通页面
2. 再看 `start_service.py` 和 `start_service_admin.py` 了解启动链路
3. 再看 `src/lfx/src/lfx/components/doubao/` 了解定制组件
4. 最后按需查看 `docs/` 和 `scripts/`

## 6. 运行数据与清理规范

当前规范：
- 运行时数据库放在 `data/runtime/`
- 根目录不要保留 `*.db`、`__pycache__`、临时预览文件等运行产物

常用清理命令（PowerShell）：

```powershell
Remove-Item -Recurse -Force __pycache__, .pytest_cache, .ruff_cache -ErrorAction SilentlyContinue
```

清理管理员数据库（危险操作）：

```bash
python start_service_admin.py --reset-db
```

## 7. 常见问题（协作者最常问）

### Q1：到底怎么启动？

A：就一条命令，首次运行会自动安装 uv 和所有依赖：
```bash
python start_service.py
```
- 日常开发：`python start_service.py`
- 登录/权限联调：`python start_service_admin.py`

首次运行时，脚本会自动检测并安装 uv（Python 依赖管理工具），然后执行 `uv sync --extra postgresql` 安装依赖，并确保连接到 PostgreSQL。你不需要再手动切回 SQLite。

如果本机没有可用 PostgreSQL，`start_service.py` 会优先尝试拉起 `docker/postgres.docker-compose.yml` 中的本地数据库容器。

### Q2：端口 7860 被占用怎么办？

A：
1. 先停掉占用进程，或设置环境变量 `LANGFLOW_PORT`
2. 管理员模式也可以直接传 `--port 7861`
3. 自动登录脚本会在 7860 被占用时尝试 7861~7910 内可用端口

### Q3：页面白屏或前端资源异常怎么办？

A：
1. 删除 `src/frontend/build` 后重启脚本
2. 确认 Node 版本（建议 20/22 LTS）
3. 确认脚本构建后已同步到后端静态目录

### Q4：组件里提示 API Key 缺失？

A：检查 `.env` 是否配置了对应 key，例如：
- `ARK_API_KEY`
- `DASHSCOPE_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY` / `GOOGLE_API_KEY`

### Q5：组件改了但界面没更新？

A：
1. 重新运行启动脚本（脚本会清理组件缓存）
2. 必要时手动执行组件缓存清理脚本：`python -m scripts.clear_component_cache`

### Q6：内测和商业化部署时，文件存储应该怎么配？

A：
- 单机小规模内测：可以先用 `LANGFLOW_STORAGE_TYPE=local`
- 多用户、要上服务器、后续商业化：改成 `LANGFLOW_STORAGE_TYPE=s3` 或 `LANGFLOW_STORAGE_TYPE=minio`

MinIO 示例：

```env
LANGFLOW_STORAGE_TYPE=s3
LANGFLOW_S3_BUCKET_NAME=langflow-media
LANGFLOW_S3_ENDPOINT_URL=http://127.0.0.1:9000
LANGFLOW_S3_ACCESS_KEY_ID=minioadmin
LANGFLOW_S3_SECRET_ACCESS_KEY=minioadmin
LANGFLOW_S3_ROOT_PREFIX=prod
LANGFLOW_S3_ADDRESSING_STYLE=path
LANGFLOW_S3_USE_SSL=false
LANGFLOW_S3_VERIFY_SSL=false
```

说明：
- 现在的 S3 存储实现支持 AWS S3 和 MinIO 这类 S3 兼容对象存储
- 生成图片/视频的预览访问会自动走对象存储预签名 URL 或你配置的 `LANGFLOW_S3_PUBLIC_BASE_URL`
- 对于需要本地文件路径的组件，服务端会把对象临时落到本地缓存后再处理，不会因为用了对象存储就直接失效

## 8. 你可以直接用的协作流程

1. 拉取代码后，先运行 `python start_service.py`
2. 页面能打开后，再开始改组件或后端逻辑
3. 改完先本地验证，再发 PR
4. 如涉及登录/权限，补跑一次 `python start_service_admin.py`

## 9. 相关文档

- 环境变量模板：`.env.example`
- 安全策略：`SECURITY.md`
- 发布说明：`RELEASE.md`
- Docker 文档：`docker/README.md`
