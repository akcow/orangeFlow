# OrangeFlow 服务器部署清单

这份清单面向 **Linux 服务器** 上的 OrangeFlow 单机部署。
推荐栈：

- `OrangeFlow`
- `PostgreSQL`
- `MinIO`
- `Nginx` 或 `Caddy`（正式环境建议启用 HTTPS）

如果你计划用 GitHub 做持续部署，推荐优先使用：

- `docker/production-image.docker-compose.yml`
- `.github/workflows/publish-orangeflow-image.yml`
- `docker/update-from-git.sh`

如果服务器资源紧张，或者 Docker Hub 拉取镜像经常超时，优先这样分流：

- 公网多用户：`docker/production-prebuilt.docker-compose.yml`
- 单机临时内测：`docker/production-lite.docker-compose.yml`
- 预构建镜像入口：`docker/production-prebuilt.Dockerfile`

注意：OrangeFlow 目前对外品牌已改名，但运行时仍兼容上游 `LANGFLOW_*` 环境变量和 `langflow` CLI。

## 1. 服务器最低建议配置

### 可运行的最低配置

- CPU：2 vCPU
- 内存：4 GB
- 磁盘：30 GB SSD

### 更稳的推荐配置

- CPU：4 vCPU
- 内存：8 GB
- 磁盘：60 GB SSD

### 为什么建议至少 4-8 GB 内存

前端是较大的 Vite/React 构建，`src/frontend/package.json` 当前构建命令为：

```bash
node --max-old-space-size=6144 ./node_modules/vite/bin/vite.js build
```

如果服务器只有 2 GB 或 4 GB 内存，Node 构建阶段很容易被系统 OOM Killer 杀掉，表现为：

- `Killed`
- `exit code 137`
- Docker build 中断

## 2. 推荐部署方式

最推荐两种：

### 方案 A：本地/CI 构建前端，再上传到服务器

这是**最稳**的方式，尤其适合小内存服务器。

流程：

1. 在你自己的电脑或 CI 上执行前端构建
2. 确认 `src/frontend/build/` 已生成
3. 把源码（包含 `src/frontend/build/`）上传到服务器
4. 多用户公网部署优先使用 `docker/production-prebuilt.docker-compose.yml` 或 `ORANGEFLOW_DEPLOY_MODE=full-prebuilt ./deploy.sh`

如果你已经接入 GitHub Actions 发布镜像，则更推荐：

4. 服务器只保留 Git 仓库、`.env` 和 compose 文件
5. 用 `docker/production-image.docker-compose.yml` 拉取 GHCR 镜像部署

优点：

- 避免服务器在 `npm run build` 时爆内存
- 服务器部署更快
- 更适合 2 GB / 4 GB 小机器

### 方案 B：在服务器本机构建前端

适合：

- 服务器至少 8 GB 内存
- 或者 4 GB 内存 + 已配置 swap

## 3. 首次部署前检查

在服务器上先确认：

```bash
docker --version
docker compose version
free -h
df -h
```

如果你打算在服务器本机构建前端，再确认：

```bash
node -v
npm -v
```

建议 Node 版本：

- `20 LTS`
- `22 LTS`

不建议太新的非 LTS 版本直接上生产构建。

## 4. 上传项目

把整个项目上传到服务器，例如放在：

```bash
/opt/orangeflow
```

进入目录：

```bash
cd /opt/orangeflow
```

## 5. 前端构建

### 推荐：在本地或 CI 构建

如果你已经在本地完成构建，确认服务器上存在：

```bash
src/frontend/build
```

### 如果必须在服务器构建

进入前端目录：

