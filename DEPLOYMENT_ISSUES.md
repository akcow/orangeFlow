# OrangeFlow Docker 部署问题总结

## 部署时间
2026-03-31

## 最终部署方案
由于 Docker 构建和镜像拉取遇到多种问题，最终采用 **混合部署方案**：
- **PostgreSQL**: Docker 容器运行
- **OrangeFlow 应用**: 宿主机直接运行 (Python + uv)
- **存储**: 本地存储 (替代 MinIO)

---

## 遇到的问题及解决方案

### 1. Docker 构建镜像时内存/资源不足

**问题描述**:
- 构建前端时 `npm ci` 被系统杀死 (Exit code 137)
- `uv sync` 安装依赖时被取消 (signal: killed)
- 下载系统包时超时

**错误日志**:
```
The command '/bin/sh -c npm ci --no-audit --no-fund' returned a non-zero code: 137
failed to execute bake: signal: killed
```

**原因分析**:
- Docker 构建过程需要大量内存和 CPU
- 网络下载速度慢导致超时
- 构建上下文过大 (2.5GB+)

**解决方案**:
- 尝试使用 `DOCKER_BUILDKIT=0` 传统构建模式
- 简化 Dockerfile，跳过前端构建，使用预构建的静态文件
- 最终放弃 Docker 构建，改用宿主机直接运行

---

### 2. psycopg 驱动缺失

**问题描述**:
容器启动后连接数据库失败，报错 libpq 库找不到。

**错误日志**:
```python
ImportError: no pq wrapper available.
Attempts made:
- couldn't import psycopg 'c' implementation: No module named 'psycopg_c'
- couldn't import psycopg 'binary' implementation: No module named 'psycopg_binary'
- couldn't import psycopg 'python' implementation: libpq library not found
```

**原因分析**:
- Python slim 镜像缺少 PostgreSQL 客户端库
- psycopg 需要 libpq 库支持

**解决方案**:
- 在 Dockerfile 中添加 `libpq5` 和 `libpq-dev` 安装
- 或者安装 `psycopg-binary` 替代包
- 最终通过宿主机直接运行，使用已有的虚拟环境

---

### 3. Docker 镜像拉取超时

**问题描述**:
拉取 MinIO 镜像时网络超时，多次重试失败。

**错误日志**:
```
c1bc68842c41: Retrying in 5 seconds
c1bc68842c41: Retrying in 4 seconds
...
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled
```

**原因分析**:
- 服务器网络连接 Docker Hub 不稳定
- 镜像层下载速度慢，超过 3-5 分钟

**解决方案**:
- 多次重试拉取
- 尝试使用国内镜像源 (未配置)
- **最终方案**: 放弃 MinIO，改用本地存储模式

---

### 4. 应用启动后 OOM 被杀死

**问题描述**:
应用启动后占用大量内存，被系统 OOM killer 终止。

**错误日志**:
```
[error] Worker (pid:1045513) was sent SIGKILL! Perhaps out of memory?
```

**原因分析**:
- OrangeFlow 应用初始化时需要加载大量组件
- 同时启动多个 Python 进程

**解决方案**:
- 使用 `nohup` 在后台运行
- 分配更多内存 (服务器有 125GB，足够使用)
- 监控进程状态，必要时重启

---

### 5. PostgreSQL 认证失败

**问题描述**:
应用连接数据库时报密码认证失败。

**错误日志**:
```
FATAL:  password authentication failed for user "langflow"
```

**原因分析**:
- Docker 容器的环境变量与 .env 文件不一致
- PostgreSQL 数据卷中已存在旧的用户配置

**解决方案**:
```bash
# 删除旧的数据卷，重新创建
docker compose -f docker/postgres.docker-compose.yml down -v
docker compose -f docker/postgres.docker-compose.yml up -d
```

---

### 6. Rollup 模块缺失 (前端构建)

**问题描述**:
尝试构建前端时，缺少平台特定的 Rollup 二进制文件。

**错误日志**:
```
Error: Cannot find module @rollup/rollup-linux-x64-gnu
```

**原因分析**:
- node_modules 是在 Windows 上安装的
- 缺少 Linux 平台的原生依赖

**解决方案**:
- 使用已有的预构建前端文件 (`src/backend/base/langflow/frontend/`)
- 跳过前端构建步骤

---

## 最终部署架构

```
┌─────────────────────────────────────────────────────────┐
│  服务器 (61.182.4.90)                                    │
│  ┌─────────────────┐      ┌─────────────────────────┐   │
│  │  Docker 容器     │      │  宿主机直接运行          │   │
│  │  PostgreSQL:5433 │◄────►│  OrangeFlow App:7860    │   │
│  │  (数据库)        │      │  (Python + uv)          │   │
│  └─────────────────┘      └─────────────────────────┘   │
│                                    │                     │
│                                    ▼                     │
│                           公网访问:7860                  │
└─────────────────────────────────────────────────────────┘
```

---

## 管理员账号信息

| 配置项 | 值 |
|--------|-----|
| 管理员用户名 | `admin` |
| 管理员密码 | `Tvz5pU4n0wCl2WPg` |
| 数据库用户名 | `orangeflow` |
| 数据库密码 | `auzFaNGy5UHFn3ZXIMfW` |

> ⚠️ **注意**: 首次部署时管理员账号会自动创建。如果修改了 `.env` 文件中的密码，需要手动在数据库中更新或删除用户让系统重新创建。

---

## 为什么使用本地存储而不是 MinIO

1. **网络问题**: MinIO 镜像拉取多次超时，Docker Hub 连接不稳定
2. **简化部署**: 本地存储不需要额外的容器，降低复杂度
3. **单服务器场景**: 当前只有一台服务器，本地存储足够使用
4. **后续可升级**: 如需使用 MinIO 或 S3，可随时修改 `LANGFLOW_STORAGE_TYPE` 环境变量

**存储路径**: `/vol1/1004/新建文件夹 1/data`

---

## 服务管理命令

```bash
# 查看服务状态
curl http://localhost:7860/health_check
curl http://61.182.4.90:7860/health_check

# 查看日志
tail -f /tmp/orangeflow.log

# 查看进程
ps aux | grep "langflow run"

# 停止服务
pkill -f "langflow run"

# 启动 PostgreSQL
cd "/vol1/1004/新建文件夹 1"
docker compose -f docker/postgres.docker-compose.yml up -d

# 启动 OrangeFlow 应用
cd "/vol1/1004/新建文件夹 1"
nohup bash -c 'export LANGFLOW_DATABASE_URL="postgresql://langflow:langflow@127.0.0.1:5433/langflow"; export LANGFLOW_CONFIG_DIR="/vol1/1004/新建文件夹 1/data"; export LANGFLOW_STORAGE_TYPE=local; uv run python -m langflow run --host 0.0.0.0 --port 7860' > /tmp/orangeflow.log 2>&1 &
```

---

## 改进建议

1. **配置 Docker 镜像加速**: 使用阿里云或腾讯云镜像加速服务
2. **预构建镜像**: 在本地构建好镜像后导出，上传到服务器直接导入
3. **使用 Docker Compose 完整部署**: 网络问题解决后，建议使用完整的 `production.docker-compose.yml`
4. **配置 systemd 服务**: 将 OrangeFlow 注册为系统服务，实现开机自启
5. **配置反向代理**: 使用 Nginx/Caddy 配置 HTTPS 访问
