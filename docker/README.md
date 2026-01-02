# Docker 部署指南（服务器/生产）

本仓库的 Langflow 是“自定义版”（包含 `lfx` 及其组件索引），如果你需要左侧栏显示 **图片创作（DoubaoImageCreator）**，请不要直接用官方镜像 `langflowai/langflow:*`，而是使用本仓库构建出来的镜像（或你自己的 custom 镜像）。

## 推荐：Docker Compose + pgvector Postgres

使用 `docker/production.docker-compose.yml`，它已经默认切换到 `pgvector/pgvector:pg16`，并将宿主机 PostgreSQL 端口默认映射为 `5433`，避免和服务器上已有 PostgreSQL 冲突。

1. 在服务器上创建 `.env`（与 `docker/production.docker-compose.yml` 同目录，或通过 `--env-file` 指定）：

   - `LANGFLOW_PORT=7860`
   - `POSTGRES_USER=langflow`
   - `POSTGRES_PASSWORD=请换成强密码`
   - `POSTGRES_DB=langflow`
   - `POSTGRES_PORT=5433`（如果宿主机 5432 已被占用；不需要宿主机直连数据库可删除 ports 映射）
   - `SECRET_KEY=请换成随机长字符串`
   - `SUPERUSER_USERNAME=admin`
   - `SUPERUSER_PASSWORD=请换成强密码`

2. 启动：

   - `docker compose -f docker/production.docker-compose.yml up -d`

3. 访问：

   - `http://<server-ip>:${LANGFLOW_PORT:-7860}`

## 常见问题排查

### 1) 左侧栏看不到“图片创作”组件

这通常是“镜像不是自定义版 / 没带 lfx 组件”导致的。进入容器做 3 个检查：

- `docker exec -it langflow-app python -c "import lfx; import lfx.components.doubao.doubao_image_creator; print('lfx doubao ok')"`
- `docker exec -it langflow-app python -c "import inspect, pathlib, lfx; p=pathlib.Path(inspect.getfile(lfx)).parent/'_assets'/'component_index.json'; print(p, p.exists())"`
- `docker exec -it langflow-app python -c "import importlib.metadata as m; print('langflow', m.version('langflow'))"`

如果 `lfx.components.doubao...` 无法 import，请确认你使用的是本仓库构建的镜像（例如使用 `docker/production.Dockerfile` 构建），而不是官方 `langflowai/langflow`。

### 2) Supabase Postgres 的 peer 认证导致页面打不开/后端连不上数据库

不建议用 `public.ecr.aws/supabase/postgres:*` 作为 Langflow 的内置数据库容器（你之前遇到的 peer 认证问题就来自这里）。建议改用：

- `pgvector/pgvector:pg16`（已在 `docker/production.docker-compose.yml` 默认采用）

如果你必须连接“外部 Supabase 数据库”（而不是跑 Supabase 的 Docker 镜像），请确保你的 `LANGFLOW_DATABASE_URL` 使用 TCP 连接字符串，且包含 host/port，例如：

- `postgresql://USER:PASSWORD@HOST:5432/DBNAME`

当 URL 写成 `postgresql://USER:PASSWORD@/DBNAME`（没有 host）时，客户端会尝试走 Unix Socket，从而触发 `peer` 认证相关错误。

### 3) 容器 PostgreSQL 与系统 PostgreSQL 冲突

表现通常是 `bind: address already in use` 或者数据库端口无法映射。

推荐做法：

- **不需要宿主机直连数据库**：直接删除 `postgres` 服务的 `ports:` 映射，仅让 Langflow 通过 Docker 网络访问 `postgres:5432`。
- **需要宿主机直连数据库**：把宿主机端口改成 `5433`（本仓库 compose 已默认 `POSTGRES_PORT:-5433`），容器内仍然是 `5432`。