```bash
cd /opt/orangeflow/src/frontend
npm install
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

说明：

- 当前项目的 `npm run build` 已内置 `--max-old-space-size=6144`
- 如果服务器本身内存小，**不是设得越大越好**
- 小内存机器上，给 Node 一个过高的堆上限，反而更容易被系统直接 OOM Kill

如果 4 GB 内存机器还是失败，优先做这两件事：

1. 增加 swap
2. 改为在本地/CI 构建前端

## 6. 生产环境变量

进入部署目录：

```bash
cd /opt/orangeflow/docker
cp .env.production.example .env
```

至少修改这些值：

```env
POSTGRES_PASSWORD=你的强密码
SUPERUSER_PASSWORD=你的强密码
MINIO_ROOT_PASSWORD=你的强密码
SECRET_KEY=随机长密钥
```

并确认这几个默认值是 OrangeFlow：

```env
POSTGRES_USER=orangeflow
POSTGRES_DB=orangeflow
MINIO_BUCKET=orangeflow-assets
```

### 直接 IP 访问

```env
LANGFLOW_BIND_ADDRESS=0.0.0.0
LANGFLOW_PUBLIC_BASE_URL=http://你的服务器IP:7860
LANGFLOW_CORS_ORIGINS=http://你的服务器IP:7860
LANGFLOW_ACCESS_SECURE=false
LANGFLOW_REFRESH_SECURE=false
```

### 域名 + HTTPS 反代

```env
LANGFLOW_BIND_ADDRESS=127.0.0.1
LANGFLOW_PUBLIC_BASE_URL=https://你的域名
LANGFLOW_CORS_ORIGINS=https://你的域名
LANGFLOW_ACCESS_SECURE=true
LANGFLOW_REFRESH_SECURE=true
```

## 7. 启动 OrangeFlow

```bash
cd /opt/orangeflow/docker
docker compose --env-file .env -f production.docker-compose.yml up -d --build
```

如果你走轻量模式：

```bash
cd /opt/orangeflow/docker
cp .env.lite.example .env
docker compose --env-file .env -f production-lite.docker-compose.yml up -d --build
```

如果你要保留 MinIO 并避免服务器前端构建：

```bash
cd /opt/orangeflow/docker
cp .env.production.example .env
docker compose --env-file .env -f production-prebuilt.docker-compose.yml up -d --build
```

如果你使用 GitHub Actions 发布镜像：

```bash
cd /opt/orangeflow/docker
cp .env.production.example .env
# 编辑 .env，设置 ORANGEFLOW_IMAGE=ghcr.io/<owner>/<repo>-orangeflow:main
docker compose --env-file .env -f production-image.docker-compose.yml pull
docker compose --env-file .env -f production-image.docker-compose.yml up -d
```

## 8. 健康检查

```bash
docker compose --env-file .env -f production.docker-compose.yml ps
docker compose --env-file .env -f production.docker-compose.yml logs -f orangeflow
curl http://127.0.0.1:7860/health_check
```

## 9. 正式环境建议

- 使用域名
- 使用 HTTPS
- 反向代理到 `127.0.0.1:7860`
- 不直接暴露 PostgreSQL 和 MinIO 到公网
- 定期备份数据库和对象存储

## 10. `exit code 137` 排查清单

`137` 几乎总是下面这个链路：

1. 前端构建吃内存很多
2. 服务器剩余内存不足
3. Linux OOM Killer 直接杀掉 Node 进程
4. Docker / shell 最终显示 `137`

### 如何确认是不是 OOM

在服务器上执行：

```bash
dmesg -T | grep -i -E "killed process|out of memory|oom"
```

如果你看到类似：

- `Out of memory`
- `Killed process ... node`

那基本就坐实了是内存问题。

### 常见触发场景

- 2 GB 小机直接在服务器执行 `npm run build`
- Docker build 同时拉镜像、解压依赖、编译前端
- 机器上还跑着数据库、MinIO、旧容器、监控程序
- 没有 swap

### 解决优先级

#### 最推荐

1. **不要在服务器构建前端**
2. 在本地或 CI 构建好 `src/frontend/build/`
3. 再上传到服务器部署

#### 第二选择

1. 给服务器加到 `8 GB RAM`
2. 或至少补 `2-4 GB swap`

#### 第三选择

构建前先清理占内存进程：

```bash
docker stats
free -h
```

必要时先停旧容器再构建。

## 11. 4 GB 服务器建议

如果你的服务器只有 4 GB，我建议这样部署：

1. 本地构建 `src/frontend/build/`
2. 上传完整项目到服务器
3. 服务器仅执行 `docker compose -f production-prebuilt.docker-compose.yml up -d --build`
4. PostgreSQL + MinIO + OrangeFlow 同机运行
5. 同时配置 2-4 GB swap

如果你有 GitHub Actions 镜像发布：

1. GitHub 构建并推送镜像到 GHCR
2. 服务器执行 `docker/update-from-git.sh`
3. 应用层不再在服务器本地 build

## 12. 2 GB 服务器建议

如果服务器只有 2 GB：

- **不建议**在服务器本机做前端构建
- **不建议**同时做高并发生产使用
- 可以用于个人测试或很小范围内测

推荐做法：

1. 本地/CI 构建前端
2. 服务器只跑容器
3. 尽量加 swap

## 13. 最稳妥的一套命令

### 本地

```bash
cd src/frontend
npm install
npm run build
```

### 服务器

```bash
cd /opt/orangeflow/docker
cp .env.production.example .env
# 编辑 .env
docker compose --env-file .env -f production.docker-compose.yml up -d --build
docker compose --env-file .env -f production.docker-compose.yml logs -f orangeflow
```

轻量模式：

```bash
cd /opt/orangeflow/src/frontend
npm install
npm run build

cd /opt/orangeflow/docker
cp .env.production.example .env
docker compose --env-file .env -f production-prebuilt.docker-compose.yml up -d --build
docker compose --env-file .env -f production-prebuilt.docker-compose.yml logs -f orangeflow
```

GitHub 镜像模式：

```bash
cd /opt/orangeflow
git clone <your-github-repo-url> .

cd /opt/orangeflow/docker
cp .env.production.example .env
# 编辑 .env，设置 ORANGEFLOW_IMAGE
docker compose --env-file .env -f production-image.docker-compose.yml pull
docker compose --env-file .env -f production-image.docker-compose.yml up -d
```

---

如果你的服务器配置比较紧张，**把前端构建从服务器上拿掉**，基本就是解决 `exit code 137` 的最有效办法。
